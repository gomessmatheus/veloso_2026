/**
 * db.js — Firebase Firestore data layer
 *
 * Collections:
 *   contracts, posts, deliverables, caixa_tx, settings, presence, brands
 *
 * OTIMIZAÇÕES (cota Firestore):
 *   - settings: removido onSnapshot → uma leitura getDocs no boot
 *   - brands:   sempre foi getDocs (sem listener) — mantido
 *   - subscribeToChanges agora abre apenas 3 listeners (contracts, posts, deliverables)
 *     em vez de 4, reduzindo o uso de avaliações de regras de segurança ~25%
 */

import {
  collection, doc, getDocs, getDoc,
  setDoc, deleteDoc, writeBatch,
  onSnapshot, orderBy, query, limit,
} from 'firebase/firestore'
import { db, auth } from './firebase.js'

// ─── Internal error logging ────────────────────────────────
function dbErr(tag, err) {
  console.error(`[db] ${tag}`, err)
}

// ─── Explicit single-doc deletion ─────────────────────────
export async function deleteItem(colName, id) {
  try {
    await deleteDoc(doc(db, colName, id))
  } catch (err) {
    dbErr(`deleteItem(${colName}/${id})`, err)
    throw err
  }
}

// ─── Generic safe sync ────────────────────────────────────
/**
 * Upsert items to Firestore.
 * - Writes ALL items unless changedIds (Set) is provided.
 * - NEVER deletes implicitly — use deleteItem() for that.
 * - previousIds param kept for backwards compat but ignored.
 * - Splits into ≤490-op batches.
 */
async function syncCollection(colName, items, _previousIds, extraFields = () => ({}), changedIds = null) {
  const now     = new Date().toISOString()
  const toWrite = changedIds ? items.filter(i => changedIds.has(i.id)) : items
  if (toWrite.length === 0) return

  const CHUNK = 490
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const batch = writeBatch(db)
    toWrite.slice(i, i + CHUNK).forEach(item => {
      batch.set(doc(db, colName, item.id), {
        id: item.id, data: item, updatedAt: now, ...extraFields(item),
      })
    })
    await batch.commit()
  }
}

// ─── Contracts ────────────────────────────────────────────
export async function loadContracts() {
  try {
    const snap = await getDocs(query(collection(db, 'contracts'), orderBy('updatedAt', 'desc'), limit(500)))
    return snap.docs.map(d => d.data().data).filter(Boolean)
  } catch (err) { dbErr('loadContracts', err); return [] }
}

export async function syncContracts(contracts, previousIds, changedIds) {
  try {
    await syncCollection('contracts', contracts, previousIds, () => ({}), changedIds)
  } catch (err) { dbErr('syncContracts', err); throw err }
}

// ─── Posts ────────────────────────────────────────────────
export async function loadPosts() {
  try {
    const snap = await getDocs(query(collection(db, 'posts'), orderBy('updatedAt', 'desc'), limit(500)))
    return snap.docs.map(d => d.data().data).filter(Boolean)
  } catch (err) { dbErr('loadPosts', err); return [] }
}

export async function syncPosts(posts, previousIds, changedIds) {
  try {
    await syncCollection('posts', posts, previousIds, p => ({ contractId: p.contractId }), changedIds)
  } catch (err) { dbErr('syncPosts', err); throw err }
}

// ─── Deliverables ─────────────────────────────────────────
export async function loadDeliverables() {
  try {
    const snap = await getDocs(query(collection(db, 'deliverables'), orderBy('updatedAt', 'desc'), limit(500)))
    return snap.docs.map(d => d.data().data).filter(Boolean)
  } catch (err) { dbErr('loadDeliverables', err); return [] }
}

export async function syncDeliverables(deliverables, previousIds, changedIds) {
  try {
    await syncCollection(
      'deliverables', deliverables, previousIds,
      d => ({ contractId: d.contractId, stage: d.stage }),
      changedIds,
    )
  } catch (err) { dbErr('syncDeliverables', err); throw err }
}

// ─── Caixa Transactions ───────────────────────────────────
export async function loadCaixaTx() {
  try {
    const snap = await getDocs(query(collection(db, 'caixa_tx'), orderBy('updatedAt', 'desc'), limit(500)))
    return snap.docs.map(d => d.data().data).filter(Boolean)
  } catch (err) { dbErr('loadCaixaTx', err); return [] }
}

