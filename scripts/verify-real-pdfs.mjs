import {createServer} from 'vite';import {chromium} from '@playwright/test';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.cwd(),input=process.env.PEI_REAL_PDF_DIR;if(!input)throw Error('Set PEI_REAL_PDF_DIR to the original PDF folder');
const samples=process.env.PEI_REAL_VALUE_SAMPLES_FILE?JSON.parse(await fs.readFile(process.env.PEI_REAL_VALUE_SAMPLES_FILE,'utf8')):[];
const out=path.resolve(root,'../private-verification');await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:3196,hmr:false,watch:null,fs:{allow:[root,input]}}});await server.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const report={cases:[],errors};
try{await p.goto('http://127.0.0.1:3196/scripts/integration-check.html');await p.waitForFunction(()=>window.integration);
for(const [file,expectedPages,expectedHash] of [['ALLEGATO A1_PEI_INFANZIA[617] 2.pdf',13,'485e7b1c7bd4b42c9d2afdd91fbde7f8511276f4c1e2f8a90bcdf9c9656c90f3'],['ALLEGATO_A1_PEI_INFANZIA[2387] NUOVO PEI DI R.M.T 2.pdf',12,'a9b27df1bcfea401f98966105a8ae16b1cc46f6d5b1bd1720eb507838635dc63']]){
 console.log('Acquiring',file);
 const result=await p.evaluate(async({file,input,samples})=>{const api=window.integration;const bytes=new Uint8Array(await fetch('/@fs/'+input+'/'+file).then(r=>r.arrayBuffer()));const r=await api.processDocumentAcquisition(bytes,file);window.realResult=r;const pages=r.documentalResult.pages;
 const native=await api.pdfjs.getDocument({data:new Uint8Array(bytes)}).promise;let count=0,retained=0;
 for(let i=1;i<=native.numPages;i++){const c=await(await native.getPage(i)).getTextContent();for(const t of c.items){if(!t.str?.trim())continue;count++;if(pages[i-1].tokens.some(n=>n.source==='pdf'&&n.text===t.str))retained++;}}
 const filled=pages.flatMap(p=>p.fields).filter(f=>String(f.originalValue??'').trim()&&f.originalValue===f.value);
 const valid=pages.every(p=>p.fields.every(f=>[f.box.x,f.box.y,f.box.width,f.box.height].every(Number.isFinite)&&f.box.x>=0&&f.box.y>=0&&f.box.x+f.box.width<=p.width+1&&f.box.y+f.box.height<=p.height+1));
 const norm=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
 const sampleChecks=samples.map(s=>({key:s.key,textFound:norm(r.fullText).includes(norm(s.value)),originalValueFound:filled.some(f=>norm(f.originalValue).includes(norm(s.value)))}));
 const schema=api.documentSchema(r.documentalResult,r.normalizedSha256,'A1');const doc={id:'real-test',schoolOrder:'A1',values:{},fieldStatuses:{},notes:{},acquiredSchema:schema,acquiredBinarySha256:r.normalizedSha256,originalSourceSha256:r.sourceSha256,originalSourceBinary:r.sourceBinary,canonicalDocument:r.canonicalDocument,sourcePdfBinary:r.canonicalDocument};await api.savePeiDocument(doc);const loaded=await api.loadSavedPeiDocument();
 return {file,pages:pages.length,sourceHash:r.sourceSha256,canonicalHash:r.normalizedSha256,nativeSpans:count,nativeSpansRetained:retained,filledFieldsPreserved:filled.length,boundsValid:valid,persistenceHash:await api.computeSha256(loaded.canonicalDocument),sampleChecks,schemaPreserved:JSON.stringify(schema)===JSON.stringify(loaded.acquiredSchema),sources:pages.map(p=>p.source)};
 },{file,input:path.resolve(input),samples:expectedPages===12?samples:[]});
 assert.equal(result.pages,expectedPages);assert.equal(result.sourceHash,expectedHash);assert.equal(result.nativeSpansRetained,result.nativeSpans);assert.ok(result.boundsValid);assert.equal(result.persistenceHash,result.canonicalHash);assert.ok(result.schemaPreserved);if(expectedPages===12)assert.ok(result.filledFieldsPreserved>0);
 const download=p.waitForEvent('download');await p.evaluate(()=>window.integration.storage.triggerBrowserFileDownload(window.realResult.canonicalDocument,'canonical.pdf'));await(await download).saveAs(path.join(out,expectedPages===12?'filled-canonical.pdf':'native-canonical.pdf'));
 const image=await p.evaluate(()=>window.realResult.documentalResult.pages[0].image);await fs.writeFile(path.join(out,expectedPages===12?'filled-raster.png':'native-raster.png'),Buffer.from(image.split(',')[1],'base64'));report.cases.push(result);await fs.writeFile(path.join(root,'test-output/integration-020/real-pdf-report.json'),JSON.stringify(report,null,2));
}
assert.equal(errors.length,0);console.log(JSON.stringify(report));
}finally{await browser.close();await server.close();}
