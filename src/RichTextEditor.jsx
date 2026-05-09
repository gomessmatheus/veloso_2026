import { useState, useRef, useEffect, useCallback } from "react";
import { B1, B2, LN, TX, TX2, TX3, RED, GRN } from "../constants/tokens.js";

function exportRoteiro(html, title) {
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Roteiro — ${title || "Entregável"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.9;color:#111;max-width:720px;margin:0 auto;padding:48px 40px}
  h1{font-size:22px;font-weight:700;margin-bottom:32px;padding-bottom:12px;border-bottom:2px solid #C8102E;letter-spacing:-.01em}
  .roteiro{font-size:15px;line-height:1.9}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;display:flex;justify-content:space-between}
  @media print{body{padding:24px}button{display:none!important}}
</style></head><body>
<h1>✍️ ${title || "Roteiro"}</h1>
<button onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:8px 20px;background:#C8102E;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimir / PDF</button>
<button onclick="navigator.clipboard.writeText(document.querySelector('.roteiro').innerText)" style="position:fixed;top:16px;right:140px;padding:8px 20px;background:#f5f5f5;color:#333;border:1px solid #ddd;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">📋 Copiar texto</button>
<div class="roteiro">${html || "<em>Roteiro em branco.</em>"}</div>
<div class="footer">
  <span>ENTREGAS · @veloso.lucas_ · Ranked</span>
  <span>${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</span>
</div>
</body></html>`);
  w.document.close();
}

const SECTIONS    = ["Abertura","Campinho","Bloco Publi","Desenvolvimento","CTA","Encerramento"];
const FLOAT_COLORS = ["#000000","#C8102E","#2563EB","#16A34A","#D97706","#7C3AED","#EA580C","#BE185D","#374151","#FFFFFF"];
const FLOAT_HLS   = ["#FEF08A","#BBF7D0","#BFDBFE","#FCA5A5","#DDD6FE","#FED7AA"];

export function RichTextEditor({ value, onChange, onAutoSave, title, minHeight = 440 }) {
  const editorRef   = useRef(null);
  const floatRef    = useRef(null);
  const autoTimer   = useRef(null);
  const isComposing = useRef(false);
  const [fmt, setFmt]           = useState({});
  const [floatPos, setFloatPos] = useState(null);
  const [savedAt, setSavedAt]   = useState(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    syncFormats();
  };

  const syncFormats = () => setFmt({
    bold:      document.queryCommandState("bold"),
    italic:    document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    strike:    document.queryCommandState("strikeThrough"),
  });

  const triggerAutoSave = (html) => {
    if (!onAutoSave) return;
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      onAutoSave(html);
      setSavedAt(new Date());
    }, 1500);
  };

  const handleInput = () => {
    if (!isComposing.current) {
      const html = editorRef.current?.innerHTML || "";
      onChange(html);
      syncFormats();
      triggerAutoSave(html);
    }
  };

  const checkSelection = useCallback(() => {
    syncFormats();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current?.contains(sel.anchorNode)) {
      setFloatPos(null); return;
    }
    try {
      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      if (rect.width === 0) { setFloatPos(null); return; }
      const W   = 310;
      let left  = rect.left + rect.width / 2 - W / 2;
      left      = Math.max(8, Math.min(left, window.innerWidth - W - 8));
      const top = rect.top - 56;
      setFloatPos({ top: top < 8 ? rect.bottom + 8 : top, left, above: top >= 8 });
    } catch { setFloatPos(null); }
  }, []);

  useEffect(() => {
    const hide = (e) => {
      if (floatRef.current && !floatRef.current.contains(e.target)) setFloatPos(null);
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  const insertSection = (label) => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false,
      `<p style="font-weight:700;color:#C8102E;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0 2px">${label}</p><p><br></p>`
    );
    const html = editorRef.current?.innerHTML || "";
    onChange(html); triggerAutoSave(html);
  };

  const Tb = ({ cmd, children, active, onDown, ttl, w = 26, fs = 13, fw = 600 }) => (
    <button title={ttl} onMouseDown={e => { e.preventDefault(); onDown ? onDown() : exec(cmd); }}
      style={{ width: w, height: 26, border: "none", background: active ? `${RED}14` : "transparent", color: active ? RED : TX2, borderRadius: 4, cursor: "pointer", fontSize: fs, fontWeight: fw, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .12s" }}>
      {children}
    </button>
  );

  const charCount = (value || "").replace(/<[^>]*>/g, "").trim().length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Floating selection toolbar */}
      {floatPos && (
        <div ref={floatRef} style={{
          position: "fixed", top: floatPos.top, left: floatPos.left,
          zIndex: 9999, width: 310, background: "#18181B", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.24)",
          display: "flex", alignItems: "center", gap: 2, padding: "5px 8px",
          animation: "floatIn .12s ease",
        }}>
          {[
            { cmd:"bold",         ch:"B", a:fmt.bold,      fw:700, fs:13 },
            { cmd:"italic",       ch:"I", a:fmt.italic,    fw:400, fs:13, it:true },
            { cmd:"underline",    ch:"U", a:fmt.underline, fw:600, fs:12, ul:true },
            { cmd:"strikeThrough",ch:"S", a:fmt.strike,    fw:600, fs:12, st:true },
          ].map(({ cmd, ch, a, fw, fs, it, ul, st }) => (
            <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd); }}
              style={{ width:26, height:26, border:"none", borderRadius:4, background:a?"rgba(200,16,46,.28)":"transparent", color:a?RED:"#D4D4D8", cursor:"pointer", fontSize:fs, fontWeight:fw, fontStyle:it?"italic":"normal", textDecoration:ul?"underline":st?"line-through":"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
              {ch}
            </button>
          ))}

          <div style={{ width:1, height:16, background:"rgba(255,255,255,.12)", margin:"0 3px" }} />

          <select defaultValue="3" onMouseDown={e => e.stopPropagation()}
            onChange={e => { exec("fontSize", e.target.value); editorRef.current?.focus(); }}
            style={{ height:24, padding:"0 4px", fontSize:10, background:"transparent", border:"1px solid rgba(255,255,255,.18)", borderRadius:4, color:"#D4D4D8", fontFamily:"inherit", cursor:"pointer", outline:"none" }}>
            {[["2","P"],["3","M"],["4","G"],["5","T"]].map(([v, l]) =>
              <option key={v} value={v} style={{ color: TX, background: B1 }}>{l}</option>
            )}
          </select>

          <div style={{ width:1, height:16, background:"rgba(255,255,255,.12)", margin:"0 3px" }} />

          <div style={{ display:"flex", flexWrap:"wrap", gap:2, width:54 }}>
            {FLOAT_COLORS.map(c => (
              <div key={c} onMouseDown={e => { e.preventDefault(); exec("foreColor", c); }}
                style={{ width:14, height:14, borderRadius:"50%", background:c, border:"1.5px solid rgba(255,255,255,.25)", cursor:"pointer" }} />
            ))}
          </div>

          <div style={{ width:1, height:16, background:"rgba(255,255,255,.12)", margin:"0 3px" }} />

          {FLOAT_HLS.map((c, i) => (
            <div key={i} onMouseDown={e => { e.preventDefault(); exec("backColor", c); }}
              style={{ width:14, height:14, borderRadius:3, background:c, border:"1px solid rgba(0,0,0,.12)", cursor:"pointer" }} />
          ))}

          <div style={{ width:1, height:16, background:"rgba(255,255,255,.12)", margin:"0 3px" }} />

          <button onMouseDown={e => { e.preventDefault(); exec("removeFormat"); exec("backColor","#FFFFFF"); setFloatPos(null); }}
            title="Limpar formatação"
            style={{ width:24, height:24, border:"none", borderRadius:4, background:"transparent", color:"#71717A", cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>
            ✕
          </button>

          {floatPos.above && (
            <div style={{ position:"absolute", bottom:-5, left:"50%", transform:"translateX(-50%)", width:10, height:6, clipPath:"polygon(0 0,100% 0,50% 100%)", background:"#18181B" }} />
          )}
        </div>
      )}

      {/* Static toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:2, padding:"6px 12px", borderBottom:`1px solid ${LN}`, background:B1 }}>
        <Tb cmd="bold"          active={fmt.bold}      ttl="Negrito · Ctrl+B"    fw={700} fs={13}>B</Tb>
        <Tb cmd="italic"        active={fmt.italic}    ttl="Itálico · Ctrl+I"    fw={400} fs={13}><em>I</em></Tb>
        <Tb cmd="underline"     active={fmt.underline} ttl="Sublinhado · Ctrl+U"><span style={{ textDecoration:"underline", fontSize:12 }}>U</span></Tb>
        <Tb cmd="strikeThrough" active={fmt.strike}    ttl="Riscado"><span style={{ textDecoration:"line-through", fontSize:12 }}>S</span></Tb>
        <div style={{ width:1, height:16, background:LN, margin:"0 3px" }} />
        <select defaultValue="3" onMouseDown={e => e.stopPropagation()}
          onChange={e => { exec("fontSize", e.target.value); editorRef.current?.focus(); }}
          style={{ height:26, padding:"0 6px", fontSize:11, background:"transparent", border:`1px solid ${LN}`, borderRadius:4, color:TX, fontFamily:"inherit", cursor:"pointer", outline:"none" }}>
          <option value="2">Pequeno</option>
          <option value="3">Normal</option>
          <option value="4">Grande</option>
          <option value="5">Título</option>
        </select>
        <div style={{ width:1, height:16, background:LN, margin:"0 3px" }} />
        <Tb ttl="Limpar formatação" onDown={() => { exec("removeFormat"); exec("backColor","#FFFFFF"); }} fs={11} fw={500}>✕</Tb>

        <span style={{ marginLeft:"auto", fontSize:9, color:savedAt ? GRN : TX3, flexShrink:0, display:"flex", alignItems:"center", gap:3 }}>
          {savedAt
            ? <>✓ Salvo {savedAt.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" })}</>
            : `${charCount} car.`
          }
        </span>

        <button onMouseDown={e => { e.preventDefault(); exportRoteiro(value, title); }}
          style={{ marginLeft:8, padding:"3px 10px", height:26, fontSize:10, fontWeight:700, background:`${RED}10`, border:`1px solid ${RED}30`, borderRadius:5, color:RED, cursor:"pointer", display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
          ↗ Exportar
        </button>
      </div>

      {/* Section chips */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderBottom:`1px solid ${LN}`, background:B2, flexWrap:"wrap" }}>
        <span style={{ fontSize:9, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".1em", marginRight:4 }}>+ Seção</span>
        {SECTIONS.map(s => (
          <button key={s} onMouseDown={e => { e.preventDefault(); insertSection(s); }}
            style={{ fontSize:10, padding:"2px 9px", background:B1, border:`1px solid ${LN}`, borderRadius:99, cursor:"pointer", color:TX2, fontWeight:600, transition:"all .12s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED; e.currentTarget.style.background = `${RED}08`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = LN;  e.currentTarget.style.color = TX2; e.currentTarget.style.background = B1; }}>
            {s}
          </button>
        ))}
        <span style={{ marginLeft:"auto", fontSize:9, color:TX3 }}>Selecione texto para formatar</span>
      </div>

      {/* Writing area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={e => { syncFormats(); checkSelection(); }}
        onMouseUp={checkSelection}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
        style={{ flex:1, minHeight, padding:"24px 28px", outline:"none", fontSize:14, lineHeight:1.9, color:TX, background:"#FEFEFE", fontFamily:"inherit", wordBreak:"break-word", overflowY:"auto" }}
      />
    </div>
  );
}
