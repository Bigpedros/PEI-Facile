import {createServer} from 'vite';import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const server=await createServer({server:{host:'127.0.0.1',port:3200,hmr:false,watch:null}});await server.listen();
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3200/scripts/integration-check.html');await page.waitForFunction(()=>window.integration);
 const id=await page.evaluate(async()=>{
  const api=window.integration,pdf=await api.PDFDocument.create();pdf.addPage([595.28,841.89]).drawText('Testo originale',{x:50,y:700,size:11});
  const bytes=await pdf.save(),hash=await api.computeSha256(bytes),now=new Date().toISOString();
  const schema={schemaId:'properties-test',templateId:'custom-properties-test',sourceSha256:hash,sourcePdfFileName:'properties.pdf',version:'1',totalPages:1,pages:[{pageNumber:1,widthPt:595.28,heightPt:841.89}],calibrationStatus:'CALIBRATED',geometryValidationStatus:'PASS',visualReviewStatus:'COMPLETED',createdAt:now,updatedAt:now,fields:[{templateFieldId:'properties-field',pageNumber:1,geometry:{xPt:50,yPt:120,widthPt:200,heightPt:50},label:'Testo di prova',fieldType:'TEXT_LONG',required:false,overflowPolicy:'RIGID',status:'MANUAL_VERIFIED',originalValue:'Testo originale',defaultValue:'Testo originale',backgroundMode:'OPAQUE_WHITE'}]};
  const doc={id:'field-properties-test',schoolOrder:'A1',schoolYear:'2026/2027',studentCode:'TEST',schoolName:'Scuola',classOrSection:'A',creationDate:now,lastModifiedDate:now,values:{'properties-field':'Testo originale'},fieldStatuses:{},notes:{},acquiredSchema:schema,acquiredBinarySha256:hash,canonicalDocument:bytes,sourcePdfBinary:bytes};
  window.originalPropertiesSchema=JSON.stringify(schema);api.mountPropertiesDocument(doc);return 'properties-field';
 });
 await page.locator('#input-'+id).waitFor();await page.locator('#input-'+id).click();await page.getByRole('button',{name:'Proprietà campo: Testo di prova',exact:true}).click();await page.getByRole('dialog').waitFor();
 await page.getByRole('spinbutton',{name:'Grandezza carattere in punti'}).fill('15');
 for(const name of ['Grassetto','Corsivo','Sottolineato'])await page.getByRole('button',{name,exact:true}).click();
 await page.getByRole('slider',{name:'Larghezza campo',exact:true}).fill('300');await page.getByRole('slider',{name:'Altezza campo',exact:true}).fill('80');
 await page.waitForFunction(id=>getComputedStyle(document.getElementById('input-'+id)).fontStyle==='italic',id);
 const live=await page.locator('#input-'+id).evaluate(e=>{const s=getComputedStyle(e);return {width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,font:s.fontSize,bold:s.fontWeight,italic:s.fontStyle,underline:s.textDecorationLine};});
 assert.equal(live.width,300);assert.equal(live.height,80);assert.equal(live.font,'15px');assert.equal(live.bold,'700');assert.equal(live.italic,'italic');assert.equal(live.underline,'underline');await page.getByRole('button',{name:'Fine',exact:true}).click();
 const saved=await page.evaluate(async()=>{const api=window.integration,d=await api.loadSavedPeiDocument();return {properties:d.fieldProperties,value:d.values['properties-field'],schemaUnchanged:JSON.stringify(d.acquiredSchema)===window.originalPropertiesSchema,hashSame:await api.computeSha256(d.canonicalDocument)===d.acquiredBinarySha256};});
 assert.equal(saved.value,'Testo originale');assert.ok(saved.schemaUnchanged&&saved.hashSame);assert.equal(saved.properties[id].widthPt,300);
 await page.reload();await page.waitForFunction(()=>window.integration);await page.evaluate(async()=>window.integration.mountPropertiesDocument(await window.integration.loadSavedPeiDocument()));
 await page.locator('#input-'+id).waitFor();assert.equal(await page.locator('#input-'+id).evaluate(e=>getComputedStyle(e).fontSize),'15px');
 await page.emulateMedia({media:'print'});await page.locator('#overlay-print-'+id).waitFor();assert.equal(await page.locator('#overlay-print-'+id).evaluate(e=>getComputedStyle(e).fontSize),'20px');assert.equal(await page.locator('#overlay-print-'+id).evaluate(e=>Math.round(e.getBoundingClientRect().width)),400);
 await page.emulateMedia({media:'screen'});await page.locator('#input-'+id).waitFor();
 await page.evaluate(async()=>{const api=window.integration,d=await api.loadSavedPeiDocument(),pdf=await api.pdfjs.getDocument({data:d.canonicalDocument.slice()}).promise;const {applyFieldPresentation}=await import('/src/core/fieldPresentation.ts');api.mountSurface(pdf,d.acquiredSchema.fields.map(f=>applyFieldPresentation(f,d.fieldProperties?.[f.templateFieldId],d.acquiredSchema.pages[0])),d.values,'PRINT');});
 await page.locator('#overlay-print-'+id).waitFor();assert.equal(await page.locator('#overlay-print-'+id).evaluate(e=>getComputedStyle(e).fontSize),'20px');assert.equal(await page.getByRole('button',{name:/Proprietà campo:/}).count(),0);assert.equal(errors.length,0);
 console.log('PASS',JSON.stringify({live,saved,browserErrors:errors}));
}finally{await browser.close();await server.close();}
