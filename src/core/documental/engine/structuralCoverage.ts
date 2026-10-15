import type {Box,FormField,Region,Token} from './types';
import type {FieldInferenceAudit,FieldInferenceDiagnostics} from './fieldDiagnostics';
import {detectWritingLines,isLabel,makeField} from './fields';
import {intersectionRatio,tokensToText} from './geometry';
import type {RasterStrokeEvidence} from './strokes';

export interface StructuralEvidence {
 id:string;regionId:string|null;kind:'cell'|'checkbox'|'line';box:Box;responseBox:Box;
 plausible:boolean;reason:string;context:string[];coveredBefore:boolean;coveredAfter:boolean;
 coverageBefore:number;coverageAfter:number;outcome:'covered'|'recovered'|'unresolved'|'static';fieldId?:string;
}
export interface StructuralCoverageDiagnostics {
 schema:'PEI_STRUCTURAL_COVERAGE_V1';unit:'px';evidence:StructuralEvidence[];
 summary:{measured:number;plausible:number;uncoveredBefore:number;recovered:number;uncoveredAfter:number;cells:number;checkboxes:number;lines:number};
}
const area=(b:Box)=>Math.max(0,b.width)*Math.max(0,b.height);
const overlap=(a:Box,b:Box)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
const inner=(b:Box,p:number):Box=>({x:b.x+p,y:b.y+p,width:b.width-2*p,height:b.height-2*p});

/** Union of clipped rectangles: overlapping fields cannot inflate coverage. */
export function structuralCoverageRatio(box:Box,fields:FormField[]):number {
 if(!area(box))return 0;
 const clips=fields.filter(f=>f.status!=='ignored'&&overlap(box,f.box)).map(({box:b})=>({x:Math.max(box.x,b.x),y:Math.max(box.y,b.y),right:Math.min(box.x+box.width,b.x+b.width),bottom:Math.min(box.y+box.height,b.y+b.height)}));
 const xs=[...new Set(clips.flatMap(b=>[b.x,b.right]))].sort((a,b)=>a-b);let covered=0;
 for(let i=1;i<xs.length;i++){
  const spans=clips.filter(b=>b.x<xs[i]&&b.right>xs[i-1]).sort((a,b)=>a.y-b.y);let end=-Infinity,height=0;
  for(const b of spans){height+=Math.max(0,b.bottom-Math.max(end,b.y));end=Math.max(end,b.bottom);}
  covered+=(xs[i]-xs[i-1])*height;
 }
 return Math.min(1,covered/area(box));
}
function blankInkRatio(canvas:HTMLCanvasElement,box:Box):number {
 const x=Math.max(0,Math.ceil(box.x)),y=Math.max(0,Math.ceil(box.y));
 const width=Math.min(Math.floor(box.width),canvas.width-x),height=Math.min(Math.floor(box.height),canvas.height-y);
 if(width<1||height<1)return 1;
 const pixels=canvas.getContext('2d')!.getImageData(x,y,width,height).data;let dark=0;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>128&&pixels[i]+pixels[i+1]+pixels[i+2]<600)dark++;
 return dark/(pixels.length/4);
}

