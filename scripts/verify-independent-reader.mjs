import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:3197,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const started=Date.now();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3197/scripts/integration-check.html');await page.waitForFunction(()=>window.integration);
 await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,300);x.fillStyle='black';x.font='28px sans-serif';x.fillText('Sezione A - Plesso o sede Roma',40,70);x.fillText('Nome Mario Rossi',40,130);window.readerFixture=c;window.workerHeartbeats=0;setInterval(()=>window.workerHeartbeats++,20);});
 const fixture=await page.evaluate(async()=>{
  const {analyzeRasterPage}=await import('/src/core/documental/engine/index.ts');const {LocalRecognizer}=await import('/src/core/documental/engine/ocr.ts');
  const o={profile:'pei',language:'ita',forceOcr:true,contrast:true,rotation:0,dpi:200,maxPages:1,segmentation:'auto'},r=new LocalRecognizer(o);
  try{const p=await analyzeRasterPage({canvas:window.readerFixture,nativeTokens:[],pageNumber:1,warnings:[]},o,r,true);return {text:p.text,primary:p.ocrReading?.rawTokens.length,secondary:p.ocrReading?.secondaryTokens.length,state:p.secondReader,heartbeats:window.workerHeartbeats};}finally{await r.terminate();}
 });
 assert.equal(fixture.state.execution,'completed');assert.ok(fixture.primary>0&&fixture.secondary>0);assert.match(fixture.text,/Mario/);assert.ok(fixture.heartbeats>0);console.log('DUAL_RASTER',JSON.stringify(fixture));
 const acquisition=await page.evaluate(async()=>{const {runDocumental}=await import('/src/core/documental/bridge.ts');const b=await new Promise(r=>window.readerFixture.toBlob(r,'image/png'));const d=await runDocumental(new File([b],'fixture.png',{type:'image/png'}),'fixture.png');return {state:d.pages[0].secondReader,secondary:d.pages[0].ocrReading?.secondaryTokens.length};});
 assert.equal(acquisition.state.execution,'completed');assert.ok(acquisition.secondary>0);console.log('ACQUISITION',JSON.stringify(acquisition));
 await page.evaluate(async()=>{const pdf=await window.integration.PDFDocument.create(),im=await pdf.embedPng(window.readerFixture.toDataURL());pdf.addPage([595,223.125]).drawImage(im,{x:0,y:0,width:595,height:223.125});window.readerPdf=await window.integration.pdfjs.getDocument({data:await pdf.save()}).promise;});
 const detection=await page.evaluate(async()=>{
  const {detectFieldsOnPdfPage,detectFieldsOnEntireDocument,collectPageRuntimeDiagnostics}=await import('/src/core/assistedFieldDetectionService.ts');const p=await window.readerPdf.getPage(1);let single,whole,disabled;
  await detectFieldsOnPdfPage(p,1,[],{onDiagnostics:d=>single=d.secondReader});
  await detectFieldsOnEntireDocument(window.readerPdf,[],undefined,undefined,{onDiagnostics:d=>whole=d.secondReader});
  await detectFieldsOnEntireDocument(window.readerPdf,[],undefined,undefined,{independentReading:false,onDiagnostics:d=>disabled=d.secondReader});
  const d=await collectPageRuntimeDiagnostics(p,{pageNumber:1});return {single,whole,disabled,exportState:d.secondReader,exportSecondary:d.ocrReading?.secondaryTokens.length,exportSchema:d.diagnosticSchema};
 });
 assert.equal(detection.single.execution,'completed');assert.equal(detection.whole.execution,'completed');assert.equal(detection.disabled.execution,'disabled');assert.ok(detection.exportSecondary>0);assert.equal(detection.exportSchema,'PEI_CALIBRATION_AUDIT_V1');console.log('PAGE_DOCUMENT_EXPORT',JSON.stringify(detection));
 const fallback=await page.evaluate(async()=>{
  const {OcrsWasmRecognizerB}=await import('/src/core/documental/vendor/motore-ocr-ai/src/core/ocr/recognizerB.ts');const {createWorkerRuntime}=await import('/src/core/documental/engine/recognizerBWorker.ts');const {readIndependent}=await import('/src/core/documental/engine/dualReading.ts');
  const base=location.origin,o={moduleUrl:base+'/recognizer-b/ocrs_wasm.js',detectionModelUrl:base+'/missing-model.rten',recognitionModelUrl:base+'/models/text-recognition.rten'},b=new OcrsWasmRecognizerB(o,()=>createWorkerRuntime(o));
  try{const r=await readIndependent(window.readerFixture,1,{text:'Nome',tokens:[{id:'a',text:'Nome',confidence:95,source:'ocr',lineId:'1',box:{x:40,y:40,width:80,height:20}}]},b);return {text:r.text,status:r.diagnostics.status,warnings:r.diagnostics.warnings};}finally{await b.dispose();}
 });
 assert.equal(fallback.status,'unavailable');assert.equal(fallback.text,'Nome');console.log('MISSING_ASSET_FALLBACK',JSON.stringify(fallback));
 const cancelled=await page.evaluate(async()=>{const {LocalRecognizer}=await import('/src/core/documental/engine/ocr.ts');const c=new AbortController(),r=new LocalRecognizer({profile:'pei',language:'ita',forceOcr:true,contrast:true,rotation:0,dpi:200,maxPages:1,segmentation:'auto',signal:c.signal});const pending=r.recognizeIndependent(window.readerFixture,1,{text:'Nome',tokens:[]});setTimeout(()=>c.abort(),30);try{await pending;return 'not-cancelled';}catch(e){return e.name;}finally{await r.terminate();}});
 assert.equal(cancelled,'AbortError');console.log('ABORT',cancelled);
 const roma=await page.evaluate(async()=>{const {collectPageRuntimeDiagnostics}=await import('/src/core/assistedFieldDetectionService.ts');const data=new Uint8Array(await fetch('/downloads/PEI_Comune_Roma_Canonico_A4_020.pdf').then(r=>r.arrayBuffer())),pdf=await window.integration.pdfjs.getDocument({data}).promise;try{const r=await collectPageRuntimeDiagnostics(await pdf.getPage(1),{pageNumber:1});return {state:r.secondReader,primary:r.ocrReading?.rawTokens.length,secondary:r.ocrReading?.secondaryTokens.length,changed:r.ocrReading?.changed,regions:r.rasterBoxes.length,fields:r.finalProposedFields.length,auditSchema:r.fieldInference?.firstPass?.schema};}finally{await pdf.destroy();}});
 assert.equal(roma.state.execution,'completed');assert.ok(roma.secondary>0);assert.equal(roma.auditSchema,'PEI_FIELD_INFERENCE_AUDIT_V1');console.log('ROMA_BUNDLED_PAGE_1',JSON.stringify(roma));
 assert.equal(errors.length,0);console.log('PASS',JSON.stringify({elapsedMs:Date.now()-started,browserErrors:errors}));
}finally{await browser.close();await server.close();}
