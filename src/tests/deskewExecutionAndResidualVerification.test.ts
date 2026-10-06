import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist';
import {processDocumentAcquisition} from '../core/documentAcquisitionService';

// Automatic acquisition preserves the raster orientation. Dedicated geometry
// tests cover deskew; acquisition must not claim a correction it does not apply.
describe('PEI FACILE — A4 raster preservation',()=>{
 it('reopens the generated PDF and preserves source ink after aspect fitting on pages 1 and 3',async()=>{
  const bytes=new Uint8Array(fs.readFileSync('Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf'));
  const acquired=await processDocumentAcquisition(bytes.buffer,'roma.pdf',{customOcrRunner:async()=>({text:''})});
  const source=await pdfjs.getDocument({data:bytes}).promise;
  const saved=await pdfjs.getDocument({data:new Uint8Array(acquired.canonicalDocument!)}).promise;
  expect(saved.numPages).toBe(source.numPages);
  async function raster(doc:any,n:number){const page=await doc.getPage(n);const size=page.getViewport({scale:1});const viewport=page.getViewport({scale:1000/size.width});const canvas=document.createElement('canvas');canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);await page.render({canvasContext:canvas.getContext('2d')!,viewport}).promise;return canvas;}
  for(const n of [1,3]){
   const before=await raster(source,n),after=await raster(saved,n);
   const expected=document.createElement('canvas');expected.width=after.width;expected.height=after.height;const ctx=expected.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,expected.width,expected.height);
   const scale=Math.min(expected.width/before.width,expected.height/before.height);const w=before.width*scale,h=before.height*scale;ctx.drawImage(before,(expected.width-w)/2,(expected.height-h)/2,w,h);
   const a=ctx.getImageData(0,0,expected.width,expected.height).data,b=after.getContext('2d')!.getImageData(0,0,after.width,after.height).data;
   let ink=0,missing=0;
   for(let y=2;y<after.height-2;y++)for(let x=2;x<after.width-2;x++){const at=(y*after.width+x)*4;if(a[at]+a[at+1]+a[at+2]>=450)continue;ink++;let found=false;
    for(let dy=-2;dy<=2&&!found;dy++)for(let dx=-2;dx<=2;dx++){const j=((y+dy)*after.width+x+dx)*4;if(b[j]+b[j+1]+b[j+2]<600){found=true;break;}}
    if(!found)missing++;
   }
   expect(ink).toBeGreaterThan(1000);expect(missing/ink).toBeLessThan(.02);
   before.width=before.height=after.width=after.height=expected.width=expected.height=1;
  }
  expect(acquired.coordinateTransform!.rotationCorrection).toBe(0);
  await source.destroy();await saved.destroy();
 },60000);
});
