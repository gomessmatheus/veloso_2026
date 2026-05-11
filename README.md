# Migrations

Scripts de migração de dados Firestore. **Sempre idempotentes.**

---

## 2026-05 — Backfill `lockedRate` em contratos estrangeiros

**Arquivo:** `scripts/migrations/2026-05-add-lockedRate-defaults.mjs`

**Problema:** Contratos em EUR/USD criados antes da Fase 7 não têm o campo
`lockedRate`. Sem ele, o `FxContractCard` não consegue calcular a variação
cambial e pode renderizar valores incorretos.

**O que faz:**
- Lê contratos onde `currency ≠ 'BRL'` **e** `lockedRate` é `undefined`
- Contratos com `lockedRate` já definido (mesmo `null`) são ignorados
- Se o contrato tem `signedAt`: busca cotação histórica na AwesomeAPI para
  aquela data e salva como `lockedRate`
- Se não tem `signedAt`: salva `lockedRate = null`, `lockedRateAt = null` e
  adiciona `migrations.lockedRateBackfilled = false` para revisão manual

### Pré-requisitos

```bash
# Firebase Admin SDK
npm install --save-dev firebase-admin

# Credencial de serviço
# Baixe em: Firebase Console → Configurações → Contas de serviço → Gerar nova chave privada
# Salve como serviceAccount.json na raiz do projeto (não commitar no git!)
echo "serviceAccount.json" >> .gitignore
```

### Rodar

```bash
# 1. Dry run (padrão) — lê dados, simula, NÃO grava
node scripts/migrations/2026-05-add-lockedRate-defaults.mjs

# ou explícito:
node scripts/migrations/2026-05-add-lockedRate-defaults.mjs --dry

# 2. Aplicar — grava no Firestore
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
  node scripts/migrations/2026-05-add-lockedRate-defaults.mjs --apply
```

### Exemplo de saída (dry run)

```
══════════════════════════════════════════════════════════
  Migration: 2026-05 add-lockedRate-defaults
  Modo: 🔍 DRY RUN (nenhuma gravação)
══════════════════════════════════════════════════════════

📄 Lendo contracts...
   Total de documentos: 12

🎯 Candidatos (currency ≠ BRL, sem lockedRate): 2

  [1/2] Paco Rabanne (EUR, assinado 15/01/2026)
    ✓ lockedRate = 6.42 (EUR/BRL em 15/01/2026)
  [2/2] Outro Cliente (USD, sem signedAt → revisão manual)

══════════════════════════════════════════════════════════
  RELATÓRIO
  Total processados:              2
  Com cotação histórica:          1 ✓
  Sem signedAt (revisão manual):  1 ⚠️
  Sem cotação (revisão manual):   0 ⚠️
  Modo:                           DRY RUN — nada foi gravado
══════════════════════════════════════════════════════════
```

### Pós-migration

Para identificar contratos que precisam de revisão manual, filtre no Firestore:
```
WHERE data.migrations.lockedRateBackfilled == false
```

Em seguida, abra cada contrato no app, acesse **Editar → Cotação na
assinatura** e preencha manualmente.

### Idempotência

A guarda é `!('lockedRate' in contract)`. Rodar o script duas vezes não
altera nenhum contrato que já passou pela migration — mesmo que `lockedRate`
seja `null`.

---

## Convenção para novas migrations

- Arquivo: `scripts/migrations/YYYY-MM-descricao-curta.mjs`
- Sempre com `--dry` como padrão e `--apply` para gravar
- Sempre idempotentes (guarda explícita de "já foi aplicada")
- Sempre logar relatório ao final
