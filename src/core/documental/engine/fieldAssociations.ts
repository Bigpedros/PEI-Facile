import type {Box,FormField,Region,Token} from './types';
import type {FieldInferenceAudit} from './fieldDiagnostics';
import type {RasterStrokeEvidence} from './strokes';
import type {StructuralCoverageDiagnostics} from './structuralCoverage';
import {structuralCoverageRatio} from './structuralCoverage';
import {detectWritingLines,isLabel,makeField,semanticKey} from './fields';
import {intersectionRatio,tokensToText} from './geometry';

export type AssociationRelation='column-header'|'row-label'|'merged-row-label'|'external-prompt'|'signature-line';
export interface AssociationDecision {
 id:string;regionId:string|null;outcome:'static'|'proposed'|'enriched'|'covered'|'ambiguous'|'blocked'|'unmatched';
 relation?:AssociationRelation;reason:string;sourceRegionIds:string[];sourceTokenIds:string[];
 anchorSource?:'primary'|'secondary';
 fieldId?:string;label?:string;preservedWords:number;
}
export interface FieldAssociationDiagnostics {
 schema:'PEI_FIELD_ASSOCIATIONS_V1';unit:'px';decisions:AssociationDecision[];
 summary:{proposed:number;enriched:number;covered:number;ambiguous:number;blocked:number;static:number;secondaryHeaders:number};
}
interface Header {label:string;type:FormField['type'];group?:boolean;day?:boolean}
interface Choice {label:string;type:FormField['type'];relation:AssociationRelation;sources:Region[];anchors:Token[];response:Box;anchorSource?:'primary'|'secondary'}
const area=(b:Box)=>Math.max(0,b.width)*Math.max(0,b.height);
const clean=(s:string)=>s.replace(/\s+/g,' ').trim().replace(/[,:;]\s*$/,'');
const key=(s:string)=>clean(s).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const inter=(a:Box,b:Box)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
const generic=(f:FormField)=>/^(?:Cella|Campo|Riga|Testo su righe).*da verificare$/i.test(f.label)||f.reason.startsWith('Recupero strutturale PEI:');
const protectedField=(f:FormField)=>f.origin==='manual'||f.status!=='review'||f.reason.startsWith('Widget AcroForm');
const rowAxis=(s:string)=>/^\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}$/.test(clean(s))||/^(?:mattina|pomeriggio)$/i.test(clean(s));
function header(text:string):Header|null {
 const s=key(text).replace(/^\*\s*/,''),names:Record<string,string>={'nome e cognome':'Nome e Cognome','nome cognome':'Nome e Cognome','nominativo':'Nome e Cognome','nome':'Nome','cognome':'Cognome','ruolo':'Ruolo','qualifica':'Qualifica','titolo di partecipazione':'Titolo di partecipazione al GLO','firma':'Firma','firme':'Firma','data':'Data','variazione':'Variazione','variazioni':'Variazione','attivita':'Attività','strategie e strumenti':'Strategie e Strumenti','ore':'Ore'};
 if(names[s])return {label:names[s],type:s==='data'?'date':'text'};
 if(/\bnome\b/.test(s)&&/\bcognome\b/.test(s))return {label:'Nome e Cognome',type:'text'};
 if(/^specificare a quale titolo\b/.test(s))return {label:'Titolo di partecipazione al GLO',type:'text'};
 if(/\btitolo\b/.test(s)&&/\bcomponente\b/.test(s))return {label:'Titolo di partecipazione',type:'text'};
 if(/^variazione\s*\(/.test(s))return {label:'Variazione del componente GLO',type:'text'};
 if(/^(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)$/.test(s))return {label:clean(text),type:'text',day:true};
 if(/^(?:dati (?:anagrafici|del componente|dei componenti)|componenti (?:del )?glo|dati personali)$/.test(s))return {label:clean(text),type:'text',group:true};
 return null;
}
function prompt(text:string):boolean {
 const s=clean(text);
 if(!s||s.length>550||/^(?:\d+[.)]\s|art\.?\s|legge\s|ai sensi\b)/i.test(s))return false;
 return isLabel(s)||/[:?]\s*$/.test(text)||/^(?:specificare|indicare|descrivere|riportare|motivare|verifica finale|valutazione globale|eventuali esigenze|aggiornamento delle condizioni|arredi speciali|risorse (?:destinate|professionali)|proposta (?:del|delle)|dati relativi|osservazioni nel contesto|obiettivi educativi)/i.test(s);
}
function isoDate(raw:string):string|null {
 const m=raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/);if(!m)return null;
 const year=m[3].length===2?(Number(m[3])<50?'20':'19')+m[3]:m[3],month=Number(m[2]),day=Number(m[1]),d=new Date(Number(year),month-1,day);
 return d.getFullYear()===Number(year)&&d.getMonth()===month-1&&d.getDate()===day?`${year}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:null;
}

/** Follow measured cell edges; do not associate by distance alone or cross gaps.
 * Only generic automatic proposals can be refined. Other fields stay intact. */
export function associateMeasuredFields(canvas:HTMLCanvasElement,tokens:Token[],regions:Region[],fields:FormField[],audit?:FieldInferenceAudit,strokes?:RasterStrokeEvidence,secondaryAnchors:Token[]=[]):{fields:FormField[];diagnostics:FieldAssociationDiagnostics} {
 const words=tokens.flatMap(t=>t.fragments??[t]),heights=words.map(t=>t.box.height).filter(h=>h>5).sort((a,b)=>a-b),h=heights[Math.floor(heights.length/2)]||20,tol=Math.max(5,h*.6),pad=Math.max(4,h*.2);
 const cells=regions.filter(r=>r.kind==='cell'),output=[...fields],decisions:AssociationDecision[]=[];
 const cellWords=new Map(cells.map(r=>[r.id,words.filter(w=>intersectionRatio(w.box,r.box)>.55)]));
 const text=(r:Region)=>tokensToText(cellWords.get(r.id)??[]).trim();
 const vertical=(top:Region,bottom:Region)=>Math.abs(top.box.y+top.box.height-bottom.box.y)<=tol&&Math.min(top.box.x+top.box.width,bottom.box.x+bottom.box.width)-Math.max(top.box.x,bottom.box.x)>=Math.min(top.box.width,bottom.box.width)*.7;
 const leftOf=(left:Region,right:Region)=>Math.abs(left.box.x+left.box.width-right.box.x)<=tol&&Math.min(left.box.y+left.box.height,right.box.y+right.box.height)-Math.max(left.box.y,right.box.y)>=right.box.height*.75;
 const horizontal=(a:Region,b:Region)=>Math.min(Math.abs(a.box.x+a.box.width-b.box.x),Math.abs(b.box.x+b.box.width-a.box.x))<=tol&&Math.min(a.box.y+a.box.height,b.box.y+b.box.height)-Math.max(a.box.y,b.box.y)>=Math.min(a.box.height,b.box.height)*.7;
 const neighbors=new Map(cells.map(r=>[r.id,[] as Region[]]));
 for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++)if(vertical(cells[i],cells[j])||vertical(cells[j],cells[i])||horizontal(cells[i],cells[j])){neighbors.get(cells[i].id)!.push(cells[j]);neighbors.get(cells[j].id)!.push(cells[i]);}
 const component=new Map<string,string>();
 for(const r of cells)if(!component.has(r.id)){const queue=[r];component.set(r.id,r.id);while(queue.length){const n=queue.shift()!;for(const next of neighbors.get(n.id)??[])if(!component.has(next.id)){component.set(next.id,r.id);queue.push(next);}}}
 const candidateHeaders=new Map(cells.filter(r=>r.box.height<=h*6).map(r=>[r.id,header(text(r))]).filter((x):x is [string,Header]=>x[1]!==null));
 const headerSources=new Map<string,'primary'|'secondary'>([...candidateHeaders.keys()].map(id=>[id,'primary']));
 const headerWords=new Map(cellWords);
 const secondaryWords=new Map(cells.map(r=>[r.id,secondaryAnchors.filter(t=>intersectionRatio(t.box,r.box)>.55)]));
 const secondaryCandidates=new Map(cells.filter(r=>r.box.height<=h*6).map(r=>[r.id,header(tokensToText(secondaryWords.get(r.id)??[]))]).filter((x):x is [string,Header]=>x[1]!==null));
 const conflicts=new Set([...candidateHeaders.keys()].filter(id=>secondaryCandidates.has(id)&&key(candidateHeaders.get(id)!.label)!==key(secondaryCandidates.get(id)!.label)));
 // B is used only as positioned header evidence, never as replacement values.
 // Require another distinct, aligned header in the same measured table row.
 for(const r of cells)if(!candidateHeaders.has(r.id)&&secondaryCandidates.has(r.id)){
  const other=cells.some(o=>o.id!==r.id&&component.get(o.id)===component.get(r.id)&&Math.abs(o.box.y-r.box.y)<tol&&
   (secondaryCandidates.get(o.id)??candidateHeaders.get(o.id))?.label!==secondaryCandidates.get(r.id)!.label&&(secondaryCandidates.has(o.id)||candidateHeaders.has(o.id)));
  if(other){candidateHeaders.set(r.id,secondaryCandidates.get(r.id)!);headerSources.set(r.id,'secondary');headerWords.set(r.id,secondaryWords.get(r.id)??[]);}
 }
 const hasBody=(r:Region)=>cells.some(b=>b.id!==r.id&&vertical(r,b));
 const headers=new Map(cells.filter(r=>candidateHeaders.has(r.id)&&(hasBody(r)||(neighbors.get(r.id)??[]).some(o=>horizontal(r,o)&&candidateHeaders.has(o.id)&&hasBody(o)))).map(r=>[r.id,candidateHeaders.get(r.id)!]));
 const inset=(b:Box):Box=>({x:b.x+pad,y:b.y+pad,width:b.width-pad*2,height:b.height-pad*2});

 const ancestors=(r:Region)=>{
  const found:{region:Region;header:Header;path:Region[]}[]=[],visited=new Set([r.id]),queue=[{region:r,path:[] as Region[]}];
  while(queue.length){const next=queue.shift()!;
   for(const above of (neighbors.get(next.region.id)??[]).filter(a=>!visited.has(a.id)&&a.box.y<=r.box.y+tol)){
    visited.add(above.id);const path=[...next.path,above],head=headers.get(above.id);
    const xOverlap=Math.min(above.box.x+above.box.width,r.box.x+r.box.width)-Math.max(above.box.x,r.box.x);
    if(head&&!head.group&&above.box.y+above.box.height<=r.box.y+tol&&xOverlap>=Math.min(above.box.width,r.box.width)*.7)found.push({region:above,header:head,path});
    queue.push({region:above,path});
   }
  }
  const nearest=Math.max(...found.map(f=>f.region.box.y+f.region.box.height));
  return found.filter(f=>nearest-f.region.box.y-f.region.box.height<=tol);
 };
 const record=(r:Region):AssociationDecision=>{const d:AssociationDecision={id:r.id,regionId:r.id,outcome:'unmatched',reason:'NO_MEASURED_ASSOCIATION',sourceRegionIds:[],sourceTokenIds:[],preservedWords:0};decisions.push(d);return d;};
 const propose=(d:AssociationDecision,choice:Choice,region?:Region)=>{
  d.relation=choice.relation;d.label=choice.label;d.anchorSource=choice.anchorSource??'primary';d.sourceRegionIds=[...new Set(choice.sources.map(s=>s.id))];d.sourceTokenIds=[...new Set(choice.anchors.map(t=>t.id))];
  const b={...choice.response};
  if(b.x<0||b.y<0||b.width<h||b.height<6||b.x+b.width>canvas.width||b.y+b.height>canvas.height){d.outcome='blocked';d.reason='ASSOCIATED_RESPONSE_TOO_SMALL';return;}
  const overlapping=output.filter(f=>inter(f.box,b));
  if(overlapping.some(protectedField)){d.outcome='blocked';d.reason='PROTECTED_FIELD_CONFLICT';return;}
  const refinable=overlapping.filter(f=>generic(f)&&intersectionRatio(f.box,b)>.8);
  const other=overlapping.filter(f=>!refinable.includes(f));
  if(other.length){d.outcome=structuralCoverageRatio(b,other)>=.65?'covered':'blocked';d.reason=d.outcome==='covered'?'EXISTING_FIELD_RETAINED':'PARTIAL_FIELD_CONFLICT';d.fieldId=other[0].id;return;}
  if(refinable.length>1){d.outcome='ambiguous';d.reason='MULTIPLE_GENERIC_FIELDS';return;}
  // A partial generic intersection cannot authorize resizing that proposal.
  if(overlapping.length&&!refinable.length){d.outcome='blocked';d.reason='PARTIAL_FIELD_CONFLICT';return;}
  const old=refinable[0];
  if(old){
   // Association refines meaning, not the already proposed value or geometry.
   const f={...old,label:choice.label,semanticKey:semanticKey(choice.label),reason:`Associazione strutturale PEI: ${choice.relation}. Proposta esistente associata; geometria e contenuto conservati, da verificare.`};
   if(choice.type==='date'&&(old.value===''||/^\d{4}-\d{2}-\d{2}$/.test(String(old.value))))f.type='date';
   output[output.indexOf(old)]=f;d.outcome='enriched';d.reason='GENERIC_FIELD_ASSOCIATED';d.fieldId=f.id;d.preservedWords=words.filter(w=>intersectionRatio(w.box,old.box)>.55).length;return;
  }
  const valueWords=words.filter(w=>intersectionRatio(w.box,b)>.55&&!/^[_.·\s]+$/.test(w.text));
  const raw=tokensToText(valueWords).trim(),f=makeField(b,choice.label,choice.relation==='signature-line'?'line':'cell');
  if(!raw){
   const pixels=canvas.getContext('2d')!.getImageData(Math.ceil(b.x),Math.ceil(b.y),Math.max(1,Math.floor(b.width)),Math.max(1,Math.floor(b.height))).data;let ink=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>128&&pixels[i]+pixels[i+1]+pixels[i+2]<600)ink++;
   if(ink/(pixels.length/4)>.012){d.outcome='ambiguous';d.reason='INK_WITHOUT_POSITIONED_TEXT';return;}
  }
  f.type=choice.type==='text'&&b.height>h*2?'textarea':choice.type;
  const date=choice.type==='date'&&raw?isoDate(raw):null;if(choice.type==='date'&&raw&&!date)f.type='text';
  f.value=date??raw;f.originalValue=f.value;f.observedText=raw;f.maskOriginal=!!raw;f.confidence=choice.relation==='column-header'?.72:.65;
  f.reason=`Associazione strutturale PEI: ${choice.relation}. Etichetta e area misurate; contenuto presente conservato, da verificare.`;
  d.preservedWords=valueWords.length;
  output.push(f);d.outcome='proposed';d.reason='ASSOCIATED_FIELD_PROPOSED';
  if(region)audit?.enter(region);else audit?.leave();audit?.candidate(f,'proposed','ASSOCIATION_FIELD_PROPOSED');audit?.leave();
  d.fieldId=f.id;
 };

 for(const r of cells){
  const d=record(r),ownText=text(r),head=headers.get(r.id),above=ancestors(r);
  const contained=cells.some(o=>o.id!==r.id&&area(o.box)<area(r.box)*.8&&intersectionRatio(o.box,r.box)>.95);
  const rowCaption=prompt(ownText)&&cells.some(o=>o.id!==r.id&&leftOf(r,o)&&o.box.width>r.box.width*1.25);
  if(head||contained||!above.length&&(rowCaption||rowAxis(ownText))){
   d.outcome='static';d.reason=head?'COLUMN_HEADER_STATIC':contained?'CONTAINER_REGION_STATIC':'ROW_LABEL_STATIC';
   if(head){d.anchorSource=headerSources.get(r.id);d.label=head.label;d.sourceRegionIds=[r.id];d.sourceTokenIds=(headerWords.get(r.id)??[]).map(t=>t.id);}
   // Only retire generic proposals created in this same automatic pipeline.
   for(let i=output.length-1;i>=0;i--)if(!protectedField(output[i])&&generic(output[i])&&intersectionRatio(output[i].box,r.box)>.8)output.splice(i,1);
   continue;
  }
  let choice:Choice|undefined;
  if(above.length){
   const distinct=new Set(above.map(a=>a.header.label));
   if(distinct.size>1){d.outcome='ambiguous';d.reason='COMPETING_COLUMN_HEADERS';d.sourceRegionIds=above.map(a=>a.region.id);continue;}
   const a=above.sort((a,b)=>a.path.length-b.path.length)[0];
   if(conflicts.has(a.region.id)){d.outcome='ambiguous';d.reason='READER_HEADER_DISAGREEMENT';d.sourceRegionIds=[a.region.id];d.sourceTokenIds=[...(cellWords.get(a.region.id)??[]),...(secondaryWords.get(a.region.id)??[])].map(t=>t.id);continue;}
   if(a.region.box.width>r.box.width*1.5){d.outcome='ambiguous';d.reason='MERGED_HEADER_WITHOUT_LEAF';d.sourceRegionIds=[a.region.id];continue;}
   const row=cells.filter(o=>o.id!==r.id&&leftOf(o,r)&&rowAxis(text(o))).sort((a,b)=>b.box.x-a.box.x)[0];
   const rowStarts:number[]=[];
   for(const o of cells.filter(o=>component.get(o.id)===component.get(r.id)&&o.box.y>=a.region.box.y+a.region.box.height-tol&&o.box.y<=r.box.y+tol).sort((a,b)=>a.box.y-b.box.y))if(!rowStarts.some(y=>Math.abs(y-o.box.y)<tol))rowStarts.push(o.box.y);
   let response=inset(r.box);
   // Keep a printed row ordinal outside the editable name/value area.
   const ordinal=(cellWords.get(r.id)??[]).find(w=>/^\d{1,2}[.)]$/.test(w.text.trim())&&w.box.x<r.box.x+h*2);
   if(ordinal&&a.header.type!=='date'){const x=ordinal.box.x+ordinal.box.width+pad;response={...response,x,width:r.box.x+r.box.width-pad-x};}
   const label=a.header.day&&row?`${a.header.label} — ${clean(text(row))}`:`${a.header.label} — riga ${Math.max(1,rowStarts.findIndex(y=>Math.abs(y-r.box.y)<tol)+1)}`;
   choice={label,type:a.header.type,relation:'column-header',sources:[...a.path,...(row?[row]:[])],anchors:[...(headerWords.get(a.region.id)??[]),...(row?cellWords.get(row.id)??[]:[])],response,anchorSource:headerSources.get(a.region.id)};
  }else{
   const left=cells.filter(o=>o.id!==r.id&&leftOf(o,r)&&o.box.width<r.box.width*.8&&prompt(text(o))).sort((a,b)=>b.box.x-a.box.x);
   if(left.length>1&&Math.abs(left[0].box.x-left[1].box.x)<tol&&key(text(left[0]))!==key(text(left[1]))){d.outcome='ambiguous';d.reason='COMPETING_ROW_LABELS';continue;}
   if(left[0]){const l=left[0];choice={label:clean(text(l)),type:r.box.height>h*2?'textarea':'text',relation:l.box.height>r.box.height*1.5?'merged-row-label':'row-label',sources:[l],anchors:cellWords.get(l.id)??[],response:inset(r.box)};}
   if(!choice&&r.box.width>canvas.width*.35){
    const nearby=tokens.filter(t=>t.box.y+t.box.height<=r.box.y+pad&&r.box.y-t.box.y-t.box.height<h*2.5&&Math.min(t.box.x+t.box.width,r.box.x+r.box.width)-Math.max(t.box.x,r.box.x)>Math.min(t.box.width,r.box.width)*.6&&!cells.some(c=>c.id!==r.id&&intersectionRatio(t.box,c.box)>.55)).sort((a,b)=>b.box.y-a.box.y);
    const anchor=nearby.find(t=>prompt(t.text));
    if(anchor)choice={label:clean(anchor.text),type:r.box.height>h*2?'textarea':'text',relation:'external-prompt',sources:[],anchors:[anchor],response:inset(r.box)};
   }
  }
  if(!choice)continue;
  if(regions.some(c=>c.kind==='checkbox'&&intersectionRatio(c.box,r.box)>.9)){d.outcome='ambiguous';d.reason='COMPOUND_RESPONSE_NEEDS_SPLITTING';continue;}
  // Text beginning with an instruction may itself be a compiled response.
  // Without a separately measured caption, do not silently strip those words.
  if(choice.relation!=='column-header'){
   const instructions=tokens.filter(t=>intersectionRatio(t.box,r.box)>.55&&/^(?:specificare|indicare|descrivere|a cura|descrizione del servizio|tipologia di assistenza|numero di ore)\b/i.test(t.text)&&t.box.y<r.box.y+r.box.height*.55);
   if(instructions.length){d.outcome='ambiguous';d.reason='PRINTED_OR_FILLED_INSTRUCTION';d.sourceTokenIds=instructions.map(t=>t.id);continue;}
  }
  propose(d,choice,r);
 }
 for(const [i,line] of detectWritingLines(canvas,regions,tokens,strokes).entries()){
  const anchors=tokens.filter(t=>/^firma(?:\b|\s)/i.test(clean(t.text))&&t.box.y+t.box.height<=line.y+pad&&line.y-t.box.y-t.box.height<h*3&&Math.min(t.box.x+t.box.width,line.x+line.width)-Math.max(t.box.x,line.x)>Math.min(t.box.width,line.width)*.5).sort((a,b)=>b.box.y-a.box.y);
  if(!anchors[0]||line.width<h*3)continue;
  const d:AssociationDecision={id:`signature-line-${i}`,regionId:null,outcome:'unmatched',reason:'NO_MEASURED_ASSOCIATION',sourceRegionIds:[],sourceTokenIds:[],preservedWords:0};decisions.push(d);
  propose(d,{label:clean(anchors[0].text),type:'text',relation:'signature-line',sources:[],anchors:[anchors[0]],response:{x:line.x,y:Math.max(0,line.y-h*1.3),width:line.width,height:h*1.25}});
 }
 const count=(outcome:AssociationDecision['outcome'])=>decisions.filter(d=>d.outcome===outcome).length;
 return {fields:output,diagnostics:{schema:'PEI_FIELD_ASSOCIATIONS_V1',unit:'px',decisions,summary:{proposed:count('proposed'),enriched:count('enriched'),covered:count('covered'),ambiguous:count('ambiguous'),blocked:count('blocked'),static:count('static'),secondaryHeaders:[...headers.keys()].filter(id=>headerSources.get(id)==='secondary').length}}};
}

export function refreshAssociatedCoverage(coverage:StructuralCoverageDiagnostics|undefined,fields:FormField[],associations?:FieldAssociationDiagnostics):StructuralCoverageDiagnostics|undefined {
 if(!coverage)return undefined;
 const staticIds=new Set(associations?.decisions.filter(d=>d.outcome==='static').map(d=>d.regionId));
 const evidence=coverage.evidence.map(e=>{const ratio=structuralCoverageRatio(e.responseBox,fields);return {...e,coverageAfter:ratio,coveredAfter:ratio>=.65,...(staticIds.has(e.regionId)?{plausible:false,outcome:'static' as const,reason:'ASSOCIATION_STATIC_REGION'}:{})};});
 const plausible=evidence.filter(e=>e.plausible);
 return {...coverage,evidence,summary:{...coverage.summary,plausible:plausible.length,uncoveredBefore:plausible.filter(e=>!e.coveredBefore).length,uncoveredAfter:plausible.filter(e=>!e.coveredAfter).length,recovered:evidence.filter(e=>e.outcome==='recovered'&&fields.some(f=>f.id===e.fieldId)).length,cells:plausible.filter(e=>e.kind==='cell').length,checkboxes:plausible.filter(e=>e.kind==='checkbox').length,lines:plausible.filter(e=>e.kind==='line').length}};
}
