import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Bold,Italic,Underline} from 'lucide-react';
import type {TemplateSchemaField} from '../../core/templateSchemaTypes';
import {applyFieldPresentation,defaultFieldFontSize,type FieldPresentation} from '../../core/fieldPresentation';
interface Props {field:TemplateSchemaField;properties?:FieldPresentation;page:{widthPt:number;heightPt:number};onChange:(patch:FieldPresentation|null)=>void;onClose:()=>void}
export function FieldPropertiesDialog({field,properties,page,onChange,onClose}:Props){
 const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 const [fontDraft,setFontDraft]=useState<string|null>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();close.current();}
   if(e.key==='Tab'){
    const all=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')??[]) as HTMLElement[],first=all[0],last=all[all.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[field.templateFieldId]);
 const effective=applyFieldPresentation(field,properties,page),font=effective.presentation?.fontSizePt??defaultFieldFontSize(field);
 const dimensions=[{key:'widthPt' as const,label:'Larghezza',max:Math.max(1,page.widthPt-field.geometry.xPt)},{key:'heightPt' as const,label:'Altezza',max:Math.max(1,page.heightPt-field.geometry.yPt)}];
 const button='rounded border border-[var(--border)] px-3 py-2 cursor-pointer hover:bg-[var(--hover-bg)]';
 return createPortal(<div className="no-print fixed inset-0 z-[200] bg-black/15" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="field-properties-title" className="absolute top-16 right-5 w-80 max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text)] shadow-2xl p-5 space-y-5">
   <div className="flex justify-between items-start gap-3"><div><h2 id="field-properties-title" className="font-bold">Proprietà campo</h2><p className="text-sm break-words mt-1">{field.label}</p></div><button type="button" aria-label="Chiudi proprietà campo" className={button} onClick={onClose}><X size={16}/></button></div>
   <fieldset className="space-y-4"><legend className="font-semibold text-sm mb-2">Dimensioni</legend>
    {dimensions.map(({key,label,max})=><label key={key} className="block text-sm"><span className="flex justify-between mb-2"><span>{label}</span><output>{(effective.geometry[key]*25.4/72).toFixed(1)} mm</output></span><input type="range" aria-label={label+' campo'} className="w-full accent-amber-700" min={Math.min(6,max)} max={max} step="0.5" value={effective.geometry[key]} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label>)}
   </fieldset>
   <fieldset className="space-y-3" disabled={field.inputType==='checkbox'}><legend className="font-semibold text-sm mb-2">Testo</legend>
    <label className="flex items-center justify-between text-sm">Carattere (pt)<input aria-label="Grandezza carattere in punti" type="number" min="6" max="72" step="0.5" value={fontDraft??font} onFocus={()=>setFontDraft(String(font))} onBlur={()=>setFontDraft(null)} className="w-20 rounded border border-[var(--border)] bg-[var(--input-bg)] p-2" onChange={e=>{setFontDraft(e.target.value);const n=Number(e.target.value);if(n>=6&&n<=72)onChange({fontSizePt:n});}}/></label>
    <input aria-label="Dimensione carattere" type="range" min="6" max="72" step="0.5" value={font} className="w-full accent-amber-700" onChange={e=>onChange({fontSizePt:Number(e.target.value)})}/>
    <div className="flex gap-2">{([{key:'bold',label:'Grassetto',Icon:Bold},{key:'italic',label:'Corsivo',Icon:Italic},{key:'underline',label:'Sottolineato',Icon:Underline}] as const).map(({key,label,Icon})=><button key={key} type="button" aria-label={label} title={label} aria-pressed={!!properties?.[key]} className={button+(properties?.[key]?' bg-amber-100 text-amber-950':'')} onClick={()=>onChange({[key]:!properties?.[key]})}><Icon size={18}/></button>)}</div>
   </fieldset>
   <p className="text-xs text-[var(--text-secondary)]">Le modifiche valgono per questo PEI e saranno incluse nella stampa e nel PDF.</p>
   <div className="flex justify-between gap-2"><button type="button" className={button+' text-sm'} onClick={()=>onChange(null)}>Ripristina</button><button type="button" className={button+' bg-amber-800 text-white text-sm'} onClick={onClose}>Fine</button></div>
  </div>
 </div>,document.body);
}
