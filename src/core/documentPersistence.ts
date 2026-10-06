import type {PeiDocument} from '../types/pei';
const KEY='pei_facile_saved_doc';
const DB='pei_facile_documents_020';
let queue:Promise<unknown>=Promise.resolve();
const cached=new Map<string,unknown[]>();
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('documents');r.result.createObjectStore('binaries');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
});}
function finish(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Salvataggio interrotto'));});}
/** Serialize only metadata into localStorage. PDF bytes stay typed and unmodified in IndexedDB. */
export function savePeiDocument(doc:PeiDocument):Promise<void>{
 const operation=queue.catch(()=>{}).then(async()=>{
  const {sourcePdfBinary,canonicalDocument,originalSourceBinary,...metadata}=doc;
  const refs=[sourcePdfBinary,canonicalDocument,originalSourceBinary];const old=cached.get(doc.id);
  const db=await open();try{
   const tx=db.transaction(['documents','binaries'],'readwrite');const done=finish(tx);
   const previous=localStorage.getItem(KEY);
   if(previous&&JSON.parse(previous).binaryStorage!=='indexeddb-020'){const backup=tx.objectStore('documents').get('__legacy_rollback_020__');backup.onsuccess=()=>{if(backup.result===undefined)tx.objectStore('documents').put(previous,'__legacy_rollback_020__');};}
   tx.objectStore('documents').put(metadata,doc.id);
   if(!old||refs.some((v,i)=>v!==old[i]))tx.objectStore('binaries').put({canonicalDocument,sourcePdfBinary:sourcePdfBinary===canonicalDocument?undefined:sourcePdfBinary,sourceAliasesCanonical:sourcePdfBinary===canonicalDocument,originalSourceBinary},doc.id);
   await done;
   localStorage.setItem(KEY,JSON.stringify({...metadata,binaryStorage:'indexeddb-020',persistenceId:doc.id}));cached.set(doc.id,refs);
  }finally{db.close();}
 });queue=operation;return operation;
}
export async function loadSavedPeiDocument():Promise<PeiDocument|null>{
 await queue.catch(()=>{});const raw=localStorage.getItem(KEY);if(!raw)return null;const metadata=JSON.parse(raw);
 if(metadata.binaryStorage!=='indexeddb-020')return metadata; // Existing records are not silently migrated or deleted.
 const db=await open();try{
  const tx=db.transaction(['documents','binaries'],'readonly');const done=finish(tx);
  const read=(store:string)=>new Promise<any>((resolve,reject)=>{const r=tx.objectStore(store).get(metadata.persistenceId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const [doc,bin]=await Promise.all([read('documents'),read('binaries')]);await done;
  if(!doc||!bin)throw new Error('Documento salvato incompleto: metadati o binari non disponibili.');
  const restored={...doc,canonicalDocument:bin.canonicalDocument,sourcePdfBinary:bin.sourceAliasesCanonical?bin.canonicalDocument:bin.sourcePdfBinary,originalSourceBinary:bin.originalSourceBinary};
  cached.set(restored.id,[restored.sourcePdfBinary,restored.canonicalDocument,restored.originalSourceBinary]);return restored;
 }finally{db.close();}
}
export async function deleteSavedPeiDocument():Promise<void>{
 await queue.catch(()=>{});const raw=localStorage.getItem(KEY);if(!raw)return;const metadata=JSON.parse(raw);
 if(metadata.binaryStorage==='indexeddb-020'){const db=await open();try{const tx=db.transaction(['documents','binaries'],'readwrite');const done=finish(tx);tx.objectStore('documents').delete(metadata.persistenceId);tx.objectStore('binaries').delete(metadata.persistenceId);await done;cached.delete(metadata.persistenceId);}finally{db.close();}}
 localStorage.removeItem(KEY);
}
