import {describe,it,expect,vi} from 'vitest';
import {readIndependent} from './engine/dualReading';
import type {Token} from './engine/types';
import type {RecognizerB} from './vendor/motore-ocr-ai/src/core/ocr/recognizerB';
import type {OcrToken} from './vendor/motore-ocr-ai/src/contracts';
import {analyzeRasterPage} from './engine';
import {LocalRecognizer} from './engine/ocr';
const canvas=()=>{const c=document.createElement('canvas');c.width=600;c.height=800;return c;};
const a=(text:string,confidence=55):Token=>({id:'a',text,confidence,source:'ocr',lineId:'l1',box:{x:50,y:50,width:90,height:20}});
const b=(text:string):OcrToken=>({id:'b',text,confidence:85,provenance:'ocr',lineId:'b1',box:{x:52,y:50,width:88,height:20}});
const secondary=(word:OcrToken):RecognizerB=>({id:'ocrs-test',recognize:vi.fn(async()=>({id:'ocrs-test',tokens:[word],text:word.text,score:85,confidence:85,warnings:[]})),recognizeRegions:vi.fn(async()=>[{...word,id:'br'}])});
describe('Secondo lettore indipendente PEI',()=>{
 it('confronta due canali B e corregge una lettura debole mantenendo raw e coordinate A',async()=>{
  const primary={tokens:[a('Sez1one')],text:'Sez1one'},before=JSON.stringify(primary),reader=secondary(b('Sezione'));
  const r=await readIndependent(canvas(),1,primary,reader);
  expect(r.tokens[0].text).toBe('Sezione');expect(r.tokens[0].box).toEqual(primary.tokens[0].box);
  expect(r.tokens[0].originalText).toBe('Sez1one');expect(JSON.stringify(primary)).toBe(before);
  expect(r.diagnostics.rawText).toBe('Sez1one');expect(r.diagnostics.changed).toBe(1);expect(r.diagnostics.disagreements).toBe(1);
  expect(reader.recognizeRegions).toHaveBeenCalled();
 });
 it('mantiene testo forte e valori compilati se B propone una trasformazione distruttiva',async()=>{
  const primary={tokens:[a('Mario',97)],text:'Mario'};
  const r=await readIndependent(canvas(),1,primary,secondary(b('125')));
  expect(r.text).toBe('Mario');expect(r.diagnostics.changed).toBe(0);
 });
 it('conta il consenso senza applicare correzioni inutili',async()=>{
  const reader=secondary(b('Sezione'));
  const r=await readIndependent(canvas(),1,{tokens:[a('Sezione',95)],text:'Sezione'},reader);
  expect(r.diagnostics.agreements).toBe(1);expect(r.diagnostics.changed).toBe(0);expect(reader.recognizeRegions).not.toHaveBeenCalled();
 });
 it('B indisponibile conserva integralmente la lettura primaria e registra il motivo',async()=>{
  const reader:RecognizerB={id:'missing',recognize:async()=>{throw Error('asset mancante');}};
  const primary={tokens:[a('Nome')],text:'Nome'};
  const r=await readIndependent(canvas(),1,primary,reader);
  expect(r.tokens).toEqual(primary.tokens);expect(r.text).toBe(primary.text);expect(r.diagnostics.status).toBe('unavailable');expect(r.diagnostics.warnings[0]).toContain('asset mancante');
 });
 it('senza correzioni conserva ordine, righe e testo A anche con spaziatura originale',async()=>{
  const primary={tokens:[{...a('Sezione',95),lineId:'original-line'}],text:'  Sezione\n'};
  const r=await readIndependent(canvas(),1,primary,secondary(b('Sezione')));
  expect(r.tokens).toEqual(primary.tokens);expect(r.text).toBe(primary.text);
 });
 it('la disattivazione esplicita non esegue B e conserva A',async()=>{
  const reader=secondary(b('Diverso'));
  const options={profile:'pei' as const,language:'ita' as const,forceOcr:true,contrast:true,rotation:0 as const,dpi:200,maxPages:1,segmentation:'auto' as const,recognizerB:reader,independentReading:false};
  const recognizer=new LocalRecognizer(options);vi.spyOn(recognizer,'recognize').mockResolvedValue({tokens:[a('Nome')],text:'Nome'});
  try{const result=await analyzeRasterPage({canvas:canvas(),nativeTokens:[],pageNumber:1,warnings:[]},options,recognizer,true);
   expect(reader.recognize).not.toHaveBeenCalled();expect(result.text).toBe('Nome');expect(result.secondReader?.execution).toBe('disabled');
  }finally{await recognizer.terminate();}
 });
 it('rifiuta evidenze B fuori pagina',async()=>{
  const word=b('Sezione');word.box.x=1000;
  const r=await readIndependent(canvas(),1,{tokens:[a('Sez1one')],text:'Sez1one'},secondary(word));
  expect(r.diagnostics.secondaryTokens).toHaveLength(0);expect(r.diagnostics.changed).toBe(0);
 });
 it('propaga annullamento e non lo nasconde come indisponibilita',async()=>{
  const controller=new AbortController();const reader:RecognizerB={id:'cancel',recognize:async()=>{controller.abort();throw Error('cancel');}};
  await expect(readIndependent(canvas(),1,{tokens:[a('Nome')],text:'Nome'},reader,controller.signal)).rejects.toMatchObject({name:'AbortError'});
 });
 it('il percorso operativo passa il raster canonico a B prima di inferire i campi',async()=>{
  const c=canvas(),reader=secondary(b('Sezione'));
  const options={profile:'pei' as const,language:'ita' as const,forceOcr:true,contrast:true,rotation:0 as const,dpi:200,maxPages:1,segmentation:'auto' as const,recognizerB:reader};
  const recognizer=new LocalRecognizer(options);vi.spyOn(recognizer,'recognize').mockResolvedValue({tokens:[a('Sez1one')],text:'Sez1one'});
  try{const result=await analyzeRasterPage({canvas:c,nativeTokens:[],pageNumber:1,warnings:[]},options,recognizer,true);
   expect(reader.recognize).toHaveBeenCalledWith(expect.objectContaining({image:c,width:600,height:800}),undefined);
   expect(result.tokens[0].text).toBe('Sezione');expect(result.ocrReading?.status).toBe('used');expect(result.image).toBe(c.toDataURL('image/png'));
  }finally{await recognizer.terminate();}
 });
 it('il testo nativo PDF resta intatto senza avviare i lettori raster',async()=>{
  const c=canvas(),reader=secondary(b('Diverso'));const token={...a('Nome: Mario',100),source:'pdf' as const};
  const options={profile:'pei' as const,language:'ita' as const,forceOcr:false,contrast:true,rotation:0 as const,dpi:200,maxPages:1,segmentation:'auto' as const,recognizerB:reader};
  const recognizer=new LocalRecognizer(options);
  try{const result=await analyzeRasterPage({canvas:c,nativeTokens:[token],pageNumber:1,warnings:[]},options,recognizer,true);
   expect(result.source).toBe('pdf');expect(result.tokens).toEqual([token]);expect(reader.recognize).not.toHaveBeenCalled();expect(result.ocrReading).toBeUndefined();
  }finally{await recognizer.terminate();}
 });
});
