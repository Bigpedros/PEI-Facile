/**
 * @license
 * PEI FACILE — Template Storage Engine (Phase 1B R01)
 * Local-first structured storage via IndexedDB for PDF binaries, geometries, and versioned hashes.
 * Ensures large PDF binaries are NEVER written to localStorage.
 */

import type { PersistedTemplateRecord } from './templateAcquisitionTypes';
import { computeSha256, isPdfBinary } from './templateSourceResolver';

const DB_NAME = 'pei_facile_templates_db';
const DB_VERSION = 1;
const STORE_TEMPLATES = 'custom_templates';
const STORE_BINARIES = 'template_pdf_binaries';

// In-memory fallback for headless or test environments where IndexedDB is unavailable
const memoryTemplateStore = new Map<string, PersistedTemplateRecord>();
const memoryBinaryStore = new Map<string, Uint8Array>();

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      return reject(new Error('IndexedDB not available in current environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        const templateStore = db.createObjectStore(STORE_TEMPLATES, { keyPath: 'templateId' });
        templateStore.createIndex('sourceSha256', 'sourceSha256', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BINARIES)) {
        db.createObjectStore(STORE_BINARIES); // Key: templateId or sourceSha256
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Creates an independent, defensive copy of the binary data and validates integrity.
 * Ensures that the buffer is not detached, byteLength > 0, and memory is decoupled.
 */
export function createDefensiveBinaryCopy(input?: Uint8Array | ArrayBuffer | ArrayBufferView | null): Uint8Array {
  if (!input) {
    throw new Error('Dati binari non forniti: payload nullo o non definito');
  }

  let sourceView: Uint8Array;
  let sourceBuffer: ArrayBufferLike;

  if (input instanceof Uint8Array) {
    sourceView = input;
    sourceBuffer = input.buffer;
  } else if (input instanceof ArrayBuffer) {
    sourceView = new Uint8Array(input);
    sourceBuffer = input;
  } else if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    sourceView = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    sourceBuffer = view.buffer;
  } else {
    throw new Error('Formato binario non valido: atteso Uint8Array o ArrayBuffer');
  }

  // Check if underlying buffer is detached
  if (sourceBuffer && 'detached' in sourceBuffer && (sourceBuffer as any).detached === true) {
    throw new Error('Buffer binario non valido: ArrayBuffer is detached');
  }

  if (sourceView.byteLength === 0) {
    throw new Error('Buffer binario non valido: byteLength è 0 (buffer vuoto o detached)');
  }

  // Allocate fresh backing ArrayBuffer and copy bytes
  const copyBuffer = new ArrayBuffer(sourceView.byteLength);
  const copyView = new Uint8Array(copyBuffer);
  copyView.set(sourceView);

  return copyView;
}

/**
 * Persists a complete template record and its raw PDF binary into IndexedDB.
 */
export async function saveCustomTemplate(
  record: PersistedTemplateRecord,
  pdfBinary?: Uint8Array,
  originalBinary?: Uint8Array
): Promise<void> {
  const binaryInput = pdfBinary || record.canonicalDocument || record.pdfBinary;
  const originalInput = originalBinary || record.pdfBinary;

  let binaryToSave: Uint8Array | undefined;
  let originalToSave: Uint8Array | undefined;

  if (binaryInput) {
    binaryToSave = createDefensiveBinaryCopy(binaryInput);
  }
  if (originalInput) {
    originalToSave = createDefensiveBinaryCopy(originalInput);
  }

  const metadataOnly: PersistedTemplateRecord = {
    ...record,
    pdfBinary: undefined, // strip binary from metadata record
    canonicalDocument: undefined,
    updatedAt: new Date().toISOString(),
  };

  if (!isIndexedDbAvailable()) {
    memoryTemplateStore.set(record.templateId, metadataOnly);
    if (binaryToSave) {
      memoryBinaryStore.set(record.templateId, binaryToSave);
      memoryBinaryStore.set(`${record.templateId}_normalized`, binaryToSave);
      memoryBinaryStore.set(`normalized_${record.templateId}`, binaryToSave);
      if (record.normalizedSha256) {
        memoryBinaryStore.set(record.normalizedSha256, binaryToSave);
        memoryBinaryStore.set(`hash_${record.normalizedSha256}`, binaryToSave);
        memoryBinaryStore.set(`normalized_${record.normalizedSha256}`, binaryToSave);
      }
      memoryBinaryStore.set(`normalized_${record.sourceSha256}`, binaryToSave);
    }
    if (originalToSave) {
      memoryBinaryStore.set(`${record.templateId}_original`, originalToSave);
      memoryBinaryStore.set(`original_${record.templateId}`, originalToSave);
      memoryBinaryStore.set(record.sourceSha256, originalToSave);
      memoryBinaryStore.set(`hash_${record.sourceSha256}`, originalToSave);
      memoryBinaryStore.set(`original_${record.sourceSha256}`, originalToSave);
    } else if (binaryToSave && !record.normalizedSha256) {
      memoryBinaryStore.set(record.sourceSha256, binaryToSave);
      memoryBinaryStore.set(`hash_${record.sourceSha256}`, binaryToSave);
    }
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TEMPLATES, STORE_BINARIES], 'readwrite');
    const templateStore = tx.objectStore(STORE_TEMPLATES);
    const binaryStore = tx.objectStore(STORE_BINARIES);

    templateStore.put(metadataOnly);

    if (binaryToSave) {
      binaryStore.put(binaryToSave, record.templateId);
      binaryStore.put(binaryToSave, `${record.templateId}_normalized`);
      binaryStore.put(binaryToSave, `normalized_${record.templateId}`);
      if (record.normalizedSha256) {
        binaryStore.put(binaryToSave, record.normalizedSha256);
        binaryStore.put(binaryToSave, `hash_${record.normalizedSha256}`);
        binaryStore.put(binaryToSave, `normalized_${record.normalizedSha256}`);
      }
      binaryStore.put(binaryToSave, `normalized_${record.sourceSha256}`);
    }

    if (originalToSave) {
      binaryStore.put(originalToSave, `${record.templateId}_original`);
      binaryStore.put(originalToSave, `original_${record.templateId}`);
      binaryStore.put(originalToSave, record.sourceSha256);
      binaryStore.put(originalToSave, `hash_${record.sourceSha256}`);
      binaryStore.put(originalToSave, `original_${record.sourceSha256}`);
    } else if (binaryToSave && !record.normalizedSha256) {
      binaryStore.put(binaryToSave, record.sourceSha256);
      binaryStore.put(binaryToSave, `hash_${record.sourceSha256}`);
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to save template to IndexedDB'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('IndexedDB transaction aborted'));
    };
  });
}

