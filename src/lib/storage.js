/**
 * storage.js — Firebase Storage helpers
 *
 * Upload e remoção de arquivos vinculados a contratos.
 * Arquivos são armazenados em: contracts/{contractId}/{fileName}
 */

import { storage } from '../firebase.js'
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'

function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function uid() {
  try { return crypto.randomUUID().slice(0, 8) } catch { return Math.random().toString(36).slice(2, 10) }
}

/**
 * Upload de um arquivo do contrato.
 * @param {string} contractId
 * @param {File} file
 * @returns {Promise<{path:string,url:string,name:string,size:number,type:string,uploadedAt:string}>}
 */
export async function uploadContractFile(contractId, file) {
  const safeName = `${Date.now()}_${uid()}_${sanitize(file.name)}`
  const path = `contracts/${contractId}/${safeName}`
  const r = ref(storage, path)
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' })
  const url = await getDownloadURL(r)
  return {
    path,
    url,
    name: file.name,
    size: file.size,
    type: file.type,
    uploadedAt: new Date().toISOString(),
  }
}

/**
 * Remove um arquivo do contrato do Storage.
 * É idempotente: ignora erro de "não existe".
 * @param {string} path
 */
export async function deleteContractFile(path) {
  if (!path) return
  try {
    await deleteObject(ref(storage, path))
  } catch (err) {
    if (err?.code === 'storage/object-not-found') return
    throw err
  }
}