/** Add review proposals only. Never change existing fields, text or pixels. */
export function recoverStructuralFields(canvas:HTMLCanvasElement,tokens:Token[],regions:Region[],fields:FormField[],initial?:FieldInferenceDiagnostics,audit?:FieldInferenceAudit,measuredStrokes?:RasterStrokeEvidence):{fields:FormField[];diagnostics:StructuralCoverageDiagnostics} {
 const words=tokens.flatMap(t=>t.fragments??[t]),heights=words.map(t=>t.box.height).filter(h=>h>5).sort((a,b)=>a-b);
 const h=heights[Math.floor(heights.length/2)]||20,pad=Math.max(4,h*.2),tolerance=Math.max(5,h*.6);
 const output=[...fields],evidence:StructuralEvidence[]=[],cells=regions.filter(r=>r.kind==='cell');
 const exclusions=new Map(initial?.regions.map(r=>[r.regionId,r.reason]));
 const alreadyProposed=new Set(initial?.regions.filter(r=>r.outcome==='proposed').map(r=>r.regionId));
 const staticReasons=new Set(['COLUMN_HEADER_STATIC','STATIC_LABEL_WITH_RIGHT_CELL','LABEL_CELL_WITH_ADJACENT_LABEL','CHECKBOX_NEXT_TO_STATIC_HEADING','CHECKBOX_COMBINED_HEADING']);
 const rowPeers=(r:Region)=>cells.filter(o=>o.id!==r.id&&Math.abs(o.box.y-r.box.y)<tolerance&&Math.abs(o.box.height-r.box.height)<tolerance&&Math.min(Math.abs(o.box.x+o.box.width-r.box.x),Math.abs(r.box.x+r.box.width-o.box.x))<tolerance);
 const columnPeers=(r:Region)=>cells.filter(o=>o.id!==r.id&&Math.abs(o.box.x-r.box.x)<tolerance&&Math.abs(o.box.width-r.box.width)<tolerance*2&&Math.min(Math.abs(o.box.y+o.box.height-r.box.y),Math.abs(r.box.y+r.box.height-o.box.y))<tolerance);
 const measuredLines=detectWritingLines(canvas,regions,tokens,measuredStrokes);
 const consider=(id:string,kind:StructuralEvidence['kind'],box:Box,responseBox:Box,plausible:boolean,reason:string,context:string[],region?:Region)=>{
  const ratio=structuralCoverageRatio(responseBox,fields),covered=ratio>=.65;
  const item:StructuralEvidence={id,regionId:region?.id??null,kind,box:{...box},responseBox:{...responseBox},plausible,reason,context,coveredBefore:covered,coveredAfter:covered,coverageBefore:ratio,coverageAfter:ratio,outcome:covered?'covered':plausible?'unresolved':'static'};
  evidence.push(item);if(covered||!plausible)return;
  if(responseBox.width<(kind==='checkbox'?Math.max(6,h*.55):h)||responseBox.height<Math.max(6,h*(kind==='checkbox'?.55:.6))||responseBox.x<0||responseBox.y<0||responseBox.x+responseBox.width>canvas.width||responseBox.y+responseBox.height>canvas.height){item.reason='RESPONSE_AREA_TOO_SMALL';return;}
  if(output.some(f=>overlap(f.box,responseBox))){item.reason='PARTIAL_FIELD_CONFLICT';return;}
  if(kind!=='checkbox'&&blankInkRatio(canvas,responseBox)>.012){item.reason='UNPOSITIONED_OR_PRINTED_INK';return;}
  const label=kind==='cell'?'Cella da verificare':kind==='line'?'Riga da verificare':'Selezione da verificare';
  const field=makeField(responseBox,label,kind==='cell'?'cell':kind==='line'?'line':'checkbox');
  field.type=kind==='checkbox'?'checkbox':responseBox.height>h*2?'textarea':'text';field.confidence=.4;field.maskOriginal=false;
  field.reason=`Recupero strutturale PEI: ${reason}. Geometria misurata; significato da verificare.`;
  if(kind==='checkbox'){
   const ink=blankInkRatio(canvas,inner(responseBox,Math.min(responseBox.width,responseBox.height)*.25));
   if(ink>=.025&&ink<=.1){item.reason='CHECKBOX_STATE_AMBIGUOUS';return;}
   field.value=ink>.1;field.originalValue=field.value;field.maskOriginal=true;
  }
  output.push(field);item.outcome='recovered';item.fieldId=field.id;
  if(region)audit?.enter(region);else audit?.leave();audit?.candidate(field,'proposed','STRUCTURAL_RECOVERY_PROPOSED');audit?.leave();
 };
 for(const r of regions){
  const reason=exclusions.get(r.id),inCell=words.filter(t=>intersectionRatio(t.box,r.box)>.55&&/[\p{L}\p{N}]/u.test(t.text));
  let response=inner(r.box,pad),plausible=false,why='NO_WRITABLE_STRUCTURE',context:string[]=[];
  if(r.kind==='checkbox'){
   response={...r.box};
   const siblings=regions.filter(o=>o.id!==r.id&&o.kind==='checkbox'&&Math.abs(o.box.width-r.box.width)<tolerance&&Math.abs(o.box.height-r.box.height)<tolerance&&((Math.abs(o.box.x-r.box.x)<tolerance&&Math.abs(o.box.y-r.box.y)<h*7)||(Math.abs(o.box.y-r.box.y)<tolerance&&Math.abs(o.box.x-r.box.x)<h*16)));
   const captionWords=words.filter(t=>Math.abs(t.box.y-r.box.y)<h*.7&&Math.min(Math.abs(t.box.x+t.box.width-r.box.x),Math.abs(r.box.x+r.box.width-t.box.x))<h*4).sort((a,b)=>a.box.x-b.box.x);
   const caption=captionWords.map(t=>t.text).join(' ');
   const explicitChoice=/(?:^|\s)(?:s[iì]|no|va definita|va omessa|non redatto|redatto|da redigere|igienica|spostamenti|mensa|altro)(?=\s|$|[.,:])/i.test(caption);
   plausible=siblings.length>0&&explicitChoice&&Math.min(r.box.width,r.box.height)>=h*.55;
   if(plausible){why='REPEATED_MEASURED_CHECKBOX';context=['aligned-checkboxes','nearby-caption'];}
  }else{
   const row=rowPeers(r),column=columnPeers(r),narrowCaption=row.some(o=>o.box.x>r.box.x&&o.box.width>r.box.width*1.35),columnText=tokensToText(inCell).trim();
   const staticCaption=isLabel(columnText)||/^(?:\d+[.)]?\s*)?(?:nome e cognome|data|firma|ruolo|ore|giorno|giorni|docente|disciplina|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)\s*[:*]?$/i.test(columnText)||/^\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}$/.test(columnText);
   const grid=column.length>0&&row.length>0;
   const responseSide=row.some(o=>o.box.x<r.box.x&&o.box.width<r.box.width*.85&&words.some(t=>intersectionRatio(t.box,o.box)>.55));
   const wideBody=r.box.width>=canvas.width*.32&&r.box.height>=h*3&&(row.length>0||column.length>0);
   if(!narrowCaption&&!staticCaption&&(grid||responseSide||wideBody)){
    context=[...(grid?['repeated-table-cells']:[]),...(responseSide?['measured-response-side']:[]),...(wideBody?['wide-framed-body']:[])];
    if(inCell.length){const bottom=Math.max(...inCell.map(t=>t.box.y+t.box.height));response={...response,y:Math.max(response.y,bottom+pad),height:r.box.y+r.box.height-pad-Math.max(response.y,bottom+pad)};plausible=response.height>=Math.max(h*2,r.box.height*.22);why='MEASURED_FREE_AREA_BELOW_PRINT';}
    else{plausible=response.width>=h*3&&response.height>=h;why='EMPTY_MEASURED_TABLE_RESPONSE';}
   }
  }
  if(alreadyProposed.has(r.id)){if(!plausible)why='EXISTING_MEASURED_RESPONSE';plausible=true;context.push('existing-field-rule');if(response.height<h*.6||response.width<h)response=r.kind==='checkbox'?{...r.box}:inner(r.box,pad);}
  if(reason&&staticReasons.has(reason)){plausible=false;why=reason;}
  consider(r.id,r.kind,r.box,response,plausible,why,context,r);
 }
 measuredLines.forEach((line,i)=>{
  const peers=measuredLines.filter((o,j)=>j!==i&&Math.abs(o.x-line.x)<h&&Math.abs(o.width-line.width)<h*2&&Math.abs(o.y-line.y)>=h*.8&&Math.abs(o.y-line.y)<=h*4);
  const box={x:line.x,y:Math.max(0,line.y-h*1.3),width:line.width,height:h*1.25};
  consider(`writing-line-${i}`,'line',line,box,peers.length>0&&line.width>canvas.width*.2,'REPEATED_MEASURED_WRITING_LINES',peers.length?['parallel-writing-lines']:[]);
 });
 for(const item of evidence){item.coverageAfter=structuralCoverageRatio(item.responseBox,output);item.coveredAfter=item.coverageAfter>=.65;}
 const plausible=evidence.filter(e=>e.plausible);
 return {fields:output,diagnostics:{schema:'PEI_STRUCTURAL_COVERAGE_V1',unit:'px',evidence,summary:{measured:evidence.length,plausible:plausible.length,uncoveredBefore:plausible.filter(e=>!e.coveredBefore).length,recovered:evidence.filter(e=>e.outcome==='recovered').length,uncoveredAfter:plausible.filter(e=>!e.coveredAfter).length,cells:plausible.filter(e=>e.kind==='cell').length,checkboxes:plausible.filter(e=>e.kind==='checkbox').length,lines:plausible.filter(e=>e.kind==='line').length}}};
}
