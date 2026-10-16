import type {Box,Token} from './types';
import {intersectionRatio,tokensToText} from './geometry';

export const readingKey=(s:string)=>s.normalize('NFKC').toUpperCase().replace(/\s+/g,'');
const area=(b:Box)=>b.width*b.height;
const bounds=(ts:Token[]):Box=>{const x=Math.min(...ts.map(t=>t.box.x)),y=Math.min(...ts.map(t=>t.box.y));return {x,y,width:Math.max(...ts.map(t=>t.box.x+t.box.width))-x,height:Math.max(...ts.map(t=>t.box.y+t.box.height))-y};};
const vertical=(a:Box,b:Box)=>Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))/Math.max(1,Math.min(a.height,b.height));
const valid=(t:Token,w:number,h:number)=>!!t.text.trim()&&[t.box.x,t.box.y,t.box.width,t.box.height].every(Number.isFinite)&&t.box.x>=0&&t.box.y>=0&&t.box.width>0&&t.box.height>0&&t.box.x+t.box.width<=w+1&&t.box.y+t.box.height<=h+1;
const ordered=(ts:Token[])=>{
 const lines=new Map<string,Token[]>();for(const t of ts){const row=lines.get(t.lineId)??[];row.push(t);lines.set(t.lineId,row);}
 return [...lines.values()].sort((a,b)=>Math.min(...a.map(t=>t.box.y))-Math.min(...b.map(t=>t.box.y))).flatMap(row=>[...row].sort((a,b)=>a.box.x-b.box.x));
};
const clone=(t:Token):Token=>({...t,box:{...t.box},...(t.fragments?{fragments:t.fragments.map(clone)}:{})});
const corroborationKey=(s:string)=>readingKey(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');

export interface SegmentationDecision {
 tokenId:string;outcome:'split'|'reboxed'|'recovered'|'retained';reason:string;source:'secondary'|'secondary-regional'|'primary-regional+secondary';
 sourceTokenIds:string[];outputTokenIds:string[];originalBox:Box;
}
export interface RetryPlanRegion {box:Box;reason:string;kind:'text';tokenIds:string[];priority:number}
export interface OcrAlignmentDiagnostics {
 schema:'PEI_OCR_ALIGNMENT_V1';unit:'px';segmentation:SegmentationDecision[];
 missing:{tokenId:string;sourceTokenIds:string[];box:Box;reason:'TWO_READER_POSITIONED_AGREEMENT'}[];
 retry:{regions:RetryPlanRegion[];eligible:number;deferred:number;deferredTokenIds:string[];skippedAgreements:number;areaRatio:number;limit:number;secondaryExecuted?:boolean;primaryExecuted?:boolean};
 comparison:{agreements:number;disagreements:number;segmentationMismatches:number;unmatched:number};
}

/** Only actual B word boxes may replace a coarse A box, and only for identical
 * complete text. No interpolation of word positions or correction of values. */
export function repairOcrSegmentation(primary:Token[],secondary:Token[],regional:Token[],width:number,height:number){
 const decisions:SegmentationDecision[]=[],tokens:Token[]=[];
 for(const raw of primary){
  if(raw.source!=='ocr'){tokens.push(clone(raw));continue;}
  const groups=[{source:'secondary' as const,words:secondary},{source:'secondary-regional' as const,words:regional}];
  let replacement:Token[]|undefined;
  for(const channel of groups){
   const candidates=channel.words.filter(t=>valid(t,width,height)&&intersectionRatio(t.box,raw.box)>.8);
   const pieces=ordered(candidates);
   if(!pieces.length||pieces.length>60||readingKey(pieces.map(t=>t.text).join(' '))!==readingKey(raw.text))continue;
   if(pieces.some((t,i)=>pieces.slice(i+1).some(o=>Math.max(intersectionRatio(t.box,o.box),intersectionRatio(o.box,t.box))>.15)))continue;
   if(pieces.some(t=>primary.some(o=>o.id!==raw.id&&Math.max(intersectionRatio(t.box,o.box),intersectionRatio(o.box,t.box))>.3)))continue;
   const union=bounds(pieces),single=pieces.length===1;
   // A single exact match needs a second optical observation before shrinking.
   if(single){
    const corroborated=channel.source==='secondary'&&regional.some(t=>readingKey(t.text)===readingKey(raw.text)&&intersectionRatio(t.box,union)>.7&&intersectionRatio(union,t.box)>.7);
    if(!corroborated||area(raw.box)<area(union)*2.5)continue;
   }
   const texts=partitionOriginal(raw.text,pieces.map(t=>t.text));if(!texts)continue;
   replacement=pieces.map((b,i)=>({...clone(raw),id:single?raw.id:`${raw.id}-seg-${i}`,text:texts[i],box:{...b.box},lineId:single?raw.lineId:`${raw.id}-seg-${b.lineId}`,fragments:undefined,
    segmentation:{rawTokenId:raw.segmentation?.rawTokenId??raw.id,rawText:raw.segmentation?.rawText??raw.text,rawBox:{...(raw.segmentation?.rawBox??raw.box)},source:channel.source,sourceTokenIds:pieces.map(t=>t.id)}}));
   decisions.push({tokenId:raw.id,outcome:single?'reboxed':'split',reason:'COMPLETE_TEXT_AGREEMENT_WITH_POSITIONED_WORDS',source:channel.source,sourceTokenIds:pieces.map(t=>t.id),outputTokenIds:replacement.map(t=>t.id),originalBox:{...raw.box}});break;
  }
  tokens.push(...(replacement??[clone(raw)]));
 }
 return {tokens,decisions};
}

/** A coarse, weak primary token may be re-read with Tesseract locally. Require
 * every positioned local word to agree with the independent full-page reader.
 * Otherwise retain the entire original token, including undeciphered content. */
export function recoverCoarseOcrTokens(primary:Token[],local:Token[],secondary:Token[],width:number,height:number){
 const heights=[...primary,...secondary].map(t=>t.box.height).filter(h=>h>5).sort((a,b)=>a-b),h=heights[Math.floor((heights.length-1)/2)]||20,decisions:SegmentationDecision[]=[],tokens:Token[]=[];
 for(const raw of primary){
  const coarse=raw.box.height>h*2.4||raw.box.width>Math.max(width*.25,h*Math.max(3,raw.text.length)*1.1);
  if(raw.source!=='ocr'||(raw.confidence??100)>=62||!coarse){tokens.push(clone(raw));continue;}
  const pieces=ordered(local.filter(t=>valid(t,width,height)&&intersectionRatio(t.box,raw.box)>.8&&/[\p{L}\p{N}]/u.test(t.text)));
  const retain=(reason:string)=>{tokens.push(clone(raw));decisions.push({tokenId:raw.id,outcome:'retained',reason,source:'primary-regional+secondary',sourceTokenIds:pieces.map(t=>t.id),outputTokenIds:[raw.id],originalBox:{...raw.box}});};
  if(!pieces.length||pieces.length>60){retain('NO_COMPLETE_LOCAL_READING');continue;}
  if(pieces.some(t=>(t.confidence??0)<(/\d/.test(t.text)?85:70))){retain('LOW_LOCAL_CONFIDENCE');continue;}
  if(pieces.some((t,i)=>pieces.slice(i+1).some(o=>Math.max(intersectionRatio(t.box,o.box),intersectionRatio(o.box,t.box))>.15))){retain('OVERLAPPING_LOCAL_WORDS');continue;}
  const matches=pieces.map(t=>secondary.find(b=>valid(b,width,height)&&corroborationKey(b.text)===corroborationKey(t.text)&&intersectionRatio(t.box,b.box)>.55&&intersectionRatio(b.box,t.box)>.55));
  if(matches.some(t=>!t)){retain('INDEPENDENT_TEXT_OR_GEOMETRY_DISAGREEMENT');continue;}
  const expected=secondary.filter(b=>valid(b,width,height)&&/[\p{L}\p{N}]/u.test(b.text)&&intersectionRatio(b.box,raw.box)>.8);
  if(expected.some(b=>!pieces.some(t=>corroborationKey(t.text)===corroborationKey(b.text)&&intersectionRatio(t.box,b.box)>.55&&intersectionRatio(b.box,t.box)>.55))){retain('INCOMPLETE_LOCAL_COVERAGE');continue;}
  if(pieces.some(t=>primary.some(o=>o.id!==raw.id&&Math.max(intersectionRatio(t.box,o.box),intersectionRatio(o.box,t.box))>.3))){retain('OTHER_PRIMARY_TOKEN_CONFLICT');continue;}
  const ids=[...pieces.map(t=>t.id),...matches.map(t=>t!.id)],replacement=pieces.map((t,i)=>({...clone(t),id:`${raw.id}-recovered-${i}`,originalText:raw.text,corrected:true,segmentation:{rawTokenId:raw.id,rawText:raw.text,rawBox:{...raw.box},source:'primary-regional+secondary' as const,sourceTokenIds:ids}}));
  tokens.push(...replacement);decisions.push({tokenId:raw.id,outcome:'recovered',reason:'COARSE_TOKEN_CORROBORATED_BY_TWO_READERS',source:'primary-regional+secondary',sourceTokenIds:ids,outputTokenIds:replacement.map(t=>t.id),originalBox:{...raw.box}});
 }
 return {tokens,decisions};
}

/** Introduce previously missing text only when A's real local observation and
 * independent B agree on both the word and its position, outside existing A. */
export function recoverMissingOcrTokens(primary:Token[],local:Token[],secondary:Token[],regions:Box[],width:number,height:number){
 const tokens=primary.map(clone),decisions:OcrAlignmentDiagnostics['missing']=[];
 for(const a of ordered(local)){
  if(!valid(a,width,height)||!/[\p{L}\p{N}]/u.test(a.text)||(a.confidence??0)<(/\d/.test(a.text)?85:70)||!regions.some(r=>intersectionRatio(a.box,r)>.8))continue;
  if(tokens.some(t=>Math.max(intersectionRatio(a.box,t.box),intersectionRatio(t.box,a.box))>.15))continue;
  const b=secondary.find(b=>valid(b,width,height)&&corroborationKey(a.text)===corroborationKey(b.text)&&intersectionRatio(a.box,b.box)>.55&&intersectionRatio(b.box,a.box)>.55);if(!b)continue;
  const id=`${a.id}-corroborated`,sourceTokenIds=[a.id,b.id];tokens.push({...clone(a),id,recovery:{source:'primary-regional+secondary',sourceTokenIds}});decisions.push({tokenId:id,sourceTokenIds,box:{...a.box},reason:'TWO_READER_POSITIONED_AGREEMENT'});
 }
 return {tokens,decisions};
}

function partitionOriginal(raw:string,parts:string[]):string[]|null {
 let cursor=0;const result:string[]=[];
 for(const part of parts){while(/\s/.test(raw[cursor]??'')&&cursor<raw.length)cursor++;const start=cursor,target=readingKey(part);let found=false;
  while(cursor<raw.length){const char=String.fromCodePoint(raw.codePointAt(cursor)!);cursor+=char.length;const value=readingKey(raw.slice(start,cursor));if(value===target){result.push(raw.slice(start,cursor));found=true;break;}if(!target.startsWith(value))return null;}
  if(!found)return null;
 }
 return raw.slice(cursor).trim()?null:result;
}

/** Build one comparable observation for one A token. A neighboring word and a
 * whole OCR line are never treated as competing readings of that same token. */
export function comparableReading(raw:Token,observations:Token[]):Token|undefined {
 const near=observations.filter(b=>vertical(raw.box,b.box)>.6&&intersectionRatio(b.box,raw.box)>.55);
 const group=ordered(near);
 if(group.length>1){const b=bounds(group);if(b.width>=raw.box.width*.5&&b.width<=raw.box.width*1.6&&b.height<=raw.box.height*1.6)
  return {...group[0],text:tokensToText(group),box:b,confidence:Math.min(...group.map(t=>t.confidence??0))};
 }
 return near.filter(b=>b.box.width>=raw.box.width*.45&&b.box.width<=raw.box.width*2.2&&b.box.height>=raw.box.height*.45&&b.box.height<=raw.box.height*2.2)
  .sort((a,b)=>Number(readingKey(b.text)===readingKey(raw.text))-Number(readingKey(a.text)===readingKey(raw.text))||intersectionRatio(b.box,raw.box)-intersectionRatio(a.box,raw.box))[0];
}

export function compareReadings(primary:Token[],secondary:Token[]):OcrAlignmentDiagnostics['comparison'] {
 const counts={agreements:0,disagreements:0,segmentationMismatches:0,unmatched:0};
 for(const raw of primary){const b=comparableReading(raw,secondary);
  if(b)counts[readingKey(raw.text)===readingKey(b.text)?'agreements':'disagreements']++;
  else if(secondary.some(b=>Math.max(intersectionRatio(b.box,raw.box),intersectionRatio(raw.box,b.box))>.45))counts.segmentationMismatches++;
  else counts.unmatched++;
 }
 return counts;
}

export function planOcrRetries(primary:Token[],secondary:Token[],width:number,height:number,limit=6):OcrAlignmentDiagnostics['retry'] {
 const candidates:RetryPlanRegion[]=[],heights=[...primary,...secondary].map(t=>t.box.height).filter(h=>h>5).sort((a,b)=>a-b),h=heights[Math.floor((heights.length-1)/2)]||20;let skippedAgreements=0;
 for(const raw of primary){
  if(raw.source!=='ocr'||!valid(raw,width,height)||!/[\p{L}\p{N}]/u.test(raw.text))continue;
  const b=comparableReading(raw,secondary),same=b&&readingKey(b.text)===readingKey(raw.text);
  const oversized=raw.box.height>h*2.4||raw.box.width>Math.max(width*.45,h*Math.max(3,raw.text.length)*1.1);
  if(same&&!oversized){skippedAgreements++;continue;}
  const mismatch=!b&&secondary.some(t=>Math.max(intersectionRatio(t.box,raw.box),intersectionRatio(raw.box,t.box))>.45);
  const low=(raw.confidence??0)<62,disagrees=b&&!same;
  if(!oversized&&!mismatch&&!disagrees&&!low)continue;
  const critical=/\d/.test(raw.text)&&disagrees;
  const priority=oversized?100:mismatch?90:critical?85:low?75:50;
  candidates.push({box:{...raw.box},reason:oversized?'oversized-token':mismatch?'segmentation-mismatch':critical?'critical-disagreement':low?'weak-unmatched-reading':'text-disagreement',kind:'text',tokenIds:[raw.id],priority});
 }
 // Group B-only words by actual line and spatial continuity. They remain mere
 // retry requests until Tesseract independently reads the same positioned text.
 const orphanGroups:Token[][]=[];
 for(const b of ordered(secondary.filter(b=>valid(b,width,height)&&/[\p{L}\p{N}]/u.test(b.text)&&!primary.some(a=>Math.max(intersectionRatio(a.box,b.box),intersectionRatio(b.box,a.box))>.45)))){
  const g=orphanGroups.find(g=>g[0].lineId===b.lineId&&vertical(g[0].box,b.box)>.6&&b.box.x>=g.at(-1)!.box.x&&b.box.x-g.at(-1)!.box.x-g.at(-1)!.box.width<h*3);
  if(g)g.push(b);else orphanGroups.push([b]);
 }
 for(const g of orphanGroups)candidates.push({box:bounds(g),reason:'missing-primary-text',kind:'text',tokenIds:g.map(t=>t.id),priority:92});
 const regions:RetryPlanRegion[]=[];let used=0;
 for(const c of candidates.sort((a,b)=>b.priority-a.priority||a.box.y-b.box.y||a.box.x-b.box.x)){
  const existing=regions.find(r=>Math.max(intersectionRatio(r.box,c.box),intersectionRatio(c.box,r.box))>.5);
  if(existing){const union=bounds([{box:existing.box},{box:c.box}] as Token[]),extra=area(union)-area(existing.box);if(used+extra<=width*height*.16){existing.box=union;existing.tokenIds.push(...c.tokenIds);used+=extra;}continue;}
  const reserve=orphanGroups.length&&c.reason!=='missing-primary-text'&&regions.filter(r=>r.reason!=='missing-primary-text').length>=Math.max(1,limit-2);
  if(regions.length>=limit||reserve||used+area(c.box)>width*height*.16)continue;
  regions.push({...c,box:{...c.box},tokenIds:[...c.tokenIds]});used+=area(c.box);
 }
 const selected=new Set(regions.flatMap(r=>r.tokenIds));
 const deferred=candidates.filter(c=>!c.tokenIds.some(id=>selected.has(id)));
 return {regions,eligible:candidates.length,deferred:deferred.length,deferredTokenIds:[...new Set(deferred.flatMap(c=>c.tokenIds))],skippedAgreements,areaRatio:used/Math.max(1,width*height),limit};
}