/**
 * Loads a template record by its templateId.
 */
export async function getCustomTemplate(
  templateId: string,
  includeBinary = false
): Promise<PersistedTemplateRecord | null> {
  if (!isIndexedDbAvailable()) {
    const record = memoryTemplateStore.get(templateId) || null;
    if (record && includeBinary) {
      const bin = memoryBinaryStore.get(templateId);
      return { ...record, pdfBinary: bin };
    }
    return record ? { ...record } : null;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const stores = includeBinary ? [STORE_TEMPLATES, STORE_BINARIES] : [STORE_TEMPLATES];
    const tx = db.transaction(stores, 'readonly');
    const templateStore = tx.objectStore(STORE_TEMPLATES);
    const req = templateStore.get(templateId);

    req.onsuccess = () => {
      const record = req.result as PersistedTemplateRecord | undefined;
      if (!record) {
        db.close();
        return resolve(null);
      }

      if (includeBinary) {
        const binaryStore = tx.objectStore(STORE_BINARIES);
        const binReq = binaryStore.get(templateId);
        binReq.onsuccess = () => {
          db.close();
          resolve({
            ...record,
            pdfBinary: binReq.result as Uint8Array | undefined,
          });
        };
        binReq.onerror = () => {
          db.close();
          resolve(record);
        };
      } else {
        db.close();
        resolve(record);
      }
    };

    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to read template from IndexedDB'));
    };
  });
}

/**
 * Loads a template metadata record without loading the underlying PDF binary.
 */
export async function getCustomTemplateMetadata(
  templateId: string
): Promise<PersistedTemplateRecord | null> {
  return getCustomTemplate(templateId, false);
}

/**
 * Searches for an existing template strictly matching a specific SHA-256 hash.
 */
export async function findTemplateBySha256(
  sha256: string
): Promise<PersistedTemplateRecord | null> {
  if (!isIndexedDbAvailable()) {
    for (const record of memoryTemplateStore.values()) {
      if (record.sourceSha256 === sha256) {
        return { ...record };
      }
    }
    return null;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TEMPLATES, 'readonly');
    const store = tx.objectStore(STORE_TEMPLATES);
    const index = store.index('sourceSha256');
    const req = index.get(sha256);

    req.onsuccess = () => {
      db.close();
      resolve((req.result as PersistedTemplateRecord) || null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to query template index'));
    };
  });
}

/**
 * Loads the raw PDF binary by templateId or SHA-256 hash.
 */
