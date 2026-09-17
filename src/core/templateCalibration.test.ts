/**
 * @license
 * PEI FACILE — Template Calibration Workflow Tests (Phase 1D R01)
 * Validates baseline models A1-A4 integrity, custom template visual calibration lifecycle,
 * bounds validation, and approval persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ModelGeometry, FieldGeometry } from '../data/geometry/types';
import { isFieldWithinPageBounds, A4_WIDTH_PT, A4_HEIGHT_PT } from '../data/geometry/geometryTransform';
import {
  createTemplateSchemaFromCandidates,
  saveTemplateSchema,
  getTemplateSchema,
  buildMinisterialTemplateSchema,
  isTemplateEligibleForCompilation,
} from './templateSchemaService';
import {
  saveCustomTemplate,
  getCustomTemplate,
  listAllCustomTemplates,
} from './templateStorage';
import type { CandidateFieldGeometry } from './templateAcquisitionTypes';
import type { TemplateSchema, FieldOverflowPolicy } from './templateSchemaTypes';
import {
  computeTextAutofit,
  AUTOFIT_FONT_SIZES_PT,
  AUTOFIT_TRACKING_PT,
  AUTOFIT_LINE_HEIGHTS,
  MIN_FONT_SIZE_PT,
} from './textAutofit';

import A1Data from '../data/geometry/A1.geometry.json';
import A2Data from '../data/geometry/A2.geometry.json';
import A3Data from '../data/geometry/A3.geometry.json';
import A4Data from '../data/geometry/A4.geometry.json';

describe('Phase 1D-R1 — Calibration Policy & Autofit Validation', () => {
  describe('Ministerial Built-in Baselines (A1-A4) Geometry Sanity', () => {
    const models = [
      { id: 'A1', data: A1Data as unknown as ModelGeometry },
      { id: 'A2', data: A2Data as unknown as ModelGeometry },
      { id: 'A3', data: A3Data as unknown as ModelGeometry },
      { id: 'A4', data: A4Data as unknown as ModelGeometry },
    ];

    models.forEach(({ id, data }) => {
      it(`Modello ${id} satisfies canonical A4 bounds for all mapped fields`, () => {
        expect(data.totalPages).toBeGreaterThanOrEqual(12);
        expect(data.pages.length).toBe(data.totalPages);

        data.pages.forEach((page) => {
          expect(page.widthPt).toBe(A4_WIDTH_PT);
          expect(page.heightPt).toBe(A4_HEIGHT_PT);

          page.fields.forEach((field) => {
            if (field.status === 'MAPPED') {
              expect(isFieldWithinPageBounds(field, page.widthPt, page.heightPt)).toBe(true);
              expect(field.widthPt).toBeGreaterThan(0);
              expect(field.heightPt).toBeGreaterThan(0);
            }
          });
        });
      });
    });

    it('A1-A4 baselines are immediately usable for compilation with visualReviewStatus = REQUIRED', () => {
      (['A1', 'A2', 'A3', 'A4'] as const).forEach((order) => {
        const schema = buildMinisterialTemplateSchema(order);
        expect(schema.calibrationStatus).toBe('CALIBRATED');
        expect(schema.geometryValidationStatus).toBe('PASS');
        expect(schema.visualReviewStatus).toBe('REQUIRED');
        
        // Allowed in compilation as built-in baseline
        const eligibility = isTemplateEligibleForCompilation(schema);
        expect(eligibility.eligible).toBe(true);

        // Disallow CLIP in all ministerial fields
        schema.fields.forEach((f) => {
          expect(f.overflowPolicy).not.toBe('CLIP');
          expect(['RIGID', 'CONTINUABLE', 'EXPANDABLE_OR_TABULAR']).toContain(f.overflowPolicy);
        });
      });
    });
  });

  describe('Overflow Policy & CLIP Prohibition', () => {
    it('sanitizes legacy CLIP or missing policies to RIGID / EXPANDABLE_OR_TABULAR', () => {
      const draft = createTemplateSchemaFromCandidates(
        'test_no_clip',
        'sample.pdf',
        'hash123',
        [{ pageNumber: 1, widthPt: 595, heightPt: 842, fields: [] }],
        [
          {
            fieldId: 'f1',
            pageNumber: 1,
            xPt: 50,
            yPt: 50,
            widthPt: 200,
            heightPt: 20,
            fieldType: 'TEXT_SHORT',
            overflowPolicy: 'CLIP' as any, // Simulate legacy CLIP attempt
          },
          {
            fieldId: 'f2',
            pageNumber: 1,
            xPt: 50,
            yPt: 100,
            widthPt: 400,
            heightPt: 150,
            fieldType: 'TABLE',
          },
        ]
      );

      // CLIP must NEVER be saved in the resulting schema
      expect(draft.fields[0].overflowPolicy).toBe('RIGID');
      expect(draft.fields[1].overflowPolicy).toBe('EXPANDABLE_OR_TABULAR');
    });
  });

  describe('Frozen Typography & Autofit Engine', () => {
    it('follows the strict frozen sequence: 12→8pt, tracking 0→-1.5pt, interlinea 1.50→1.20', () => {
      const shortText = 'Breve intestazione';
      const resultShort = computeTextAutofit(shortText, 300, 40, 'RIGID');
      expect(resultShort.overflowsBox).toBe(false);
      expect(resultShort.fontSizePt).toBe(12);
      expect(resultShort.trackingPt).toBe(0);
      expect(resultShort.lineHeight).toBe(1.50);

      // Longer text that fits with moderate reduction
      const mediumText = 'Questo è un testo di media lunghezza inserito all’interno di un riquadro con limiti dimensionali precisi.';
      const resultMedium = computeTextAutofit(mediumText, 150, 40, 'RIGID');
      expect(resultMedium.fontSizePt).toBeLessThanOrEqual(12);
      expect(resultMedium.fontSizePt).toBeGreaterThanOrEqual(8);
    });

    it('NEVER reduces font size below 8 pt even for very long overflowing text', () => {
      const massiveText = 'Descrizione estremamente dettagliata delle osservazioni e degli interventi educativi e didattici previsti per l’alunno '.repeat(20);
      const resultOverflow = computeTextAutofit(massiveText, 100, 30, 'RIGID');
      
      expect(resultOverflow.fontSizePt).toBe(MIN_FONT_SIZE_PT); // strictly 8
      expect(resultOverflow.fontSizePt).toBeGreaterThanOrEqual(8);
      expect(resultOverflow.overflowsBox).toBe(true);
      expect(resultOverflow.policyAction).toBe('TEACHER_SYNTHESIS_REQUIRED');
    });

    it('triggers CONTINUATION_BLOCK for CONTINUABLE policy and TABULAR_EXPANSION for EXPANDABLE_OR_TABULAR', () => {
      const massiveText = 'Testo esteso '.repeat(50);
      const continuableResult = computeTextAutofit(massiveText, 80, 20, 'CONTINUABLE');
      expect(continuableResult.policyAction).toBe('CONTINUATION_BLOCK');

      const tabularResult = computeTextAutofit(massiveText, 80, 20, 'EXPANDABLE_OR_TABULAR');
      expect(tabularResult.policyAction).toBe('TABULAR_EXPANSION');
    });
  });

  describe('User Template Calibration Approval Flow', () => {
    it('creates schema in REVIEW_REQUIRED state and visualReviewStatus = REQUIRED (never auto-completed)', async () => {
      const templateId = 'custom-test-model-001';
      const sourcePdf = 'modello_scuola_test.pdf';
      const sourceSha256 = 'abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const pages = [
        {
          pageNumber: 1,
          widthPt: A4_WIDTH_PT,
          heightPt: A4_HEIGHT_PT,
          fields: [] as FieldGeometry[],
        },
      ];

      const candidates: CandidateFieldGeometry[] = [
        {
          fieldId: 'f-p1-1',
          label: 'Cognome e Nome Alunno',
          pageNumber: 1,
          xPt: 50,
          yPt: 100,
          widthPt: 400,
          heightPt: 30,
          anchorText: 'ALUNNO/A',
          fieldType: 'TEXT_SHORT',
          derivationMethod: 'TEXT_ANCHOR',
          confidence: 0.95,
          status: 'MAPPED',
          overflowPolicy: 'RIGID',
        },
      ];

      // 1. Initial draft creation after PDF intake
      const draftSchema = createTemplateSchemaFromCandidates(
        templateId,
        sourcePdf,
        sourceSha256,
        pages,
        candidates,
        'REVIEW_REQUIRED',
        'A2'
      );

      // Automated analysis / confidence MUST NOT set visualReviewStatus to COMPLETED
      expect(draftSchema.calibrationStatus).toBe('REVIEW_REQUIRED');
      expect(draftSchema.visualReviewStatus).toBe('REQUIRED');

      // 2. User simulates visual inspection and manual adjustment
      const calibratedCandidates = [
        {
          ...candidates[0],
          xPt: 55, // Nudged by user
          yPt: 105,
          widthPt: 390,
          heightPt: 28,
        },
      ];

      // 3. User explicitly approves calibration in TemplateCalibrationWorkspace
      const approvedSchema = createTemplateSchemaFromCandidates(
        templateId,
        sourcePdf,
        sourceSha256,
        pages,
        calibratedCandidates,
        'CALIBRATED',
        'A2'
      );
      approvedSchema.geometryValidationStatus = 'PASS';
      approvedSchema.visualReviewStatus = 'COMPLETED'; // Explicit human approval

      expect(approvedSchema.calibrationStatus).toBe('CALIBRATED');
      expect(approvedSchema.visualReviewStatus).toBe('COMPLETED');
      expect(approvedSchema.fields[0].geometry.xPt).toBe(55);
      expect(approvedSchema.fields[0].geometry.widthPt).toBe(390);

      // 4. Save and verify retrieval
      await saveTemplateSchema(approvedSchema);
      const retrieved = await getTemplateSchema(templateId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.calibrationStatus).toBe('CALIBRATED');
      expect(retrieved?.visualReviewStatus).toBe('COMPLETED');
    });

    it('rejects calibration approval if a field exceeds page boundaries', () => {
      const fieldOutOfBounds: FieldGeometry = {
        fieldId: 'err-1',
        label: 'Field overflowing page',
        pageNumber: 1,
        xPt: 500,
        yPt: 800,
        widthPt: 200, // 500 + 200 = 700 > 595.32 (A4_WIDTH_PT)
        heightPt: 100,
        anchorText: 'Test',
        derivationMethod: 'MANUAL_VERIFIED',
        confidence: 1.0,
        status: 'MAPPED',
      };

      const isValid = isFieldWithinPageBounds(fieldOutOfBounds, A4_WIDTH_PT, A4_HEIGHT_PT);
      expect(isValid).toBe(false);
    });
  });
});
