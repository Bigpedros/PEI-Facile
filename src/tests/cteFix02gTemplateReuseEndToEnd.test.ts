/**
 * @license
 * PEI FACILE — CTE-FIX-02G
 * Integration Test for Automatic Template Reuse and Layout Matching
 * 
 * Objectives:
 * 1. Model calibration of Document A (e.g. PEI Comune di Roma for Student 1)
 * 2. Persist calibration to LocalStorage (Schema) and IndexedDB (Binary/Metadata)
 * 3. Clear transient/runtime memory to simulate browser restart
 * 4. Ingest Document B (structurally equivalent PEI with different student name, file name, and SHA-256)
 * 5. Verify if the acquisition pipeline automatically recognizes B as matching A's template and applies the calibration
 * 
 * Note: This is the RED phase. The test is expected to fail on the automatic matching step
 * because the matcher is not yet integrated into the normal ingestion/classification pipeline.
 */

import { describe, it, expect, vi } from 'vitest';
import { processDocumentAcquisition } from '../core/documentAcquisitionService';
import { saveCustomTemplate, getCustomTemplate, listAllCustomTemplates, clearAllCustomTemplates } from '../core/templateStorage';
import { saveTemplateSchema, getTemplateSchema, createTemplateSchemaFromCandidates } from '../core/templateSchemaService';
import type { ModelGeometry, PageGeometry, FieldGeometry } from '../data/geometry/types';
import type { TemplateSchema } from '../core/templateSchemaTypes';
import type { PeiModelDefinition, SchoolOrder } from '../types/pei';
import { computeSha256 } from '../core/templateSourceResolver';
import { MATCH_THRESHOLDS } from '../core/canonical-template-engine/matcher/thresholds';

/**
 * Generates a compliant synthetic PDF byte stream representing a PEI form.
 */
