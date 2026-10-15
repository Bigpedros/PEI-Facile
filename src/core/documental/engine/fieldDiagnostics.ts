import type {Box,FormField,Region,Token} from './types';
import {intersectionRatio} from './geometry';

export type InferenceCategory='geometry'|'association'|'filter'|'proposal';
export interface FieldAttempt {
 regionId:string|null;fieldId:string;box:Box;outcome:'proposed'|'excluded';
 reason:string;category:InferenceCategory;duplicateOf?:string;
}
export interface RegionDecision {
 regionId:string;kind:Region['kind'];box:Box;positionedWords:number;
 outcome:'proposed'|'excluded';reason:string;category:InferenceCategory;
 proposedFieldIds:string[];overlappingFieldIds:string[];details:Record<string,number|string|boolean>;
}
export interface FieldInferenceDiagnostics {
 schema:'PEI_FIELD_INFERENCE_AUDIT_V1';unit:'px';width:number;height:number;
 regions:RegionDecision[];attempts:FieldAttempt[];
 summary:{regions:number;proposedRegions:number;excludedRegions:number;fields:number;reasons:Record<string,number>};
 ocrObservations:{positionedWords:number;lowConfidenceWords:number;oversizedTokenIds:string[]};
}

/** Passive observer: never changes candidates, tokens, ordering or thresholds. */
export class FieldInferenceAudit {
 private active:string|null=null;
 private decisions=new Map<string,RegionDecision>();
 private attempts:FieldAttempt[]=[];
 constructor(private width:number,private height:number,regions:Region[],private tokens:Token[]){
  const words=tokens.flatMap(t=>t.fragments??[t]);
  for(const r of regions)this.decisions.set(r.id,{
   regionId:r.id,kind:r.kind,box:{...r.box},
   positionedWords:words.filter(t=>intersectionRatio(t.box,r.box)>.55).length,
   outcome:'excluded',reason:'NO_MATCHING_FIELD_RULE',category:'association',
   proposedFieldIds:[],overlappingFieldIds:[],details:{},
  });
 }
 enter(region:Region){this.active=region.id;}
 leave(){this.active=null;}
 reject(reason:string,category:InferenceCategory='association',details:RegionDecision['details']={}){
  const entry=this.active?this.decisions.get(this.active):undefined;
  if(entry&&entry.proposedFieldIds.length===0){entry.reason=reason;entry.category=category;entry.details={...details};}
 }
 candidate(field:FormField,outcome:FieldAttempt['outcome'],reason:string,duplicateOf?:string){
  const category:InferenceCategory=outcome==='proposed'?'proposal':reason==='FIELD_TOO_SMALL_AFTER_CLAMP'?'geometry':'filter';
  this.attempts.push({regionId:this.active,fieldId:field.id,box:{...field.box},outcome,reason,category,...(duplicateOf?{duplicateOf}:{})});
  const entry=this.active?this.decisions.get(this.active):undefined;
  if(entry&&outcome==='proposed'){
   entry.outcome='proposed';entry.reason='FIELD_PROPOSED';entry.category='proposal';entry.proposedFieldIds.push(field.id);
  }else this.reject(reason,category);
 }
 finish(fields:FormField[]):FieldInferenceDiagnostics{
  const regions=[...this.decisions.values()].map(r=>({...r,
   overlappingFieldIds:fields.filter(f=>intersectionRatio(r.box,f.box)>.55||intersectionRatio(f.box,r.box)>.55).map(f=>f.id),
  }));
  const reasons:Record<string,number>={};for(const r of regions)reasons[r.reason]=(reasons[r.reason]??0)+1;
  const words=this.tokens.flatMap(t=>t.fragments??[t]);
  return {schema:'PEI_FIELD_INFERENCE_AUDIT_V1',unit:'px',width:this.width,height:this.height,regions,attempts:this.attempts,
   summary:{regions:regions.length,proposedRegions:regions.filter(r=>r.outcome==='proposed').length,excludedRegions:regions.filter(r=>r.outcome==='excluded').length,fields:fields.length,reasons},
   ocrObservations:{positionedWords:words.length,lowConfidenceWords:words.filter(t=>t.confidence!==null&&t.confidence<45).length,
    oversizedTokenIds:words.filter(t=>t.box.width>this.width*.65&&t.box.width>t.box.height*Math.max(2,t.text.length*.85)).map(t=>t.id)},
  };
 }
}
