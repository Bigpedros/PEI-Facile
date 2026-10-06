import {it,expect} from 'vitest';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist';
import {createCanvas} from '@napi-rs/canvas';
import {normalize} from './engine/raster';
import {canonicalRasterPdf} from './bridge';
import {detectCanonicalPageFields} from './detection';

// The filled PEI stays outside the repository. Enable this regression locally
// with PEI_REAL_ROMA_PDF pointing to the original document supplied for testing.
const input=process.env.PEI_REAL_ROMA_PDF;
it.skipIf(!input)('conserva firme e aree narrative del PEI compilato dopo normalizzazione A4',async()=>{
 const original=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(input!))}).promise;
 const pages:any[]=[];
 try{
  for(const number of [1,2,3,4]){
   const page=await original.getPage(number),initial=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:Math.min(200/72,3508/Math.max(initial.width,initial.height))});
   const canvas=createCanvas(Math.round(viewport.width),Math.round(viewport.height));
   await page.render({canvasContext:canvas.getContext('2d') as any,viewport}).promise;
   const prepared=normalize({canvas:canvas as any,nativeTokens:[],pageNumber:number,warnings:[]} as any,{profile:'pei',dpi:200,rotation:0} as any);
   pages.push({pageNumber:number,width:prepared.canvas.width,height:prepared.canvas.height,image:prepared.canvas.toDataURL('image/png')});
  }
 }finally{await original.destroy();}
 const canonical=await pdfjs.getDocument({data:await canonicalRasterPdf({pages} as any)}).promise;
 try{
  for(const number of [1,2,3,4]){
   const result=await detectCanonicalPageFields(await canonical.getPage(number),number),fields=result.page.fields;
   if(number===1)expect(fields.filter(f=>/firma del dirigente/i.test(f.label))).toHaveLength(4);
   if(number===2)expect(fields.filter(f=>f.type==='textarea').length).toBeGreaterThanOrEqual(3);
   if(number===3){
    expect(fields.filter(f=>/^[a-d]\. Dimensione/.test(f.label))).toHaveLength(4);
    expect(fields.find(f=>/^a\. Dimensione/.test(f.label))!.value).toContain('CONSAPEVOLEZZA');
    expect(fields.find(f=>/^c\. Dimensione/.test(f.label))!.value).toContain('AUTONOMO');
    expect(fields.find(f=>f.label==='Strategie e Strumenti')!.value).toContain('COSTRUZIONI');
   }
   if(number===4){
    expect(fields.filter(f=>['Obiettivi ed esiti attesi','Attività','Strategie e Strumenti'].includes(f.label))).toHaveLength(9);
    expect(fields.find(f=>f.label==='Obiettivi ed esiti attesi')!.value).toContain('RAFFORZARE');
    expect(fields.some(f=>f.type==='checkbox')).toBe(false);
   }
  }
 }finally{await canonical.destroy();}
},120000);
