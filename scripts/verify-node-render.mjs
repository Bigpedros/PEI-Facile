import {createCanvas,DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
import assert from 'node:assert/strict';
import fs from 'node:fs';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
const d=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf'))}).promise;
try{const p=await d.getPage(1);const viewport=p.getViewport({scale:1});const c=createCanvas(viewport.width,viewport.height);
 await p.render({canvasContext:c.getContext('2d'),viewport}).promise;
 assert.equal(c.width,2092);assert.equal(c.height,3007);
 const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let ink=0;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]<450)ink++;
 const fraction=ink/(c.width*c.height);assert.ok(fraction>.005&&fraction<.5);
 console.log(JSON.stringify({pages:d.numPages,raster:[c.width,c.height],inkFraction:fraction,canvas:JSON.parse(fs.readFileSync('node_modules/@napi-rs/canvas/package.json')).version}));
}finally{await d.destroy();}