function createSyntheticPeiPdf(studentName: string): Uint8Array {
  const fontObjId = 3;
  const objects: Array<{ id: number; content: string }> = [
    {
      id: fontObjId,
      content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    },
    {
      id: 2,
      content: `<< /Type /Pages /Kids [4 0 R] /Count 1 >>`,
    },
    {
      id: 1,
      content: `<< /Type /Catalog /Pages 2 0 R >>`,
    },
  ];

  // Specific text that gives layout identity
  const textStream = `BT /F1 12 Tf 50 800 Td (COMUNE DI ROMA - PIANO EDUCATIVO INDIVIDUALIZZATO) Tj 50 750 Td (ALUNNO: ${studentName}) Tj 50 700 Td (CODICE FISCALE: ________________) Tj ET`;
  
  objects.push({
    id: 5,
    content: `<< /Length ${textStream.length} >>\nstream\n${textStream}\nendstream`,
  });

  objects.push({
    id: 4,
    content: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`,
  });

  objects.sort((a, b) => a.id - b.id);

  let pdfStr = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach((obj) => {
    offsets.push(pdfStr.length);
    pdfStr += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
  });

  const startXref = pdfStr.length;
  pdfStr += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const offset = String(offsets[i]).padStart(10, '0');
    pdfStr += `${offset} 00000 n \n`;
  }

  pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  return new TextEncoder().encode(pdfStr);
}

describe('CTE-FIX-02G — Automatic Template Reuse Integration Test (RED PHASE)', () => {

  it('proves that Document B (equivalent) fails to automatically recall Document A’s calibration through the normal acquisition pipeline', async () => {
    // 1. Prepare Document A (Comune di Roma template with Alunno Rossi)
    const pdfBytesA = createSyntheticPeiPdf('Rossi Giovanni');
    const hashA = await computeSha256(pdfBytesA);
    const templateId = 'custom_comune_roma_pei';

    // 2. Define custom model definition & calibrated geometry
    const initialPages: PageGeometry[] = [
      {
        pageNumber: 1,
        widthPt: 595.32,
        heightPt: 841.92,
        fields: []
      }
    ];

    const calibratedCandidates = [
      {
        fieldId: 'fld_student_name',
        label: 'Cognome e Nome Alunno',
        pageNumber: 1,
        xPt: 100,
        yPt: 745,
        widthPt: 300,
        heightPt: 20,
        anchorText: 'ALUNNO:',
        fieldType: 'TEXT_SHORT',
        derivationMethod: 'TEXT_ANCHOR' as const,
        confidence: 0.98,
        status: 'MAPPED' as const,
        calibrationStatus: 'CONFIRMED' as const
      },
      {
        fieldId: 'fld_fiscal_code',
        label: 'Codice Fiscale Alunno',
        pageNumber: 1,
        xPt: 160,
        yPt: 695,
        widthPt: 250,
        heightPt: 20,
        anchorText: 'CODICE FISCALE:',
        fieldType: 'TEXT_SHORT',
        derivationMethod: 'TEXT_ANCHOR' as const,
        confidence: 0.98,
        status: 'MAPPED' as const,
        calibrationStatus: 'CONFIRMED' as const
      }
    ];

    // 3. Create the calibrated TemplateSchema for Document A
    const schemaA = createTemplateSchemaFromCandidates(
      templateId,
      'pei_roma_rossi_giovanni.pdf',
      hashA,
      initialPages,
      calibratedCandidates,
      'CALIBRATED', // Mark as fully approved
      'A2'
    );
    schemaA.geometryValidationStatus = 'PASS';
    schemaA.visualReviewStatus = 'COMPLETED';

    const customModelDefA: PeiModelDefinition = {
      id: templateId,
      name: 'Modello Roma Capitale - Servizi Sociali',
      schoolOrder: 'A2',
      originType: 'INSTITUTION',
      originName: 'Amministrazione Centrale Capitolina',
      version: '1.0',
      acquisitionDate: '2026-09-27',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: hashA,
      sourceSha256: hashA,
      templateId: templateId,
      geometryMappingId: templateId,
      calibrationStatus: 'CALIBRATED',
      description: 'Schema calibrato per il Comune di Roma.',
      usedCount: 1
    };

    // 4. Save Document A calibration through official services
    await saveCustomTemplate(
      {
        templateId,
        name: customModelDefA.name,
        schoolOrder: customModelDefA.schoolOrder,
        sourceFileName: 'pei_roma_rossi_giovanni.pdf',
        sourceSha256: hashA,
        fileSizeBytes: pdfBytesA.byteLength,
        pageCount: 1,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationStatus: 'CALIBRATED',
        pages: initialPages.map(p => ({
          ...p,
          fields: calibratedCandidates.map(c => ({
            fieldId: c.fieldId,
            label: c.label,
            pageNumber: c.pageNumber,
            xPt: c.xPt,
            yPt: c.yPt,
            widthPt: c.widthPt,
            heightPt: c.heightPt,
            anchorText: c.anchorText,
            derivationMethod: c.derivationMethod,
            confidence: c.confidence,
            status: c.status,
            calibrationStatus: c.calibrationStatus
          }))
        }))
      },
      pdfBytesA
    );
    await saveTemplateSchema(schemaA);

    // Verify template A is successfully persisted
    const savedSchema = await getTemplateSchema(templateId);
    expect(savedSchema).not.toBeNull();
    expect(savedSchema?.calibrationStatus).toBe('CALIBRATED');

    // 5. Ingest Document B (Equivalent Comune di Roma PEI but with Alunno Bianchi)
    const pdfBytesB = createSyntheticPeiPdf('Bianchi Marianna');
    const hashB = await computeSha256(pdfBytesB);
    const fileNameB = 'pei_roma_bianchi_marianna.pdf';

    // Verify B is indeed different from A
    expect(hashB).not.toBe(hashA);

    // 6. Run Document B through the normal, unmodified ingestion and acquisition pipeline
    // We pass our list of customModels containing the definition for Document A
    const acquisitionResult = await processDocumentAcquisition(
      pdfBytesB,
      fileNameB,
      {
        customModels: [customModelDefA]
      }
    );

    // =========================================================================
    // THE RED ASSERTION
    // =========================================================================
    // Due to the lack of layout-based CanonicalTemplateMatcher integration in processDocumentAcquisition / classifyDocumentModel,
    // Document B is NOT recognized as matching the Comune di Roma template schema.
    // It will fall back to model non-recognized, resulting in detectedModelId being undefined or not matching A.
    // We assert that B successfully recalls A's schema to prove the desired behavior, which we expect to FAIL right now.
    expect(acquisitionResult.classification.isModelRecognized).toBe(true);
    expect(acquisitionResult.classification.detectedModelId).toBe(templateId);
  });
});
