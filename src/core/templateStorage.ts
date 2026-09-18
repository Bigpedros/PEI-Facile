/**
 * @license
 * PEI FACILE — Template Storage Engine (Phase 1B R01)
 * Local-first structured storage via IndexedDB for PDF binaries, geometries, and versioned hashes.
 * Ensures large PDF binaries are NEVER written to localStorage.
 */

import type { PersistedTemplateRecord } from './templateAcquisitionTypes';

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
  pdfBinary?: Uint8Array
): Promise<void> {
  const binaryInput = pdfBinary || record.pdfBinary;
  let binaryToSave: Uint8Array | undefined;

  if (binaryInput) {
    binaryToSave = createDefensiveBinaryCopy(binaryInput);
  }

  const metadataOnly: PersistedTemplateRecord = {
    ...record,
    pdfBinary: undefined, // strip binary from metadata record
    updatedAt: new Date().toISOString(),
  };

  if (!isIndexedDbAvailable()) {
    memoryTemplateStore.set(record.templateId, metadataOnly);
    if (binaryToSave) {
      memoryBinaryStore.set(record.templateId, binaryToSave);
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
  identifier: string
): Promise<Uint8Array | null> {
  if (!identifier) return null;
  const cleanKey = identifier.startsWith('hash_') ? identifier.replace(/^hash_/, '') : identifier;
  const hashKey = `hash_${cleanKey}`;

  if (!isIndexedDbAvailable()) {
    return (
      memoryBinaryStore.get(cleanKey) ||
      memoryBinaryStore.get(hashKey) ||
      memoryBinaryStore.get(identifier) ||
      null
    );
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BINARIES, 'readonly');
    const store = tx.objectStore(STORE_BINARIES);
    const req = store.get(cleanKey);

    req.onsuccess = () => {
      if (req.result) {
        db.close();
        return resolve(req.result as Uint8Array);
      }
      // Check secondary hash key
      const hashReq = store.get(hashKey);
      hashReq.onsuccess = () => {
        db.close();
        resolve((hashReq.result as Uint8Array) || null);
      };
      hashReq.onerror = () => {
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
