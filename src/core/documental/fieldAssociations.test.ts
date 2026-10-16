import {describe,it,expect} from 'vitest';
import {createCanvas} from '@napi-rs/canvas';
import {associateMeasuredFields,refreshAssociatedCoverage} from './engine/fieldAssociations';
import {makeField} from './engine/fields';
import {pageCandidates} from './bridge';
import type {Region,Token,FormField} from './engine/types';

function canvas(){const c=createCanvas(800,1100),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,1100);return c as unknown as HTMLCanvasElement;}
const cell=(id:string,x:number,y:number,w=240,h=50):Region=>({id,box:{x,y,width:w,height:h},kind:'cell',text:'',status:'review',checked:null});
const word=(text:string,x:number,y:number,w=150):Token=>({id:text+x+y,text,box:{x,y,width:w,height:18},confidence:95,source:'ocr',lineId:String(y)});
const run=(tokens:Token[],regions:Region[],fields:FormField[]=[],c=canvas())=>associateMeasuredFields(c,tokens,regions,fields);

describe('Fase 4: associazioni su struttura misurata',()=>{
 it('usa B soltanto come intestazioni corroborate, conservando i valori primari',()=>{
  const regions=[cell('nh',40,100),cell('sh',280,100),cell('n',40,150),cell('s',280,150)],primary=[word('Anna Verdi',50,160)],secondary=[word('Nome e Cognome',50,110),word('Firma',300,110),word('Lettura B diversa',50,160)];
  const before=JSON.stringify({regions,primary,secondary}),r=associateMeasuredFields(canvas(),primary,regions,[],undefined,undefined,secondary);
  expect(r.diagnostics.summary.secondaryHeaders).toBe(2);expect(r.fields.map(f=>f.value)).toEqual(['Anna Verdi','']);expect(r.diagnostics.decisions.find(d=>d.id==='n')).toMatchObject({anchorSource:'secondary',sourceTokenIds:[secondary[0].id]});expect(JSON.stringify({regions,primary,secondary})).toBe(before);
 });
 it('una intestazione B isolata o in una tabella diversa non basta',()=>{
  const primary:Token[]=[],regions=[cell('nh',40,100),cell('n',40,150),cell('sh',400,500),cell('s',400,550)],secondary=[word('Nome',50,110),word('Firma',410,510)];
  const r=associateMeasuredFields(canvas(),primary,regions,[],undefined,undefined,secondary);expect(r.diagnostics.summary.secondaryHeaders).toBe(0);expect(r.fields).toHaveLength(0);
 });
 it('se i lettori danno intestazioni diverse lascia esplicita l’ambiguità',()=>{
  const r=associateMeasuredFields(canvas(),[word('Nome',50,110)],[cell('h',40,100),cell('a',40,150)],[],undefined,undefined,[word('Firma',50,110)]);
  expect(r.fields).toHaveLength(0);expect(r.diagnostics.decisions.find(d=>d.id==='a')?.reason).toBe('READER_HEADER_DISAGREEMENT');
 });
 it('accenti diversi nei giorni non costituiscono disaccordo semantico',()=>{
  const r=associateMeasuredFields(canvas(),[word('Lunedì',50,110)],[cell('h',40,100),cell('a',40,150)],[],undefined,undefined,[word('Lunedi',50,110)]);
  expect(r.fields).toHaveLength(1);expect(r.diagnostics.summary.ambiguous).toBe(0);
 });
 it('associa una proposta senza estenderne il rettangolo o aggiungervi parole esterne',()=>{
  const old=makeField({x:60,y:165,width:100,height:25},'Cella da verificare','cell');old.reason='Recupero strutturale PEI: prova';
  const r=run([word('Nome',50,110),word('Parola fuori',180,160,90)],[cell('h',40,100),cell('a',40,150)],[old]);
  expect(r.fields[0]).toMatchObject({id:old.id,box:old.box,value:old.value,originalValue:old.originalValue,observedText:old.observedText,maskOriginal:old.maskOriginal});expect(r.diagnostics.summary.enriched).toBe(1);
 });
 it('propaga le intestazioni lungo tutte le righe collegate e conserva i nomi compilati',()=>{
  const regions=[cell('name-head',40,100),cell('sign-head',280,100),...Array.from({length:6},(_,i)=>[cell('n'+i,40,150+i*50),cell('s'+i,280,150+i*50)]).flat()];
  const tokens=[word('Nome e Cognome',50,110),word('Firma',300,110),word('1.',48,160,20),word('Mario Rossi',80,160,150),word('Luca Bianchi',60,410)];
  const before=JSON.stringify({tokens,regions}),out=run(tokens,regions);
  expect(out.fields.filter(f=>/^Firma/.test(f.label))).toHaveLength(6);expect(out.fields.find(f=>f.value==='Mario Rossi')?.box.x).toBeGreaterThan(68);
  expect(out.fields.some(f=>f.value==='Luca Bianchi')).toBe(true);expect(JSON.stringify({tokens,regions})).toBe(before);
  expect(out.diagnostics.decisions.find(d=>d.id==='s5')?.sourceRegionIds).toContain('sign-head');
 });
 it('non eredita un’intestazione da una seconda tabella separata da un vuoto',()=>{
  const r=run([word('Firma',50,110)],[cell('head',40,100),cell('one',40,150),cell('unrelated',40,450)]);
  expect(r.fields).toHaveLength(1);expect(r.diagnostics.decisions.find(d=>d.id==='unrelated')?.outcome).toBe('unmatched');
 });
 it('segue il resto della griglia quando manca la regione di una cella intermedia',()=>{
  const regions=[cell('date-head',40,100),cell('name-head',280,100),cell('name-row1',280,150),cell('date-row2',40,200),cell('name-row2',280,200)];
  const r=run([word('Data',50,110),word('Nome e Cognome',300,110),word('16/10/26',50,210)],regions);
  expect(r.fields.some(f=>f.label==='Data — riga 2'&&f.value==='2026-10-16')).toBe(true);
  expect(r.diagnostics.decisions.find(d=>d.id==='date-row2')?.sourceRegionIds).toContain('name-row1');
 });
 it('segue una etichetta unita verticalmente su più righe misurate',()=>{
  const r=run([word('Eventuali esigenze di trasporto',45,110,160)],[cell('merged',40,100,180,150),cell('r1',220,100,450),cell('r2',220,150,450),cell('r3',220,200,450)]);
  expect(r.fields).toHaveLength(3);expect(r.diagnostics.decisions.filter(d=>d.relation==='merged-row-label')).toHaveLength(3);
 });
 it('usa le intestazioni foglia sotto un’intestazione unita, senza confondere le colonne',()=>{
  const regions=[cell('group',40,50,480),cell('first',40,100),cell('last',280,100),cell('a',40,150),cell('b',280,150)];
  const r=run([word('Dati anagrafici',50,60),word('Nome',50,110),word('Cognome',300,110),word('Anna',50,160),word('Verdi',300,160)],regions);
  expect(r.fields.map(f=>f.label)).toEqual(['Nome — riga 1','Cognome — riga 1']);expect(r.fields.map(f=>f.value)).toEqual(['Anna','Verdi']);
 });
 it('se il titolo unito manca di intestazioni foglia lascia esplicita l’ambiguità',()=>{
  const r=run([word('Nome e Cognome',50,60)],[cell('head',40,50,480),cell('a',40,100),cell('b',280,100)]);
  expect(r.fields).toHaveLength(0);expect(r.diagnostics.decisions.filter(d=>d.reason==='MERGED_HEADER_WITHOUT_LEAF')).toHaveLength(2);
 });
 it('associa un riquadro ampio alla consegna esterna vicina, senza includerla nel valore',()=>{
  const tokens=[word('Aggiornamento delle condizioni di contesto',40,70,650),word('Risposta già compilata',60,130,400)],r=run(tokens,[cell('response',40,110,650,180)]);
  expect(r.fields).toHaveLength(1);expect(r.fields[0].value).toBe('Risposta già compilata');expect(r.fields[0].observedText).toBe('Risposta già compilata');expect(r.fields[0].box.y).toBeGreaterThan(100);
 });
 it('un titolo generico o una consegna distante non bastano',()=>{
  expect(run([word('9. Organizzazione del progetto',40,70,600)],[cell('response',40,110,650,150)]).fields).toHaveLength(0);
  expect(run([word('Specificare le esigenze',40,20,500)],[cell('response',40,250,650,150)]).fields).toHaveLength(0);
 });
 it('distingue l’intestazione DATA da una data non interpretabile senza perdere il testo',()=>{
  const r=run([word('Data',50,110),word('16/10/26',50,160),word('data incerta',50,210)],[cell('head',40,100),cell('a',40,150),cell('b',40,200)]);
  expect(r.fields[0]).toMatchObject({type:'date',value:'2026-10-16',observedText:'16/10/26'});expect(r.fields[1]).toMatchObject({type:'text',value:'data incerta',originalValue:'data incerta'});
 });
 it('associa la firma generica soltanto a una riga realmente misurata',()=>{
  const c=canvas(),x=c.getContext('2d')!;x.strokeStyle='black';x.beginPath();x.moveTo(200,250);x.lineTo(550,250);x.stroke();
  const tokens=[word('Firma del genitore',200,210,250)];expect(run(tokens,[],[],c).fields.some(f=>f.label==='Firma del genitore'&&f.origin==='line')).toBe(true);
  expect(run(tokens,[]).fields).toHaveLength(0);
 });
 it('raffina soltanto una proposta automatica generica e ne conserva ID e valore',()=>{
  const generic=makeField({x:285,y:155,width:220,height:35},'Cella da verificare','cell');generic.reason='Recupero strutturale PEI: prova';generic.value='Valore conservato';generic.originalValue='Valore conservato';generic.observedText='Valore conservato';
  const before=JSON.stringify(generic),r=run([word('Firma',300,110)],[cell('head',280,100),cell('body',280,150)],[generic]);
  expect(r.fields).toHaveLength(1);expect(r.fields[0].id).toBe(generic.id);expect(r.fields[0].label).toMatch(/^Firma/);expect(r.fields[0].value).toBe('Valore conservato');expect(JSON.stringify(generic)).toBe(before);expect(r.diagnostics.summary.enriched).toBe(1);
 });
 it('rispetta campi manuali, confermati, ignorati e nativi anche con sovrapposizione piccola',()=>{
  for(const patch of [{origin:'manual'},{status:'confirmed'},{status:'ignored'},{reason:'Widget AcroForm esplicito'}]){
   const f={...makeField({x:300,y:165,width:12,height:10},'Protetto','cell'),...patch} as FormField,before=JSON.stringify(f),r=run([word('Firma',300,110)],[cell('head',280,100),cell('body',280,150)],[f]);
   expect(r.fields).toEqual([f]);expect(JSON.stringify(f)).toBe(before);expect(r.diagnostics.summary.blocked).toBe(1);
  }
 });
 it('non sostituisce campi automatici già significativi e blocca intersezioni parziali',()=>{
  const f=makeField({x:300,y:165,width:15,height:10},'Etichetta esistente','cell'),r=run([word('Firma',300,110)],[cell('head',280,100),cell('body',280,150)],[f]);expect(r.fields).toEqual([f]);expect(r.diagnostics.decisions.find(d=>d.id==='body')?.reason).toBe('PARTIAL_FIELD_CONFLICT');
 });
 it('conserva una risposta che inizia con un verbo di istruzione senza eliminarne parole',()=>{
  const tokens=[word('Eventuali esigenze',45,110),word('Indicare come procedere domani',250,115,400)],r=run(tokens,[cell('label',40,100,180,100),cell('response',220,100,450,100)]);
  expect(r.fields).toHaveLength(0);expect(r.diagnostics.decisions.find(d=>d.id==='response')?.reason).toBe('PRINTED_OR_FILLED_INSTRUCTION');expect(tokens[1].text).toBe('Indicare come procedere domani');
 });
 it('non copre una consegna stampata interna con un nuovo campo esteso a tutta la cella',()=>{
  const tokens=[word('Risorse destinate agli interventi',45,110,150),word('Descrizione del servizio svolto dai collaboratori scolastici',250,110,400)],r=run(tokens,[cell('label',40,100,180,100),cell('response',220,100,450,100)]);
  expect(r.fields).toHaveLength(0);expect(r.diagnostics.decisions.find(d=>d.id==='response')?.reason).toBe('PRINTED_OR_FILLED_INSTRUCTION');
 });
 it('non assegna il nome del componente GLO alla semantica dell’alunno',()=>{
  const r=run([word('Nome e Cognome',50,110),word('Mario Rossi',50,160)],[cell('header',40,100),cell('body',40,150)]),f=pageCandidates({fields:r.fields,width:800,height:1100,pageNumber:1} as any)[0];
  expect(f.detectionSource).toBe('PEI_CONTEXT_ASSOCIATION');expect(f.semanticKey).toBeNull();expect(f.suggestedSemanticKey).toBeNull();expect(f.defaultValue).toBe('Mario Rossi');
 });
 it('un’intestazione certa non autorizza a dichiarare vuoto il contenuto non letto',()=>{
  const c=canvas(),x=c.getContext('2d')!;x.fillStyle='black';x.fillRect(60,165,150,10);const pixels=c.toDataURL(),r=run([word('Nome e Cognome',50,110)],[cell('head',40,100),cell('body',40,150)],[],c);
  expect(r.fields).toHaveLength(0);expect(r.diagnostics.decisions.find(d=>d.id==='body')?.reason).toBe('INK_WITHOUT_POSITIONED_TEXT');expect(c.toDataURL()).toBe(pixels);
 });
 it('combina giorni e fasce orarie senza rendere editabili gli assi della tabella',()=>{
  const regions=[cell('blank',40,100,160),cell('monday',200,100,300),cell('time',40,150,160),cell('answer',200,150,300)];
  const r=run([word('Lunedì',210,110),word('8.00 - 9.00',45,160,130),word('Pres. x',220,160)],regions);
  expect(r.fields).toHaveLength(1);expect(r.fields[0].label).toBe('Lunedì — 8.00 - 9.00');expect(r.fields[0].value).toBe('Pres. x');
 });
 it('è idempotente e aggiorna la copertura senza modificare il rapporto precedente',()=>{
  const regions=[cell('head',40,100),cell('body',40,150)],tokens=[word('Firma',50,110)],first=run(tokens,regions),second=run(tokens,regions,first.fields);expect(second.fields).toEqual(first.fields);expect(second.diagnostics.summary.proposed).toBe(0);
  const old={schema:'PEI_STRUCTURAL_COVERAGE_V1',unit:'px',evidence:[{id:'body',regionId:'body',kind:'cell',box:regions[1].box,responseBox:first.fields[0].box,plausible:true,reason:'NO_LABEL',context:[],coveredBefore:false,coveredAfter:false,coverageBefore:0,coverageAfter:0,outcome:'unresolved'}],summary:{measured:1,plausible:1,uncoveredBefore:1,recovered:0,uncoveredAfter:1,cells:1,checkboxes:0,lines:0}} as any;
  const next=refreshAssociatedCoverage(old,first.fields,first.diagnostics);expect(next?.summary.uncoveredAfter).toBe(0);expect(old.summary.uncoveredAfter).toBe(1);
 });
});
