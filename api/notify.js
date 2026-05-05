/**
 * api/notify.js — WhatsApp daily/weekly via Claude + Z-API
 * 
 * Env vars no Vercel:
 *   ZAPI_URL           https://api.z-api.io/instances/.../token/.../send-text
 *   WHATSAPP_PHONE     5561999999999
 *   ANTHROPIC_API_KEY  sk-ant-...
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_API_KEY
 */

const ZAPI_URL      = process.env.ZAPI_URL
const PHONE         = process.env.WHATSAPP_PHONE
const CLAUDE_KEY    = process.env.ANTHROPIC_API_KEY
const FB_PROJECT    = process.env.FIREBASE_PROJECT_ID
const FB_KEY        = process.env.FIREBASE_API_KEY

// ─── Firestore REST ───────────────────────────────────────
function parseField(v) {
  if (!v) return null
  if (v.stringValue  !== undefined) return v.stringValue
  if (v.integerValue !== undefined) return Number(v.integerValue)
  if (v.doubleValue  !== undefined) return Number(v.doubleValue)
  if (v.booleanValue !== undefined) return v.booleanValue
  if (v.mapValue?.fields) return parseDoc(v.mapValue.fields)
  if (v.arrayValue?.values) return v.arrayValue.values.map(i => parseField(i))
  return null
}
function parseDoc(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) out[k] = parseField(v)
  return out
}
async function firestoreList(col) {
  const url = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/${col}?pageSize=200&key=${FB_KEY}`
  const res  = await fetch(url)
  const json = await res.json()
  if (!json.documents) return []
  return json.documents.map(doc => parseDoc(doc.fields?.data?.mapValue?.fields || doc.fields)).filter(Boolean)
}

// ─── Helpers ─────────────────────────────────────────────
const STAGES = [
  { id:"briefing",   label:"Briefing",      days:-9 },
  { id:"roteiro",    label:"Roteiro",        days:-7 },
  { id:"ap_roteiro", label:"Ap. Roteiro",    days:-5 },
  { id:"gravacao",   label:"Gravação",        days:-4 },
  { id:"edicao",     label:"Edição",          days:-3 },
  { id:"ap_final",   label:"Ap. Final",       days:-1 },
  { id:"postagem",   label:"Postagem",        days:0  },
  { id:"done",       label:"Entregue",        days:0  },
]
function addDays(dateStr, n) {
  if (!dateStr || n == null) return null
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().substr(0, 10)
}
function fmtDate(s) {
  if (!s) return "—"
  const [y,m,d] = s.split("-")
  return `${d}/${m}`
}
function daysLeft(s) {
  if (!s) return null
  return Math.ceil((new Date(s) - new Date()) / 864e5)
}

// ─── Message generation ───────────────────────────────────
async function generateMessage(type, contracts, deliverables, posts) {
  const today    = new Date()
  const todayStr = today.toISOString().substr(0, 10)
  const todayFmt = today.toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" })

  // Build pipeline summary
  const pipeline = deliverables
    .filter(d => d && d.stage !== "done")
    .map(d => {
      const stage = STAGES.find(s => s.id === (d.stage || "briefing"))
      const stageDue = stage ? addDays(d.plannedPostDate, stage.days) : null
      const dl = daysLeft(stageDue)
      const c = contracts.find(x => x.id === d.contractId)
      const late = dl !== null && dl < 0
      return {
        title: d.title,
        company: c?.company || "",
        stage: stage?.label || d.stage,
        postDate: d.plannedPostDate,
        stageDue,
        dl,
        late,
        urgent: dl !== null && dl >= 0 && dl <= 1,
      }
    })
    .sort((a,b) => new Date(a.postDate||"9999") - new Date(b.postDate||"9999"))

  const late    = pipeline.filter(d => d.late)
  const urgent  = pipeline.filter(d => d.urgent)
  const today7  = pipeline.filter(d => d.postDate && d.postDate <= addDays(todayStr, 7))

  // Post conflicts
  const dateCounts = {}
  deliverables.forEach(d => { if (d?.plannedPostDate) dateCounts[d.plannedPostDate] = (dateCounts[d.plannedPostDate]||0)+1 })
  const conflicts = Object.entries(dateCounts).filter(([,c])=>c>1)

  const pipelineSummary = pipeline.slice(0, 10).map(d =>
    `• ${d.title} (${d.company}) — etapa: ${d.stage} → post ${fmtDate(d.postDate)} · prazo etapa: ${fmtDate(d.stageDue)} [${d.dl!=null?d.dl+"d":"?"}]${d.late?" ⚠️ ATRASADO":""}${d.urgent?" ⏰ URGENTE":""}`
  ).join("\n")

  const isWeekly = type === "weekly"

  const prompt = `Você é o co-piloto operacional de Matheus Gomes, sócio gestor do @veloso.lucas_ (Copa do Mundo 2026). A Ranked é a agência.

Gere uma mensagem de WhatsApp ${isWeekly ? "para segunda-feira (visão semanal)" : "diária (agenda do dia)"} para o Matheus.

REGRAS:
- Tom direto, como um assistente operacional experiente
- Use emojis com moderação (máx 5 por mensagem)
- WhatsApp: use *negrito* para títulos, sem markdown complexo
- Seja objetivo — máx 300 palavras
- Sempre termine com "Bom dia! 🎯" (diária) ou "Boa semana! 🏆" (semanal)

DADOS — ${todayFmt}:

PIPELINE (${pipeline.length} entregáveis ativos):
${pipelineSummary || "Nenhum entregável cadastrado ainda."}

ATRASADOS: ${late.length > 0 ? late.map(d=>`${d.title} (${d.stage})`).join(", ") : "✅ Nenhum"}
URGENTES HOJE/AMANHÃ: ${urgent.length > 0 ? urgent.map(d=>`${d.title}`).join(", ") : "✅ Nenhum"}
CONFLITOS DE DATA: ${conflicts.length > 0 ? conflicts.map(([d,c])=>`${fmtDate(d)} (${c} publis)`).join(", ") : "✅ Nenhum"}
POSTS PUBLICADOS: ${posts.filter(p=>p?.isPosted).length}/${posts.length}
CONTRATOS ATIVOS: ${contracts.length}

${isWeekly 
  ? "Crie: 1) visão geral da semana, 2) prioridade crítica da semana, 3) alertas, 4) sugestão de organização por dia." 
  : "Crie: 1) o que fazer HOJE, 2) 1 item urgente se houver, 3) 1 risco a evitar."}

Responda APENAS com o texto da mensagem.`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    })
  })
  const data = await res.json()
  return data.content?.[0]?.text || "Erro ao gerar mensagem."
}

// ─── Send WhatsApp ────────────────────────────────────────
async function sendWhatsApp(message) {
  const res = await fetch(ZAPI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.ZAPI_CLIENT_TOKEN ? { "Client-Token": process.env.ZAPI_CLIENT_TOKEN } : {}),
    },
    body: JSON.stringify({ phone: PHONE, message })
  })
  return res.json()
}

// ─── Handler ─────────────────────────────────────────────
export default async function handler(req, res) {
  const type = req.query.type || "daily"

  try {
    const [contracts, posts, deliverables] = await Promise.all([
      firestoreList("contracts"),
      firestoreList("posts"),
      firestoreList("deliverables"),
    ])

    let message, claudeError = null
    try {
      message = await generateMessage(type, contracts, deliverables, posts)
    } catch(claudeErr) {
      claudeError = String(claudeErr)
      message = `Erro Claude: ${claudeError}`
    }
    const zapiRes = await sendWhatsApp(message)

    res.status(200).json({
      ok: true,
      type,
      stats: { contracts: contracts.length, posts: posts.length, deliverables: deliverables.length },
      preview: message.substr(0, 300),
      claudeError,
      zapi: zapiRes,
    })
  } catch (err) {
    console.error("[notify]", err)
    res.status(500).json({ ok: false, error: String(err) })
  }
}
