/**
 * ViewRenderer
 *
 * Central router + error boundary for all views.
 *
 * Etapa 5: wrapped in <Suspense> so that when views are extracted to
 * separate files with React.lazy(), they'll show the skeleton automatically.
 *
 * NOTE: During this transition period, view components are still defined in
 * App.jsx and passed in via props. Inject them until each view is moved to
 * its own file (e.g. src/views/DashboardView.jsx).
 */

import { Suspense } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary.jsx";

/**
 * Shown while a lazy view chunk is loading.
 * Inline style so this works even before globals.css loads.
 */
function ViewSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      {[120, 200, 160, 90, 220, 140].map((w, i) => (
        <div key={i} style={{
          height: 14, marginBottom: 16, borderRadius: 6,
          background: "#EFEFEF", width: w,
          animation: "skPulse 1.5s ease-in-out infinite",
          animationDelay: `${i * 0.08}s`,
        }} />
      ))}
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

export function ViewRenderer({
  view, contracts, posts, deliverables, stats, rates,
  saveNote, toggleComm, toggleCommPaid, toggleNF,
  setModal, setView, saveC, saveP, saveD,
  calEvents, calMonth, setCal, calFilter, setCalF,
  triggerNewTask, setTriggerNewTask, role, userName, syncStatus,
  // Injected view components (removed one by one as views get extracted)
  Dashboard, Acompanhamento, Contratos, Financeiro, Caixa,
}) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<ViewSkeleton />}>
        {view === "dashboard"      && <Dashboard contracts={contracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal} navigateTo={setView} role={role} userName={userName} />}
        {view === "acompanhamento" && <Acompanhamento contracts={contracts} posts={posts} deliverables={deliverables} saveDeliverables={saveD} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF} role={role} />}
        {view === "contratos"      && <Contratos contracts={contracts} posts={posts} deliverables={deliverables} saveC={saveC} saveP={saveP} saveDeliverables={saveD} setModal={setModal} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} saveNote={saveNote} rates={rates} role={role} />}
        {view === "caixa"          && <Caixa contracts={contracts} />}
        {view === "financeiro"     && <Financeiro contracts={contracts} posts={posts} deliverables={deliverables} rates={rates} toggleNF={toggleNF} toggleCommPaid={toggleCommPaid} saveC={saveC} role={role} />}
      </Suspense>
    </ErrorBoundary>
  );
}
