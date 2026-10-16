import {expect,it,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as realWasm from '../../../public/recognizer-b/ocrs_wasm.js';
import {PDFDocument} from 'pdf-lib';
import {createCanvas} from '@napi-rs/canvas';
// Node-only I/O adapter: the same shipped WASM and RTen models, no fabricated OCR results.
// Browser worker transport is covered separately by verify-phase6.mjs.
vi.mock('./engine/recognizerBWorker',()=>({createWorkerRuntime:async()=>{
 const wasm=realWasm;
 wasm.initSync({module:new Uint8Array(fs.readFileSync('public/recognizer-b/ocrs_wasm_bg.wasm'))});
 return new wasm.OcrsRecognizer(new Uint8Array(fs.readFileSync('public/models/text-detection.rten')),new Uint8Array(fs.readFileSync('public/models/text-recognition.rten')));
}}));
import {processDocumentAcquisition} from '../documentAcquisitionService';
import {documentSchema} from './bridge';
import {computeSha256} from '../templateAcquisitionService';
const input=process.env.PEI_PHASE6_INPUT,out=process.env.PEI_PHASE6_OUTPUT;
it.skipIf(!input||!out)('acquires the original 12 pages with both real readers and exports canonical A4',async()=>{
 const output=path.resolve(out!);
 if(output===process.cwd()||output.startsWith(process.cwd()+path.sep))throw new Error('Use a private output directory outside the repository.');
 fs.mkdirSync(output,{recursive:true});
 // Native Canvas is the real raster surface in the Node harness.
 vi.stubGlobal('HTMLCanvasElement',createCanvas(1,1).constructor);
 const bytes=new Uint8Array(fs.readFileSync(input!)),progress:any[]=[],completed:number[]=[];
 const result=await processDocumentAcquisition(bytes.buffer,'phase6-source.pdf',{
  onProgress:p=>progress.push(p),
  onDocumentalPage:p=>{
   fs.writeFileSync(path.join(output,`page-${String(p.pageNumber).padStart(2,'0')}.json`),JSON.stringify(p));
   completed.push(p.pageNumber);
   console.log(JSON.stringify({page:p.pageNumber,fields:p.fields.length,readerB:p.secondReader?.execution,elapsedMs:p.elapsedMs}));
  },
 });
 expect(completed).toEqual(Array.from({length:12},(_,i)=>i+1));
 expect(result.totalPages).toBe(12);expect(result.sourceSha256).toBe(await computeSha256(bytes));
 expect(result.sourceBinary).toEqual(bytes);
 const schema=documentSchema(result.documentalResult!,result.normalizedSha256!,'A1');
 expect(schema.totalPages).toBe(12);expect(schema.calibrationStatus).toBe('REVIEW_REQUIRED');
 expect(new Set(schema.fields.map(f=>f.templateFieldId)).size).toBe(schema.fields.length);
 for(const f of schema.fields){
  const page=schema.pages.find(p=>p.pageNumber===f.pageNumber)!;
  expect(page).toBeDefined();const g=f.geometry;
  expect([g.xPt,g.yPt,g.widthPt,g.heightPt].every(Number.isFinite)).toBe(true);
  expect(g.xPt).toBeGreaterThanOrEqual(0);expect(g.yPt).toBeGreaterThanOrEqual(0);
  expect(g.widthPt).toBeGreaterThan(0);expect(g.heightPt).toBeGreaterThan(0);
  expect(g.xPt+g.widthPt).toBeLessThanOrEqual(page.widthPt+.01);
  expect(g.yPt+g.heightPt).toBeLessThanOrEqual(page.heightPt+.01);
 }
 expect(result.documentalResult!.pages.every(p=>p.secondReader?.execution==='completed')).toBe(true);
 expect(progress.at(-1).percentage).toBe(100);
 expect([...new Set(progress.filter(p=>p.stage!=='REVIEW_READY'&&p.currentPage>0).map(p=>p.currentPage))]).toContain(12);
 fs.writeFileSync(path.join(output,'acquisition.json'),JSON.stringify({...result,canonicalDocument:undefined,sourceBinary:undefined}));
 fs.writeFileSync(path.join(output,'canonical.pdf'),result.canonicalDocument!);
 fs.writeFileSync(path.join(output,'schema.json'),JSON.stringify(schema));
 const exported=await PDFDocument.load(result.canonicalDocument!);expect(exported.getPageCount()).toBe(12);
 for(const p of exported.getPages()){expect(p.getWidth()).toBeCloseTo(210/25.4*72,2);expect(p.getHeight()).toBeCloseTo(297/25.4*72,2);}
 const report={status:'PASS',scope:'Node acquisition; browser lifecycle requires separate verification',pages:result.documentalResult!.pages.map(p=>({page:p.pageNumber,fields:p.fields.length,tokens:p.tokens.length,readerB:p.secondReader?.execution,elapsedMs:p.elapsedMs,stageTimingsMs:p.stageTimingsMs,unresolvedStructures:p.structuralCoverage?.evidence.filter(e=>e.outcome==='unresolved').length??0})),totalFields:schema.fields.length,processingTimeMs:result.processingTimeMs,sourcePreserved:true,canonicalA4Pages:exported.getPageCount()};
 fs.writeFileSync(path.join(output,'node-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
},1_200_000);
