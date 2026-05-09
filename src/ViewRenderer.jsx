/**
 * ViewRenderer
 *
 * Central router that maps view IDs to their view components.
 * Wraps each view in the ErrorBoundary so a per-view crash
 * does not take down the entire app.
 *
 * NOTE: During Etapa 1 the view components (Dashboard, Acompanhamento, etc.)
 * are still defined in the parent App.jsx and passed in via props.
 * Once each view is extracted to its own file (future etapas),
 * import them here and remove the props.
 */

import { useState, useEffect } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";
import { Btn } from "../components/ui.jsx";
import { RED, TX, B2, LN } from "../constants/tokens.js";

export function ViewRenderer({
  view, contracts, posts, deliverables, stats, rates,
  saveNote, toggleComm, toggleCommPaid, toggleNF,
  setModal, setView, saveC, saveP, saveD,
  calEvents, calMonth, setCal, calFilter, setCalF,
  role, userName,
  // Injected view components (temp — removed once views are extracted)
  Dashboard, Acompanhamento, Contratos, Financeiro, Caixa,
}) {
  return (
    <ErrorBoundary>
      {view === "dashboard"      && <Dashboard contracts={contracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal} navigateTo={setView} role={role} userName={userName} />}
      {view === "acompanhamento" && <Acompanhamento contracts={contracts} posts={posts} deliverables={deliverables} saveDeliverables={saveD} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF} role={role} />}
      {view === "contratos"      && <Contratos contracts={contracts} posts={posts} deliverables={deliverables} saveC={saveC} saveP={saveP} saveDeliverables={saveD} setModal={setModal} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} saveNote={saveNote} rates={rates} role={role} />}
      {view === "caixa"          && <Caixa contracts={contracts} />}
      {view === "financeiro"     && <Financeiro contracts={contracts} posts={posts} deliverables={deliverables} rates={rates} toggleNF={toggleNF} toggleCommPaid={toggleCommPaid} saveC={saveC} role={role} />}
    </ErrorBoundary>
  );
}
