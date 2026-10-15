import {describe,it,expect} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {recoverStructuralFields,structuralCoverageRatio} from './engine/structuralCoverage';
import {makeField,inferFields} from './engine/fields';
import {analyzeRasterPage} from './engine';
import {LocalRecognizer} from './engine/ocr';
import {pageCandidates} from './bridge';
import {FieldInferenceAudit} from './engine/fieldDiagnostics';
import {rasterStrokes} from './engine/strokes';
import {detectRegions} from './engine/regions';
import type {Region,Token} from './engine/types';
function canvas(){const c=createCanvas(600,800),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,600,800);return c as unknown as HTMLCanvasElement;}
function cell(id:string,x:number,y:number,width=240,height=70):Region{return {id,box:{x,y,width,height},kind:'cell',status:'review',text:'',checked:null};}
function word(text:string,x:number,y:number,width=100):Token{return {id:text+y,text,box:{x,y,width,height:20},source:'ocr',lineId:String(y),confidence:95};}
const grid=()=>[cell('a',40,100),cell('b',280,100),cell('c',40,170),cell('d',280,170)];
describe('Fase 3: copertura e recupero strutturale',()=>{
 it('riusa i tratti senza cambiare regioni e campi',()=>{
  const c=canvas(),x=c.getContext('2d')!;x.strokeStyle='black';grid().forEach(r=>x.strokeRect(r.box.x,r.box.y,r.box.width,r.box.height));
  const tokens=[word('Nome',50,110)],s=rasterStrokes(c),a=detectRegions(c,tokens),b=detectRegions(c,tokens,s);expect(a).toEqual(b);
  const strip=(f:ReturnType<typeof inferFields>)=>f.map(({id,...v})=>v);expect(strip(inferFields(c,tokens,b,undefined,s))).toEqual(strip(inferFields(c,tokens,a)));
 });
 it('recupera una griglia senza etichette e non modifica raster o regioni',()=>{
  const c=canvas(),regions=grid(),before=JSON.stringify(regions),pixels=c.toDataURL(),r=recoverStructuralFields(c,[],regions,[]);
  expect(r.fields).toHaveLength(4);expect(r.diagnostics.summary).toMatchObject({uncoveredBefore:4,recovered:4,uncoveredAfter:0});
  expect(r.fields.every(f=>f.label==='Cella da verificare'&&f.status==='review'&&!f.maskOriginal)).toBe(true);expect(JSON.stringify(regions)).toBe(before);expect(c.toDataURL()).toBe(pixels);
 });
 it('un piccolo campo non copre una cella e non viene sovrascritto',()=>{
  const f=makeField({x:300,y:120,width:20,height:10},'Confermato');f.status='confirmed';const before=JSON.stringify(f),r=recoverStructuralFields(canvas(),[],grid(),[f]),e=r.diagnostics.evidence.find(e=>e.id==='b')!;
  expect(e.coveredBefore).toBe(false);expect(e.coverageBefore).toBeLessThan(.1);expect(e.reason).toBe('PARTIAL_FIELD_CONFLICT');expect(r.fields[0]).toBe(f);expect(JSON.stringify(f)).toBe(before);
 });
 it('misura l’unione senza doppi conteggi',()=>{
  const box={x:0,y:0,width:100,height:100},f=makeField({x:0,y:0,width:40,height:100});
  expect(structuralCoverageRatio(box,[f,{...f,id:'duplicate'}])).toBe(.4);expect(structuralCoverageRatio(box,[f,makeField({x:40,y:0,width:60,height:100})])).toBe(1);expect(structuralCoverageRatio(box,[{...f,status:'ignored'}])).toBe(0);
 });
 it('non dichiara vuoto l’inchiostro non letto',()=>{
  const c=canvas(),x=c.getContext('2d')!;x.fillStyle='black';x.fillRect(300,120,150,15);const r=recoverStructuralFields(c,[],grid(),[]),e=r.diagnostics.evidence.find(e=>e.id==='b')!;
  expect(e.plausible).toBe(true);expect(e.outcome).toBe('unresolved');expect(e.reason).toBe('UNPOSITIONED_OR_PRINTED_INK');expect(r.fields).toHaveLength(3);
 });
 it('conserva celle descrittive strette e recupera il lato risposta',()=>{
  const r=recoverStructuralFields(canvas(),[word('Consegna stampata',50,115,120)],[cell('caption',40,100,140,140),cell('response',180,100,360,140)],[]);
  expect(r.fields).toHaveLength(1);expect(r.diagnostics.evidence.find(e=>e.outcome==='recovered')?.id).toBe('response');
 });
 it('propone soltanto lo spazio libero sotto il testo stampato',()=>{
  const c=canvas(),regions=[cell('a',40,100,250,160),cell('b',290,100,250,160)],tokens=[word('Istruzione articolata',50,110,210)],x=c.getContext('2d')!;x.fillStyle='black';x.fillRect(50,110,210,20);
  const r=recoverStructuralFields(c,tokens,regions,[]),f=r.fields.find(f=>f.box.x<290)!;expect(f.box.y).toBeGreaterThan(130);expect(f.value).toBe('');expect(f.maskOriginal).toBe(false);expect(tokens[0].text).toBe('Istruzione articolata');
 });
 it('rispetta l’esclusione delle intestazioni',()=>{
  const regions=grid(),audit=new FieldInferenceAudit(600,800,regions,[]);audit.enter(regions[0]);audit.reject('COLUMN_HEADER_STATIC','filter');audit.leave();const r=recoverStructuralFields(canvas(),[],regions,[],audit.finish([]),audit);
  expect(r.diagnostics.evidence[0]).toMatchObject({plausible:false,reason:'COLUMN_HEADER_STATIC',outcome:'static'});expect(r.fields).toHaveLength(3);
 });
 it('mantiene statici giorni e fasce orarie',()=>{
  const r=recoverStructuralFields(canvas(),[word('Lunedì',50,110),word('8.00 - 9.00',50,180)],grid(),[]);expect(r.fields.filter(f=>f.box.x<280)).toHaveLength(0);
 });
 it('un riquadro o una riga isolati non bastano',()=>{
  const c=canvas(),x=c.getContext('2d')!;x.strokeStyle='black';x.beginPath();x.moveTo(40,400);x.lineTo(500,400);x.stroke();const r=recoverStructuralFields(c,[],[cell('frame',40,100,480,100)],[]);expect(r.fields).toHaveLength(0);expect(r.diagnostics.summary.uncoveredBefore).toBe(0);
 });
 it('recupera righe parallele misurate',()=>{
  const c=canvas(),x=c.getContext('2d')!;x.strokeStyle='black';for(const y of [400,435]){x.beginPath();x.moveTo(40,y);x.lineTo(500,y);x.stroke();}const r=recoverStructuralFields(c,[],[],[]);expect(r.fields.filter(f=>f.origin==='line')).toHaveLength(2);expect(r.diagnostics.summary.lines).toBe(2);
 });
 it('recupera piccole caselle solo con una scelta esplicita e conserva la spunta',()=>{
  const c=canvas(),x=c.getContext('2d')!,regions=[cell('c1',180,100,12,12),cell('c2',180,140,12,12)].map(r=>({...r,kind:'checkbox' as const}));x.strokeStyle='black';regions.forEach(r=>x.strokeRect(r.box.x,r.box.y,12,12));x.fillStyle='black';x.fillRect(184,104,4,4);
  const r=recoverStructuralFields(c,[word('Sì',40,100),word('No',40,140)],regions,[]);expect(r.fields).toHaveLength(2);expect(r.fields.map(f=>f.value)).toEqual([true,false]);const f=pageCandidates({fields:r.fields,width:600,height:800,pageNumber:1} as any)[0];expect(f.detectionSource).toBe('PEI_STRUCTURAL_RECOVERY');expect(f.semanticKey).toBeNull();
 });
 it('non promuove piccoli quadrati dentro titoli o riferimenti normativi',()=>{
  const regions=[cell('c1',180,100,12,12),cell('c2',180,140,12,12)].map(r=>({...r,kind:'checkbox' as const}));const r=recoverStructuralFields(canvas(),[word('Variazione del GLO',40,100),word('Legge 328/2000',40,140)],regions,[]);expect(r.fields).toHaveLength(0);expect(r.diagnostics.summary.checkboxes).toBe(0);
 });
 it('è idempotente e non ripropone campi ignorati',()=>{
  const c=canvas(),regions=grid(),first=recoverStructuralFields(c,[],regions,[]),again=recoverStructuralFields(c,[],regions,first.fields);expect(again.fields).toHaveLength(4);expect(again.diagnostics.summary.recovered).toBe(0);
  const ignored={...first.fields[0],status:'ignored' as const},r=recoverStructuralFields(c,[],regions,[ignored]);expect(r.fields[0]).toBe(ignored);expect(r.diagnostics.evidence[0].reason).toBe('PARTIAL_FIELD_CONFLICT');
 });
 it('opera nel nucleo condiviso con zero parole e traccia le proposte',async()=>{
  const c=canvas(),x=c.getContext('2d')!;x.strokeStyle='black';grid().forEach(r=>x.strokeRect(r.box.x,r.box.y,r.box.width,r.box.height));const opts={profile:'pei' as const,language:'ita' as const,forceOcr:true,contrast:false,rotation:0 as const,dpi:200,maxPages:1,segmentation:'auto' as const,customOcrRunner:async()=>({text:'',tokens:[]})},reader=new LocalRecognizer(opts);
  try{const p=await analyzeRasterPage({canvas:c,nativeTokens:[],pageNumber:1,warnings:[]},opts,reader,true);expect(p.structuralCoverage?.summary.recovered).toBe(4);expect(p.fields).toHaveLength(4);expect(p.fieldInferenceDiagnostics?.attempts.filter(a=>a.reason==='STRUCTURAL_RECOVERY_PROPOSED')).toHaveLength(4);expect(p.fieldInferenceDiagnostics?.summary.fields).toBe(p.fields.length);}finally{await reader.terminate();}
 });
});
