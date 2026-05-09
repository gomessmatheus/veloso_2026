import { COMM_RATE, MONTHS_SH } from "../constants/tokens.js";
import { STAGES, PRODUCTION_RULES, STAGE_IDS } from "../constants/tasks.js";

// ─── Date utils used in pipeline ─────────────────────────
export function addDays(dateStr, n) {
  if (!dateStr || n == null) return null;
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + n);
    return d.toISOString().substr(0, 10);
  } catch { return null; }
}

export function calcStageDates(postDate) {
  if (!postDate) return {};
  const dates = {};
  STAGES.forEach(s => { dates[s.id] = addDays(postDate, s.days); });
  return dates;
}

export function stageDeadline(deliverable, stageId) {
  if (!deliverable) return null;
  if (deliverable.stageDateOverrides?.[stageId]) return deliverable.stageDateOverrides[stageId];
  if (!deliverable.plannedPostDate) return null;
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) return null;
  return addDays(deliverable.plannedPostDate, stage.days);
}

// ─── Production validation ────────────────────────────────
export function validateDeliverable(d) {
  if (!d?.plannedPostDate) return [];
  const warnings = [];
  STAGES.filter(s => s.minDays > 0 && s.id !== "postagem" && s.id !== "done").forEach(s => {
    const deadline = d.stageDateOverrides?.[s.id] || addDays(d.plannedPostDate, s.days);
    if (!deadline) return;
    const prev = STAGES[STAGES.findIndex(x => x.id === s.id) - 1];
    if (!prev) return;
    const prevDeadline = d.stageDateOverrides?.[prev.id] || addDays(d.plannedPostDate, prev.days);
    if (!prevDeadline) return;
    const gap = Math.round((new Date(deadline) - new Date(prevDeadline)) / 86400000);
    if (gap < s.minDays) {
      warnings.push({ stage: s.id, label: s.label, got: gap, need: s.minDays, rule: s.rule });
    }
  });
  return warnings;
}

// ─── Contract financial calculations ─────────────────────
export function monthsBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start), e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

export function getInstallments(c) {
  if (c.installments?.length > 0) return c.installments;
  const arr = [];
  if (c.parc1Deadline || c.parc1Value) arr.push({ value: Number(c.parc1Value) || 0, date: c.parc1Deadline || "" });
  if (c.parc2Deadline || c.parc2Value) arr.push({ value: Number(c.parc2Value) || 0, date: c.parc2Deadline || "" });
  return arr.length ? arr : [];
}

export function contractTotal(c) {
  if (c.paymentType === "monthly") {
    const m = monthsBetween(c.contractStart, c.contractDeadline);
    return m ? (c.monthlyValue || 0) * m : 0;
  }
  if (c.paymentType === "split") {
    const inst = getInstallments(c);
    if (inst.length) return inst.reduce((s, i) => s + (Number(i.value) || 0), 0);
  }
  return c.contractValue || 0;
}

export function toBRL(value, currency, rates) {
  if (currency === "BRL" || !currency) return value;
  if (currency === "EUR") return rates.eur > 0 ? value * rates.eur : value;
  if (currency === "USD") return rates.usd > 0 ? value * rates.usd : value;
  return value;
}