export async function syncCaixaTx(items, previousIds = [], changedIds) {
  try {
    await syncCollection('caixa_tx', items, previousIds, () => ({}), changedIds)
  } catch (err) { dbErr('syncCaixaTx', err); throw err }
}

// ─── Brands ───────────────────────────────────────────────
export async function loadBrands() {
  try {
    const snap = await getDocs(query(collection(db, 'brands'), orderBy('updatedAt', 'desc'), limit(500)))
    return snap.docs.map(d => d.data().data).filter(Boolean)
  } catch (err) { dbErr('loadBrands', err); return [] }
}

export async function syncBrands(brands, previousIds, changedIds) {
  try {
    await syncCollection('brands', brands, previousIds, () => ({}), changedIds)
  } catch (err) { dbErr('syncBrands', err); throw err }
}

export async function deleteBrand(id) {
  return deleteItem('brands', id)
}

// ─── Settings ─────────────────────────────────────────────
// OTIMIZAÇÃO: getSetting/setSetting usam getDoc/setDoc pontuais.
// onSnapshot de settings removido de subscribeToChanges — settings
// raramente mudam e não precisam de listener em tempo real.
export async function getSetting(key) {
  try {
    const snap = await getDoc(doc(db, 'settings', key))
    return snap.exists() ? snap.data().value : null
  } catch (err) { dbErr(`getSetting(${key})`, err); return null }
}

export async function setSetting(key, value) {
  try {
    await setDoc(doc(db, 'settings', key), { key, value: String(value) })
  } catch (err) { dbErr(`setSetting(${key})`, err); throw err }
}

// ─── Presence ─────────────────────────────────────────────
const PRESENCE_COLORS = ['#C8102E','#1D4ED8','#059669','#D97706','#7C3AED','#0891B2','#BE185D','#92400E']

function getSessionId() {
  let id = sessionStorage.getItem('copa_session_id')
  if (!id) {
    try { id = crypto.randomUUID().slice(0, 12) } catch { id = Math.random().toString(36).substr(2, 12) }
    sessionStorage.setItem('copa_session_id', id)
  }
  return id
}

export function getMyPresence() {
  const sessionId   = getSessionId()
  const currentUser = typeof auth !== 'undefined' ? auth.currentUser : null

  let name  = currentUser?.displayName || currentUser?.email?.split('@')[0] || localStorage.getItem('copa_display_name')
  let color = localStorage.getItem('copa_display_color')

  if (!name) {
    name = ['Matheus','Lucas','Thiago','Ana','Pedro'][Math.floor(Math.random() * 5)]
  }
  localStorage.setItem('copa_display_name', name)

  if (!color) {
    color = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)]
    localStorage.setItem('copa_display_color', color)
  }

  return { sessionId, name, color }
}

export async function updatePresence() {
  const { sessionId, name, color } = getMyPresence()
  try {
    await setDoc(doc(db, 'presence', sessionId), {
      sessionId, name, color, lastSeen: new Date().toISOString(),
    })
  } catch (err) { dbErr('updatePresence', err) }
}

export async function removePresence() {
  try { await deleteDoc(doc(db, 'presence', getSessionId())) }
  catch (err) { dbErr('removePresence', err) }
}

export function subscribeToPresence(callback) {
  return onSnapshot(collection(db, 'presence'), snap => {
    const now = Date.now()
    callback(snap.docs.map(d => d.data()).filter(p => p.lastSeen && now - new Date(p.lastSeen).getTime() < 90_000))
  })
}

// ─── Real-time subscriptions ──────────────────────────────
/**
 * Subscribe to live changes.
 *
 * OTIMIZAÇÃO: apenas 3 listeners em tempo real (contracts, posts, deliverables).
 * Settings removido — use getSetting() para leitura pontual quando necessário.
 * Brands: carregado via loadBrands() no boot (getDocs), sem listener.
 *
 * @param {object} opts
 * @param {Function} opts.onContracts    - (contracts[]) => void
 * @param {Function} opts.onPosts        - (posts[]) => void
 * @param {Function} opts.onDeliverables - (deliverables[]) => void
 * @param {Function} opts.onError        - (source, err) => void
 * @returns {Function} unsubscribe
 */
