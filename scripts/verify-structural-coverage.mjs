// Compare identical real OCR/geometry evidence, without rerunning OCR.
// Evidence files can contain personal data and must stay outside version control.
import {createServer} from 'vite';import {chromium} from '@playwright/test';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const args=process.argv.slice(2),directory=args[args.indexOf('--evidence-dir')+1];
if(!args.includes('--evidence-dir')||!directory)throw Error('Uso: node scripts/verify-structural-coverage.mjs --evidence-dir /percorso/evidenze');
const input=path.resolve(directory),files=fs.readdirSync(input).filter(f=>/^baseline-\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));if(!files.length)throw Error('Nessuna evidenza baseline-<pagina>.json disponibile.');
const server=await createServer({server:{host:'127.0.0.1',port:3199,hmr:false,watch:null}});await server.listen();const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3199/scripts/integration-check.html');await page.waitForFunction(()=>window.integration);
 const summary=[];
 for(const file of files){
  const before=JSON.parse(fs.readFileSync(path.join(input,file),'utf8'));
  const result=await page.evaluate(async baseline=>{
   const {recoverStructuralFields}=await import('/src/core/documental/engine/structuralCoverage.ts'),{fieldTokens}=await import('/src/core/documental/engine/index.ts');
   const image=Object.assign(new Image(),{src:baseline.image});await image.decode();const canvas=document.createElement('canvas');canvas.width=baseline.width;canvas.height=baseline.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   const immutable=JSON.stringify({tokens:baseline.tokens,regions:baseline.regions,fields:baseline.fields}),pixels=canvas.toDataURL();
   const recovered=recoverStructuralFields(canvas,fieldTokens(baseline.tokens,baseline.regions),baseline.regions,baseline.fields,baseline.fieldInferenceDiagnostics);
   const unchanged=immutable===JSON.stringify({tokens:baseline.tokens,regions:baseline.regions,fields:baseline.fields})&&pixels===canvas.toDataURL();
   const repeated=recoverStructuralFields(canvas,fieldTokens(baseline.tokens,baseline.regions),baseline.regions,recovered.fields,baseline.fieldInferenceDiagnostics),added=recovered.fields.slice(baseline.fields.length);
   const valid=added.every(f=>f.status==='review'&&f.box.x>=0&&f.box.y>=0&&f.box.x+f.box.width<=canvas.width&&f.box.y+f.box.height<=canvas.height&&f.value!==undefined);
   for(const e of recovered.diagnostics.evidence){if(e.outcome!=='recovered'&&!(e.plausible&&!e.coveredAfter))continue;ctx.lineWidth=3;ctx.strokeStyle=e.outcome==='recovered'?'#00a86b':'#e78200';ctx.setLineDash(e.outcome==='recovered'?[]:[8,5]);ctx.strokeRect(e.responseBox.x,e.responseBox.y,e.responseBox.width,e.responseBox.height);}
   return {page:baseline.pageNumber,before:baseline.fields.length,after:recovered.fields.length,unchanged,valid,idempotent:repeated.fields.length===recovered.fields.length,coverage:recovered.diagnostics,added:added.map(f=>({box:f.box,type:f.type,value:f.value})),overlay:canvas.toDataURL('image/png')};
  },before);
  assert.ok(result.unchanged);assert.ok(result.valid);assert.ok(result.idempotent);
  fs.writeFileSync(path.join(input,`phase3-overlay-${result.page}.png`),Buffer.from(result.overlay.split(',')[1],'base64'));delete result.overlay;fs.writeFileSync(path.join(input,`phase3-${result.page}.json`),JSON.stringify(result,null,2));
  const row={page:result.page,before:result.before,after:result.after,...result.coverage.summary};summary.push(row);console.log('STRUCTURAL',JSON.stringify(row));
 }
 assert.equal(errors.length,0);fs.writeFileSync(path.join(input,'phase3-summary.json'),JSON.stringify(summary,null,2));console.log('PASS',JSON.stringify({pages:summary.length,browserErrors:errors}));
}finally{await browser.close();await server.close();}
