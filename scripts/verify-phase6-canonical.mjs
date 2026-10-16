/** Verify every exported canonical page against its captured production raster.
 * Usage: node scripts/verify-phase6-canonical.mjs /private/acquisition-output
 * No OCR is rerun. This checks raster preservation, not recognition accuracy or browser print.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createCanvas,loadImage,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
if(!process.argv[2])throw new Error('Provide the private acquisition output directory.');
const out=path.resolve(process.argv[2]);
assert.ok(out!==process.cwd()&&!out.startsWith(process.cwd()+path.sep),'Use a private output directory outside the repository');
const pdf=await pdfjs.getDocument({data:new Uint8Array(await fs.readFile(path.join(out,'canonical.pdf')))}).promise;
try{
 assert.equal(pdf.numPages,12);const report=[];
 const sheet=createCanvas(3*300,4*440),sheetCtx=sheet.getContext('2d');sheetCtx.fillStyle='#ddd';sheetCtx.fillRect(0,0,sheet.width,sheet.height);
 for(let n=1;n<=pdf.numPages;n++){
  const evidence=JSON.parse(await fs.readFile(path.join(out,`page-${String(n).padStart(2,'0')}.json`),'utf8'));
  const p=await pdf.getPage(n),viewport=p.getViewport({scale:1}),actual=createCanvas(Math.round(viewport.width),Math.round(viewport.height));
  await p.render({canvasContext:actual.getContext('2d'),viewport}).promise;
  const expected=createCanvas(actual.width,actual.height),ctx=expected.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,actual.width,actual.height);ctx.drawImage(await loadImage(evidence.image),0,0,actual.width,actual.height);
  const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,b=ctx.getImageData(0,0,actual.width,actual.height).data;
  let ink=0,diff=0;for(let i=0;i<a.length;i+=4){if(a[i]+a[i+1]+a[i+2]<720)ink++;for(let c=0;c<3;c++)diff+=Math.abs(a[i+c]-b[i+c]);}
  const inkFraction=ink/(actual.width*actual.height),meanAbsoluteError=diff/(actual.width*actual.height*3);
  assert.ok(inkFraction>.001,`Blank page ${n}`);assert.ok(meanAbsoluteError<8,`Raster mismatch on page ${n}: ${meanAbsoluteError}`);
  report.push({page:n,inkFraction,meanAbsoluteError});
  const x=((n-1)%3)*300,y=Math.floor((n-1)/3)*440;
  sheetCtx.fillStyle='black';sheetCtx.font='14px sans-serif';sheetCtx.fillText(`Pagina ${n}`,x+10,y+18);sheetCtx.drawImage(actual,x+5,y+24,290,410);
  p.cleanup();
 }
 await fs.writeFile(path.join(out,'canonical-contact.png'),sheet.toBuffer('image/png'));
 const result={status:'PASS',pages:12,scope:'Canonical raster preservation only',measurements:report};await fs.writeFile(path.join(out,'canonical-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await pdf.destroy();}