export function getCommEntries(c) {
  if (!c.hasCommission) return [];
  const paid = c.commPaid || {};
  if (c.paymentType === "monthly") {
    if (!c.contractStart || !c.contractDeadline) return [];
    const entries = [];
    const s = new Date(c.contractStart), e = new Date(c.contractDeadline);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      entries.push({
        key, label: `${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`,
        amount: (c.monthlyValue || 0) * COMM_RATE,
        currency: c.currency, isPaid: !!paid[key],
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return entries;
  }
  const totalCosts = (c.costs || []).reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (c.paymentType === "split") {
    const O = ["1ª","2ª","3ª","4ª","5ª","6ª"];
    const insts = getInstallments(c);
    const costPerInst = insts.length ? totalCosts / insts.length : 0;
    return insts.map((inst, i) => ({
      key: `parc${i + 1}`, label: `${O[i] || `${i + 1}ª`} Parcela`,
      amount: Math.max(0, (Number(inst.value) || 0) - costPerInst) * COMM_RATE,
      currency: c.currency, date: inst.date, isPaid: !!paid[`parc${i + 1}`],
    }));
  }
  const total = contractTotal(c);
  const costs = (c.costs || []).reduce((s, x) => s + (Number(x.value) || 0), 0);
  const netTotal = Math.max(0, total - costs);
  return [{ key:"single", label:"Pagamento Único", amount:netTotal * COMM_RATE, currency:c.currency, date:c.paymentDeadline, isPaid:!!paid["single"] }];
}

export function getNFEntries(c) {
  const nf = c.nfEmitted || {};
  if (c.paymentType === "monthly") {
    if (!c.contractStart || !c.contractDeadline) return [];
    const entries = [];
    const s = new Date(c.contractStart), e = new Date(c.contractDeadline);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      entries.push({ key, label:`NF ${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`, amount:c.monthlyValue || 0, currency:c.currency, isEmitted:!!nf[key] });
      cur.setMonth(cur.getMonth() + 1);
    }
    return entries;
  }
  if (c.paymentType === "split") {
    const O = ["1ª","2ª","3ª","4ª","5ª","6ª"];
    return getInstallments(c).map((inst, i) => ({
      key: `parc${i + 1}`, label: `NF ${O[i] || `${i + 1}ª`} Parcela`,
      amount: Number(inst.value) || 0, currency: c.currency, date: inst.date, isEmitted: !!nf[`parc${i + 1}`],
    }));
  }
  const total = contractTotal(c);
  return [{ key:"single", label:"NF Única", amount:total, currency:c.currency, date:c.paymentDeadline, isEmitted:!!nf["single"] }];
}

// ─── Slot / capacity calculator ───────────────────────────
export function calcAvailableSlots(deliverables, contracts, weeksAhead = 8) {
  const today = new Date();
  const slots = [];
  for (let w = 0; w < weeksAhead; w++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekDels = deliverables.filter(d => {
      if (!d.plannedPostDate || d.stage === "done") return false;
      const ds = new Date(d.plannedPostDate);
      const diff = Math.round((ds - weekStart) / 86400000);
      return diff >= 0 && diff < 7;
    });

    const publiDels = weekDels.filter(d =>
      d.contractId && (d.type === "reel" || d.type === "tiktok" || d.type === "post")
    );
    const publiCount = publiDels.length;

    let travelDays = 0;
    contracts.forEach(c => {
      if (!c.hasTravel || !c.travelDates?.length) return;
      c.travelDates.filter(td => td.date).forEach(td => {
        const diff = Math.round((new Date(td.date) - weekStart) / 86400000);
        if (diff >= 0 && diff < 7) travelDays++;
      });
    });

    const lucasAvailable = Math.max(0, 5 - travelDays);
    const lucasUsed = weekDels.length * PRODUCTION_RULES.lucasDaysPerDeliverable;
    const lucasRemaining = Math.max(0, Math.floor((lucasAvailable - lucasUsed) / PRODUCTION_RULES.lucasDaysPerDeliverable));

    const publiSlotsRemaining = Math.max(0, PRODUCTION_RULES.maxPubliPerWeek - publiCount);
    const publiOverIdeal = publiCount > PRODUCTION_RULES.idealPubliPerWeek;
    const publiOverMax   = publiCount >= PRODUCTION_RULES.maxPubliPerWeek;

    let status = "ok";
    if (publiOverMax || lucasRemaining === 0) status = "full";
    else if (publiOverIdeal || lucasRemaining <= 1) status = "tight";

    slots.push({
      weekStart: weekStart.toISOString().substr(0, 10),
      weekEnd:   weekEnd.toISOString().substr(0, 10),
      label: weekStart.toLocaleDateString("pt-BR", { day:"numeric", month:"short" }),
      scheduled: weekDels.length,
      publiCount, publiSlotsRemaining, publiOverIdeal, publiOverMax,
      lucasAvailable, lucasUsed, lucasRemaining: Math.min(lucasRemaining, publiSlotsRemaining),
      travelDays, status,
      deliverables: publiDels.map(d => d.title),
    });
  }
  return slots;
}
