import {describe,it,expect,vi} from 'vitest';
import {repairOcrSegmentation,recoverCoarseOcrTokens,recoverMissingOcrTokens,comparableReading,compareReadings,planOcrRetries,readingKey,type RetryPlanRegion} from './engine/ocrAlignment';
import {readIndependent} from './engine/dualReading';
import {fieldTokens} from './engine';
import type {Token,Region} from './engine/types';
import type {RecognizerB} from './vendor/motore-ocr-ai/src/core/ocr/recognizerB';
const word=(id:string,text:string,x=50,y=50,width=100,height=20,confidence=95):Token=>({id,text,box:{x,y,width,height},lineId:'line',source:'ocr',confidence});
const canvas=()=>Object.assign(document.createElement('canvas'),{width:800,height:1100});
const toB=(t:Token)=>({...t,provenance:'ocr' as const});
const reader=(full:Token[],local:Token[]=[]):RecognizerB=>({id:'recorded-test',recognize:vi.fn(async()=>({id:'recorded-test',tokens:full.map(toB),text:full.map(t=>t.text).join(' '),confidence:85,score:85,warnings:[]})),recognizeRegions:vi.fn(async()=>local.map(toB))});

describe('Fase 5: segmentazione e confronto OCR per PEI',()=>{
 it('la pipeline introduce testo prima assente solo dopo la conferma primaria locale',async()=>{
  const b=[word('b','Anna',200,50,100)],local=vi.fn(async(_regions:RetryPlanRegion[])=>[word('ar','Anna',200,50,100)]),r=await readIndependent(canvas(),1,{tokens:[],text:''},reader(b),undefined,true,local);
  expect(r.tokens.map(t=>t.text)).toEqual(['Anna']);expect(r.diagnostics.alignment?.missing).toHaveLength(1);expect(r.diagnostics.rawTokens).toEqual([]);expect(local).toHaveBeenCalledTimes(1);
 });
 it('i tentativi non eseguiti per B indisponibile sono distinti da quelli pianificati',async()=>{
  const local=vi.fn(async(_regions:RetryPlanRegion[])=>[]),r=await readIndependent(canvas(),1,{tokens:[word('a','Testo',50,50,100,20,20)],text:'Testo'},reader([]),undefined,true,local);expect(local).not.toHaveBeenCalled();expect(r.diagnostics.alignment?.retry).toMatchObject({primaryExecuted:false,secondaryExecuted:false});
 });
 it('recupera testo mancante soltanto con parole realmente lette da entrambi i motori',()=>{
  const a=[word('a','Nome',40,50,100)],local=[word('ar','Anna',200,50,100)],b=[word('b','Anna',201,50,100)],regions=[{x:190,y:45,width:130,height:30}],r=recoverMissingOcrTokens(a,local,b,regions,800,1100);
  expect(r.tokens.map(t=>t.text)).toEqual(['Nome','Anna']);expect(r.tokens[1].box).toEqual(local[0].box);expect(r.tokens[1].recovery?.sourceTokenIds).toEqual(['ar','b']);expect(recoverMissingOcrTokens(r.tokens,local,b,regions,800,1100).decisions).toHaveLength(0);
 });
 it('testo visto solo da B o fuori dal ritentativo non entra nel documento',()=>{
  const b=[word('b','Anna',200,50,100)],regions=[{x:190,y:45,width:130,height:30}];expect(recoverMissingOcrTokens([],[],b,regions,800,1100).tokens).toHaveLength(0);expect(recoverMissingOcrTokens([],[word('ar','Anna',200,50,100)],b,[],800,1100).tokens).toHaveLength(0);
 });
 it('un numero nuovo richiede una rilettura primaria locale forte',()=>{
  const b=[word('b','30',200,50,100)],regions=[{x:190,y:45,width:130,height:30}];expect(recoverMissingOcrTokens([],[word('ar','30',200,50,100,20,70)],b,regions,800,1100).tokens).toHaveLength(0);expect(recoverMissingOcrTokens([],[word('ar','30',200,50,100,20,96)],b,regions,800,1100).tokens).toHaveLength(1);
 });
 it('riserva spazio al testo mancante anche in presenza di molte anomalie geometriche',()=>{
  const a=Array.from({length:10},(_,i)=>word('a'+i,'li',40,30+i*90,150,70,20)),b=[word('b','Anna',400,300,120)],p=planOcrRetries(a,b,800,1100);expect(p.regions.some(r=>r.reason==='missing-primary-text')).toBe(true);expect(p.regions.length).toBeLessThanOrEqual(6);expect(p.areaRatio).toBeLessThanOrEqual(.16);
 });
 it('recupera un token deformato solo se la rilettura primaria e B concordano parola per parola',()=>{
  const a=[word('a','li',40,40,300,100,20)],local=[word('ar1','Nome',50,50,90),word('ar2','Cognome',150,50,130)],b=local.map(t=>({...t,id:'b'+t.id})),before=JSON.stringify({a,local,b}),r=recoverCoarseOcrTokens(a,local,b,800,1100);
  expect(r.tokens.map(t=>t.text)).toEqual(['Nome','Cognome']);expect(r.tokens[0].segmentation?.rawText).toBe('li');expect(r.tokens.map(t=>t.box)).toEqual(local.map(t=>t.box));expect(r.decisions[0].outcome).toBe('recovered');expect(JSON.stringify({a,local,b})).toBe(before);
 });
 it('un recupero incompleto o poco affidabile conserva integralmente il token originale',()=>{
  const a=[word('a','li',40,40,300,100,20)],local=[word('ar1','Nome',50,50,90),word('ar2','Cognome',150,50,130)],b=[{...local[0],id:'b'}];expect(recoverCoarseOcrTokens(a,local,b,800,1100).tokens).toEqual(a);
  expect(recoverCoarseOcrTokens(a,[{...local[0],confidence:40}],b,800,1100).tokens).toEqual(a);
  expect(recoverCoarseOcrTokens(a,[local[0]],local.map(t=>({...t,id:'b'+t.id})),800,1100).tokens).toEqual(a);
 });
 it('non riscrive token forti o non deformati neppure con doppia lettura locale diversa',()=>{
  const local=[word('ar','130',50,50,80)],b=[{...local[0],id:'b'}];for(const a of [[word('a','125',40,40,300,100,98)],[word('a','125',50,50,80,20,20)]])expect(recoverCoarseOcrTokens(a,local,b,800,1100).tokens).toEqual(a);
 });
 it('il percorso operativo usa la rilettura primaria solo sulle anomalie selezionate',async()=>{
  const a=[word('a','li',40,40,300,100,20),word('other','Testo',450,200)],b=[word('b','Nome',50,50,90),word('b-other','Testo',450,200)],local=vi.fn(async(_regions:RetryPlanRegion[])=>[word('ar','Nome',50,50,90)]),r=await readIndependent(canvas(),1,{tokens:a,text:'li Testo'},reader(b),undefined,true,local);
  expect(local).toHaveBeenCalledTimes(1);expect(local.mock.calls[0][0][0].tokenIds).toEqual(['a']);expect(r.tokens[0].text).toBe('Nome');expect(r.diagnostics.primaryRegionalTokens).toHaveLength(1);expect(r.diagnostics.rawTokens).toEqual(a);
 });
 it('separa una riga aggregata soltanto con parole reali e testo completo concorde',()=>{
  const a=[word('a','Anna Verdi',40,40,300,60)],b=[word('b1','ANNA',50,50,80),word('b2','VERDI',150,50,90)],before=JSON.stringify({a,b}),r=repairOcrSegmentation(a,b,[],800,1100);
  expect(r.tokens.map(t=>t.text)).toEqual(['Anna','Verdi']);expect(r.tokens.map(t=>t.box)).toEqual(b.map(t=>t.box));expect(r.tokens[0].segmentation?.rawBox).toEqual(a[0].box);expect(r.decisions[0].outcome).toBe('split');expect(JSON.stringify({a,b})).toBe(before);
 });
 it('conserva anche accenti, numeri e punteggiatura nella separazione',()=>{
  const a=[word('a','È Anna, 24/04/2026',40,40,500,50)],b=[word('b1','È',50,50,15),word('b2','ANNA,',80,50,100),word('b3','24/04/2026',200,50,120)],r=repairOcrSegmentation(a,b,[],800,1100);
  expect(readingKey(r.tokens.map(t=>t.text).join(' '))).toBe(readingKey(a[0].text));expect(r.tokens.at(-1)?.text).toBe('24/04/2026');
 });
 it('non perde una parola mancante nella seconda lettura e non interpreta valori diversi',()=>{
  for(const b of [[word('b','Anna',50,50)],[word('b','Anna Neri',50,50,200)]]){const a=[word('a','Anna Verdi',40,40,300,60)];expect(repairOcrSegmentation(a,b,[],800,1100).tokens).toEqual(a);}
 });
 it('non sdoppia osservazioni sovrapposte e non occupa un altro token primario',()=>{
  const a=[word('a','Anna Verdi',40,40,300,60)],b=[word('b1','Anna',50,50,100),word('b2','Verdi',100,50,100)];expect(repairOcrSegmentation(a,b,[],800,1100).decisions).toHaveLength(0);
  b[1].box.x=170;expect(repairOcrSegmentation([...a,word('other','30',175,50,90)],b,[],800,1100).decisions).toHaveLength(0);
 });
 it('un singolo rettangolo ridotto richiede corroborazione regionale',()=>{
  const a=[word('a','Firma',40,40,300,100)],b=[word('b','Firma',50,50,70)],local=[word('r','Firma',51,50,70)];
  expect(repairOcrSegmentation(a,b,[],800,1100).tokens).toEqual(a);const r=repairOcrSegmentation(a,b,local,800,1100);expect(r.tokens[0].box).toEqual(b[0].box);expect(r.tokens[0].id).toBe('a');expect(r.decisions[0].outcome).toBe('reboxed');
 });
 it('non modifica geometrie native PDF e rifiuta evidenze fuori pagina',()=>{
  const a=[{...word('a','Anna Verdi',40,40,300,60),source:'pdf' as const}],b=[word('b1','Anna',50,50),word('b2','Verdi',200,50)];expect(repairOcrSegmentation(a,b,[],800,1100).tokens).toEqual(a);
  expect(repairOcrSegmentation([{...a[0],source:'ocr'}],[...b.slice(0,1),word('outside','Verdi',780,50)],[],800,1100).decisions).toHaveLength(0);
 });
 it('confronta una frase con le parole che la compongono senza falsi disaccordi',()=>{
  const a=[word('a','Nome e Cognome',40,50,250,20,40)],b=[word('b1','Nome',45,50,70),word('b2','e',125,50,15),word('b3','Cognome',155,50,120)];
  expect(comparableReading(a[0],b)?.text).toBe('Nome e Cognome');expect(compareReadings(a,b)).toMatchObject({agreements:1,disagreements:0});expect(planOcrRetries(a,b,800,1100).regions).toHaveLength(0);
 });
 it('distingue un token B di riga da una lettura concorrente della singola parola',()=>{
  const a=[word('a','Nome',40,50,70)],b=[word('b','Nome e Cognome',40,50,300)];expect(comparableReading(a[0],b)).toBeUndefined();expect(compareReadings(a,b)).toMatchObject({disagreements:0,segmentationMismatches:1});
 });
 it('non usa parole adiacenti per sostituire un valore debole',async()=>{
  const a=[word('a','125',50,50,50,20,20)],b=[word('b','130',105,50,50)];const r=await readIndependent(canvas(),1,{tokens:a,text:'125'},reader(b,b),undefined,true);expect(r.tokens).toEqual(a);expect(r.diagnostics.changed).toBe(0);
 });
 it('i valori forti restano primari quando B cambia una cifra',async()=>{
  const a=[word('a','125',50,50,80,20,98)],b=[word('b','130',50,50,80)];const r=await readIndependent(canvas(),1,{tokens:a,text:'125'},reader(b,b),undefined,true);expect(r.tokens[0].text).toBe('125');expect(r.diagnostics.rawTokens).toEqual(a);
 });
 it('anche un numero debole richiede conferma della rilettura primaria prima della correzione',async()=>{
  const a=[word('a','125',50,50,80,20,20)],b=[word('b','130',50,50,80)],r=await readIndependent(canvas(),1,{tokens:a,text:'125'},reader(b,b),undefined,true);
  expect(r.tokens[0].text).toBe('125');expect(r.diagnostics.decisions[0].reason).toBe('CRITICAL_VALUE_NEEDS_PRIMARY_LOCAL_AGREEMENT');
 });
 it('prioritizza anomalie geometriche anche dopo molte parole precedenti',()=>{
  const a=Array.from({length:20},(_,i)=>word('a'+i,'Lettura',50,30+i*30,100,20,55)),b=a.map(t=>({...t,id:'b'+t.id,text:'Diversa'}));a.push(word('last','Errore',400,800,300,100,20));
  const p=planOcrRetries(a,b,800,1100);expect(p.regions[0].tokenIds).toContain('last');expect(p.regions.length).toBeLessThanOrEqual(6);expect(p.areaRatio).toBeLessThanOrEqual(.16);expect(p.deferred).toBeGreaterThan(0);
 });
 it('salta parole concordi anche se poco confidenti e non ritenta segnaposti',()=>{
  const a=[word('a','Nome',50,50,100,20,20),word('line','______',50,100,300,20,0)],b=[word('b','Nome')],p=planOcrRetries(a,b,800,1100);expect(p.skippedAgreements).toBe(1);expect(p.regions).toHaveLength(0);
 });
 it('deduplica aree annidate conservando gli ID da diagnosticare',()=>{
  const a=[word('a','Errore',40,40,300,100,20),word('b','Testo',50,50,100,20,20)],p=planOcrRetries(a,[],800,1100);expect(p.regions).toHaveLength(1);expect(p.regions[0].tokenIds).toEqual(['a','b']);expect(p.deferred).toBe(0);
 });
 it('senza lettore B disponibile non rilancia regioni e conserva testo e token',async()=>{
  const a=[word('a','  Testo  ',50,50,100,20,20)],b=reader([]),r=await readIndependent(canvas(),1,{tokens:a,text:'  Testo\n'},b,undefined,true);expect(r.tokens).toEqual(a);expect(r.text).toBe('  Testo\n');expect(b.recognizeRegions).not.toHaveBeenCalled();
 });
 it('un errore regionale è diagnosticato e lascia disponibili le evidenze primarie',async()=>{
  const a=[word('a','Nome',50,50,100,20,98)],b=reader([word('b','Firma')]);b.recognizeRegions=vi.fn(async()=>{throw Error('region unavailable');});
  const r=await readIndependent(canvas(),1,{tokens:a,text:'Nome'},b,undefined,true);expect(r.tokens[0].text).toBe('Nome');expect(r.diagnostics.warnings.join()).toContain('RECOGNIZER_B_REGION_UNAVAILABLE');
 });
 it('l’annullamento resta un annullamento anche durante il ritentativo',async()=>{
  const c=new AbortController(),b=reader([word('b','Firma')]);b.recognizeRegions=vi.fn(async()=>{c.abort();return [];});await expect(readIndependent(canvas(),1,{tokens:[word('a','Nome')],text:'Nome'},b,c.signal,true)).rejects.toMatchObject({name:'AbortError'});
 });
 it('mantiene separati celle foglia e livelli verticali con lo stesso lineId OCR',()=>{
  const r=(id:string,x:number,y:number,width:number,height:number):Region=>({id,box:{x,y,width,height},kind:'cell',text:'',status:'review',checked:null});
  const regions=[r('parent',0,0,600,300),r('left',0,0,150,100),r('right',150,0,150,100)],a=[word('a','Nome',80,40,60),word('b','Firma',155,40,60),word('c','Altro',220,80,60)];
  expect(fieldTokens(a,regions).map(t=>t.text)).toEqual(['Nome','Firma','Altro']);
 });
});
