/**
 * @license
 * PEI FACILE — CTE-FIX-02K Test Suite
 * Real Detector Cleanup — False Positive Reduction
 */

import { describe, it, expect } from 'vitest';
import { isValidLabel, clusterAndRefineCandidates } from '../core/fieldCandidateClustering';
import { reverseEngineerSchema } from '../core/semanticReverseEngineering';
import type { ProcessCandidatesInput } from '../core/fieldCandidateClustering';
import type { TemplateSchema, TemplateSchemaField } from '../core/templateSchemaTypes';

describe('CTE-FIX-02K — Detector False Positive Reduction Suite', () => {
  it('TEST A: rejects purely numeric labels like "4."', () => {
    expect(isValidLabel('4.')).toBe(false);
    expect(isValidLabel('4')).toBe(false);
  });

  it('TEST B: rejects purely numeric labels like "5."', () => {
    expect(isValidLabel('5.')).toBe(false);
  });

  it('TEST C: rejects isolated punctuation / symbols like quotes, |, /', () => {
    expect(isValidLabel('”')).toBe(false);
    expect(isValidLabel('\'')).toBe(false);
    expect(isValidLabel('|')).toBe(false);
    expect(isValidLabel('/')).toBe(false);
    expect(isValidLabel('(')).toBe(false);
    expect(isValidLabel('L]')).toBe(false);
  });

  it('TEST D: isolated checkbox does NOT generate "Scelta opzione" (it is rejected as orphan noise)', () => {
    const input: ProcessCandidatesInput = {
      pageNumber: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      rawLines: [],
      rawRects: [{ x: 50, y: 100, w: 12, h: 12, isCheckbox: true }], // completely isolated checkbox
      textItems: [],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    };

    const { proposedFields } = clusterAndRefineCandidates(input);
    const hasOrphan = proposedFields.some((f) => f.label.includes('Scelta opzione') || f.label.includes('Opzione'));
    expect(hasOrphan).toBe(false);
    expect(proposedFields.length).toBe(0); // completely discarded!
  });

  it('TEST E: checkbox with near valid label is correctly proposed', () => {
    const input: ProcessCandidatesInput = {
      pageNumber: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      rawLines: [],
      rawRects: [{ x: 50, y: 100, w: 12, h: 12, isCheckbox: true }],
      textItems: [
        { x: 68, yTop: 102, w: 40, h: 10, str: 'Sostegno' }, // near valid label on the right
      ],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    };

    const { proposedFields } = clusterAndRefineCandidates(input);
    const soutienField = proposedFields.find((f) => f.label.includes('Sostegno'));
    expect(soutienField).toBeDefined();
    expect(soutienField!.fieldType).toBe('SINGLE_CHOICE');
  });

  it('TEST F: "Sezione ______" and "Plesso o sede ______" remain as two distinct fields without being merged', () => {
    const input: ProcessCandidatesInput = {
      pageNumber: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      rawLines: [
        { x1: 100, y: 120, x2: 180 }, // line for Sezione
        { x1: 250, y: 120, x2: 450 }, // line for Plesso
      ],
      rawRects: [],
      textItems: [
        { x: 50, yTop: 108, w: 45, h: 10, str: 'Sezione' },
        { x: 195, yTop: 108, w: 50, h: 10, str: 'Plesso o sede' },
      ],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    };

    const { proposedFields } = clusterAndRefineCandidates(input);
    expect(proposedFields.length).toBe(2);

    const sez = proposedFields.find((f) => f.label.toLowerCase().includes('sezione'));
    const plesso = proposedFields.find((f) => f.label.toLowerCase().includes('plesso'));

    expect(sez).toBeDefined();
    expect(plesso).toBeDefined();
    // They must be separate and not merged!
    expect(sez!.xPt).toBeLessThan(plesso!.xPt);
    expect(sez!.widthPt + sez!.xPt).toBeLessThan(plesso!.xPt);
  });

  it('TEST G: token "data" inside a longer phrase is NOT proposed as a separate field', () => {
    // If "data" is part of "data di nascita:", it shouldn't be standalone
    expect(isValidLabel('data di nascita')).toBe(true);
    expect(isValidLabel('data')).toBe(false); // standalone "data" token is rejected as noise/fragment
  });

  it('TEST H: "rivedibilità" inside a full label is NOT a standalone field', () => {
    expect(isValidLabel('Grado di rivedibilità')).toBe(true);
    expect(isValidLabel('rivedibilità')).toBe(false); // standalone is noise
  });

  it('TEST I: valid real field with line is correctly preserved', () => {
    const input: ProcessCandidatesInput = {
      pageNumber: 1,
      pageWidthPt: 595,
      pageHeightPt: 842,
      rawLines: [{ x1: 150, y: 150, x2: 350 }],
      rawRects: [],
      textItems: [{ x: 50, yTop: 138, w: 90, h: 10, str: 'Cognome e Nome' }],
      acroformCandidates: [],
      textLayerCandidates: [],
      existingFields: [],
    };

    const { proposedFields } = clusterAndRefineCandidates(input);
    const validField = proposedFields.find((f) => f.label.toLowerCase().includes('cognome'));
    expect(validField).toBeDefined();
    expect(validField!.xPt).toBeGreaterThanOrEqual(140);
  });

  it('TEST J: reverse engineering successfully enriches valid fields', () => {
    const mockBaseline: TemplateSchema = {
      schemaId: 'SCHEMA_B',
      templateId: 'A1',
      sourceSha256: 'sha',
      sourcePdfFileName: 'a.pdf',
      version: '1.0.0',
      schoolOrder: 'A1',
      totalPages: 1,
      pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
      fields: [
        {
          templateFieldId: 'f-1',
          pageNumber: 1,
          geometry: { xPt: 50, yPt: 50, widthPt: 100, heightPt: 20 },
          label: 'Alunno',
          semanticKey: 'studentName',
          fieldType: 'TEXT_SHORT',
          required: true,
          overflowPolicy: 'RIGID',
          status: 'AUTO_VERIFIED',
        },
      ],
      calibrationStatus: 'CALIBRATED',
      geometryValidationStatus: 'PASS',
      visualReviewStatus: 'COMPLETED',
      createdAt: '',
      updatedAt: '',
    };

    const mockAcquired: TemplateSchema = {
      schemaId: 'SCHEMA_A',
      templateId: 'model_a',
      sourceSha256: 'sha2',
      sourcePdfFileName: 'b.pdf',
      version: '1.0.0',
      schoolOrder: 'A1',
      totalPages: 1,
      pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
      fields: [
        {
          templateFieldId: 'field_bambino',
          pageNumber: 1,
          geometry: { xPt: 60, yPt: 60, widthPt: 120, heightPt: 22 },
          label: 'Bambino/a [INTESTAZIONE]',
          fieldType: 'TEXT_SHORT',
          required: false,
          overflowPolicy: 'RIGID',
          status: 'CANDIDATE',
        },
      ],
      calibrationStatus: 'REVIEW_REQUIRED',
      geometryValidationStatus: 'NOT_RUN',
      visualReviewStatus: 'REQUIRED',
      createdAt: '',
      updatedAt: '',
    };

    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    const field = calibratedSchema.fields[0];
    expect(field.semanticKey).toBe('studentName'); // Enriched
    expect(field.backgroundMode).toBe('OPAQUE_WHITE');
  });

  it('TEST K: reverse engineering refuses to enrich false positives', () => {
    const mockAcquired: TemplateSchema = {
      schemaId: 'SCHEMA_A',
      templateId: 'model_a',
      sourceSha256: 'sha2',
      sourcePdfFileName: 'b.pdf',
      version: '1.0.0',
      schoolOrder: 'A1',
      totalPages: 1,
      pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
      fields: [
        {
          templateFieldId: 'field_noise',
          pageNumber: 1,
          geometry: { xPt: 10, yPt: 10, widthPt: 50, heightPt: 10 },
          label: '4.', // pure noise
          fieldType: 'TEXT_SHORT',
          required: false,
          overflowPolicy: 'RIGID',
          status: 'CANDIDATE',
        },
      ],
      calibrationStatus: 'REVIEW_REQUIRED',
      geometryValidationStatus: 'NOT_RUN',
      visualReviewStatus: 'REQUIRED',
      createdAt: '',
      updatedAt: '',
    };

    const { calibratedSchema } = reverseEngineerSchema(null, mockAcquired, null, null);
    const field = calibratedSchema.fields[0];
    expect(field.semanticKey).toBeNull(); // No mapping allowed for pure noise
    expect(field.suggestedSemanticKey).toBeUndefined();
  });
});
