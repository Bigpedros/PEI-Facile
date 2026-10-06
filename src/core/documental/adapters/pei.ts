import type {DocumentResult} from '../engine/types';
export function toPeiReview(document:DocumentResult){
 if(document.profile!=='pei')throw new Error('Serve un risultato elaborato con il profilo PEI / CTE.');
 return {schemaVersion:'2.0',model:null,requiresReview:document.pages.some(p=>p.fields.some(f=>f.status==='review')),pages:document.pages.map(page=>({pageNumber:page.pageNumber,background:page.image,width:page.width,height:page.height,physicalSizeMm:page.physicalSizeMm,fields:page.fields.filter(f=>f.status!=='ignored').map(field=>({...field,geometry:{...field.box}}))}))};
}
