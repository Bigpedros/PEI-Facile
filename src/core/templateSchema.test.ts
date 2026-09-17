import { describe, it, expect } from 'vitest';
import {
  buildMinisterialTemplateSchema,
  isTemplateEligibleForCompilation,
  createTemplateSchemaFromCandidates,
  computeFitScale,
  MINISTERIAL_SCHEMAS,
} from './templateSchemaService';
import type { TemplateSchema } from './templateSchemaTypes';

describe('PEI FACILE — Phase 1C/1D Template Schema & Production Gate (R01)', () => {
  it('validates precalibrated ministerial models A1, A2, A3, A4 (BUILT_IN_BASELINE) with CALIBRATED status and PASS validation', () => {
    (['A1', 'A2', 'A3', 'A4'] as const).forEach((order) => {
      const schema = buildMinisterialTemplateSchema(order);
      expect(schema.calibrationStatus).toBe('CALIBRATED');
      expect(schema.geometryValidationStatus).toBe('PASS');
      expect(schema.visualReviewStatus).toBe('REQUIRED');
      expect(schema.fields.length).toBeGreaterThan(0);

      // Verify no field uses forbidden CLIP policy
      schema.fields.forEach((f) => {
        expect(f.overflowPolicy).not.toBe('CLIP');
        expect(['RIGID', 'CONTINUABLE', 'EXPANDABLE_OR_TABULAR']).toContain(f.overflowPolicy);
      });

      const eligibility = isTemplateEligibleForCompilation(schema);
      expect(eligibility.eligible).toBe(true);
    });
  });

  it('strictly blocks uncalibrated custom models from production compilation', () => {
    const uncalibratedSchema = createTemplateSchemaFromCandidates(
      'custom_tpl_test',
      'test_uncalibrated.pdf',
      'sha256_mock_sample',
      [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
          fields: [],
        },
      ],
      [
        {
          fieldId: 'field_1',
          pageNumber: 1,
          xPt: 50,
          yPt: 100,
          widthPt: 200,
          heightPt: 25,
        },
      ],
      'REVIEW_REQUIRED'
    );

    const eligibility = isTemplateEligibleForCompilation(uncalibratedSchema);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toContain('REQUISITO BLOCCANTE');
    expect(eligibility.calibrationStatus).toBe('REVIEW_REQUIRED');
  });

  it('permits custom models once approved and marked as CALIBRATED', () => {
    const calibratedCustomSchema = createTemplateSchemaFromCandidates(
      'custom_tpl_approved',
      'test_approved.pdf',
      'sha256_mock_sample_2',
      [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
          fields: [],
        },
      ],
      [
        {
          fieldId: 'field_verified_1',
          pageNumber: 1,
          xPt: 50,
          yPt: 100,
          widthPt: 200,
          heightPt: 25,
        },
      ],
      'CALIBRATED'
    );

    const eligibility = isTemplateEligibleForCompilation(calibratedCustomSchema);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.reason).toBeUndefined();
  });

  it('calculates font size scale reduction correctly for text overflow handling', () => {
    const exactFit = computeFitScale('Breve testo', 200, 30);
    expect(exactFit).toBe(1.0);

    const longText = 'Questo è un testo particolarmente esteso destinato a superare la capienza originaria del rettangolo geometrico del PDF ministeriale.'.repeat(4);
    const reducedScale = computeFitScale(longText, 150, 25, 11, 8);
    expect(reducedScale).toBeLessThanOrEqual(1.0);
    expect(reducedScale).toBeGreaterThanOrEqual(8 / 11);
  });
});
