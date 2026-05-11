/**
 * scripts/migrations/2026-05-cleanup-fx-settings.mjs
 *
 * Remove settings/eurRate e settings/usdRate do Firestore.
 * Esses documentos viraram lixo após a Fase 7 (cotações automáticas via FxContext).
 *
 * O QUE FAZ:
 *   1. Lê e loga os valores atuais para auditoria
 *   2. Copia para settings/_deprecated/{key}_{YYYYMMDD} (preserva 30 dias)
 *   3. Deleta os originais
 *
 * IDEMPOTÊNCIA:
 *   - Se o original já não existe → pula (nada a fazer)
 *   - Se o _deprecated já existe → sobrescreve (merge seguro)
 *
 * USO:
 *   # Dry run (padrão):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     node scripts/migrations/2026-05-cleanup-fx-settings.mjs
 *
 *   # Aplicar:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *     node scripts/migrations/2026-05-cleanup-fx-settings.mjs --apply
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';
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

// ─── Firebase ─────────────────────────────────────────────────────────────

function initFirebase() {
  if (getApps().length) return;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    console.error(
      '\n❌  Defina GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json\n'
    );
    process.exit(1);
  }
  try {
    initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
  } catch (e) {
    console.error(`\n❌  Credencial inválida: ${e.message}\n`);
    process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const HR = '══════════════════════════════════════════════════════════';
  console.log(`\n${HR}`);
  console.log('  Migration: 2026-05 cleanup-fx-settings');
  console.log(`  Modo: ${DRY_RUN ? '🔍 DRY RUN (nenhuma gravação)' : '⚡ APPLY (gravando no Firestore)'}`);
  console.log(`${HR}\n`);

  initFirebase();
  const db      = getFirestore();
  const dateStr = todayStr();
  const KEYS    = ['eurRate', 'usdRate'];

  const stats = { found: 0, archived: 0, deleted: 0, skipped: 0 };

  for (const key of KEYS) {
    console.log(`\n── ${key} ────────────────────────────────────`);

    const origRef = db.collection('settings').doc(key);
    const origSnap = await origRef.get();

    // ── Idempotência: já foi removido ─────────────────────
    if (!origSnap.exists) {
      console.log(`  settings/${key}: não encontrado — já removido anteriormente ✓`);
      stats.skipped++;
      continue;
    }

    stats.found++;
    const data = origSnap.data();

    // ── 1. Auditoria: logar valor atual ───────────────────
    console.log(`  settings/${key} (valor atual para auditoria):`);
    console.log(`    ${JSON.stringify(data, null, 4).split('\n').join('\n    ')}`);

    // ── 2. Copiar para _deprecated ─────────────────────────
    const archiveKey = `_deprecated/${key}_${dateStr}`;
    const archiveRef = db.collection('settings').doc(archiveKey);

    const archivePayload = {
      ...data,
      _deprecatedAt:     new Date().toISOString(),
      _deprecatedReason: 'Fase 7: substituído por FxContext (cotações automáticas)',
      _deleteAfter:      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      _originalPath:     `settings/${key}`,
    };

    if (DRY_RUN) {
      console.log(`  [dry] Copiaria para settings/${archiveKey}`);
      console.log(`  [dry] Deletaria settings/${key}`);
    } else {
      await archiveRef.set(archivePayload, { merge: true });
      console.log(`  ✓ Arquivado em settings/${archiveKey}`);
      stats.archived++;

      // ── 3. Deletar original ──────────────────────────────
      await origRef.delete();
      console.log(`  ✓ settings/${key} deletado`);
      stats.deleted++;
    }
  }

  // ── Relatório ──────────────────────────────────────────

  console.log(`\n${HR}`);
  console.log('  RELATÓRIO');
  console.log(`  Encontrados:  ${stats.found}`);
  console.log(`  Arquivados:   ${DRY_RUN ? `${stats.found} (simulado)` : stats.archived}`);
  console.log(`  Deletados:    ${DRY_RUN ? `${stats.found} (simulado)` : stats.deleted}`);
  console.log(`  Já removidos: ${stats.skipped}`);
  console.log(`  Modo:         ${DRY_RUN ? 'DRY RUN — nada foi gravado' : 'APPLY — concluído'}`);
  console.log(HR);

  if (!DRY_RUN && stats.archived > 0) {
    console.log('\n  ℹ️  Arquivos em settings/_deprecated/ expiram em 30 dias.');
    console.log('     Após esse prazo, podem ser deletados manualmente.\n');
  }
  console.log('');
}

main().catch(err => {
  console.error('\n❌  Erro fatal:', err);
  process.exit(1);
});
