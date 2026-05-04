/**
 * db.js — Firebase Firestore + Presence
 */
import {
  collection, doc,
  getDocs, getDoc,
  setDoc, deleteDoc,
  writeBatch,
  onSnapshot,
  orderBy, query, where,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'

// ─── Contracts ────────────────────────────────────────────
export async function loadContracts() {
  const q = query(collection(db, 'contracts'), orderBy('updatedAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data().data)
}
export async function syncContracts(contracts, previousIds) {
  const batch = writeBatch(db)
  const now = new Date().toISOString()
  for (const c of contracts) {
    batch.set(doc(db, 'contracts', c.id), { id: c.id, data: c, updatedAt: now })
  }
  const currentIds = new Set(contracts.map(c => c.id))
  for (const id of (previousIds || [])) {
    if (!currentIds.has(id)) batch.delete(doc(db, 'contracts', id))
  }
  await batch.commit()
}

// ─── Posts ────────────────────────────────────────────────
export async function loadPosts() {
  const q = query(collection(db, 'posts'), orderBy('updatedAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data().data)
}
export async function syncPosts(posts, previousIds) {
  const batch = writeBatch(db)
  const now = new Date().toISOString()
  for (const p of posts) {
    batch.set(doc(db, 'posts', p.id), { id: p.id, contractId: p.contractId, data: p, updatedAt: now })
  }
  const currentIds = new Set(posts.map(p => p.id))
  for (const id of (previousIds || [])) {
    if (!currentIds.has(id)) batch.delete(doc(db, 'posts', id))
  }
  await batch.commit()
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
const PRESENCE_COLORS = [
  '#C8102E','#1D4ED8','#059669','#D97706','#7C3AED',
  '#0891B2','#BE185D','#92400E','#374151','#0F766E',
]

function getSessionId() {
  let id = sessionStorage.getItem('copa_session_id')
  if (!id) {
    id = Math.random().toString(36).substr(2, 12)
    sessionStorage.setItem('copa_session_id', id)
  }
  return id
}
function getSessionName() {
  let name = localStorage.getItem('copa_display_name')
  if (!name) {
    const names = ['Matheus','Lucas','Thiago','Ana','Pedro','Carol']
    name = names[Math.floor(Math.random() * names.length)]
    localStorage.setItem('copa_display_name', name)
  }
  return name
}
function getSessionColor() {
  let color = localStorage.getItem('copa_display_color')
  if (!color) {
    color = PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)]
    localStorage.setItem('copa_display_color', color)
  }
  return color
}

export function getMyPresence() {
  return {
    sessionId: getSessionId(),
    name: getSessionName(),
    color: getSessionColor(),
  }
}

export async function updatePresence() {
  const { sessionId, name, color } = getMyPresence()
  try {
    await setDoc(doc(db, 'presence', sessionId), {
      sessionId, name, color,
      lastSeen: new Date().toISOString(),
      page: window.location.pathname,
    })
  } catch {}
}

export async function removePresence() {
  const { sessionId } = getMyPresence()
  try { await deleteDoc(doc(db, 'presence', sessionId)) } catch {}
}

export function subscribeToPresence(callback) {
  return onSnapshot(collection(db, 'presence'), snap => {
    const now = Date.now()
    const online = snap.docs
      .map(d => d.data())
      .filter(p => {
        if (!p.lastSeen) return false
        return now - new Date(p.lastSeen).getTime() < 90_000 // 90s window
      })
    callback(online)
  })
}

// ─── Real-time subscriptions ──────────────────────────────
export function subscribeToChanges({ onContracts, onPosts, onSetting }) {
  const qC = query(collection(db, 'contracts'), orderBy('updatedAt', 'asc'))
  const qP = query(collection(db, 'posts'), orderBy('updatedAt', 'asc'))
  const unsubC = onSnapshot(qC, snap => onContracts(snap.docs.map(d => d.data().data)))
  const unsubP = onSnapshot(qP, snap => onPosts(snap.docs.map(d => d.data().data)))
  const unsubS = onSnapshot(collection(db, 'settings'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'modified' || change.type === 'added') {
        const { key, value } = change.doc.data()
        onSetting(key, value)
      }
    })
  })
  return () => { unsubC(); unsubP(); unsubS() }
}
