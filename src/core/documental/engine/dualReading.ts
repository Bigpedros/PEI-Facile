import {OcrsWasmRecognizerB,type RecognizerB} from '../vendor/motore-ocr-ai/src/core/ocr/recognizerB';
import {createRawOcrSnapshot,createEvidenceSet,addEvidenceTokens,type OcrDecision} from '../vendor/motore-ocr-ai/src/core/pipeline/checkpoints';
import {stabilizeOcrPage} from '../vendor/motore-ocr-ai/src/core/pipeline/decisionEngine';
import type {OcrToken} from '../vendor/motore-ocr-ai/src/contracts';
import type {Token} from './types';
import {assignLines,tokensToText,intersectionRatio} from './geometry';
import {createWorkerRuntime} from './recognizerBWorker';

export interface IndependentReaderState {
 configured:boolean;availability:'not-configured'|'provided-unverified'|'available'|'unavailable';
 execution:'blocked-no-reader'|'not-needed'|'completed'|'fallback-primary'|'disabled';
 reason:string;returnedPositionedWords:number|null;readerId?:string;stage?:'core'|'pei-recovery';
}

export interface DualReadingDiagnostics {
 primary:'tesseract';secondary:string;status:'used'|'unavailable'|'empty';
 rawText:string;rawTokens:Token[];secondaryTokens:Token[];
 regionalTokens:Token[];decisions:OcrDecision[];
 agreements:number;disagreements:number;changed:number;
 secondaryConfidenceKind:'heuristic';warnings:string[];
}

export function createIndependentRecognizer():RecognizerB {
 const base=new URL(import.meta.env.BASE_URL,location.href);
 const options={
  moduleUrl:new URL('recognizer-b/ocrs_wasm.js',base).href,
  detectionModelUrl:new URL('models/text-detection.rten',base).href,
  recognitionModelUrl:new URL('models/text-recognition.rten',base).href,
  regionLimit:8,
 };
 return new OcrsWasmRecognizerB(options,()=>createWorkerRuntime(options));
}

/** Both readers use the canonical raster pixel space; only A gets contrast preprocessing.
 * B and B-region remain distinct evidence channels. The upstream Decision Engine
 * selects text, retaining A's coordinates and preserving an auditable raw snapshot.
 */
export async function readIndependent(
 canvas:HTMLCanvasElement,pageNumber:number,primary:{tokens:Token[];text:string},
 secondary:RecognizerB,signal?:AbortSignal,
):Promise<{tokens:Token[];text:string;diagnostics:DualReadingDiagnostics}> {
 signal?.throwIfAborted();
 const input={image:canvas,pageNumber,width:canvas.width,height:canvas.height};
 const rawTokens=primary.tokens.map(toOcrToken);
 const raw=createRawOcrSnapshot({...input,tokens:rawTokens,text:primary.text,warnings:[]});
 const evidence=createEvidenceSet(raw);
 const result=await secondary.recognize(input,signal).catch(error=>{
  signal?.throwIfAborted();
  return {id:secondary.id,tokens:[],text:'',score:0,confidence:null,warnings:[`RECOGNIZER_B_UNAVAILABLE:${error instanceof Error?error.message:String(error)}`]};
 });
 signal?.throwIfAborted();
 const full=result.tokens.filter(t=>validToken(t,canvas.width,canvas.height));
 addEvidenceTokens(evidence,'recognizer-b',full,`independent:${secondary.id}`);
 const disputed=rawTokens.filter(a=>(a.confidence??0)<80||full.some(b=>overlaps(a,b)&&key(a.text)!==key(b.text)));
 const regions=disputed.slice(0,8).map(t=>({box:{...t.box},reason:'independent-disagreement',kind:'text' as const}));
 const regional=(full.length&&regions.length&&secondary.recognizeRegions
  ?await secondary.recognizeRegions(input,regions,signal).catch(error=>{signal?.throwIfAborted();result.warnings.push(`RECOGNIZER_B_REGION_UNAVAILABLE:${String(error)}`);return [];}):[]).filter(t=>validToken(t,canvas.width,canvas.height));
 signal?.throwIfAborted();
 addEvidenceTokens(evidence,'recognizer-b-region',regional,`independent-region:${secondary.id}`);
 const stabilized=stabilizeOcrPage(evidence);
 // Keep line grouping compatible with the calibrator and never change A's boxes.
 const changed=stabilized.decisions.some(d=>d.changed);
 const tokens=changed?assignLines(stabilized.page.tokens.map(fromOcrToken)):primary.tokens.map(clone);
 const diagnostics:DualReadingDiagnostics={
  primary:'tesseract',secondary:secondary.id,
  status:full.length?'used':result.warnings.length?'unavailable':'empty',
  rawText:primary.text,rawTokens:primary.tokens.map(clone),
  secondaryTokens:full.map(fromOcrToken),regionalTokens:regional.map(fromOcrToken),
  decisions:stabilized.decisions,
  agreements:rawTokens.filter(a=>full.some(b=>overlaps(a,b)&&key(a.text)===key(b.text))).length,
  disagreements:rawTokens.filter(a=>full.some(b=>overlaps(a,b)&&key(a.text)!==key(b.text))).length,
  changed:stabilized.decisions.filter(d=>d.changed).length,
  secondaryConfidenceKind:'heuristic',warnings:[...result.warnings],
 };
 return {tokens:full.length?tokens:primary.tokens.map(clone),text:full.length&&changed?tokensToText(tokens):primary.text,diagnostics};
}
function clone(t:Token):Token{return {...t,box:{...t.box}};}
function toOcrToken(t:Token):OcrToken{return {id:t.id,text:t.text,confidence:t.confidence,box:{...t.box},lineId:t.lineId,provenance:t.source==='pdf'?'native-pdf':'ocr',rawText:t.originalText??t.text};}
function fromOcrToken(t:OcrToken):Token{return {id:t.id,text:t.text,confidence:t.confidence,box:{...t.box},lineId:t.lineId,source:t.provenance==='native-pdf'?'pdf':'ocr',...(t.rawText&&t.rawText!==t.text?{originalText:t.rawText,corrected:true}:{})};}
function key(s:string){return s.normalize('NFKC').toUpperCase().replace(/\s+/g,'');}
function overlaps(a:OcrToken,b:OcrToken){return Math.max(intersectionRatio(a.box,b.box),intersectionRatio(b.box,a.box))>.45;}
function validToken(t:OcrToken,width:number,height:number){const b=t.box;return !!t.text.trim()&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1;}
