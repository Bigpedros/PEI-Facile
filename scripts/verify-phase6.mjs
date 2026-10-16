/** Full browser acceptance: original private PDF -> dual OCR -> edit -> save -> reload -> production print.
 * Usage: node scripts/verify-phase6.mjs /absolute/input.pdf /private/output-outside-repository
 * Optional CHROMIUM_EXECUTABLE points to an already installed Chromium.
 * Outputs include document content: keep outside the repository.
 */
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
const [inputArg,outputArg]=process.argv.slice(2);
if(!inputArg||!outputArg)throw new Error('Provide the original PDF and a private output directory outside the repository.');
const input=path.resolve(inputArg),out=path.resolve(outputArg),root=process.cwd();
assert.ok(out!==root&&!out.startsWith(root+path.sep),'Private output must be outside the repository');
const bytes=await fs.readFile(input);await fs.mkdir(out,{recursive:true});
let server,browser;
try{
 server=await createServer({root,server:{host:'127.0.0.1',port:3216,strictPort:true,hmr:false,watch:null}});
 server.middlewares.use('/__phase6/input.pdf',(_req,res)=>{res.setHeader('Content-Type','application/pdf');res.end(bytes);});
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60_000);
 await page.exposeFunction('phase6Checkpoint',async p=>{
  await fs.writeFile(path.join(out,`page-${String(p.pageNumber).padStart(2,'0')}.json`),JSON.stringify(p));
  console.log(JSON.stringify({page:p.pageNumber,fields:p.fields.length,readerB:p.secondReader?.execution,elapsedMs:p.elapsedMs}));
 });
 await page.goto('http://127.0.0.1:3216/');await page.locator('#root').waitFor();
 await page.waitForFunction(()=>document.getElementById('root')?.textContent?.trim().length>0);
 await page.goto('http://127.0.0.1:3216/scripts/integration-check.html');await page.waitForFunction(()=>window.integration);
 const acquisition=await page.evaluate(async()=>{
  const api=window.integration,bytes=new Uint8Array(await(await fetch('/__phase6/input.pdf')).arrayBuffer()),pending=[],progress=[];
  const result=await api.processDocumentAcquisition(new File([bytes],'phase6-source.pdf',{type:'application/pdf'}),'phase6-source.pdf',{
   onProgress:p=>progress.push(p),onDocumentalPage:p=>pending.push(window.phase6Checkpoint(p)),
  });
  await Promise.all(pending);window.phase6Result=result;
  const schema=api.documentSchema(result.documentalResult,result.normalizedSha256,'A1');window.phase6Schema=JSON.stringify(schema);
  return {pages:result.totalPages,fields:schema.fields.length,sourceHash:result.sourceSha256,canonicalHash:result.normalizedSha256,
   finalProgress:progress.at(-1),reportedPages:[...new Set(progress.map(p=>p.currentPage))],
   readers:result.documentalResult.pages.map(p=>p.secondReader),processingTimeMs:result.processingTimeMs};
 });
 assert.equal(acquisition.pages,12);assert.equal(acquisition.finalProgress.percentage,100);
 assert.ok(acquisition.readers.every(r=>r?.execution==='completed'));
 for(let n=1;n<=12;n++)assert.ok(acquisition.reportedPages.includes(n));
 // A calibrated *test copy* exercises compilation. This is not a human validation of detections.
 const initial=await page.evaluate(async()=>{
  const api=window.integration,r=window.phase6Result,schema=JSON.parse(window.phase6Schema);
  schema.calibrationStatus='CALIBRATED';schema.geometryValidationStatus='PASS';
  schema.visualReviewStatus='REQUIRED';
  schema.fields.push({templateFieldId:'phase6-manual-field',pageNumber:12,geometry:{xPt:40,yPt:790,widthPt:280,heightPt:30},label:'Campo manuale di collaudo',fieldType:'TEXT_SHORT',required:false,overflowPolicy:'RIGID',status:'MANUAL_VERIFIED',defaultValue:'',originalValue:'',backgroundMode:'OPAQUE_WHITE'});
  const now=new Date().toISOString();
  const doc={id:'phase6-private-test',schoolOrder:'A1',schoolYear:'2026/2027',studentCode:'TEST',schoolName:'TEST',classOrSection:'TEST',creationDate:now,lastModifiedDate:now,
   values:Object.fromEntries(schema.fields.map(f=>[f.templateFieldId,f.defaultValue??''])),fieldStatuses:{},notes:{},acquiredSchema:schema,acquiredBinarySha256:r.normalizedSha256,
   canonicalDocument:r.canonicalDocument,sourcePdfBinary:r.canonicalDocument,originalSourceBinary:r.sourceBinary};
  await api.savePeiDocument(doc);window.phase6OriginalSchema=JSON.stringify(schema);api.mountLifecycleDocument(doc);
  return {values:doc.values,schema:JSON.stringify(schema)};
 });
 await page.locator('[id^="document-page-"][data-render-status="SUCCESS"]').nth(11).waitFor();
 const chosen=await page.evaluate(()=>[1,7,12].map(n=>{
  const f=window.lifecycleDocument.acquiredSchema.fields.find(f=>f.pageNumber===n&&['TEXT_SHORT','TEXT_LONG'].includes(f.fieldType));
  if(!f)throw new Error(`No editable text field on page ${n}`);return {id:f.templateFieldId,page:n,label:f.label};
 }));
 for(const f of chosen)await page.locator('#input-'+f.id).fill(`VERIFICA FASE 6 PAGINA ${f.page}`);
 await page.locator('#input-phase6-manual-field').fill('CAMPO MANUALE FASE 6');
 const styled=chosen[0];await page.locator('#input-'+styled.id).click();
 await page.getByRole('button',{name:`Proprietà campo: ${styled.label}`,exact:true}).click();
 await page.getByRole('spinbutton',{name:'Grandezza carattere in punti'}).fill('15');
 for(const name of ['Grassetto','Corsivo','Sottolineato'])await page.getByRole('button',{name,exact:true}).click();
 // Choose bounded dimensions using the same page coordinates, without changing the calibrated schema.
 const dimensions=await page.evaluate(id=>{const f=window.lifecycleDocument.acquiredSchema.fields.find(f=>f.templateFieldId===id),p=window.lifecycleDocument.acquiredSchema.pages.find(p=>p.pageNumber===f.pageNumber);return {width:Math.min(260,p.widthPt-f.geometry.xPt),height:Math.min(65,p.heightPt-f.geometry.yPt)};},styled.id);
 await page.getByRole('slider',{name:'Larghezza campo',exact:true}).fill(String(dimensions.width));
 await page.getByRole('slider',{name:'Altezza campo',exact:true}).fill(String(dimensions.height));
 await page.getByRole('button',{name:'Fine',exact:true}).click();
 const expected=await page.evaluate(async()=>{
  await window.lifecycleSave;const api=window.integration,d=await api.loadSavedPeiDocument();
  return {values:d.values,properties:d.fieldProperties,schema:JSON.stringify(d.acquiredSchema),
   canonicalHash:await api.computeSha256(d.canonicalDocument),sourceHash:await api.computeSha256(d.originalSourceBinary),alias:d.sourcePdfBinary===d.canonicalDocument};
 });
 assert.equal(expected.schema,initial.schema);assert.equal(expected.canonicalHash,acquisition.canonicalHash);assert.equal(expected.sourceHash,acquisition.sourceHash);assert.ok(expected.alias);
 for(const f of chosen)assert.equal(expected.values[f.id],`VERIFICA FASE 6 PAGINA ${f.page}`);
 for(const [id,value] of Object.entries(initial.values))if(id!=='phase6-manual-field'&&!chosen.some(f=>f.id===id))assert.deepEqual(expected.values[id],value);
 await page.reload();await page.waitForFunction(()=>window.integration);
 const reopened=await page.evaluate(async()=>{
  const api=window.integration,d=await api.loadSavedPeiDocument();api.mountLifecycleDocument(d);
  return {values:d.values,properties:d.fieldProperties,schema:JSON.stringify(d.acquiredSchema),canonicalHash:await api.computeSha256(d.canonicalDocument),sourceHash:await api.computeSha256(d.originalSourceBinary),alias:d.sourcePdfBinary===d.canonicalDocument};
 });
 assert.deepEqual(reopened,expected);
 assert.equal(reopened.values['phase6-manual-field'],'CAMPO MANUALE FASE 6');
 for(const f of chosen){await page.locator('#input-'+f.id).waitFor();assert.equal(await page.locator('#input-'+f.id).inputValue(),expected.values[f.id]);}
 const css=await page.locator('#input-'+styled.id).evaluate(e=>{const s=getComputedStyle(e);return {font:s.fontSize,bold:s.fontWeight,italic:s.fontStyle,underline:s.textDecorationLine,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height};});
 assert.equal(css.font,'15px');assert.equal(css.bold,'700');assert.equal(css.italic,'italic');assert.equal(css.underline,'underline');
 assert.ok(Math.abs(css.width-expected.properties[styled.id].widthPt)<1);assert.ok(Math.abs(css.height-expected.properties[styled.id].heightPt)<1);
 // Production AnteprimaScreen includes the real print CSS and parent layout.
 await page.evaluate(async()=>window.integration.mountLifecycleDocument(await window.integration.loadSavedPeiDocument(),true));
 await page.locator('#btn-back-to-compilazione').waitFor();
 await page.locator('[id^="document-page-"][data-render-status="SUCCESS"]').nth(11).waitFor();
 await page.emulateMedia({media:'print'});await page.locator('#overlay-print-'+styled.id).waitFor();
 const printed=await page.locator('#overlay-print-'+styled.id).evaluate(e=>{const s=getComputedStyle(e);return {font:s.fontSize,bold:s.fontWeight,italic:s.fontStyle,underline:s.textDecorationLine};});
 assert.equal(printed.font,'20px');assert.equal(printed.bold,'700');assert.equal(printed.italic,'italic');assert.equal(printed.underline,'underline');
 const exportPath=path.join(out,'edited-print.pdf');await page.pdf({path:exportPath,preferCSSPageSize:true,printBackground:true});
 const exported=await PDFDocument.load(await fs.readFile(exportPath));assert.equal(exported.getPageCount(),12);
 for(const p of exported.getPages()){assert.ok(Math.abs(p.getWidth()-595.28)<1);assert.ok(Math.abs(p.getHeight()-841.89)<1);}
 // Reopen the actual exported bytes through PDF.js and verify text is on its intended page.
 const verification=await page.evaluate(async bytes=>{
  const api=window.integration,pdf=await api.pdfjs.getDocument({data:new Uint8Array(bytes)}).promise,checks=[];
  for(const n of [1,7,12]){const p=await pdf.getPage(n),text=(await p.getTextContent()).items.filter(i=>'str'in i).map(i=>i.str).join(' ');checks.push(text.includes(`VERIFICA FASE 6 PAGINA ${n}`)&&(n!==12||text.includes('CAMPO MANUALE FASE 6')));}
  await pdf.destroy();return checks;
 },Array.from(await fs.readFile(exportPath)));
 assert.ok(verification.every(Boolean));assert.deepEqual(errors,[]);
 const report={status:'PASS',acquisition,fieldsEditedOnPages:[1,7,12],otherValuesPreserved:true,schemaPreserved:true,sourceAndCanonicalHashesPreserved:true,reopenedExactValuesAndProperties:true,manualFieldPreserved:true,styleInPreviewAndPrint:true,exportPages:12,exportedTextOnCorrectPages:true,browserErrors:errors,visualReview:'REQUIRED; test copy is not human approval'};
 await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await server?.close();}
