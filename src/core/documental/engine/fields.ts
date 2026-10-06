import type {Box,FormField,Region,Token} from './types';
import {intersectionRatio,tokensToText} from './geometry';
import {rasterStrokes} from './strokes';
const labelWords=/\b(nome|cognome|data|nato|nata|nascita|luogo|indirizzo|residenza|telefono|cellulare|email|e-mail|classe|sezione|scuola|istituto|codice|firma|note|osservazioni|descrizione|obiettivi|risposta|motivazione|comune|provincia|cap|anno|alunno|alunna|bambino|bambina|plesso|sede|docente|genitore|consenso)\b/i;
export function isLabel(text:string):boolean {
 const s=text.trim();
 if(!s||s.length>=110||/^(?:\d+[.)]\s|(?:indicare|descrivere|specificare|compilare|barrare|riportare|a cura|ai sensi|istruzioni)\b)/i.test(s))return false;
 if(/^(?:nella fase|in questa fase|fase transitoria|istruzioni|avvertenze)\b/i.test(s))return false;
 if(/[:?]\s*$/.test(s))return true;
 // A keyword embedded in a heading/narrative is not itself a prompt.
 return /^(?:nome(?: e cognome)?|cognome(?: e nome)?|data(?: di nascita)?|luogo(?: di nascita)?|indirizzo|residenza|telefono|cellulare|email|e-mail|classe|sezione|scuola|istituto|codice(?: fiscale)?|firma|note(?: cliniche)?|osservazioni|descrizione|obiettivi|risposta|motivazione|comune|provincia|cap|anno scolastico|alunn[oa](?:\/a)?|bambin[oa](?:\/?a)?|plesso(?: o sede)?|docente|genitore|consenso)$/i.test(s);
}
const clean=(s:string)=>s.replace(/[_\.]{3,}/g,'').replace(/\s+/g,' ').trim().replace(/[,:;]$/, '');
export function fieldType(label:string,height:number,typicalHeight:number):FormField['type']{return /\bdata\b|(?:nato|nata)\s+il/i.test(label)?'date':((/note|osservazioni|descrizione|obiettivi|motivazione|risposta/i.test(label)&&height>typicalHeight*2)||(!/nome|cognome|classe|sezione|indirizzo|telefono|email|codice|luogo|comune|provincia|firma/i.test(label)&&height>typicalHeight*6))?'textarea':'text';}
export function semanticKey(label:string):string{return label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
export function makeField(box:Box,label='Campo da verificare',origin:FormField['origin']='manual'):FormField{return{id:crypto.randomUUID(),box:{...box},label,semanticKey:semanticKey(label),type:'text',value:'',originalValue:'',observedText:'',status:'review',origin,confidence:origin==='manual'?1:.4,reason:origin==='manual'?'Creato manualmente.':'Candidato da verificare.',options:[],required:false,fontSize:12,maskOriginal:false};}
function typical(tokens:Token[]):number {const heights=tokens.map(t=>t.box.height).filter(n=>n>5).sort((a,b)=>a-b);return heights[Math.floor(heights.length/2)]||20;}
function inset(b:Box,p=4):Box{return{x:b.x+p,y:b.y+p,width:Math.max(6,b.width-p*2),height:Math.max(6,b.height-p*2)};}
function inside(tokens:Token[],box:Box){return tokens.filter(t=>intersectionRatio(t.box,box)>.55);}
function labelNearby(box:Box,tokens:Token[]):string|null {
 const left=tokens.filter(t=>isLabel(t.text)&&t.box.x+t.box.width<=box.x+6&&box.x-t.box.x-t.box.width<250&&Math.abs((t.box.y+t.box.height/2)-(box.y+box.height/2))<Math.max(box.height/2,t.box.height*1.5));
 if(left.length)return left.sort((a,b)=>b.box.x-a.box.x)[0].text;
 const above=tokens.filter(t=>isLabel(t.text)&&t.box.y+t.box.height<=box.y+4&&box.y-t.box.y-t.box.height<t.box.height*1.2&&t.box.x<box.x+box.width&&t.box.x+t.box.width>box.x);
 return above.sort((a,b)=>b.box.y-a.box.y)[0]?.text||null;
}
function checkedState(canvas:HTMLCanvasElement,box:Box):boolean|null {
 const ctx=canvas.getContext('2d')!;const b=inset(box,Math.min(box.width,box.height)*.25);const w=Math.max(1,Math.floor(b.width)),h=Math.max(1,Math.floor(b.height));const pixels=ctx.getImageData(Math.max(0,Math.floor(b.x)),Math.max(0,Math.floor(b.y)),w,h).data;let dark=0;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]<420)dark++;
 const ratio=dark/(w*h);return ratio<.025?false:ratio>.1?true:null;
}
export function detectWritingLines(canvas:HTMLCanvasElement,regions:Region[],tokens:Token[]):Box[]{
 const strokes=rasterStrokes(canvas),scale=strokes.scale,horizontal=[...strokes.horizontal,...strokes.writing];const result:Box[]=[];const words=tokens.flatMap(t=>t.fragments||[t]);
 for(const line of [...horizontal].sort((a,b)=>(b.end-b.start)-(a.end-a.start))){
  if(line.end-line.start<30)continue;
  const box={x:line.start/scale,y:line.pos/scale,width:(line.end-line.start)/scale,height:1/scale};
  const tableEdge=regions.some(r=>Math.min(box.x+box.width,r.box.x+r.box.width)-Math.max(box.x,r.box.x)>8&&(Math.abs(box.y-r.box.y)<8/scale||Math.abs(box.y-r.box.y-r.box.height)<8/scale));
  // OCR can include the underline in the label's bounding box. Only reject
  // strokes through the body of letters, not strokes at/below the baseline.
  const textEdge=words.some(t=>{
   if(/^[_.\s]+$/.test(t.text))return false;
   const oversized=t.box.width>t.box.height*Math.max(2,t.text.length*.85);
   return box.y>t.box.y-3&&box.y<t.box.y+t.box.height*(oversized?.72:1)+3&&Math.min(box.x+box.width,t.box.x+t.box.width)-Math.max(box.x,t.box.x)>Math.min(box.width,t.box.width)*.25;
  });
  if(!tableEdge&&!textEdge&&!result.some(b=>Math.abs(b.y-box.y)<6/scale&&Math.abs(b.x-box.x)<10/scale))result.push(box);
 }
 return result.slice(0,200);
}
export function inferFields(canvas:HTMLCanvasElement,tokens:Token[],regions:Region[]):FormField[]{
 const fields:FormField[]=[];const textHeight=typical(tokens),margin=Math.max(4,textHeight*.18);
 const add=(field:FormField)=>{field.box.x=Math.max(0,field.box.x);field.box.y=Math.max(0,field.box.y);field.box.width=Math.min(field.box.width,canvas.width-field.box.x);field.box.height=Math.min(field.box.height,canvas.height-field.box.y);if(field.box.width<6||field.box.height<6)return;if(fields.some(f=>intersectionRatio(field.box,f.box)>.6||intersectionRatio(f.box,field.box)>.8))return;fields.push(field);};
 // OCR often groups a bare PEI prompt and its existing response on one line.
 // Recover only explicit known prompts; keep original word boxes when available.
 for(const t of tokens){
  const split=t.text.match(/^(BAMBINO\/A|ALUNNO\/A|SEZIONE|PLESSO(?: O SEDE)?|ANNO SCOLASTICO|NOME(?: E COGNOME)?|COGNOME(?: E NOME)?)\s*:?\s+(.+)$/i);
  if(isLabel(clean(t.text))||!split||!clean(split[2])||/[_\.]{3,}/.test(split[2])||/^(?:di nascita|e cognome|del |della |da |inserire|indicare|descrivere)/i.test(split[2]))continue;
  const start=t.text.indexOf(split[2]);let box:Box;
  if(t.fragments){let pos=0;const values=t.fragments.filter(word=>{const end=pos+word.text.length;const keep=end>start;pos=end+1;return keep;});if(!values.length)continue;
   const x=Math.min(...values.map(v=>v.box.x)),y=Math.min(...values.map(v=>v.box.y));box={x,y,width:Math.max(...values.map(v=>v.box.x+v.box.width))-x,height:Math.max(...values.map(v=>v.box.y+v.box.height))-y};
  }else{const ctx=canvas.getContext('2d')!;ctx.font=`${t.box.height}px Arial`;const ratio=ctx.measureText(t.text.slice(0,start)).width/(ctx.measureText(t.text).width||1);box={x:t.box.x+t.box.width*ratio,y:t.box.y,width:t.box.width*(1-ratio),height:t.box.height};}
  const f=makeField({...box,y:Math.max(0,box.y-margin),height:box.height+margin*2},clean(split[1]),'inline');f.type=fieldType(f.label,f.box.height,textHeight);f.value=clean(split[2]);f.originalValue=f.value;f.observedText=f.value;f.maskOriginal=true;f.confidence=t.fragments?.7:.55;f.reason=t.fragments?'Valore dopo una etichetta PEI; confine ricavato dalle parole OCR, da verificare.':'Valore dopo una etichetta PEI nello stesso elemento PDF; confine stimato, da verificare.';add(f);
 }
 // Explicit writing marks within native PDF spans, before region heuristics.
 // Boundaries estimated from font widths remain proposals, never confirmed PEI bindings.
 for(const t of tokens.filter(t=>t.source==='pdf')){
  const runs=[...t.text.matchAll(/_{3,}/g)];let previousEnd=0;
  for(const run of runs){const start=run.index!;const label=clean(t.text.slice(previousEnd,start));previousEnd=start+run[0].length;if(!isLabel(label))continue;
   const ctx=canvas.getContext('2d')!;ctx.font=`${t.box.height}px Arial`;
   const total=ctx.measureText(t.text).width||1;
   const x=t.box.x+t.box.width*ctx.measureText(t.text.slice(0,start)).width/total;
   const width=t.box.width*ctx.measureText(run[0]).width/total;
   const f=makeField({x,y:Math.max(0,t.box.y-textHeight*.15),width,height:textHeight*1.3},label,'line');
   f.type=fieldType(label,f.box.height,textHeight);f.confidence=.55;f.reason='Segnaposto sottolineato nel testo PDF; confine stimato, da verificare.';add(f);
  }
  if(!/^\[\s*[xX]?\s*\]$/.test(t.text.trim()))continue;
  const right=tokens.filter(n=>n.id!==t.id&&n.box.x>=t.box.x+t.box.width-2&&n.box.x-t.box.x-t.box.width<textHeight*3&&Math.abs(n.box.y-t.box.y)<textHeight).sort((a,b)=>a.box.x-b.box.x)[0];
  if(!right||!/^(?:redatto in data|da redigere|sì|si|no|maschio|femmina|altro)\b/i.test(clean(right.text)))continue;
  const left=tokens.filter(n=>n.source==='pdf'&&n.box.x<t.box.x&&Math.abs(n.box.y-t.box.y)<textHeight*.7).sort((a,b)=>a.box.x-b.box.x);
  // PDF small caps may split the initial capital from the rest of the word.
  const caption=left.map((n,i)=>(i&&n.box.x-left[i-1].box.x-left[i-1].box.width>textHeight*.25?' ':'')+n.text).join('');
  const context=caption.match(/P\s*ROGETTO\s*I\s*NDIVIDUALE/i)?'PROGETTO INDIVIDUALE':undefined;
  const label=(context?context+': ':'')+clean(right.text);
  const f=makeField({...t.box},label,'checkbox');f.type='checkbox';f.value=/x/i.test(t.text);f.originalValue=f.value;f.observedText=t.text;f.maskOriginal=true;f.confidence=.8;f.reason='Casella esplicita tra parentesi nel testo PDF, associata a una scelta adiacente.';add(f);
 }
 for(const region of regions){
 if(region.kind==='checkbox'){
 const captionTokens=tokens.flatMap(t=>t.fragments||[t]);
 const next=captionTokens.filter(t=>t.box.x>=region.box.x+region.box.width-2&&t.box.x-region.box.x-region.box.width<250&&Math.abs(t.box.y-region.box.y)<textHeight).sort((a,b)=>a.box.x-b.box.x);
 const stop=regions.filter(r=>r.kind==='checkbox'&&r.box.x>region.box.x+region.box.width&&Math.abs(r.box.y-region.box.y)<textHeight).sort((a,b)=>a.box.x-b.box.x)[0]?.box.x??canvas.width;
 if(next[0]&&/^DATA\b/.test(next[0].text)&&regions.some(r=>r.kind==='cell'&&intersectionRatio(region.box,r.box)>.9))continue;
 const label=(next[0]?captionTokens.filter(t=>t.lineId===next[0].lineId&&t.box.x>=next[0].box.x&&t.box.x<stop).sort((a,b)=>a.box.x-b.box.x).map(t=>t.text).join(' '):'')||'Selezione da verificare';if(/^DATA\s+FIRMA\b/i.test(label))continue;const f=makeField({...region.box},label.replace(/\s*[C([]\]?\s*$/,'').trim(),'checkbox');const state=checkedState(canvas,region.box);f.type='checkbox';f.value=state??false;f.originalValue=f.value;f.maskOriginal=true;f.confidence=state===null?.4:.85;f.reason=state===null?'Quadratino rilevato; stato ambiguo da verificare.':'Quadratino e contenuto interno rilevati.';add(f);continue;
 }
 if(tokens.some(t=>/^\s*[*•]?\s*(?:specificare|indicare|compilare|istruzioni|a cura)\b/i.test(t.text)&&intersectionRatio(t.box,region.box)>.1))continue;
 const content=inside(tokens,region.box);const rawText=tokensToText(content).trim();const text=clean(rawText);
 // Missing OCR coordinates do not turn printed instructions into an empty cell.
 if(!text){const b=inset(region.box,margin*2),pixels=canvas.getContext('2d')!.getImageData(Math.floor(b.x),Math.floor(b.y),Math.max(1,Math.floor(b.width)),Math.max(1,Math.floor(b.height))).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]<600)ink++;if(ink/(pixels.length/4)>.015)continue;}
 const left=regions.filter(r=>r.kind==='cell'&&r.box.x+r.box.width<=region.box.x+8&&region.box.x-r.box.x-r.box.width<15&&Math.abs(r.box.y-region.box.y)<10&&isLabel(r.text)).sort((a,b)=>b.box.x-a.box.x)[0];
 const above=regions.filter(r=>r.kind==='cell'&&r.box.y+r.box.height<=region.box.y+8&&region.box.y-r.box.y-r.box.height<15&&Math.abs(r.box.x-region.box.x)<15&&isLabel(r.text)&&r.box.height<textHeight*4).sort((a,b)=>b.box.y-a.box.y)[0];
 const label=left?.text||above?.text;
 if(label){const f=makeField(inset(region.box,margin),clean(label),'cell');f.type=fieldType(label,f.box.height,textHeight);f.value=rawText;f.originalValue=rawText;f.observedText=rawText;f.maskOriginal=!!text;f.confidence=.85;f.reason='Cella associata a etichetta adiacente; contenuto presente conservato.';add(f);continue;}
 if(!text){const nearby=labelNearby(region.box,tokens);if(!nearby)continue;const f=makeField(inset(region.box,margin),clean(nearby||'Campo da verificare'),'cell');f.type=fieldType(f.label,f.box.height,textHeight);f.confidence=nearby?.7:.3;f.reason=nearby?'Cella vuota vicino a una possibile etichetta.':'Cella vuota senza etichetta certa: potrebbe essere uno spazio grafico.';add(f);continue;}
 // Label-only cell with a separate cell on the right must remain static.
 const right=regions.some(r=>Math.abs(r.box.x-region.box.x-region.box.width)<10&&Math.abs(r.box.y-region.box.y)<10);
 if(isLabel(text)&&!right&&content.length){
 const last=Math.max(...content.map(t=>t.box.x+t.box.width));const remaining=region.box.x+region.box.width-margin-last;
 if(remaining>textHeight*3){const f=makeField({x:last+margin,y:region.box.y+margin,width:remaining-margin,height:region.box.height-margin*2},text,'inline');f.type=fieldType(text,f.box.height,textHeight);f.confidence=.6;f.reason='Spazio libero dopo un’etichetta nella stessa cella.';add(f);}
 }
 }
 for(const line of detectWritingLines(canvas,regions,tokens)){
 const box={x:line.x,y:Math.max(0,line.y-textHeight*1.3),width:line.width,height:textHeight*1.3};
 const row=tokens.filter(t=>!/^[_.\s]+$/.test(t.text)&&t.box.x<line.x&&line.x-t.box.x-t.box.width<textHeight*4&&Math.abs(t.box.y+t.box.height-line.y)<textHeight*1.2).sort((a,b)=>b.box.x-a.box.x);
 const label=row.find(t=>isLabel(clean(t.text))||/\b(?:data|firma|codice sostitutivo personale|verbale allegato)\b/i.test(t.text))?.text||labelNearby(box,tokens);if(!label)continue;const f=makeField(box,clean(label||'Risposta sulla riga').replace(/^BAMBINOA$/i,'BAMBINO/A'),'line');f.type=fieldType(f.label,box.height,textHeight);f.confidence=label?.8:.4;f.reason='Riga continua o tratteggiata fuori dai bordi delle celle.';add(f);
 }
 // Already filled unboxed spans are preserved; native span splitting is an estimate to review.
 for(const t of tokens){
 if(regions.some(r=>intersectionRatio(t.box,r.box)>.5))continue;
 if(regions.some(r=>r.kind==='checkbox'&&t.box.x>=r.box.x+r.box.width-4&&t.box.x-r.box.x-r.box.width<250&&Math.abs(t.box.y-r.box.y)<textHeight))continue;
 const split=t.text.match(/^(.{1,70}?:)\s*(.+)$/);
 if(split&&labelWords.test(split[1])&&!/^[([\]\s0-9]*$/.test(split[2])){const ratio=(t.text.indexOf(split[2]))/t.text.length;const b={x:t.box.x+t.box.width*ratio,y:Math.max(0,t.box.y-margin),width:Math.max(12,t.box.width*(1-ratio)),height:t.box.height+margin*2};const f=makeField(b,clean(split[1]),'inline');f.type=fieldType(f.label,b.height,textHeight);f.value=clean(split[2]);f.originalValue=f.value;f.observedText=String(f.value);f.maskOriginal=!!f.value;f.confidence=.55;f.reason='Valore nello stesso elemento PDF: confine tra etichetta e risposta stimato, da verificare.';add(f);continue;}
 if(!isLabel(t.text))continue;
 const next=tokens.filter(o=>o.id!==t.id&&o.box.x>=t.box.x+t.box.width-2&&o.box.x-t.box.x-t.box.width<textHeight*3&&Math.abs(o.box.y-t.box.y)<textHeight*.7&&!isLabel(o.text)).sort((a,b)=>a.box.x-b.box.x)[0];
 // A continuation of a prompt is not a filled value (e.g. separate PDF spans ‘data’ / ‘di nascita’).
 if(next&&isLabel(clean(t.text.trim()+' '+next.text.trim())))continue;
 if(next&&/[:?]\s*$/.test(t.text)){const row=tokens.filter(o=>o.box.x>=next.box.x&&Math.abs(o.box.y-next.box.y)<textHeight*.7&&!isLabel(o.text));const max=Math.max(...row.map(o=>o.box.x+o.box.width));const b={x:next.box.x,y:Math.max(0,next.box.y-margin),width:max-next.box.x+margin,height:Math.max(...row.map(o=>o.box.height))+margin*2};const f=makeField(b,clean(t.text),'inline');f.type=fieldType(f.label,b.height,textHeight);f.value=row.map(o=>o.text).join(' ');f.originalValue=f.value;f.observedText=String(f.value);f.maskOriginal=true;f.confidence=.6;f.reason='Testo vicino a un’etichetta; verificare che sia una risposta già compilata.';add(f);}
 }
 // Unboxed labels: only propose a nearby area when pixels show enough whitespace.
 const ctx=canvas.getContext('2d')!;
 for(const t of tokens){if(/^plesso$/i.test(t.text)&&tokens.some(o=>/^o\s+sede[,:;]?$/i.test(o.text)&&o.box.x>=t.box.x&&o.box.x-t.box.x-t.box.width<textHeight*2&&Math.abs(o.box.y-t.box.y)<textHeight))continue;if(tokens.some(o=>o.id!==t.id&&isLabel(clean(t.text+' '+o.text))&&o.box.x>=t.box.x+t.box.width-2&&o.box.x-t.box.x-t.box.width<textHeight*2&&Math.abs(o.box.y-t.box.y)<textHeight))continue;if(!isLabel(t.text)||(!labelWords.test(t.text)&&!/^(?:nome(?: e cognome)?|cognome(?: e nome)?|bambin[oa]\/?a?|alunn[oa]\/?a?|classe|sezione|plesso(?: o sede)?|codice fiscale|anno scolastico)$/i.test(t.text.trim())))continue;if(regions.some(r=>intersectionRatio(t.box,r.box)>.5))continue;
 if(regions.some(r=>r.kind==='checkbox'&&t.box.x>=r.box.x+r.box.width-4&&t.box.x-r.box.x-r.box.width<250&&Math.abs(t.box.y-r.box.y)<textHeight))continue;
 const sameLine=tokens.filter(other=>other.id!==t.id&&other.box.x>t.box.x+t.box.width&&Math.abs(other.box.y-t.box.y)<textHeight*.6).sort((a,b)=>a.box.x-b.box.x);
 const x=t.box.x+t.box.width+margin;const end=sameLine[0]?sameLine[0].box.x-margin:Math.min(canvas.width*.92,x+canvas.width*.35);const width=end-x;if(width<textHeight*3)continue;
 const box={x,y:t.box.y-margin,width,height:textHeight*1.7};if(box.y<0||box.y+box.height>canvas.height)continue;
 const pixels=ctx.getImageData(Math.floor(x),Math.floor(box.y),Math.floor(width),Math.floor(box.height)).data;let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]<400)dark++;
 if(dark/(pixels.length/4)>.008)continue;const f=makeField(box,clean(t.text),'inline');f.type=fieldType(f.label,box.height,textHeight);f.confidence=.5;f.reason='Spazio bianco dopo un’etichetta; da distinguere da un margine.';add(f);
 }
 for(const f of fields)if(f.type==='date'&&typeof f.value==='string'){const m=f.value.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);if(m){f.value=`${m[3]}-${m[2]}-${m[1]}`;f.originalValue=f.value;}}
 return fields.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x);
}
