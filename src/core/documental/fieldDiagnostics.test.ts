import {describe,it,expect} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {inferFields} from './engine/fields';
import {FieldInferenceAudit} from './engine/fieldDiagnostics';
import {analyzeRasterPage} from './engine';
import {LocalRecognizer} from './engine/ocr';
import type {Token,Region,FormField} from './engine/types';

function canvas(){const c=createCanvas(600,800);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,800);return c as unknown as HTMLCanvasElement;}
const token=(text:string,x=30,y=100,width=80):Token=>({id:text,text,box:{x,y,width,height:16},confidence:95,source:'ocr',lineId:'line'});
const region=(id:string,x:number,y:number,width:number,height:number,kind:Region['kind']='cell'):Region=>({id,box:{x,y,width,height},kind,text:'',status:'review',checked:null});
const withoutRandomIds=(fields:FormField[])=>fields.map(({id,...f})=>f);
function inspect(c:HTMLCanvasElement,tokens:Token[],regions:Region[]){
 const input=JSON.stringify({tokens,regions});const plain=inferFields(c,tokens,regions);
 const audit=new FieldInferenceAudit(c.width,c.height,regions,tokens);const traced=inferFields(c,tokens,regions,audit);
 expect(withoutRandomIds(traced)).toEqual(withoutRandomIds(plain));expect(JSON.stringify({tokens,regions})).toBe(input);
 const report=audit.finish(traced);expect(report.regions).toHaveLength(regions.length);
 expect(report.summary.proposedRegions+report.summary.excludedRegions).toBe(regions.length);
 return {fields:traced,report};
}
describe('Fase 1: diagnostica passiva del rilevamento campi',()=>{
 it('distingue cella proposta, cella senza etichetta e casella sotto soglia senza cambiare i campi',()=>{
  const c=canvas();const regions=[region('response',150,100,250,45),region('unlabelled',300,400,150,40),region('tiny',400,600,6,6,'checkbox')];
  const r=inspect(c,[token('Nome',30,110)],regions);
  expect(r.report.regions.find(r=>r.regionId==='response')?.reason).toBe('FIELD_PROPOSED');
  expect(r.report.regions.find(r=>r.regionId==='unlabelled')?.reason).toBe('EMPTY_CELL_WITHOUT_RECOGNIZED_LABEL');
  expect(r.report.regions.find(r=>r.regionId==='tiny')?.reason).toBe('CHECKBOX_BELOW_TEXT_SCALE');
 });
 it('esplicita il filtro delle istruzioni stampate',()=>{
  const r=inspect(canvas(),[token('Specificare il tipo',50,105,180)],[region('instructions',40,100,300,60)]);
  expect(r.report.regions[0].reason).toBe('PRINTED_INSTRUCTION_IN_REGION');expect(r.fields).toEqual([]);
 });
 it('distingue inchiostro non letto da una cella vuota',()=>{
  const c=canvas();c.getContext('2d')!.fillStyle='black';c.getContext('2d')!.fillRect(60,115,80,10);
  const r=inspect(c,[],[region('ink',40,100,150,40)]);
  expect(r.report.regions[0].reason).toBe('INK_WITHOUT_POSITIONED_TEXT');expect(r.report.regions[0].details.inkRatio).toBeGreaterThan(.015);
 });
 it('registra contenuto non associabile invece di dichiarare che manca la geometria',()=>{
  const r=inspect(canvas(),[token('Testo presente',60,110,100)],[region('content',40,100,200,50)]);
  expect(r.report.regions[0].positionedWords).toBe(1);expect(r.report.regions[0].reason).toBe('CONTENT_WITHOUT_RECOGNIZED_FIELD_RELATION');
 });
 it('traccia duplicati e mantiene distinta la sovrapposizione dalla decisione sulla regione',()=>{
  const r=inspect(canvas(),[token('Nome',30,110)],[region('one',150,100,250,45),region('two',150,100,250,45)]);
  expect(r.report.attempts.some(a=>a.reason==='DUPLICATE_FIELD'&&a.duplicateOf)).toBe(true);
  const excluded=r.report.regions.find(r=>r.reason==='DUPLICATE_FIELD')!;
  expect(excluded.outcome).toBe('excluded');expect(excluded.overlappingFieldIds.length).toBeGreaterThan(0);
 });
 it('segnala token anomali senza correggerli',()=>{
  const c=canvas(),tokens=[token('i',30,110,490)];const r=inspect(c,tokens,[]);
  expect(r.report.ocrObservations.oversizedTokenIds).toEqual(['i']);expect(tokens[0].box.width).toBe(490);
 });
 it('allega il rapporto alla pipeline attiva anche quando non produce campi',async()=>{
  const c=canvas();const options={profile:'pei' as const,language:'ita' as const,forceOcr:true,contrast:true,rotation:0 as const,dpi:200,maxPages:1,segmentation:'auto' as const,customOcrRunner:async()=>({text:'Testo',tokens:[token('Testo')]})};
  const recognizer=new LocalRecognizer(options);
  try{const p=await analyzeRasterPage({canvas:c,nativeTokens:[],pageNumber:1,warnings:[]},options,recognizer,true);
   expect(p.fieldInferenceDiagnostics?.schema).toBe('PEI_FIELD_INFERENCE_AUDIT_V1');expect(p.fieldInferenceDiagnostics?.summary.fields).toBe(p.fields.length);
  }finally{await recognizer.terminate();}
 });
});