export async function getTemplatePdfBinary(
  identifier: string,
  mode: 'normalized' | 'original' = 'normalized'
): Promise<Uint8Array | null> {
  if (!identifier) return null;
  const cleanKey = identifier
    .replace(/^hash_/, '')
    .replace(/^normalized_/, '')
    .replace(/^original_/, '')
    .replace(/_normalized$/, '')
    .replace(/_original$/, '');

  const primaryKey = mode === 'original' ? `${cleanKey}_original` : cleanKey;
  const secondaryKey = mode === 'original' ? `original_${cleanKey}` : `normalized_${cleanKey}`;

  if (!isIndexedDbAvailable()) {
    return (
      memoryBinaryStore.get(primaryKey) ||
      memoryBinaryStore.get(secondaryKey) ||
      memoryBinaryStore.get(cleanKey) ||
      null
    );
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BINARIES, 'readonly');
    const store = tx.objectStore(STORE_BINARIES);
    const req = store.get(primaryKey);

    req.onsuccess = () => {
      if (req.result) {
        db.close();
        return resolve(req.result as Uint8Array);
      }
      // Check secondary key
      const secReq = store.get(secondaryKey);
      secReq.onsuccess = () => {
        if (secReq.result) {
          db.close();
          return resolve(secReq.result as Uint8Array);
        }
        // Fallback to cleanKey
        const fallbackReq = store.get(cleanKey);
        fallbackReq.onsuccess = () => {
          db.close();
          resolve((fallbackReq.result as Uint8Array) || null);
        };
        fallbackReq.onerror = () => {
          db.close();
          resolve(null);
        };
      };
      secReq.onerror = () => {
        db.close();
        resolve(null);
      };
    };

    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to load PDF binary from IndexedDB'));
    };
  });
}

/**
 * Lists all persisted custom templates (metadata only, no binary payload).
 */
export async function listAllCustomTemplates(): Promise<PersistedTemplateRecord[]> {
  if (!isIndexedDbAvailable()) {
    return Array.from(memoryTemplateStore.values()).map((r) => ({ ...r }));
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TEMPLATES, 'readonly');
    const store = tx.objectStore(STORE_TEMPLATES);
    const req = store.getAll();

    req.onsuccess = () => {
      db.close();
      resolve((req.result as PersistedTemplateRecord[]) || []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error || new Error('Failed to list custom templates'));
    };
  });
}

/**
 * Wipes all stored templates and binaries from IndexedDB and memory stores.
 */
export async function clearAllCustomTemplates(): Promise<void> {
  memoryTemplateStore.clear();
  memoryBinaryStore.clear();

  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_TEMPLATES, STORE_BINARIES], 'readwrite');
      tx.objectStore(STORE_TEMPLATES).clear();
      tx.objectStore(STORE_BINARIES).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to clear stores'));
      };
    });
  } catch {
    // ignore
  }
}

/**
 * Removes a custom template record and its associated binaries from IndexedDB and memory stores.
 */
export async function deleteCustomTemplate(
  templateId: string,
  sourceSha256?: string
): Promise<void> {
  memoryTemplateStore.delete(templateId);
  memoryBinaryStore.delete(templateId);
  if (sourceSha256) {
    memoryBinaryStore.delete(sourceSha256);
    memoryBinaryStore.delete(`hash_${sourceSha256}`);
  }

  if (!isIndexedDbAvailable()) return;

  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_TEMPLATES, STORE_BINARIES], 'readwrite');
      const templateStore = tx.objectStore(STORE_TEMPLATES);
      const binaryStore = tx.objectStore(STORE_BINARIES);

      templateStore.delete(templateId);
      binaryStore.delete(templateId);
      if (sourceSha256) {
        binaryStore.delete(sourceSha256);
        binaryStore.delete(`hash_${sourceSha256}`);
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to delete template from IndexedDB'));
      };
    });
  } catch (err) {
    console.warn('deleteCustomTemplate error:', err);
  }
}

/**
 * Recupera specificamente il binario del PDF elaborato (normalizzato A4 / rettificato).
 * Verifica che il binario esista, sia valido e corrisponda a normalizedSha256.
 * Se il binario elaborato manca, restituisce null: NON restituisce mai l'originale.
 */
