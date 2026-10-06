import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'test-output/integration-020');await fs.mkdir(out,{recursive:true});
const server=await createServer({root,server:{host:'127.0.0.1',port:3199,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={started:new Date().toISOString(),checks:[],errors};
async function saveBinary(name,source){const pending=page.waitForEvent('download');await page.evaluate(({name,source})=>window.integration.storage.triggerBrowserFileDownload(window[source].canonicalDocument,name),{name,source});const file=await pending;await file.saveAs(path.join(out,name));}
try{
 await page.goto('http://127.0.0.1:3199');await page.getByText('PEI FACILE',{exact:false}).first().waitFor();report.checks.push('App React avviata');
 await page.goto('http://127.0.0.1:3199/scripts/integration-check.html');await page.waitForFunction(()=>window.integration);
 const native=await page.evaluate(async()=>{
  const api=window.integration;
  const bytes=await fetch('/models/ALLEGATO_A1_PEI_INFANZIA.pdf').then(r=>r.arrayBuffer());
  const result=await api.processDocumentAcquisition(bytes,'a1.pdf');
  const template=await api.acquirePdfTemplate(bytes,'a1.pdf',true);
  window.native=result;window.template=template;
  const pages=result.documentalResult.pages;
  if(pages.some(p=>p.fields.some(f=>f.status!=='review')))throw new Error('Associazione automatica non verificata');
  return {pages:pages.length,source:pages.map(p=>p.source),textChars:result.fullText.length,
    candidates:template.geometryCandidates.length,bytes:result.canonicalDocument.length,nativeTokensEveryPage:pages.every(p=>p.tokens.some(t=>t.source==='pdf')),
    boundsValid:pages.every(p=>p.tokens.every(t=>t.box.x>=-1&&t.box.y>=-1&&t.box.x+t.box.width<=p.width+2&&t.box.y+t.box.height<=p.height+2))};
 });assert.equal(native.pages,12);assert.ok(native.nativeTokensEveryPage);assert.ok(native.boundsValid);report.native=native;
 await saveBinary('A1-canonical.pdf','native');
 for(const num of [1,3]){const data=await page.evaluate(n=>window.native.documentalResult.pages[n-1].image,num);await fs.writeFile(path.join(out,`A1-page${num}.png`),Buffer.from(data.split(',')[1],'base64'));}
 report.checks.push('PDF A1: tutte le 12 pagine, testo nativo conservato, OCR delle immagini ove presenti, coordinate e proposte');
 const mixed=await page.evaluate(async()=>{
  const api=window.integration,pdf=await api.PDFDocument.create(),pp=pdf.addPage([595.2756,841.8898]);
  pp.drawText('VALORE NATIVO',{x:40,y:740,size:14});
  const c=document.createElement('canvas');c.width=1000;c.height=120;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,120);ctx.fillStyle='black';ctx.font='36px Arial';ctx.fillText('Valore raster: Luca Bianchi',20,60);
  const image=await pdf.embedPng(c.toDataURL('image/png'));pp.drawImage(image,{x:40,y:500,width:500,height:60});
  const result=await api.processDocumentAcquisition(await pdf.save(),'mixed.pdf');
  return {native:result.fullText.includes('VALORE NATIVO'),raster:result.fullText.includes('Luca Bianchi'),type:result.rawPages[0].pageType,text:result.fullText};
 });console.log('Mixed',JSON.stringify(mixed));assert.ok(mixed.native&&mixed.raster);assert.equal(mixed.type,'MIXED');report.checks.push('PDF misto sintetico: conservazione testo nativo e lettura valore raster');

 const persistence=await page.evaluate(async()=>{
  const api=window.integration,t=window.template;
  const raw=await fetch('/models/ALLEGATO_A1_PEI_INFANZIA.pdf').then(r=>r.arrayBuffer());
  const record={templateId:'integration-test-020',name:'Test 020',schoolOrder:'A1',sourceFileName:'a1.pdf',sourceSha256:t.sourceSha256,normalizedSha256:t.normalizedSha256,normalizationSucceeded:true,fileSizeBytes:raw.byteLength,pageCount:t.pageCount,schemaVersion:'1.0.0',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),calibrationStatus:'REVIEW_REQUIRED',pages:t.pages,coordinateTransform:t.coordinateTransform};
  await api.storage.saveCustomTemplate(record,t.canonicalDocument,new Uint8Array(raw));
  const schema=api.createTemplateSchemaFromCandidates(record.templateId,'a1.pdf',t.sourceSha256,t.pages,t.geometryCandidates,'REVIEW_REQUIRED','A1');
  await api.saveTemplateSchema(schema);window.schema=schema;
  return {id:record.templateId,original:t.sourceSha256,normalized:t.normalizedSha256};
 });
 await page.reload();await page.waitForFunction(()=>window.integration);
 const reopen=await page.evaluate(async(meta)=>{
  const api=window.integration;const record=await api.storage.getCustomTemplate(meta.id);
  const normal=await api.storage.getNormalizedTemplatePdfBinary(meta.id);
  const original=await api.storage.getOriginalTemplatePdfBinary(meta.id);
  const schema=await api.getTemplateSchema(meta.id);window.schema=schema;window.reopened=normal.binary;
  return {record:!!record,schema:!!schema,normal:await api.computeSha256(normal.binary),original:await api.computeSha256(original.binary)};
 },persistence);assert.equal(reopen.normal,persistence.normalized);assert.equal(reopen.original,persistence.original);assert.ok(reopen.record&&reopen.schema);report.checks.push('IndexedDB: salvataggio, reload, riapertura schema e binari originali/normalizzati con hash corrispondenti');
 // Download the exact saved binary through the existing application helper.
 const download=page.waitForEvent('download');await page.evaluate(()=>window.integration.storage.triggerBrowserFileDownload(window.reopened,'saved-a1.pdf'));
 const file=await download;const downloaded=await fs.readFile(await file.path());await fs.writeFile(path.join(out,'downloaded-a1.pdf'),downloaded);
 const {createHash}=await import('node:crypto');assert.equal(createHash('sha256').update(downloaded).digest('hex'),persistence.normalized);report.checks.push('Download: stessi byte del documento salvato');
 // Real AcroForm regression fixture, rendered and filled through the real PageSurface.
 const acro=await page.evaluate(async()=>{
  const api=window.integration,pdf=await api.PDFDocument.create();const pp=pdf.addPage([595.2756,841.8898]);
  pp.drawText('Nome:',{x:40,y:740,size:12});const form=pdf.getForm();const f=form.createTextField('Nome');f.setText('Mario Rossi');f.addToPage(pp,{x:100,y:730,width:220,height:24});
  const check=form.createCheckBox('Consenso');check.addToPage(pp,{x:40,y:680,width:18,height:18});check.check();
  const select=form.createDropdown('Scelta');select.addOptions(['Uno','Due']);select.select('Uno');select.addToPage(pp,{x:100,y:670,width:220,height:24});
  const bytes=await pdf.save();const result=await api.processDocumentAcquisition(bytes,'acro.pdf');window.acro=result;
  const explicit=result.documentalResult.pages[0].fields.find(f=>f.reason.startsWith('Widget'));
  return {value:explicit?.value,original:explicit?.originalValue,checkbox:result.documentalResult.pages[0].fields.find(f=>f.type==='checkbox')?.value,select:result.documentalResult.pages[0].fields.find(f=>f.type==='select')?.value};
 });assert.equal(acro.value,'Mario Rossi');assert.equal(acro.original,'Mario Rossi');assert.equal(acro.checkbox,true);assert.equal(acro.select,'Uno');report.checks.push('AcroForm reale: valore esistente preservato');
 const fill=await page.evaluate(async()=>{
  const api=window.integration,r=window.acro,p=r.documentalResult.pages[0];
  const candidates=api.pageCandidates(p);const schema=api.createTemplateSchemaFromCandidates('filled-fixture','acro.pdf',r.sourceSha256,[{pageNumber:1,widthPt:595.2756,heightPt:841.8898,fields:candidates}],candidates,'REVIEW_REQUIRED','A1');
  const f=schema.fields.find(f=>f.defaultValue==='Mario Rossi');f.label='Nome corretto';f.calibrationStatus='MODIFIED';
  const doc=await api.pdfjs.getDocument({data:new Uint8Array(r.canonicalDocument)}).promise;
  const sourceDoc=await api.pdfjs.getDocument({data:new Uint8Array(r.sourceBinary)}).promise;
  const recandidates=await api.detectFieldsOnPdfPage(await sourceDoc.getPage(1),1,[]);
  await sourceDoc.destroy();
  if(!recandidates.some(f=>f.originalValue==='Mario Rossi'&&f.defaultValue==='Mario Rossi'))throw Error('Recalibration lost AcroForm value');
  const protectedFields=[{...candidates.find(f=>f.defaultValue==='Mario Rossi'),calibrationStatus:'MODIFIED'}];
  const before=JSON.stringify(protectedFields);const proposals=await api.detectFieldsOnPdfPage(await doc.getPage(1),1,protectedFields);
  const untouched=before===JSON.stringify(protectedFields);
  api.mountSurface(doc,[f],{[f.templateFieldId]:'Pietro Bellotti'},'EDIT');window.fill={f,doc};
  return {untouched,default:f.defaultValue,proposals:proposals.length};
 });assert.ok(fill.untouched);await page.locator('input,textarea').first().waitFor();await page.screenshot({path:path.join(out,'field-edit.png')});
 await page.evaluate(()=>window.integration.mountSurface(window.fill.doc,[window.fill.f],{[window.fill.f.templateFieldId]:'Pietro Bellotti'},'PRINT'));
 await page.locator('#overlay-print-'+await page.evaluate(()=>window.fill.f.templateFieldId)).waitFor();await page.locator('#document-page-1[data-render-status=SUCCESS]').waitFor();await page.pdf({path:path.join(out,'filled-page.pdf'),preferCSSPageSize:true,printBackground:true});
 report.checks.push('Revisione/correzione proprietà, protezione campo MODIFIED, compilazione in PageSurface ed esportazione PDF browser');
 const acquired=await page.evaluate(async()=>{
  const api=window.integration,r=window.acro;
  const schema=api.documentSchema(r.documentalResult,r.normalizedSha256,'A1');
  const source=await api.resolveTemplateSource({providedBinary:r.canonicalDocument,providedSchema:schema,providedBinarySha256:r.normalizedSha256,schoolOrder:'A1'});
  let rejected=false;try{await api.resolveTemplateSource({providedBinary:r.canonicalDocument,providedSchema:schema,providedBinarySha256:'bad-hash',schoolOrder:'A1'});}catch{rejected=true;}
  const doc={id:'integration-acquired',schoolOrder:'A1',schoolYear:'2026/2027',studentCode:'test',schoolName:'test',classOrSection:'test',creationDate:'2026-10-04',lastModifiedDate:'2026-10-04',values:{},fieldStatuses:{},notes:{},acquiredSchema:schema,acquiredBinarySha256:r.normalizedSha256,canonicalDocument:r.canonicalDocument,sourcePdfBinary:r.canonicalDocument};
  localStorage.setItem('integration-acquired',JSON.stringify(doc));const copy=JSON.parse(localStorage.getItem('integration-acquired'));copy.canonicalDocument=Uint8Array.from(Object.values(copy.canonicalDocument));copy.sourcePdfBinary=copy.canonicalDocument;
  api.mountDocument(copy);return {schema:source.templateSchema.schemaId,rejected,original:copy.acquiredSchema.fields.find(f=>f.defaultValue==='Mario Rossi')?.defaultValue};
 });assert.ok(acquired.rejected);assert.equal(acquired.original,'Mario Rossi');await page.locator('input,textarea').first().waitFor();
 report.checks.push('Documento acquisito: schema proprio, ripristino JSON, DocumentSurface e rifiuto hash discordante');

 // Real Roma scan via the ordinary acquisition facade, not an alternate normalization script.
 await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));
 console.log('Roma: avvio OCR delle 12 pagine');
 const roma=await page.evaluate(async(fixture)=>{
  const api=window.integration;const bytes=await fetch('/@fs/'+fixture).then(r=>r.arrayBuffer());
  const hash=await api.computeSha256(new Uint8Array(bytes));if(hash!=='d35456652c65d388b2e1e1381407a2a0ab97c77351389a98451135ea37dea7e7')throw new Error('Hash fixture Roma diverso');
  const r=await api.processDocumentAcquisition(bytes,'roma.pdf');window.roma=r;
  return {pages:r.totalPages,source:r.documentalResult.pages.map(p=>p.source),chars:r.rawPages.map(p=>p.text.length),hash:r.normalizedSha256,fields:r.documentalResult.pages.map(p=>p.fields.length)};
 },path.join(root,'Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf'));assert.equal(roma.pages,12);assert.ok(roma.source.every(s=>s==='ocr'));assert.ok(roma.chars.every(n=>n>0));report.roma=roma;console.log('Roma: OCR concluso',JSON.stringify(roma));
 await saveBinary('Roma-canonical.pdf','roma');
 for(const n of [1,3]){const data=await page.evaluate(n=>window.roma.documentalResult.pages[n-1].image,n);await fs.writeFile(path.join(out,`Roma-page${n}.png`),Buffer.from(data.split(',')[1],'base64'));}
 report.checks.push('Roma scansito: acquisizione reale di tutte le 12 pagine, raster e OCR');
 const savedRoma=await page.evaluate(async()=>{
  const api=window.integration,r=window.roma,schema=api.documentSchema(r.documentalResult,r.normalizedSha256,'A1');
  const doc={id:'integration-roma-saved',modelId:schema.templateId,templateId:schema.templateId,schoolOrder:'A1',schoolYear:'2026/2027',studentCode:'test',schoolName:'test',classOrSection:'test',creationDate:'2026-10-04',lastModifiedDate:'2026-10-04',values:{'integration-value':'Salvataggio verificato'},fieldStatuses:{},notes:{},acquiredSchema:schema,acquiredBinarySha256:r.normalizedSha256,originalSourceSha256:r.sourceSha256,originalSourceBinary:r.sourceBinary,canonicalDocument:r.canonicalDocument,sourcePdfBinary:r.canonicalDocument};
  await api.savePeiDocument(doc);return {hash:r.normalizedSha256,metadataLength:localStorage.getItem('pei_facile_saved_doc').length};
 });assert.ok(savedRoma.metadataLength<1000000);
 await page.reload();await page.waitForFunction(()=>window.integration);
 const loadedRoma=await page.evaluate(async()=>{const api=window.integration,d=await api.loadSavedPeiDocument();return {hash:await api.computeSha256(d.canonicalDocument),original:await api.computeSha256(d.originalSourceBinary),value:d.values['integration-value'],pages:d.acquiredSchema.totalPages};});
 assert.equal(loadedRoma.hash,savedRoma.hash);assert.equal(loadedRoma.original,'d35456652c65d388b2e1e1381407a2a0ab97c77351389a98451135ea37dea7e7');assert.equal(loadedRoma.value,'Salvataggio verificato');assert.equal(loadedRoma.pages,12);
 report.checks.push('PEI completo Roma: salvataggio IndexedDB dei PDF, metadata localStorage compatto, reload e ripristino valori/schema/hash');
 await page.goto('http://127.0.0.1:3199');await page.getByText('Apri PEI Esistente',{exact:true}).click();await page.locator('#document-surface-root').waitFor({timeout:30000});report.checks.push('App reale: Apri PEI Esistente ricarica il documento Roma salvato e la sua superficie');


 assert.deepEqual(errors,[]);report.finished=new Date().toISOString();console.log(JSON.stringify(report,null,2));
}catch(e){report.failure=String(e.stack||e);console.error(e);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
