# Refactor — split-app

Esta branch contem o **scaffold** (estrutura de pastas vazia) para a refatoração do `src/App.jsx`
(6.208 linhas) em módulos. Cada arquivo contém apenas um cabeçalho e TODOs.

## Restrições

- Não renomear coleções nem campos do Firestore (contracts, posts, deliverables, caixa_tx, settings, presence).
- Não quebrar a API pública de `src/db.js`.
- Manter compatibilidade com dados antigos (parc1Value/parc2Value coexistindo com installments[]).
- Preservar todas as views, modais e regras de papéis (admin, agente, atendimento, influencer).
- Manter JSX (não introduzir TypeScript nesta etapa).

## Estrutura criada

```
src/
  constants/  tokens.js, roles.js, tasks.js
    utils/      id.js, format.js, contracts.js, posts.js
      hooks/      useAuth.js, useIsMobile.js, usePresence.js, useFirestoreSync.js, useToast.js
        context/    ToastContext.jsx, RoleContext.jsx
          components/ ErrorBoundary.jsx, Sidebar.jsx, TopBar.jsx, MobileNav.jsx,
                        LoginPage.jsx, UserInviteModal.jsx,
                                      modals/ContractModal.jsx, modals/PostModal.jsx
                                        views/      DashboardView.jsx, AcompanhamentoView.jsx, ContratosView.jsx,
                                                      FinanceiroView.jsx, CaixaView.jsx, CalendarView.jsx, ViewRenderer.jsx
                                                        styles/     globals.css
                                                        ```

                                                        ## Próximos passos (executar em commits separados)

                                                        1. **Etapa 1 — Refator puro**: mover código de `App.jsx` para os arquivos acima, sem alterar comportamento.
                                                        2. **Etapa 2 — Robustez**: refatorar `syncCollection`, ErrorBoundary, presence usando auth, limit nas queries.
                                                        3. **Etapa 3 — UX**: skeletons, transições, empty states, toasts, foco visível, aria-labels.
                                                        4. **Etapa 4 — Precisão**: avisos em contractTotal, toBRL retornando null, commissionRate por contrato.
                                                        5. **Etapa 5 — DX/Build**: manualChunks, React.lazy nas views, ESLint/Prettier, Vitest.

                                                        ## Validação

                                                        A cada etapa: `npm run build` deve passar e `npm run dev` deve abrir o app, fazer login e listar
                                                        dados existentes do Firestore (sem perder nada visualmente).
                                                        