export async function getNormalizedTemplatePdfBinary(
  modelOrId: string | { templateId?: string; id?: string; normalizedPdfSha256?: string; normalizedSha256?: string; sourcePdfSha256?: string; sourceSha256?: string }
): Promise<{ binary: Uint8Array; sha256: string; sizeBytes: number } | null> {
  let templateId = '';
  let expectedNormSha = '';
  let expectedSrcSha = '';

  if (typeof modelOrId === 'string') {
    templateId = modelOrId;
  } else if (modelOrId) {
    templateId = modelOrId.templateId || modelOrId.id || '';
    expectedNormSha = modelOrId.normalizedPdfSha256 || modelOrId.normalizedSha256 || '';
    expectedSrcSha = modelOrId.sourcePdfSha256 || modelOrId.sourceSha256 || '';
  }

  // Se i metadati non sono completi, recupera il record persistito
  if ((!expectedNormSha || !expectedSrcSha) && templateId) {
    const meta = await getCustomTemplateMetadata(templateId);
    if (meta) {
      if (!expectedNormSha) expectedNormSha = meta.normalizedSha256 || '';
      if (!expectedSrcSha) expectedSrcSha = meta.sourceSha256 || '';
    }
  }

  const cleanId = templateId
    .replace(/^hash_/, '')
    .replace(/^normalized_/, '')
    .replace(/^original_/, '')
    .replace(/_normalized$/, '')
    .replace(/_original$/, '');

  const searchKeys = [
    expectedNormSha,
    expectedNormSha ? `normalized_${expectedNormSha}` : null,
    expectedNormSha ? `hash_${expectedNormSha}` : null,
    cleanId ? `${cleanId}_normalized` : null,
    cleanId ? `normalized_${cleanId}` : null,
    expectedSrcSha ? `normalized_${expectedSrcSha}` : null,
    cleanId,
  ].filter(Boolean) as string[];

  for (const k of searchKeys) {
    const bin = await getTemplatePdfBinary(k, 'normalized');
    if (bin && bin.byteLength > 0 && isPdfBinary(bin)) {
      const hash = await computeSha256(bin);
      // Se è presente expectedNormSha, deve corrispondere rigorosamente
      if (expectedNormSha && hash === expectedNormSha) {
        return { binary: bin, sha256: hash, sizeBytes: bin.byteLength };
      }
      // Se non abbiamo expectedNormSha ma il file differisce dall'originale registrato
      if (!expectedNormSha && expectedSrcSha && hash !== expectedSrcSha) {
        return { binary: bin, sha256: hash, sizeBytes: bin.byteLength };
      }
      // Se chiave specifica normalized e non collide con l'originale
      if (k.includes('normalized') && (!expectedSrcSha || hash !== expectedSrcSha)) {
        return { binary: bin, sha256: hash, sizeBytes: bin.byteLength };
      }
    }
  }

  return null;
}

/**
 * Recupera specificamente il binario del PDF originale non modificato.
 */
export async function getOriginalTemplatePdfBinary(
  modelOrId: string | { templateId?: string; id?: string; sourcePdfSha256?: string; sourceSha256?: string; normalizedPdfSha256?: string; normalizedSha256?: string }
): Promise<{ binary: Uint8Array; sha256: string; sizeBytes: number } | null> {
  let templateId = '';
  let expectedSrcSha = '';

  if (typeof modelOrId === 'string') {
    templateId = modelOrId;
  } else if (modelOrId) {
    templateId = modelOrId.templateId || modelOrId.id || '';
    expectedSrcSha = modelOrId.sourcePdfSha256 || modelOrId.sourceSha256 || '';
  }

  if (!expectedSrcSha && templateId) {
    const meta = await getCustomTemplateMetadata(templateId);
    if (meta) {
      expectedSrcSha = meta.sourceSha256 || '';
    }
  }

  const cleanId = templateId
    .replace(/^hash_/, '')
    .replace(/^normalized_/, '')
    .replace(/^original_/, '')
    .replace(/_normalized$/, '')
    .replace(/_original$/, '');

  const searchKeys = [
    cleanId ? `${cleanId}_original` : null,
    cleanId ? `original_${cleanId}` : null,
    expectedSrcSha ? `original_${expectedSrcSha}` : null,
    expectedSrcSha,
    expectedSrcSha ? `hash_${expectedSrcSha}` : null,
    cleanId,
  ].filter(Boolean) as string[];

  for (const k of searchKeys) {
    const bin = await getTemplatePdfBinary(k, 'original');
    if (bin && bin.byteLength > 0 && isPdfBinary(bin)) {
      const hash = await computeSha256(bin);
      if (expectedSrcSha && hash === expectedSrcSha) {
        return { binary: bin, sha256: hash, sizeBytes: bin.byteLength };
      }
      if (!expectedSrcSha) {
        return { binary: bin, sha256: hash, sizeBytes: bin.byteLength };
      }
    }
  }

  return null;
}

/**
 * Trigger per il download trasparente di un file nel browser.
 */
export function triggerBrowserFileDownload(
  bytes: Uint8Array,
  filename: string,
  mimeType = 'application/pdf'
): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
