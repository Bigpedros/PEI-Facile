import {describe,it,expect} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {inferFields,isLabel} from './engine/fields';
import {fieldTokens} from './engine';
import {pageCandidates,pageTransform} from './bridge';
import {createTemplateSchemaFromCandidates} from '../templateSchemaService';
import {canonicalRasterPdf} from './bridge';
import {PDFDocument} from 'pdf-lib';
import type {PageResult,Token,Region} from './engine/types';
function fixture():PageResult{
 const c=createCanvas(1000,1400);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1000,1400);
 return {pageNumber:1,width:1000,height:1400,unit:'px',image:c.toDataURL('image/png'),text:'Nome: Mario Rossi',tokens:[],regions:[],fields:[{id:'observed',box:{x:200,y:100,width:300,height:30},label:'Nome',semanticKey:'nome',type:'text',value:'Mario Rossi',originalValue:'Mario Rossi',observedText:'Mario Rossi',status:'review',origin:'cell',confidence:.85,reason:'Valore osservato',options:[],required:false,fontSize:12,maskOriginal:true}],source:'pdf',transform:{sourceWidth:1000,sourceHeight:1400,scale:1,offsetX:0,offsetY:0,rotation:0},physicalSizeMm:{width:210,height:297},warnings:[],elapsedMs:0};
}
describe('Documental 020 integration regressions',()=>{
 it('retains an existing value, review status and unconfirmed PEI association through schema creation',()=>{
  const p=fixture(),fields=pageCandidates(p);
  const s=createTemplateSchemaFromCandidates('t','a.pdf','hash',[{pageNumber:1,widthPt:595.2756,heightPt:841.8898,fields}],fields);
  expect(s.fields[0].defaultValue).toBe('Mario Rossi');expect(s.fields[0].originalValue).toBe('Mario Rossi');expect(s.fields[0].semanticKey).toBeNull();expect(s.fields[0].calibrationStatus).toBe('PROPOSED');
 });
 it('preserves checkbox booleans and dropdown options as typed controls',()=>{
  const p=fixture();p.fields[0].type='checkbox';p.fields[0].value=true;p.fields[0].originalValue=true;
  let fields=pageCandidates(p);let s=createTemplateSchemaFromCandidates('t','a.pdf','hash',[{pageNumber:1,widthPt:595.2756,heightPt:841.8898,fields}],fields);
  expect(s.fields[0].inputType).toBe('checkbox');expect(s.fields[0].defaultValue).toBe(true);
  p.fields[0].type='select';p.fields[0].value='Uno';p.fields[0].options=['Uno','Due'];fields=pageCandidates(p);s=createTemplateSchemaFromCandidates('t','a.pdf','hash',[{pageNumber:1,widthPt:595.2756,heightPt:841.8898,fields}],fields);
  expect(s.fields[0].inputType).toBe('select');expect(s.fields[0].options).toEqual(['Uno','Due']);
 });
 it('maps pixels to PDF points without changing the relative position or inverting y',()=>{
  const p=fixture(),f=pageCandidates(p)[0];expect(f.xPt/(210/25.4*72)).toBeCloseTo(.2);expect(f.yPt/(297/25.4*72)).toBeCloseTo(100/1400);
  const t=pageTransform(p),x=531,y=729;const [a,, ,d,e,g]=t.affineMatrix;const [ia,,,,ie,ig]=t.inverseMatrix;
  expect((x*a+e)*ia+ie).toBeCloseTo(x);expect((y*d+g)*t.inverseMatrix[3]+ig).toBeCloseTo(y);
 });
 it('does not promote instructions or a lone unlabeled horizontal line into a field',()=>{
  expect(isLabel('Indicare nome e cognome del genitore')).toBe(false);
  const c=createCanvas(600,800),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,800);ctx.fillStyle='black';ctx.fillRect(50,200,400,2);
  expect(inferFields(c as any,[],[])).toEqual([]);
 });
 it('groups OCR label fragments without crossing adjacent table cells',()=>{
  const region:Region={id:'r1',kind:'cell',box:{x:10,y:10,width:100,height:30},text:'',status:'review',checked:null};
  const mk=(text:string,x:number):Token=>({id:text,text,box:{x,y:15,width:30,height:10},lineId:'l',confidence:90,source:'ocr'});
  const grouped=fieldTokens([mk('Nome',15),mk('alunno',50),mk('Mario',120)],[region]);expect(grouped.map(t=>t.text)).toEqual(['Nome alunno','Mario']);
 });
 it('keeps native label/value spans separate and never merges native with OCR',()=>{
  const mk=(text:string,x:number,source:'pdf'|'ocr'):Token=>({id:text,text,box:{x,y:15,width:30,height:10},lineId:'l',confidence:90,source});
  expect(fieldTokens([mk('Nome:',15,'pdf'),mk('Mario',50,'pdf'),mk('Rossi',85,'ocr')],[]).map(t=>t.text)).toEqual(['Nome:','Mario','Rossi']);
 });
 it('rejects institution headers and fragmented prompt continuations as values',()=>{
  expect(isLabel('COMUNE DI ROMA')).toBe(false);
  const c=createCanvas(600,800);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,800);
  const mk=(text:string,x:number,width:number):Token=>({id:text,text,box:{x,y:200,width,height:12},lineId:'l',confidence:null,source:'pdf'});
  expect(inferFields(c as any,[mk('data',40,24),mk('di nascita',75,60)],[])).toEqual([]);
 });
 it('recovers separate writing areas from a native span with two underlined prompts',()=>{
  const c=createCanvas(600,800),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,800);
  const t:Token={id:'prompts',text:'Sezione ________ Plesso o sede________',box:{x:40,y:100,width:350,height:12},lineId:'l',confidence:null,source:'pdf'};
  const fields=inferFields(c as any,[t],[]);expect(fields.map(f=>f.label)).toEqual(['Sezione','Plesso o sede']);expect(fields.every(f=>f.value===''&&f.status==='review')).toBe(true);expect(fields[0].box.x+fields[0].box.width).toBeLessThan(fields[1].box.x);
 });
 it('preserves an OCR response after a bare PEI prompt using the response word boxes',()=>{
  const c=createCanvas(600,800),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,800);
  const mk=(text:string,x:number,width:number):Token=>({id:text,text,box:{x,y:100,width,height:12},lineId:'l',confidence:90,source:'ocr'});
  const name=mk('Mario',120,35);name.box.y=98;
  const grouped=fieldTokens([mk('BAMBINO/A',40,70),name,mk('Rossi',160,35)],[]);
  const f=inferFields(c as any,grouped,[]).find(f=>f.label==='BAMBINO/A')!;expect(f.originalValue).toBe('Mario Rossi');expect(f.value).toBe(f.originalValue);expect(f.box.x).toBe(120);expect(f.status).toBe('review');
 });
 it('rejects invalid raster dimensions instead of accepting a byte-producing PDF',async()=>{
  const p=fixture();p.width=999;
  await expect(canonicalRasterPdf({pages:[p]} as any)).rejects.toThrow('Dimensioni raster incoerenti');
 });
 it('exports the entire source raster at the declared A4 size',async()=>{
  const p=fixture();const bytes=await canonicalRasterPdf({pages:[p,p]} as any);const pdf=await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(2);expect(pdf.getPages()[0].getSize().width).toBeCloseTo(210/25.4*72);expect(pdf.getPages()[0].getSize().height).toBeCloseTo(297/25.4*72);
 });
});
