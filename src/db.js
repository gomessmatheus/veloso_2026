/**
 * db.js — Firebase Firestore
 * Collections: contracts, posts, deliverables, caixa_tx, settings, presence
 */
import {
  collection, doc, getDocs, getDoc,
  setDoc, deleteDoc, writeBatch,
  onSnapshot, orderBy, query,
} from 'firebase/firestore'
import { db } from './firebase.js'

// ─── Generic sync helper ──────────────────────────────────
async function syncCollection(colName, items, previousIds, extraFields = {}) {
  const batch = writeBatch(db)
  const now = new Date().toISOString()
  for (const item of items) {
    batch.set(doc(db, colName, item.id), {
      id: item.id, data: item, updatedAt: now, ...extraFields(item)
    })
  }
  const currentIds = new Set(items.map(i => i.id))
  for (const id of (previousIds || [])) {
    if (!currentIds.has(id)) batch.delete(doc(db, colName, id))
  }
  await batch.commit()
}

// ─── Contracts ────────────────────────────────────────────
export async function loadContracts() {
  const snap = await getDocs(query(collection(db, 'contracts'), orderBy('updatedAt', 'asc')))
  return snap.docs.map(d => d.data().data)
}
export async function syncContracts(contracts, previousIds) {
  await syncCollection('contracts', contracts, previousIds, () => ({}))
}

// ─── Posts ────────────────────────────────────────────────
export async function loadPosts() {
  const snap = await getDocs(query(collection(db, 'posts'), orderBy('updatedAt', 'asc')))
  return snap.docs.map(d => d.data().data)
}
export async function syncPosts(posts, previousIds) {
  await syncCollection('posts', posts, previousIds, p => ({ contractId: p.contractId }))
}

// ─── Deliverables ─────────────────────────────────────────
export async function loadDeliverables() {
  try {
    const snap = await getDocs(query(collection(db, 'deliverables'), orderBy('updatedAt', 'asc')))
    return snap.docs.map(d => d.data().data)
  } catch { return [] }
}
export async function syncDeliverables(deliverables, previousIds) {
  await syncCollection('deliverables', deliverables, previousIds, d => ({ contractId: d.contractId, stage: d.stage }))
}

// ─── Caixa Transactions ───────────────────────────────────
export async function loadCaixaTx() {
  try {
    const snap = await getDocs(collection(db, 'caixa_tx'))
    return snap.docs.map(d => d.data().data).filter(Boolean)
  } catch { return [] }
}
export async function syncCaixaTx(items, previousIds = []) {
  await syncCollection('caixa_tx', items, previousIds, () => ({}))
}

// ─── Settings ─────────────────────────────────────────────
export async function getSetting(key) {
  const snap = await getDoc(doc(db, 'settings', key))
  return snap.exists() ? snap.data().value : null
}
export async function setSetting(key, value) {
  await setDoc(doc(db, 'settings', key), { key, value: String(value) })
}

// ─── Presence ─────────────────────────────────────────────
const PRESENCE_COLORS = ['#C8102E','#1D4ED8','#059669','#D97706','#7C3AED','#0891B2','#BE185D','#92400E']

function getSessionId() {
  let id = sessionStorage.getItem('copa_session_id')
  if (!id) { id = Math.random().toString(36).substr(2, 12); sessionStorage.setItem('copa_session_id', id) }
  return id
}
export function getMyPresence() {
  const sessionId = getSessionId()
  let name  = localStorage.getItem('copa_display_name')
  let color = localStorage.getItem('copa_display_color')
  if (!name)  { name  = ['Matheus','Lucas','Thiago','Ana','Pedro'][Math.floor(Math.random()*5)]; localStorage.setItem('copa_display_name', name) }
  if (!color) { color = PRESENCE_COLORS[Math.floor(Math.random()*PRESENCE_COLORS.length)]; localStorage.setItem('copa_display_color', color) }
  return { sessionId, name, color }
}
export async function updatePresence() {
  const { sessionId, name, color } = getMyPresence()
  try { await setDoc(doc(db, 'presence', sessionId), { sessionId, name, color, lastSeen: new Date().toISOString() }) } catch {}
}
export async function removePresence() {
  try { await deleteDoc(doc(db, 'presence', getSessionId())) } catch {}
}
export function subscribeToPresence(callback) {
  return onSnapshot(collection(db, 'presence'), snap => {
    const now = Date.now()
    callback(snap.docs.map(d => d.data()).filter(p => p.lastSeen && now - new Date(p.lastSeen).getTime() < 90_000))
  })
}

// ─── Real-time subscriptions ──────────────────────────────
export function subscribeToChanges({ onContracts, onPosts, onDeliverables, onSetting }) {
  const qC = query(collection(db, 'contracts'),   orderBy('updatedAt', 'asc'))
  const qP = query(collection(db, 'posts'),        orderBy('updatedAt', 'asc'))
  const qD = query(collection(db, 'deliverables'), orderBy('updatedAt', 'asc'))
  const unsubC = onSnapshot(qC, snap => onContracts(snap.docs.map(d => d.data().data)))
  const unsubP = onSnapshot(qP, snap => onPosts(snap.docs.map(d => d.data().data)))
  const unsubD = onSnapshot(qD, snap => onDeliverables?.(snap.docs.map(d => d.data().data)))
  const unsubS = onSnapshot(collection(db, 'settings'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'modified' || change.type === 'added') {
        const { key, value } = change.doc.data()
        onSetting?.(key, value)
      }
    })
  })
  return () => { unsubC(); unsubP(); unsubD(); unsubS() }
}
