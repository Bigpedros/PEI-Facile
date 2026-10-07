import {it,expect} from 'vitest';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist';
import {detectCanonicalPageFields} from './detection';

it('conserva le aree narrative e recupera le consegne esterne del modello Roma vuoto',async()=>{
 const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('public/downloads/PEI_Comune_Roma_Canonico_A4_020.pdf'))}).promise;
 try{
  for(const number of [2,3,5]){
   const {page}=await detectCanonicalPageFields(await pdf.getPage(number),number),fields=page.fields;
   if(number===2)expect(fields.find(f=>f.label.startsWith('Sintetica descrizione'))!.box.height).toBeGreaterThan(100);
   if(number===3)expect(fields.some(f=>f.label==='Attività')).toBe(true);
   if(number===5){
    expect(fields.some(f=>f.label==='Osservazioni sul contesto: barriere e facilitatori')).toBe(true);
    expect(fields.some(f=>f.label==='Interventi sul contesto per un ambiente inclusivo')).toBe(true);
    expect(fields.some(f=>f.label.startsWith('Modalità di sostegno'))).toBe(true);
   }
  }
 }finally{await pdf.destroy();}
},90000);