export function subscribeToChanges({ onContracts, onPosts, onDeliverables, onError }) {
  const handleErr = (tag) => (err) => {
    dbErr(`subscribeToChanges(${tag})`, err)
    onError?.(tag, err)
  }

  const qC = query(collection(db, 'contracts'),   orderBy('updatedAt', 'desc'), limit(500))
  const qP = query(collection(db, 'posts'),        orderBy('updatedAt', 'desc'), limit(500))
  const qD = query(collection(db, 'deliverables'), orderBy('updatedAt', 'desc'), limit(500))

  const unsubC = onSnapshot(qC, snap => onContracts?.(snap.docs.map(d => d.data().data).filter(Boolean)), handleErr('contracts'))
  const unsubP = onSnapshot(qP, snap => onPosts?.(snap.docs.map(d => d.data().data).filter(Boolean)),     handleErr('posts'))
  const unsubD = onSnapshot(qD, snap => onDeliverables?.(snap.docs.map(d => d.data().data).filter(Boolean)), handleErr('deliverables'))

  // Settings listener REMOVIDO — era a 4ª fonte de leituras constantes.
  // App.jsx já não usa o callback onSetting (estava vazio).

  return () => { unsubC(); unsubP(); unsubD() }
}

// ─── User Roles ───────────────────────────────────────────
const DEFAULT_ROLES = {
  'lucas.veloso4001@gmail.com': 'influencer',
  'caio@rnkd.com.br':           'agente',
  'matheus@rnkd.com.br':        'atendimento',
  'beatriz@rnkd.com.br':        'atendimento',
  'thiago@rnkd.com.br':         'agente',
  'matheussgbf@gmail.com':      'admin',
}

export async function getUserRole(email) {
  try {
    const snap = await getDoc(doc(db, 'settings', 'user_roles'))
    if (snap.exists()) return snap.data()[email] || 'atendimento'
    await setDoc(doc(db, 'settings', 'user_roles'), DEFAULT_ROLES)
    return DEFAULT_ROLES[email] || 'atendimento'
  } catch (err) {
    dbErr(`getUserRole(${email})`, err)
    return DEFAULT_ROLES[email] || 'atendimento'
  }
}

export async function setUserRoles(roles) {
  try {
    await setDoc(doc(db, 'settings', 'user_roles'), roles)
  } catch (err) { dbErr('setUserRoles', err); throw err }
}

// ─── FX Prefs ─────────────────────────────────────────────
export async function getFxPrefs(uid) {
  if (!uid) return null
  try {
    const snap = await getDoc(doc(db, 'settings', `fx_prefs_${uid}`))
    return snap.exists() ? snap.data().prefs : null
  } catch (err) { dbErr('getFxPrefs', err); return null }
}

export async function setFxPrefs(uid, prefs) {
  if (!uid) return
  try {
    await setDoc(doc(db, 'settings', `fx_prefs_${uid}`), { uid, prefs, updatedAt: new Date().toISOString() })
  } catch (err) { dbErr('setFxPrefs', err); throw err }
}

// ─── FX History ───────────────────────────────────────────
// OTIMIZAÇÃO: getFxHistory/appendFxHistory são operações pontuais (getDoc/setDoc).
// Não há onSnapshot de fx_history — já estava correto, mantido.
export async function getFxHistory(uid) {
  if (!uid) return []
  try {
    const snap = await getDoc(doc(db, 'fx_history', uid))
    return snap.exists() ? (snap.data().records || []) : []
  } catch (err) { dbErr('getFxHistory', err); return [] }
}

export async function appendFxHistory(uid, record) {
  if (!uid) return
  try {
    const ref      = doc(db, 'fx_history', uid)
    const snap     = await getDoc(ref)
    const existing = snap.exists() ? (snap.data().records || []) : []
    const records  = [record, ...existing].slice(0, 10)
    await setDoc(ref, { uid, records, updatedAt: new Date().toISOString() })
  } catch (err) { dbErr('appendFxHistory', err) }
}
