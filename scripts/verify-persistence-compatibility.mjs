import {createServer} from 'vite';import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),server=await createServer({root,server:{host:'127.0.0.1',port:3197,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();
try{await p.goto('http://127.0.0.1:3197/scripts/integration-check.html');await p.waitForFunction(()=>window.integration);
 const result=await p.evaluate(async()=>{
  const api=window.integration;const old={id:'old-document',schoolOrder:'A1',values:{existing:'Valore precedente'},fieldStatuses:{},notes:{}};const legacy=JSON.stringify(old);localStorage.setItem('pei_facile_saved_doc',legacy);
  const read=await api.loadSavedPeiDocument();const notMigrated=localStorage.getItem('pei_facile_saved_doc')===legacy&&read.values.existing==='Valore precedente';
  const bytes=new Uint8Array(await fetch('/downloads/PEI_Comune_Roma_Canonico_A4_020.pdf').then(r=>r.arrayBuffer()));
  const next={...old,id:'new-document',values:{existing:'Nuovo valore'},canonicalDocument:bytes,sourcePdfBinary:bytes,originalSourceBinary:bytes};await api.savePeiDocument(next);
  const restored=await api.loadSavedPeiDocument();
  const backup=await new Promise((resolve,reject)=>{const r=indexedDB.open('pei_facile_documents_020',1);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('documents','readonly');const q=tx.objectStore('documents').get('__legacy_rollback_020__');q.onsuccess=()=>resolve(q.result);tx.oncomplete=()=>db.close();q.onerror=()=>reject(q.error);};r.onerror=()=>reject(r.error);});
  return {notMigrated,snapshotExact:backup===legacy,byteCount:restored.canonicalDocument.length,hashSame:await api.computeSha256(restored.canonicalDocument)===await api.computeSha256(bytes),aliasesSame:restored.sourcePdfBinary===restored.canonicalDocument,metadataLength:localStorage.getItem('pei_facile_saved_doc').length,value:restored.values.existing};
 });assert.ok(result.notMigrated&&result.snapshotExact&&result.hashSame&&result.aliasesSame);assert.ok(result.byteCount>5000000);assert.ok(result.metadataLength<10000);assert.equal(result.value,'Nuovo valore');
 await fs.writeFile(path.join(root,'test-output/integration-020/persistence-compatibility.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await server.close();}
