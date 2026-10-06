import {describe,it,expect} from 'vitest';
import {classifyDetectionCandidates,isProtectedDetectionField} from '../assistedFieldDetectionService';
import type {FieldGeometry} from '../../data/geometry/types';
const field=(id:string,x:number,status='PROPOSED')=>({fieldId:id,pageNumber:1,xPt:x,yPt:100,widthPt:80,heightPt:20,label:'Nome',calibrationStatus:status,detectionSource:'DOCUMENTAL_020'} as FieldGeometry);
describe('Diagnostica del rilevamento e ricostruzione',()=>{
 it('conteggia le proposte automatiche già visibili senza scartarle come campi confermati',()=>{
  const existing=[field('auto',10),field('confirmed',110,'CONFIRMED'),field('rejected',210,'REJECTED')];
  const candidates=[field('a',10),field('b',110),field('c',210),field('new',310)];
  const result=classifyDetectionCandidates(candidates,existing,1);
  expect(result.proposals.map(f=>f.fieldId)).toEqual(['a','new']);
  expect(result.matchedAutomatic).toHaveLength(1);expect(result.newProposals).toHaveLength(1);expect(result.protectedDuplicates).toHaveLength(2);
  expect(isProtectedDetectionField(existing[0])).toBe(false);expect(isProtectedDetectionField(existing[1])).toBe(true);expect(isProtectedDetectionField(existing[2])).toBe(true);
 });
});
