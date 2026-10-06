import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist';
import {detectRegions} from './engine/regions';
import {detectWritingLines,inferFields,isLabel} from './engine/fields';
import {assignLines} from './engine/geometry';
import {fieldTokens} from './engine';
import {detectCanonicalPageFields} from './detection';
import type {Token} from './engine/types';

describe('Calibratore: evidenza raster e associazioni',()=>{
 it('rileva caselle piccole e righe grigie interrotte, senza promuovere la frase introduttiva',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);ctx.strokeStyle='#a0a0a0';ctx.lineWidth=1;
  ctx.strokeRect(50,150,12,12);ctx.beginPath();ctx.moveTo(160,110);ctx.lineTo(260,111);ctx.moveTo(263,111);ctx.lineTo(360,112);ctx.stroke();
  const tokens:Token[]=[{id:'s',text:'Sezione',box:{x:50,y:90,width:80,height:20},source:'ocr',confidence:90,lineId:'1'},{id:'n',text:'Nella fase transitoria:',box:{x:50,y:210,width:190,height:20},source:'ocr',confidence:90,lineId:'2'}];
  const regions=detectRegions(c as any,tokens);const fields=inferFields(c as any,tokens,regions);
  expect(regions.some(r=>r.kind==='checkbox')).toBe(true);expect(fields.some(f=>f.label==='Sezione'&&f.box.x>=150)).toBe(true);expect(fields.some(f=>/Nella fase/.test(f.label))).toBe(false);expect(isLabel('Nella fase transitoria:')).toBe(false);
 });
 it('trova geometria reale sulla pagina Roma inclusa nello ZIP e separa Sezione da Plesso',async()=>{
  const d=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('public/downloads/PEI_Comune_Roma_Canonico_A4_020.pdf'))}).promise;
  try{const result=await detectCanonicalPageFields(await d.getPage(1),1);
   console.log('ROMA',JSON.stringify({tokens:result.tokens,regions:result.regions,fields:result.page.fields.length}));
   fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/roma-page1.json',JSON.stringify(result.page,null,2));
   expect(result.regions).toBeGreaterThan(5);expect(result.page.fields.filter(f=>f.type==='checkbox').length).toBeGreaterThan(2);
   expect(result.page.fields.some(f=>/Nella fase transitoria/i.test(f.label))).toBe(false);
   expect(result.page.fields.some(f=>/^Sezione$/i.test(f.label))).toBe(true);
   expect(result.page.fields.some(f=>/^Plesso o sede$/i.test(f.label))).toBe(true);
   const sezione=result.page.fields.find(f=>/^Sezione$/i.test(f.label))!,plesso=result.page.fields.find(f=>/^Plesso o sede$/i.test(f.label))!;
   expect(sezione.box.x+sezione.box.width).toBeLessThan(plesso.box.x);
   expect(result.page.fields.filter(f=>f.label==='Nome e Cognome')).toHaveLength(1);
  }finally{await d.destroy();}
 },120000);
});
