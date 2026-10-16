// Real positioned evidence stays local; only anonymous counts belong in git.
import {createServer} from 'vite';import {chromium} from '@playwright/test';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const args=process.argv.slice(2),directory=args[args.indexOf('--evidence-dir')+1];if(!args.includes('--evidence-dir')||!directory)throw Error('Uso: node scripts/verify-field-associations.mjs --evidence-dir /percorso/evidenze');
const dir=path.resolve(directory),files=fs.readdirSync(dir).filter(f=>/^baseline-\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));if(!files.length)throw Error('Evidenze baseline mancanti.');
const server=await createServer({server:{host:'127.0.0.1',port:3203,hmr:false,watch:null}});await server.listen();const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:3203/scripts/integration-check.html');await p.waitForFunction(()=>window.integration);const summary=[];
 for(const file of files){
  const baseline=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
  const result=await p.evaluate(async page=>{
   const {associateMeasuredFields,refreshAssociatedCoverage}=await import('/src/core/documental/engine/fieldAssociations.ts'),{rasterStrokes}=await import('/src/core/documental/engine/strokes.ts'),{fieldTokens}=await import('/src/core/documental/engine/index.ts');
   const image=Object.assign(new Image(),{src:page.image});await image.decode();const canvas=document.createElement('canvas');canvas.width=page.width;canvas.height=page.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   const input=JSON.stringify({tokens:page.tokens,regions:page.regions,fields:page.fields}),pixels=canvas.toDataURL(),strokes=rasterStrokes(canvas),tokens=fieldTokens(page.tokens,page.regions);
   const result=associateMeasuredFields(canvas,tokens,page.regions,page.fields,undefined,strokes,page.ocrReading?.secondaryTokens),again=associateMeasuredFields(canvas,tokens,page.regions,result.fields,undefined,strokes,page.ocrReading?.secondaryTokens);
   const generic=f=>/^(?:Cella|Campo|Riga|Testo su righe).*da verificare$/i.test(f.label)||f.reason.startsWith('Recupero strutturale PEI:');
   const retained=page.fields.filter(f=>!generic(f)||f.origin==='manual'||f.status!=='review').every(f=>JSON.stringify(result.fields.find(n=>n.id===f.id))===JSON.stringify(f));
   const preserved=page.fields.every(f=>{const n=result.fields.find(n=>n.id===f.id);return !n||['box','value','originalValue','observedText','maskOriginal'].every(k=>JSON.stringify(n[k])===JSON.stringify(f[k]));});
   const unchanged=input===JSON.stringify({tokens:page.tokens,regions:page.regions,fields:page.fields})&&pixels===canvas.toDataURL();
   const idempotent=JSON.stringify(result.fields)===JSON.stringify(again.fields);
   const valid=result.fields.every(f=>f.box.x>=0&&f.box.y>=0&&f.box.x+f.box.width<=canvas.width+1&&f.box.y+f.box.height<=canvas.height+1);
   const coverage=refreshAssociatedCoverage(page.structuralCoverage,result.fields,result.diagnostics);
   const associated=result.diagnostics.decisions.filter(d=>d.outcome==='proposed'||d.outcome==='enriched');
   for(const d of associated){const f=result.fields.find(f=>f.id===d.fieldId);if(f){ctx.lineWidth=3;ctx.strokeStyle=d.outcome==='proposed'?'#00a86b':'#2274d8';ctx.strokeRect(f.box.x,f.box.y,f.box.width,f.box.height);}}
   return {page:page.pageNumber,before:page.fields.length,after:result.fields.length,unchanged,retained,preserved,idempotent,valid,diagnostics:result.diagnostics,filledAssociated:associated.filter(d=>result.fields.find(f=>f.id===d.fieldId)?.value!=='').length,uncoveredBefore:page.structuralCoverage?.summary.uncoveredAfter,uncoveredAfter:coverage?.summary.uncoveredAfter,fields:result.fields,overlay:canvas.toDataURL('image/png')};
  },baseline);
  assert.ok(result.unchanged,'Evidenze modificate');assert.ok(result.retained,'Campo esistente significativo modificato');assert.ok(result.preserved,'Geometria o contenuto esistente modificati');assert.ok(result.idempotent,'Passaggio non idempotente');assert.ok(result.valid,'Campo fuori pagina');
  fs.writeFileSync(path.join(dir,`phase4-overlay-${result.page}.png`),Buffer.from(result.overlay.split(',')[1],'base64'));delete result.overlay;fs.writeFileSync(path.join(dir,`phase4-${result.page}.json`),JSON.stringify(result,null,2));
  const row={page:result.page,before:result.before,after:result.after,...result.diagnostics.summary,filledAssociated:result.filledAssociated,uncoveredBefore:result.uncoveredBefore,uncoveredAfter:result.uncoveredAfter};summary.push(row);console.log('ASSOCIATIONS',JSON.stringify(row));
 }
 assert.equal(errors.length,0);fs.writeFileSync(path.join(dir,'phase4-summary.json'),JSON.stringify(summary,null,2));console.log('PASS',JSON.stringify({pages:summary.length,browserErrors:errors}));
}finally{await browser.close();await server.close();}
