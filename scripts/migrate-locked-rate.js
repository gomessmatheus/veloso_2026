/**
 * scripts/migrate-locked-rate.js
 *
 * FASE 7.5 — Migração Firestore idempotente
 *
 * O QUE FAZ:
 *   1. Adiciona { lockedRate: null, lockedRateAt: null } em todos os
 *      contratos que não têm esses campos (idempotente).
 *   2. Remove os documentos settings/eurRate e settings/usdRate que
 *      ficaram órfãos após a FASE 7 (DT-04).
 *
 * SCHEMA ANTES:
 *   contracts/{id}: {
 *     currency: 'BRL'|'EUR'|'USD',
 *     contractValue: number,
 *     // lockedRate: AUSENTE em contratos antigos
 *     // lockedRateAt: AUSENTE em contratos antigos
 *   }
 *
 * SCHEMA DEPOIS:
 *   contracts/{id}: {
 *     currency: 'BRL'|'EUR'|'USD',
 *     contractValue: number,
 *     lockedRate: number | null,    ← cotação travada na assinatura
 *     lockedRateAt: string | null,  ← ISO 8601 de quando foi travada
 *   }
 *
 * SEGURANÇA:
 *   - Não modifica contratos que já têm lockedRate (respeita edição manual)
 *   - Batch de 500 ops (limite Firestore)
 *   - Dry run com DRY_RUN=true
 *
 * USO:
 *   # Pré-requisito: firebase-admin instalado e credencial configurada
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/migrate-locked-rate.js
 *
 *   # Dry run (não grava):
 *   DRY_RUN=true node scripts/migrate-locked-rate.js
 *
 * FIRESTORE RULES afetadas:
 *   Nenhuma — campos novos são opcionais e a regra existente de
 *   autenticação já cobre contratos.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';
import { readFileSync }                   from 'fs';

// ─── Configuração ──────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === 'true';

if (!getApps().length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    console.error('Erro: defina GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
}

const db = getFirestore();

// ─── Helpers ───────────────────────────────────────────────────

/** Commit em lotes de 500 (limite Firestore) */
async function commitInBatches(ops, label) {
  const BATCH_SIZE = 499;
  let committed = 0;

  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const slice  = ops.slice(i, i + BATCH_SIZE);
    const batch  = db.batch();
    for (const { ref, data } of slice) batch.update(ref, data);

    if (DRY_RUN) {
      console.log(`  [dry-run] ${label}: ${slice.length} operações simuladas`);
    } else {
      await batch.commit();
      committed += slice.length;
    }
  }
  return committed;
}

// ─── 1. Migração de contratos ──────────────────────────────────

async function migrateContracts() {
  console.log('\n📄 Migração: contracts/{id} → lockedRate + lockedRateAt\n');

  const snap = await db.collection('contracts').get();
  const ops  = [];
  let alreadyOk = 0;

  for (const doc of snap.docs) {
    const data    = doc.data();
    const updates = {};

    // Idempotente: só adiciona se o campo não existir
    if (!('lockedRate' in data))    updates.lockedRate    = null;
    if (!('lockedRateAt' in data))  updates.lockedRateAt  = null;

    if (Object.keys(updates).length > 0) {
      ops.push({ ref: doc.ref, data: updates });
    } else {
      alreadyOk++;
    }
  }

  console.log(`  Contratos no total:          ${snap.size}`);
  console.log(`  Já com lockedRate:            ${alreadyOk}`);
  console.log(`  Precisam de migração:         ${ops.length}`);

  if (ops.length === 0) {
    console.log('\n  ✓ Nada a fazer — migração já completa.\n');
    return 0;
  }

  const committed = await commitInBatches(ops, 'contracts');

  if (DRY_RUN) {
    console.log(`\n  [dry-run] ${ops.length} contratos seriam atualizados.\n`);
  } else {
    console.log(`\n  ✓ ${committed} contratos atualizados com sucesso.\n`);
  }

  return committed;
}

// ─── 2. Limpeza de settings órfãs (DT-04) ─────────────────────

async function cleanStaleSettings() {
  console.log('🧹 Limpeza: settings/{eurRate,usdRate} (órfãos da Fase 7)\n');

  const keysToDelete = ['eurRate', 'usdRate'];
  let deleted = 0;

  for (const key of keysToDelete) {
    const ref  = db.collection('settings').doc(key);
    const snap = await ref.get();

    if (!snap.exists) {
      console.log(`  ${key}: já inexistente — skip`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] settings/${key} seria deletado`);
    } else {
      await ref.delete();
      deleted++;
      console.log(`  ✓ settings/${key} removido`);
    }
  }

  console.log(`\n  Total removido: ${DRY_RUN ? '0 (dry-run)' : deleted}\n`);
  return deleted;
}

// ─── Execução ──────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════');
  console.log('  FASE 7.5 — Migration: lockedRate + cleanup');
  console.log(`  Modo: ${DRY_RUN ? 'DRY RUN (sem gravação)' : 'PRODUÇÃO'}`);
  console.log('════════════════════════════════════════════════');

  const contractsUpdated = await migrateContracts();
  const settingsDeleted  = await cleanStaleSettings();

  console.log('════════════════════════════════════════════════');
  console.log('  RESUMO');
  console.log(`  Contratos migrados: ${DRY_RUN ? '(dry-run)' : contractsUpdated}`);
  console.log(`  Settings removidas: ${DRY_RUN ? '(dry-run)' : settingsDeleted}`);
  console.log('════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌ Erro na migration:', err);
  process.exit(1);
});
