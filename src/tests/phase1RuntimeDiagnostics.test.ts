import {describe,it,expect} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {collectPageRuntimeDiagnostics} from '../core/assistedFieldDetectionService';
import {detectCanonicalPageFields} from '../core/documental/detection';

describe('Fase 1: export diagnostico dalla pipeline PDF',()=>{
 it('esporta decisioni, ID e stato lettore senza alterare le proposte',async()=>{
  const pdf=await PDFDocument.create();const p=pdf.addPage([595,842]);
  p.drawText('Nome',{x:40,y:730,size:12});p.drawRectangle({x:140,y:710,width:300,height:45,borderWidth:1});
  const doc=await pdfjs.getDocument({data:new Uint8Array(await pdf.save())}).promise;
  try{
   const page=await doc.getPage(1),plain=await detectCanonicalPageFields(page,1);
   const diagnostic=await collectPageRuntimeDiagnostics(page,{pageNumber:1});
   expect(diagnostic.diagnosticSchema).toBe('PEI_CALIBRATION_AUDIT_V1');
   expect(diagnostic.structuralCoverage?.schema).toBe('PEI_STRUCTURAL_COVERAGE_V1');
   expect(diagnostic.pipelineTrace.steps.some(s=>s.step==='structuralCoverageRecovery')).toBe(true);
   expect(diagnostic.secondReader).toMatchObject({availability:'provided-unverified',execution:'not-needed',reason:'NATIVE_PDF_TEXT'});
   const audit=diagnostic.fieldInference!.firstPass!;
   expect(audit.summary.regions).toBe(diagnostic.rasterBoxes.length);expect(audit.regions.every(r=>!!r.reason)).toBe(true);
   expect(diagnostic.finalProposedFields).toHaveLength(plain.fields.length);
   expect(diagnostic.finalProposedFields.length).toBeGreaterThan(0);
   for(const f of diagnostic.finalProposedFields){const expected=plain.fields.find(p=>p.fieldId===f.fieldId)!;
    expect(f.bbox).toEqual({xPt:expected.xPt,yPt:expected.yPt,widthPt:expected.widthPt,heightPt:expected.heightPt});
   }
   expect(diagnostic.fieldInference?.fieldIdMap.some(m=>m.retainedInPage&&m.candidateFieldId)).toBe(true);
   const fields=await collectPageRuntimeDiagnostics(page,{pageNumber:1,existingFields:plain.fields.map(f=>({...f,calibrationStatus:'CONFIRMED'}))});
   expect(fields.finalProposedFields).toHaveLength(0);
   expect(fields.pipelineTrace.discarded.some(d=>d.discardedReason==='PROTECTED_EXISTING_FIELD')).toBe(true);
  }finally{await doc.destroy();}
 },30000);
});
