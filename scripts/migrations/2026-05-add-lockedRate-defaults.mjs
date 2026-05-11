/**
 * scripts/migrations/2026-05-add-lockedRate-defaults.mjs
 *
 * Backfill lockedRate / lockedRateAt para contratos em moeda estrangeira
 * que ainda não têm o campo definido (undefined, não null).
 *
 * USO:
 *   node scripts/migrations/2026-05-add-lockedRate-defaults.mjs          # dry run
 *   node scripts/migrations/2026-05-add-lockedRate-defaults.mjs --dry    # dry run explícito
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     node scripts/migrations/2026-05-add-lockedRate-defaults.mjs --apply
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';
import { readFileSync }                  from 'fs';
import { parseArgs }                     from 'util';

// ─── CLI ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    apply: { type: 'boolean', default: false },
    dry:   { type: 'boolean', default: false },
  },
  strict: false,
});

const DRY_RUN = !args.apply;

// ─── Firebase init ────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    console.error(
      '\n❌  Defina GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json\n' +
      '    Baixe em: Firebase Console → Configurações → Contas de serviço\n'
    );
    process.exit(1);
  }
  try {
    initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
  } catch (e) {
    console.error(`\n❌  Erro ao ler credencial: ${e.message}\n`);
    process.exit(1);
  }
}

// ─── AwesomeAPI histórico ─────────────────────────────────────────────────

function toAwesomeDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function fetchHistoricalRate(currency, targetDate) {
  const pair = `${currency}-BRL`;
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(targetDate);
    d.setUTCDate(d.getUTCDate() - offset);
    const dateStr = toAwesomeDate(d);
    const url = `https://economia.awesomeapi.com.br/json/daily/${pair}/1?start_date=${dateStr}&end_date=${dateStr}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].bid) {
        return parseFloat(data[0].bid);
      }
    } catch { /* timeout ou erro de rede — tenta dia anterior */ }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// ─── Normaliza signedAt para Date ─────────────────────────────────────────

function parseSignedAt(signedAt) {
  if (!signedAt) return null;
  if (typeof signedAt === 'object' && typeof signedAt.seconds === 'number') {
    return new Date(signedAt.seconds * 1000);
  }
  if (typeof signedAt?.toDate === 'function') return signedAt.toDate();
  const d = new Date(
    typeof signedAt === 'number' && signedAt < 1e12
      ? signedAt * 1000
      : signedAt
  );
  return isNaN(d.getTime()) ? null : d;
}

// ─── Relatório ────────────────────────────────────────────────────────────

function printReport(stats) {
  const line = '══════════════════════════════════════════════════════════';
  console.log(`\n${line}`);
  console.log('  RELATÓRIO');
  console.log(`  Total processados:              ${stats.total}`);
  console.log(`  Com cotação histórica:          ${stats.withRate} ✓`);
  console.log(`  Sem signedAt (revisão manual):  ${stats.noSignedAt} ⚠️`);
  console.log(`  Sem cotação (revisão manual):   ${stats.failed} ⚠️`);
  console.log(`  Modo:                           ${DRY_RUN ? 'DRY RUN — nada foi gravado' : 'APPLY — gravado no Firestore'}`);
  console.log(line);
  const needsReview = stats.noSignedAt + stats.failed;
  if (needsReview > 0) {
    console.log(`\n  ⚠️  ${needsReview} contrato(s) para revisão manual:`);
    console.log('     Filtrar por migrations.lockedRateBackfilled = false');
    console.log('     e preencher lockedRate no ContractModal do app.');
  }
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const line = '══════════════════════════════════════════════════════════';
  console.log(`\n${line}`);
  console.log('  Migration: 2026-05 add-lockedRate-defaults');
  console.log(`  Modo: ${DRY_RUN ? '🔍 DRY RUN (nenhuma gravação)' : '⚡ APPLY (gravando no Firestore)'}`);
  console.log(`${line}\n`);

  initFirebase();
  const db = getFirestore();

  // 1. Ler todos os contratos
  console.log('📄 Lendo contracts...');
  const snap = await db.collection('contracts').get();
  console.log(`   Total de documentos: ${snap.size}\n`);

  // 2. Filtrar candidatos
  // Idempotência: só processa quem não tem a chave 'lockedRate' definida
  const candidates = snap.docs
    .map(docSnap => ({ ref: docSnap.ref, contract: docSnap.data().data }))
    .filter(({ contract }) =>
      contract &&
      contract.currency !== 'BRL' &&
      contract.currency &&
      !('lockedRate' in contract)
    );

  console.log(`🎯 Candidatos (currency ≠ BRL, sem lockedRate): ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('\n✅ Nada a fazer.\n');
    printReport({ total: 0, withRate: 0, noSignedAt: 0, failed: 0 });
    return;
  }
  console.log('');

  // 3. Processar
  const stats = { total: 0, withRate: 0, noSignedAt: 0, failed: 0 };
  const BATCH_SIZE = 400;
  let batch     = db.batch();
  let batchOps  = 0;

  const flushBatch = async () => {
    if (DRY_RUN || batchOps === 0) return;
    await batch.commit();
    batch    = db.batch();
    batchOps = 0;
  };

  for (const { ref, contract } of candidates) {
    stats.total++;
    const idx   = `[${stats.total}/${candidates.length}]`;
    const label = contract.company || contract.id;
    const signedAtDate = parseSignedAt(contract.signedAt);

    let update = null;

    if (signedAtDate) {
      process.stdout.write(`  ${idx} ${label} (${contract.currency}, assinado ${signedAtDate.toLocaleDateString('pt-BR')}) ... `);
      const rate = await fetchHistoricalRate(contract.currency, signedAtDate);
      if (rate) {
        console.log(`✓ ${rate}`);
        stats.withRate++;
        update = {
          ...contract,
          lockedRate:   rate,
          lockedRateAt: signedAtDate.toISOString(),
          migrations:   { ...(contract.migrations || {}), lockedRateBackfilled: true },
        };
      } else {
        console.log('⚠️  cotação não encontrada → revisão manual');
        stats.failed++;
        update = {
          ...contract,
          lockedRate:   null,
          lockedRateAt: null,
          migrations:   { ...(contract.migrations || {}), lockedRateBackfilled: false },
        };
      }
    } else {
      console.log(`  ${idx} ${label} (${contract.currency}, sem signedAt → revisão manual)`);
      stats.noSignedAt++;
      update = {
        ...contract,
        lockedRate:   null,
        lockedRateAt: null,
        migrations:   { ...(contract.migrations || {}), lockedRateBackfilled: false },
      };
    }

    if (!DRY_RUN) {
      batch.set(ref, {
        id:        contract.id,
        data:      update,
        updatedAt: new Date().toISOString(),
      });
      batchOps++;
      if (batchOps >= BATCH_SIZE) {
        await flushBatch();
        console.log(`\n  ✓ Batch de ${BATCH_SIZE} operações gravado.\n`);
      }
    }
  }

  await flushBatch();
  printReport(stats);
}

main().catch(err => {
  console.error('\n❌  Erro fatal:', err);
  process.exit(1);
});
