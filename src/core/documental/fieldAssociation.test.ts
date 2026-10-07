import {describe,it,expect} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {inferFields} from './engine/fields';
import {fieldTokens} from './engine';
import type {Region,Token} from './engine/types';
const cell=(id:string,x:number,y:number,width:number,height:number):Region=>({id,kind:'cell',box:{x,y,width,height},text:'',status:'review',checked:null});
const word=(text:string,x:number,y:number,width:number,lineId='row'):Token=>({id:text+x+y,text,box:{x,y,width,height:12},lineId,source:'ocr',confidence:95});
function infer(words:Token[],regions:Region[]){const c=createCanvas(800,1100),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1100);return inferFields(c as any,fieldTokens(words,regions),regions);}
describe('Associazioni dei riquadri e delle tabelle',()=>{
 it('recupera obiettivi OCR e riquadro con sola consegna esterna senza generare campi sul titolo',()=>{
  const words=[word('Oblettivi',55,105,55,'a'),word('ed',115,105,15,'a'),word('esiti',135,105,25,'a'),word('attesi',165,105,35,'a'),word('OBIETTIVI',35,245,80,'b')];
  const fields=infer(words,[cell('a',50,100,650,90),cell('b',50,260,650,100)]);
  expect(fields.filter(f=>f.label==='Obiettivi ed esiti attesi'&&f.type==='textarea')).toHaveLength(2);
  expect(fields.some(f=>f.label==='OBIETTIVI')).toBe(false);expect(fields[1].box.y).toBeGreaterThan(275);
 });
 it('associa la revisione alla cella descrittiva e lascia la data separata',()=>{
  const words=[word('Specificare',55,205,65,'a'),word('|',125,205,3,'a'),word('punti',135,205,30,'a'),word('oggetto di eventuale',55,225,130,'b'),word('revisione',55,245,60,'c'),word('Data:',220,180,35,'date')];
  const fields=infer(words,[cell('left',50,200,150,80),cell('body',200,200,500,80)]);
  const revision=fields.find(f=>f.label==='Punti oggetto di revisione')!;
  expect(revision.type).toBe('textarea');expect(revision.box.x).toBeGreaterThan(200);expect(fields.some(f=>f.type==='date'&&f.box.height>40)).toBe(false);
 });
 it('applica le intestazioni a due righe e non rende compilabili i ruoli prestampati',()=>{
  const regions=[cell('header1',50,100,100,35),cell('header2',150,100,300,35),cell('row11',50,135,100,30),cell('row12',150,135,300,30),cell('row21',50,165,100,30),cell('row22',150,165,300,30),cell('name',50,250,300,30),cell('role',350,250,350,30)];
  const words=[word('Data',55,105,35,'a'),word('Nome e Cognome',155,105,120,'a'),word('3. Docente di sezione',355,255,180,'b')];
  const fields=infer(words,regions);
  expect(fields.filter(f=>f.label==='Data'&&f.type==='date')).toHaveLength(2);expect(fields.filter(f=>f.label==='Nome e Cognome')).toHaveLength(2);
  expect(fields.filter(f=>f.label==='Nome e Cognome — Docente di sezione')).toHaveLength(1);
  expect(fields.some(f=>f.box.x>=350&&f.box.y>=250)).toBe(false);
 });
 it('riconosce scelte Va definita e Va omessa senza inglobarle in un campo Sezione',()=>{
  const words=[word('Sezione',50,100,60),word('4A/5A',115,100,45),word('[0]',165,100,12),word('Va',185,100,15),word('definita',205,100,45),word('0]',270,100,12),word('Va',290,100,15),word('omessa',310,100,45)];
  const fields=infer(words,[]);
  expect(fields.filter(f=>f.type==='checkbox')).toHaveLength(2);
  expect(fields.some(f=>f.label==='Sezione')).toBe(false);
  expect(fields.every(f=>f.status==='review')).toBe(true);
 });
});
