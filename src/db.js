/**
 * db.js — Camada de acesso ao Firebase Firestore
 *
 * Coleções:
 *   contracts  { id, data, updatedAt }
 *   posts      { id, contractId, data, updatedAt }
 *   settings   { key (doc id), value }
 *
 * Interface idêntica à versão Supabase — App.jsx não muda.
 */

import {
  collection, doc,
  getDocs, getDoc,
  setDoc, deleteDoc,
  writeBatch,
  onSnapshot,
  orderBy, query,
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
  const now   = new Date().toISOString()

  // Upsert all current contracts
  for (const c of contracts) {
    const ref = doc(db, 'contracts', c.id)
    batch.set(ref, { id: c.id, data: c, updatedAt: now })
  }

  // Delete removed contracts
  const currentIds = new Set(contracts.map(c => c.id))
  for (const id of (previousIds || [])) {
    if (!currentIds.has(id)) {
      batch.delete(doc(db, 'contracts', id))
    }
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
  const now   = new Date().toISOString()

  for (const p of posts) {
    const ref = doc(db, 'posts', p.id)
    batch.set(ref, { id: p.id, contractId: p.contractId, data: p, updatedAt: now })
  }

  const currentIds = new Set(posts.map(p => p.id))
  for (const id of (previousIds || [])) {
    if (!currentIds.has(id)) {
      batch.delete(doc(db, 'posts', id))
    }
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

// ─── Real-time subscriptions ──────────────────────────────

export function subscribeToChanges({ onContracts, onPosts, onSetting }) {
  const qC = query(collection(db, 'contracts'), orderBy('updatedAt', 'asc'))
  const qP = query(collection(db, 'posts'),     orderBy('updatedAt', 'asc'))

  const unsubContracts = onSnapshot(qC, snap => {
    onContracts(snap.docs.map(d => d.data().data))
  })

  const unsubPosts = onSnapshot(qP, snap => {
    onPosts(snap.docs.map(d => d.data().data))
  })

  const unsubSettings = onSnapshot(collection(db, 'settings'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'modified' || change.type === 'added') {
        const { key, value } = change.doc.data()
        onSetting(key, value)
      }
    })
  })

  return () => {
    unsubContracts()
    unsubPosts()
    unsubSettings()
  }
}
