import {OcrsWasmRecognizerB,type RecognizerB} from '../vendor/motore-ocr-ai/src/core/ocr/recognizerB';
import {createRawOcrSnapshot,createEvidenceSet,addEvidenceTokens,type OcrDecision} from '../vendor/motore-ocr-ai/src/core/pipeline/checkpoints';
import {stabilizeOcrPage} from '../vendor/motore-ocr-ai/src/core/pipeline/decisionEngine';
import type {OcrToken} from '../vendor/motore-ocr-ai/src/contracts';
import type {Token} from './types';
import {assignLines,tokensToText,intersectionRatio} from './geometry';
import {createWorkerRuntime} from './recognizerBWorker';
import {comparableReading,compareReadings,planOcrRetries,readingKey,recoverCoarseOcrTokens,recoverMissingOcrTokens,repairOcrSegmentation,type OcrAlignmentDiagnostics,type RetryPlanRegion} from './ocrAlignment';

export interface IndependentReaderState {
 configured:boolean;availability:'not-configured'|'provided-unverified'|'available'|'unavailable';
 execution:'blocked-no-reader'|'not-needed'|'completed'|'fallback-primary'|'disabled';
 reason:string;returnedPositionedWords:number|null;readerId?:string;stage?:'core'|'pei-recovery';
}

export interface DualReadingDiagnostics {
 alignment?:OcrAlignmentDiagnostics;
 primaryRegionalTokens?:Token[];
 primary:'tesseract';secondary:string;status:'used'|'unavailable'|'empty';
 rawText:string;rawTokens:Token[];secondaryTokens:Token[];
 regionalTokens:Token[];decisions:OcrDecision[];
 agreements:number;disagreements:number;changed:number;
 secondaryConfidenceKind:'heuristic';warnings:string[];
 timingsMs?:{fullPage:number;regional:number;primaryRegional?:number};
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
 secondary:RecognizerB,signal?:AbortSignal,peiAlignment=false,primaryRegions?:(regions:RetryPlanRegion[])=>Promise<Token[]>,
):Promise<{tokens:Token[];text:string;diagnostics:DualReadingDiagnostics}> {
 signal?.throwIfAborted();
 const input={image:canvas,pageNumber,width:canvas.width,height:canvas.height};
 const rawTokens=primary.tokens.map(toOcrToken);
 const raw=createRawOcrSnapshot({...input,tokens:rawTokens,text:primary.text,warnings:[]});
 const evidence=createEvidenceSet(raw);
 const fullStart=performance.now();
 const result=await secondary.recognize(input,signal).catch(error=>{
  signal?.throwIfAborted();
  return {id:secondary.id,tokens:[],text:'',score:0,confidence:null,warnings:[`RECOGNIZER_B_UNAVAILABLE:${error instanceof Error?error.message:String(error)}`]};
 });
 const fullMs=performance.now()-fullStart;
 signal?.throwIfAborted();
 const full=result.tokens.filter(t=>validToken(t,canvas.width,canvas.height));
 if(peiAlignment)return readPeiEvidence(canvas,pageNumber,primary,secondary,full,result.warnings,fullMs,signal,primaryRegions);
 addEvidenceTokens(evidence,'recognizer-b',full,`independent:${secondary.id}`);
 const disputed=rawTokens.filter(a=>(a.confidence??0)<80||full.some(b=>overlaps(a,b)&&key(a.text)!==key(b.text)));
 const regions=disputed.slice(0,8).map(t=>({box:{...t.box},reason:'independent-disagreement',kind:'text' as const}));
 const regionalStart=performance.now();
 const regional=(full.length&&regions.length&&secondary.recognizeRegions
  ?await secondary.recognizeRegions(input,regions,signal).catch(error=>{signal?.throwIfAborted();result.warnings.push(`RECOGNIZER_B_REGION_UNAVAILABLE:${String(error)}`);return [];}):[]).filter(t=>validToken(t,canvas.width,canvas.height));
 const regionalMs=performance.now()-regionalStart;
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
  timingsMs:{fullPage:Math.round(fullMs),regional:Math.round(regionalMs)},
 };
 return {tokens:full.length?tokens:primary.tokens.map(clone),text:full.length&&changed?tokensToText(tokens):primary.text,diagnostics};
}

