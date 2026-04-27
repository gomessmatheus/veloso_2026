# Veloso 2026 · OP

Dashboard operacional colaborativo — contratos, entregas, comissões e NF da Copa do Mundo 2026.

**Multi-usuário em tempo real** via Firebase Firestore.

---

## Stack

| Camada     | Tecnologia                     |
|------------|-------------------------------|
| Frontend   | React 18 + Vite               |
| Banco      | Firebase Firestore (Realtime) |
| Deploy     | Vercel                        |

---

## Setup rápido

### 1. Criar projeto no Firebase
1. Acesse console.firebase.google.com
2. "Add project" → dê um nome → desative Google Analytics → "Create project"
3. No menu lateral: "Build" → "Firestore Database" → "Create database" → "Start in test mode" → escolha região us-east1

### 2. Pegar as credenciais
1. Clique na engrenagem ⚙️ → "Project settings"
2. Role até "Your apps" → clique em `</>` (Web)
3. Registre o app (nome qualquer) → copie o bloco `firebaseConfig`

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Preencha `.env` com os valores do `firebaseConfig`.

### 4. Rodar local
```bash
npm install
npm run dev
```

### 5. Deploy no Vercel
1. Push para o GitHub
2. Importe no vercel.com
3. Adicione as 6 variáveis `VITE_FIREBASE_*` em Environment Variables
4. Deploy

### 6. Regras do Firestore (acesso público ao time)
No Firebase Console → Firestore → Rules, cole o conteúdo de `firebase/firestore.rules`.

---

## Estrutura

```
veloso2026-op/
├── src/
│   ├── App.jsx        ← componentes e lógica
│   ├── db.js          ← operações Firestore + Realtime
│   ├── firebase.js    ← client init
│   └── main.jsx
├── firebase/
│   └── firestore.rules
├── .env.example
├── index.html
├── vite.config.js
└── package.json
```
