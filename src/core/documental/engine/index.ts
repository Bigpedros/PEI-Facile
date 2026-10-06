import {loadPages} from './load';
import {normalize,recognitionImage} from './raster';
import {LocalRecognizer} from './ocr';
import {inferFields} from './fields';
import {detectRegions} from './regions';
import {tokensToText,mapBox,rotateBox,intersectionRatio,assignLines} from './geometry';
import {parseReceipt} from '../adapters/receipt';
import type {DocumentResult,EngineOptions,PageResult,RasterPage,Token} from './types';
export * from './types';
export {toPeiReview} from '../adapters/pei';
export {parseReceipt} from '../adapters/receipt';

/** Group words only within the same line and region, without crossing table cells. */
export function fieldTokens(tokens:Token[],regions:PageResult['regions']):Token[] {
 const groups:Token[][]=[];
 const regionId=(t:Token)=>regions.find(r=>t.box.x>=r.box.x&&t.box.y>=r.box.y&&t.box.x+t.box.width<=r.box.x+r.box.width+2&&t.box.y+t.box.height<=r.box.y+r.box.height+2)?.id;
 // OCR words on one line have slightly different top coordinates. Sort by line then x,
 // otherwise a response two pixels higher can be visited before its left-hand label.
 for(const t of [...tokens].sort((a,b)=>a.lineId.localeCompare(b.lineId)||a.box.x-b.box.x)){
  // PDF spans already carry their own geometry: do not merge label and value across spans.
  if(t.source==='pdf'){groups.push([t]);continue;}
  const group=groups.find(g=>g[0].source===t.source&&g[0].lineId===t.lineId&&regionId(g[0])===regionId(t)&&t.box.x>=g[g.length-1].box.x&&t.box.x-(g[g.length-1].box.x+g[g.length-1].box.width)<Math.max(10,t.box.height*2));
  if(group)group.push(t);else groups.push([t]);
 }
 return groups.map(g=>{const x=Math.min(...g.map(t=>t.box.x)),y=Math.min(...g.map(t=>t.box.y));return {...g[0],fragments:g.length>1?g:undefined,text:g.map(t=>t.text).join(' '),box:{x,y,width:Math.max(...g.map(t=>t.box.x+t.box.width))-x,height:Math.max(...g.map(t=>t.box.y+t.box.height))-y}};});
}

export async function analyzeRasterPage(raw:RasterPage,options:EngineOptions,recognizer:LocalRecognizer,alreadyCanonical=false):Promise<PageResult> {
 options.signal?.throwIfAborted();const start=performance.now();
 const prepared=alreadyCanonical?{canvas:raw.canvas,tokens:raw.nativeTokens,
  transform:{sourceWidth:raw.canvas.width,sourceHeight:raw.canvas.height,scale:1,offsetX:0,offsetY:0,rotation:0},physicalSizeMm:raw.physicalSizeMm??null}:normalize(raw,options);
 const warnings=[...raw.warnings];
 const mixed=raw.hasRasterImages&&prepared.tokens.length>0;
 const native=(prepared.tokens.length>0||(raw.nativeFields?.length??0)>0)&&!mixed&&!options.forceOcr&&!warnings.some(w=>w.startsWith('Testo PDF ruotato'));
 let tokens=prepared.tokens,text=tokensToText(tokens);
 if(!native){
  options.onProgress?.(`Pagina ${raw.pageNumber} · OCR`,0);
  if(options.customOcrRunner){const read=await options.customOcrRunner(prepared.canvas);text=read.text;tokens=read.tokens??[];if(!tokens.length)warnings.push('OCR esterno senza coordinate: geometrie testuali non disponibili.');}
  else{const read=await recognizer.recognize(recognitionImage(prepared.canvas,options.contrast),raw.pageNumber);tokens=read.tokens;text=read.text;}
 }
 if(mixed&&!options.forceOcr){tokens=assignLines([...prepared.tokens,...tokens.filter(t=>!prepared.tokens.some(n=>intersectionRatio(t.box,n.box)>.55))]);text=tokensToText(tokens);warnings.push('Pagina mista: testo nativo conservato e OCR delle informazioni raster, da verificare.');}
 options.signal?.throwIfAborted();
 if(!tokens.length)warnings.push('Nessun testo posizionato: revisione richiesta.');
 if(native)warnings.push('Testo nativo PDF: eventuali valori presenti solo nelle immagini richiedono verifica OCR.');
 const regions=options.profile!=='receipt'?detectRegions(prepared.canvas,tokens):[];
 const inferred=options.profile!=='receipt'?inferFields(prepared.canvas,fieldTokens(tokens,regions),regions):[];
 const explicit=(raw.nativeFields||[]).map(f=>({...f,box:alreadyCanonical?f.box:mapBox(rotateBox(f.box,raw.canvas.width,raw.canvas.height,options.rotation),prepared.transform.scale,prepared.transform.offsetX,prepared.transform.offsetY)}));
 const fields=[...explicit,...inferred.filter(f=>!explicit.some(e=>intersectionRatio(f.box,e.box)>.5||intersectionRatio(e.box,f.box)>.5))];
 return {pageNumber:raw.pageNumber,width:prepared.canvas.width,height:prepared.canvas.height,unit:'px',image:prepared.canvas.toDataURL('image/png'),text,tokens,regions,fields,source:native?'pdf':'ocr',transform:prepared.transform,physicalSizeMm:prepared.physicalSizeMm,warnings,elapsedMs:Math.round(performance.now()-start)};
}

export async function analyzeDocument(file:File,options:EngineOptions):Promise<DocumentResult> {
 if(file.size>80*1024*1024)throw new Error('File oltre 80 MB.');
 if(options.dpi<100||options.dpi>300)throw new Error('Risoluzione ammessa: 100–300 DPI.');
 if(options.fineRotation!==undefined&&(!Number.isFinite(options.fineRotation)||Math.abs(options.fineRotation)>15))throw new Error('Rotazione fine ammessa: da -15 a +15 gradi.');
 options.signal?.throwIfAborted();
 const recognizer=new LocalRecognizer(options);const abort=()=>{void recognizer.terminate();};
 options.signal?.addEventListener('abort',abort,{once:true});const pages:PageResult[]=[];
 try{
  for await(const raw of loadPages(file,options)){
   options.onProgress?.(`Pagina ${raw.pageNumber} · analisi`,0);
   const page=await analyzeRasterPage(raw,options,recognizer);
   pages.push(page);options.onPage?.(page);
   // Only the canonical PNG and coordinate data survive the page iteration.
   raw.canvas.width=raw.canvas.height=1;
  }
  return {schemaVersion:'2.0',engineVersion:'0.2.0',id:crypto.randomUUID(),updatedAt:new Date().toISOString(),filename:file.name,profile:options.profile,createdAt:new Date().toISOString(),pages,receipt:options.profile==='receipt'?parseReceipt(pages.map(p=>p.text).join('\n')):null,warnings:[]};
 }finally{options.signal?.removeEventListener('abort',abort);await recognizer.terminate();}
}