/** PEI compares the same positioned text span in each channel. The upstream
 * decision policy still chooses the text, but unrelated neighbors cannot vote. */
async function readPeiEvidence(canvas:HTMLCanvasElement,pageNumber:number,primary:{tokens:Token[];text:string},secondary:RecognizerB,full:OcrToken[],readerWarnings:string[],fullMs:number,signal?:AbortSignal,primaryRegions?:(regions:RetryPlanRegion[])=>Promise<Token[]>){
 const secondaryTokens=full.map(fromOcrToken),first=repairOcrSegmentation(primary.tokens,secondaryTokens,[],canvas.width,canvas.height);
 const retry=planOcrRetries(first.tokens,secondaryTokens,canvas.width,canvas.height),warnings=[...readerWarnings],input={image:canvas,pageNumber,width:canvas.width,height:canvas.height};
 const regionalStart=performance.now();
 const regional=(full.length&&retry.regions.length&&secondary.recognizeRegions?await secondary.recognizeRegions(input,retry.regions,signal).catch(error=>{signal?.throwIfAborted();warnings.push(`RECOGNIZER_B_REGION_UNAVAILABLE:${String(error)}`);return [];}):[]).filter(t=>validToken(t,canvas.width,canvas.height));
 signal?.throwIfAborted();const regionalMs=performance.now()-regionalStart,regionalTokens=regional.map(fromOcrToken),decisions:OcrDecision[]=[],selected:Token[]=[];
 const primaryStart=performance.now(),primaryPlan=retry.regions.filter(r=>r.reason==='oversized-token'||r.reason==='segmentation-mismatch'||r.reason==='missing-primary-text'||r.reason==='critical-disagreement');
 const primaryRegionalTokens=full.length&&primaryPlan.length&&primaryRegions?await primaryRegions(primaryPlan).catch(error=>{signal?.throwIfAborted();warnings.push(`PRIMARY_REGION_UNAVAILABLE:${String(error)}`);return [];}):[];
 retry.secondaryExecuted=!!(full.length&&retry.regions.length&&secondary.recognizeRegions);retry.primaryExecuted=!!(full.length&&primaryPlan.length&&primaryRegions);
 signal?.throwIfAborted();const primaryMs=performance.now()-primaryStart,recovered=recoverCoarseOcrTokens(first.tokens,primaryRegionalTokens,secondaryTokens,canvas.width,canvas.height);
 for(const d of recovered.decisions.filter(d=>d.outcome==='recovered')){const raw=first.tokens.find(t=>t.id===d.tokenId)!;decisions.push({tokenId:raw.id,selectedText:tokensToText(recovered.tokens.filter(t=>d.outputTokenIds.includes(t.id))),rawText:raw.text,source:'targeted-reocr',reason:d.reason,confidence:null,changed:true});}
 for(const a of recovered.tokens){
  const raw=createRawOcrSnapshot({...input,tokens:[toOcrToken(a)],text:a.text,warnings:[]}),evidence=createEvidenceSet(raw);
  for(const channel of [{source:'recognizer-b' as const,tokens:secondaryTokens},{source:'recognizer-b-region' as const,tokens:regionalTokens}]){
   const b=comparableReading(a,channel.tokens);if(b)addEvidenceTokens(evidence,channel.source,[toOcrToken(b)],`aligned:${secondary.id}`);
  }
  const stabilized=stabilizeOcrPage(evidence);let decision=stabilized.decisions.find(d=>d.tokenId===a.id)!,winner=stabilized.page.tokens.find(t=>t.id===a.id);
  if(decision.changed&&/\d/.test(a.text+decision.selectedText)){
   const local=comparableReading(a,primaryRegionalTokens);
   if(!local||(local.confidence??0)<85||readingKey(local.text)!==readingKey(decision.selectedText)){
    winner=undefined;decision={tokenId:a.id,selectedText:a.text,rawText:a.originalText??a.text,source:'raw',reason:'CRITICAL_VALUE_NEEDS_PRIMARY_LOCAL_AGREEMENT',confidence:a.confidence,changed:false};
   }
  }
  decisions.push(decision);
  // Only a decision for this original token can change it. Novel values and
  // overlap suppression from other words cannot erase or insert page content.
  selected.push(winner&&decision.changed?{...clone(a),text:winner.text,confidence:winner.confidence,originalText:a.originalText??a.text,corrected:true}:clone(a));
 }
 const missing=recoverMissingOcrTokens(selected,primaryRegionalTokens,secondaryTokens,primaryPlan.filter(r=>r.reason==='missing-primary-text').map(r=>r.box),canvas.width,canvas.height);
 for(const d of missing.decisions){const t=missing.tokens.find(t=>t.id===d.tokenId)!;decisions.push({tokenId:t.id,rawText:'',selectedText:t.text,source:'targeted-reocr',reason:d.reason,confidence:t.confidence,changed:true});}
 const final=repairOcrSegmentation(missing.tokens,secondaryTokens,regionalTokens,canvas.width,canvas.height);
 const segmentation=[...first.decisions,...recovered.decisions,...final.decisions],geometryChanged=segmentation.some(d=>d.outcome!=='retained'),textChanged=decisions.some(d=>d.changed),changed=textChanged||geometryChanged;
 const tokens=full.length?final.tokens:primary.tokens.map(clone),comparison=compareReadings(first.tokens,secondaryTokens);
 const diagnostics:DualReadingDiagnostics={primary:'tesseract',secondary:secondary.id,status:full.length?'used':warnings.length?'unavailable':'empty',rawText:primary.text,rawTokens:primary.tokens.map(clone),secondaryTokens,regionalTokens,primaryRegionalTokens,decisions,
  agreements:comparison.agreements,disagreements:comparison.disagreements,changed:decisions.filter(d=>d.changed).length,secondaryConfidenceKind:'heuristic',warnings,
  timingsMs:{fullPage:Math.round(fullMs),regional:Math.round(regionalMs),primaryRegional:Math.round(primaryMs)},alignment:{schema:'PEI_OCR_ALIGNMENT_V1',unit:'px',segmentation,missing:missing.decisions,retry,comparison}};
 return {tokens,text:full.length&&changed?tokensToText(tokens):primary.text,diagnostics};
}
function clone(t:Token):Token{return {...t,box:{...t.box},...(t.fragments?{fragments:t.fragments.map(clone)}:{})};}
function toOcrToken(t:Token):OcrToken{return {id:t.id,text:t.text,confidence:t.confidence,box:{...t.box},lineId:t.lineId,provenance:t.source==='pdf'?'native-pdf':'ocr',rawText:t.originalText??t.text};}
function fromOcrToken(t:OcrToken):Token{return {id:t.id,text:t.text,confidence:t.confidence,box:{...t.box},lineId:t.lineId,source:t.provenance==='native-pdf'?'pdf':'ocr',...(t.rawText&&t.rawText!==t.text?{originalText:t.rawText,corrected:true}:{})};}
function key(s:string){return s.normalize('NFKC').toUpperCase().replace(/\s+/g,'');}
function overlaps(a:OcrToken,b:OcrToken){return Math.max(intersectionRatio(a.box,b.box),intersectionRatio(b.box,a.box))>.45;}
function validToken(t:OcrToken,width:number,height:number){const b=t.box;return !!t.text.trim()&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1;}
