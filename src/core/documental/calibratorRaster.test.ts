import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist';
import {detectRegions} from './engine/regions';
import {detectWritingLines,inferFields,isLabel} from './engine/fields';
import {assignLines} from './engine/geometry';
import {fieldTokens} from './engine';
import {detectCanonicalPageFields} from './detection';
import {pageCandidates} from './bridge';
import type {Token} from './engine/types';

describe('Calibratore: evidenza raster e associazioni',()=>{
 it('rileva caselle piccole e righe grigie interrotte, senza promuovere la frase introduttiva',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);ctx.strokeStyle='#a0a0a0';ctx.lineWidth=1;
  ctx.strokeRect(50,150,12,12);ctx.beginPath();ctx.moveTo(160,110);ctx.lineTo(260,111);ctx.moveTo(263,111);ctx.lineTo(360,112);ctx.stroke();
  const tokens:Token[]=[{id:'s',text:'Sezione',box:{x:50,y:90,width:80,height:20},source:'ocr',confidence:90,lineId:'1'},{id:'n',text:'Nella fase transitoria:',box:{x:50,y:210,width:190,height:20},source:'ocr',confidence:90,lineId:'2'}];
  const regions=detectRegions(c as any,tokens);const fields=inferFields(c as any,tokens,regions);
  expect(regions.some(r=>r.kind==='checkbox')).toBe(true);expect(fields.some(f=>f.label==='Sezione'&&f.box.x>=150)).toBe(true);expect(fields.some(f=>/Nella fase/.test(f.label))).toBe(false);expect(isLabel('Nella fase transitoria:')).toBe(false);
 });
 it('ricostruisce un riquadro con un angolo interrotto senza usare le righe interne come bordi',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);ctx.strokeStyle='#808080';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(62,100);ctx.lineTo(750,100);ctx.moveTo(50,100);ctx.lineTo(50,250);ctx.lineTo(750,250);ctx.lineTo(750,100);ctx.moveTo(80,190);ctx.lineTo(720,190);ctx.moveTo(80,215);ctx.lineTo(720,215);ctx.stroke();
  const tokens:Token[]=[{id:'caption',text:'b. Indicazioni da considerare per il progetto individuale',box:{x:60,y:120,width:500,height:20},source:'ocr',confidence:95,lineId:'caption'}];
  const regions=detectRegions(c as any,tokens),fields=inferFields(c as any,tokens,regions);
  expect(regions.filter(r=>r.kind==='cell')).toHaveLength(1);expect(fields.filter(f=>f.type==='textarea')).toHaveLength(1);expect(fields[0].box.height).toBeGreaterThan(90);
  const unreadable=tokens.map(t=>({...t,text:'OCR illeggibile'}));const uncertain=inferFields(c as any,unreadable,detectRegions(c as any,unreadable));expect(uncertain.some(f=>f.type==='textarea'&&f.label==='Testo su righe — da verificare'&&f.status==='review')).toBe(true);
 });
 it('trasforma il segnaposto scuola in un campo che copre il testo originale',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);
  const tokens:Token[]=[{id:'header',text:'[INTESTAZIONE DELLA SCUOLA]',box:{x:180,y:70,width:360,height:22},source:'ocr',confidence:95,lineId:'header'}];
  const fields=inferFields(c as any,tokens,[]);
  expect(fields).toHaveLength(1);expect(fields[0].label).toBe('INTESTAZIONE DELLA SCUOLA');expect(fields[0].maskOriginal).toBe(true);
  const candidate=pageCandidates({fields,width:800,height:1000,pageNumber:1} as any)[0];
  expect(candidate.backgroundMode).toBe('OPAQUE_WHITE');expect(candidate.suggestedSemanticKey).toBe('school.institutionName');expect(candidate.semanticKey).toBeNull();
  expect(isLabel('(ART. 7, D. Lgs. 13 aprile 2017, N. 66 e s.m.i.)')).toBe(false);
 });
 it('conserva una data compilata, rifiuta caselle spurie e associa una firma alla riga sottostante',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);ctx.strokeStyle='black';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(410,250);ctx.lineTo(620,250);ctx.stroke();
  const dateLabel:Token={id:'date-label',text:'DATA',box:{x:100,y:100,width:50,height:20},source:'ocr',confidence:95,lineId:'date'};
  const dateValue:Token={id:'date-value',text:'16/10/24',box:{x:160,y:100,width:100,height:20},source:'ocr',confidence:95,lineId:'date'};
  const tokens:Token[]=[{...dateLabel,text:'DATA 16/10/24',box:{x:100,y:100,width:160,height:20},fragments:[dateLabel,dateValue]}, {id:'signature',text:'FIRMA DEL DIRIGENTE SCOLASTICO',box:{x:400,y:200,width:280,height:20},source:'ocr',confidence:95,lineId:'signature'}];
  const fields=inferFields(c as any,tokens,[{id:'noise',kind:'checkbox',box:{x:80,y:100,width:12,height:12},text:'',status:'review',checked:null}]);
  expect(fields.some(f=>f.type==='checkbox')).toBe(false);
  const date=fields.find(f=>f.type==='date')!;expect(date.value).toBe('2024-10-16');expect(date.label).toBe('DATA');expect(date.box.x).toBe(160);
  const signature=fields.find(f=>/firma/i.test(f.label))!;expect(signature).toBeDefined();expect(signature.box.width).toBeGreaterThan(180);expect(signature.box.y).toBeGreaterThan(220);
 });
 it('lascia statici i titoli e conserva il testo nella zona narrativa sotto la consegna',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);
  const tokens:Token[]=[
   {id:'heading',text:'4. Osservazioni sul bambino per progettare gli interventi di sostegno:',box:{x:50,y:50,width:650,height:20},source:'ocr',confidence:95,lineId:'heading'},
   {id:'caption',text:'a. Dimensione della relazione, interazione e socializzazione:',box:{x:55,y:104,width:620,height:20},source:'ocr',confidence:95,lineId:'caption'},
   {id:'response',text:'Testo già compilato da conservare.',box:{x:55,y:138,width:500,height:20},source:'ocr',confidence:95,lineId:'response'}];
  const fields=inferFields(c as any,tokens,[{id:'narrative',kind:'cell',box:{x:50,y:100,width:650,height:160},text:'',status:'review',checked:null}]);
  expect(fields).toHaveLength(1);expect(fields[0].type).toBe('textarea');expect(fields[0].box.y).toBeGreaterThan(124);expect(fields[0].value).toBe('Testo già compilato da conservare.');expect(fields[0].maskOriginal).toBe(true);
  expect(isLabel('4. Osservazioni sul bambino:')).toBe(false);expect(isLabel('a. Dimensione della relazione:')).toBe(false);
 });
 it('ricostruisce quattro celle con bordi chiari inclinati senza alterare il raster',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);ctx.strokeStyle='#d7d7d7';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(50,100);ctx.lineTo(750,112);ctx.lineTo(746,460);ctx.lineTo(46,448);ctx.closePath();ctx.stroke();
  for(let n=1;n<4;n++){ctx.beginPath();ctx.moveTo(50-n,100+n*87);ctx.lineTo(750-n,112+n*87);ctx.stroke();}
  const tokens:Token[]=Array.from({length:4},(_,n)=>({id:'caption'+n,text:`${'abcd'[n]}. Dimensione della relazione:`,box:{x:60,y:120+n*87,width:390,height:20},source:'ocr',confidence:95,lineId:'row'+n}));
  const regions=detectRegions(c as any,tokens),fields=inferFields(c as any,tokens,regions);
  expect(regions.filter(r=>r.kind==='cell')).toHaveLength(4);expect(fields.filter(f=>f.type==='textarea')).toHaveLength(4);
 });
 it('conserva tutta la cella quando attività e risposta condividono la prima riga',()=>{
  const c=createCanvas(800,1000),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1000);
  const caption:Token={id:'c',text:'Attività',box:{x:55,y:105,width:80,height:20},source:'ocr',confidence:95,lineId:'row'};
  const response:Token={id:'v',text:'GIOCHI DI TURNAZIONE',box:{x:150,y:105,width:260,height:20},source:'ocr',confidence:95,lineId:'row'};
  const fields=inferFields(c as any,fieldTokens([caption,response],[{id:'cell',kind:'cell',box:{x:50,y:100,width:650,height:120},text:'',status:'review',checked:null}]),[{id:'cell',kind:'cell',box:{x:50,y:100,width:650,height:120},text:'',status:'review',checked:null}]);
  expect(fields).toHaveLength(1);expect(fields[0].label).toBe('Attività');expect(fields[0].value).toBe('Attività GIOCHI DI TURNAZIONE');expect(fields[0].maskOriginal).toBe(true);expect(fields[0].type).toBe('textarea');
  expect(isLabel('fascia di età, capacità di integrare competenze:')).toBe(false);
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
   expect(result.page.fields.some(f=>/intestazione della scuola/i.test(f.label))).toBe(true);
   expect(result.page.fields.filter(f=>/firma del dirigente scolastico/i.test(f.label))).toHaveLength(4);
   expect(result.page.fields.some(f=>f.type==='checkbox'&&/^(DATA|FIRMA)/i.test(f.label))).toBe(false);
   // A tiny/blank preview must never be used as OCR input or change geometry.
   const preview=createCanvas(300,424);
   const zoomed=await detectCanonicalPageFields(await d.getPage(1),1,undefined,preview as any);
   expect(zoomed.page.width).toBe(result.page.width);expect(zoomed.page.height).toBe(result.page.height);
   expect(zoomed.page.fields.map(f=>({label:f.label,box:f.box}))).toEqual(result.page.fields.map(f=>({label:f.label,box:f.box})));
  }finally{await d.destroy();}
 },120000);
 it('propone aree narrative nelle pagine Roma 2 e 3',async()=>{
  const d=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync('public/downloads/PEI_Comune_Roma_Canonico_A4_020.pdf'))}).promise;
  try{for(const n of [2,3]){const result=await detectCanonicalPageFields(await d.getPage(n),n);
   fs.writeFileSync(`verification/roma-page${n}.json`,JSON.stringify(result.page,null,2));
   console.log('ROMA NARRATIVE',n,result.page.fields.filter(f=>f.type==='textarea').map(f=>f.label));
   expect(result.page.fields.some(f=>f.type==='textarea')).toBe(true);
   expect(result.page.fields.some(f=>/^\d+[.)]\s*(?:Osservazioni|Interventi|Elementi generali)/i.test(f.label))).toBe(false);
  }}finally{await d.destroy();}
 },120000);

});
