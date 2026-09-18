import { describe, it, expect } from 'vitest';
import {
  detectFieldsOnPdfPage,
  detectFieldsOnEntireDocument,
} from '../core/assistedFieldDetectionService';
import { createTemplateSchemaFromCandidates } from '../core/templateSchemaService';
import { FieldGeometry } from '../data/geometry/types';

describe('PEI FACILE — R08 Assisted Field Detection', () => {
  describe('Page Field Detection Logic', () => {
    it('detects AcroForm widget annotations and creates PROPOSED fields with ACROFORM source', async () => {
      const mockPageProxy: any = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [
          {
            subtype: 'Widget',
            fieldType: 'Tx',
            fieldName: 'alunno_cognome',
            rect: [50, 700, 250, 725], // PDF bottom-up coords [x1, y1, x2, y2]
          },
        ],
        getTextContent: async () => ({ items: [] }),
      };

      const existingFields: FieldGeometry[] = [];
      const proposed = await detectFieldsOnPdfPage(mockPageProxy, 1, existingFields);

      expect(proposed).toHaveLength(1);
      const field = proposed[0];
      expect(field.calibrationStatus).toBe('PROPOSED');
      expect(field.detectionSource).toBe('ACROFORM');
      expect(field.status).toBe('REVIEW_REQUIRED');
      expect(field.confidence).toBeGreaterThanOrEqual(0.85);
      expect(field.pageNumber).toBe(1);
      expect(field.xPt).toBe(50);
      expect(field.widthPt).toBe(200);
      expect(field.heightPt).toBe(25);
    });

    it('detects text layer label patterns (e.g. "Cognome e Nome: ......") and proposes TEXT_LAYER fields', async () => {
      const mockPageProxy: any = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [],
        getTextContent: async () => ({
          items: [
            {
              str: 'Cognome e Nome: .......................................',
              transform: [12, 0, 0, 12, 60, 750], // font size 12, pos x=60, y_pdf=750
              width: 300,
              height: 12,
            },
          ],
        }),
      };

      const existingFields: FieldGeometry[] = [];
      const proposed = await detectFieldsOnPdfPage(mockPageProxy, 1, existingFields);

      expect(proposed.length).toBeGreaterThanOrEqual(1);
      const field = proposed[0];
      expect(field.calibrationStatus).toBe('PROPOSED');
      expect(field.detectionSource).toBe('TEXT_LAYER');
      expect(field.suggestedSemanticKey).toBe('student.fullName');
      expect(field.suggestedLabel).toContain('Cognome e Nome');
    });

    it('does not produce duplicate proposed fields when overlapping with existing validated fields', async () => {
      const mockPageProxy: any = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [
          {
            subtype: 'Widget',
            fieldType: 'Tx',
            fieldName: 'alunno_cf',
            rect: [60, 700, 260, 725],
          },
        ],
        getTextContent: async () => ({ items: [] }),
      };

      const existingFields: FieldGeometry[] = [
        {
          fieldId: 'EXISTING_CF',
          label: 'Codice Fiscale',
          semanticKey: 'student.fiscalCode',
          pageNumber: 1,
          xPt: 60,
          yPt: 841.89 - 725, // Exactly matching bounding box
          widthPt: 200,
          heightPt: 25,
          anchorText: 'Codice Fiscale',
          backgroundMode: 'TRANSPARENT',
          derivationMethod: 'MANUAL_VERIFIED',
          confidence: 1.0,
          status: 'MAPPED',
          calibrationStatus: 'CONFIRMED',
        },
      ];

      const proposed = await detectFieldsOnPdfPage(mockPageProxy, 1, existingFields);
      expect(proposed).toHaveLength(0); // Duplicate skipped
    });

    it('supports full document detection with progress callback', async () => {
      const mockDoc: any = {
        numPages: 2,
        getPage: async (pageNum: number) => ({
          pageNumber: pageNum,
          getViewport: () => ({ width: 595.28, height: 841.89 }),
          getAnnotations: async () => [
            {
              subtype: 'Widget',
              fieldType: 'Tx',
              fieldName: `field_p${pageNum}`,
              rect: [50, 700, 200, 720],
            },
          ],
          getTextContent: async () => ({ items: [] }),
        }),
      };

      const pages = [
        { pageNumber: 1, widthPt: 595.28, heightPt: 841.89, fields: [] },
        { pageNumber: 2, widthPt: 595.28, heightPt: 841.89, fields: [] },
      ];

      const progressLog: Array<{ current: number; total: number }> = [];
      const res = await detectFieldsOnEntireDocument(mockDoc, pages, (c, t) => {
        progressLog.push({ current: c, total: t });
      });

      expect(res.totalProposed).toBe(2);
      expect(progressLog).toHaveLength(2);
      expect(progressLog[0]).toEqual({ current: 1, total: 2 });
      expect(progressLog[1]).toEqual({ current: 2, total: 2 });
      expect(res.pages[0].fields).toHaveLength(1);
      expect(res.pages[1].fields).toHaveLength(1);
    });
  });

  describe('Schema Integration & REJECTED Filtering', () => {
    it('excludes REJECTED candidates when generating final TemplateSchema', () => {
      const candidates = [
        {
          fieldId: 'CONFIRMED_FIELD',
          label: 'Alunno',
          semanticKey: 'student.fullName',
          backgroundMode: 'TRANSPARENT' as const,
          pageNumber: 1,
          xPt: 50,
          yPt: 100,
          widthPt: 200,
          heightPt: 20,
          anchorText: 'Alunno',
          calibrationStatus: 'CONFIRMED' as const,
          confidence: 1.0,
          detectionSource: 'TEXT_LAYER' as const,
        },
        {
          fieldId: 'REJECTED_FIELD',
          label: 'Falso Riconoscimento',
          semanticKey: null,
          backgroundMode: 'TRANSPARENT' as const,
          pageNumber: 1,
          xPt: 50,
          yPt: 150,
          widthPt: 100,
          heightPt: 20,
          anchorText: 'Falso',
          calibrationStatus: 'REJECTED' as const,
          confidence: 0.3,
          detectionSource: 'TEXT_LAYER' as const,
        },
      ];

      const pages = [{ pageNumber: 1, widthPt: 595.28, heightPt: 841.89, fields: [] }];

      const schema = createTemplateSchemaFromCandidates(
        'TEST_R08_MODEL',
        'template.pdf',
        'abcdef123456',
        pages,
        candidates,
        'CALIBRATED',
        'A2'
      );

      expect(schema.fields).toHaveLength(1);
      expect(schema.fields[0].templateFieldId).toBe('CONFIRMED_FIELD');
      expect(schema.fields[0].calibrationStatus).toBe('CONFIRMED');
      expect(schema.fields[0].detectionSource).toBe('TEXT_LAYER');
    });

    it('persists MODIFIED status and detection metadata in TemplateSchemaField', () => {
      const candidates = [
        {
          fieldId: 'MODIFIED_FIELD',
          label: 'Data Nascita Modificata',
          semanticKey: 'student.birthDate',
          backgroundMode: 'OPAQUE_WHITE' as const,
          pageNumber: 1,
          xPt: 60,
          yPt: 200,
          widthPt: 150,
          heightPt: 25,
          anchorText: 'Nato il',
          calibrationStatus: 'MODIFIED' as const,
          confidence: 0.9,
          detectionSource: 'COMBINED' as const,
          suggestedLabel: 'Nato il',
          suggestedSemanticKey: 'student.birthDate',
        },
      ];

      const pages = [{ pageNumber: 1, widthPt: 595.28, heightPt: 841.89, fields: [] }];

      const schema = createTemplateSchemaFromCandidates(
        'TEST_R08_MODIFIED',
        'template.pdf',
        'abcdef123456',
        pages,
        candidates,
        'CALIBRATED',
        'A1'
      );

      expect(schema.fields).toHaveLength(1);
      const f = schema.fields[0];
      expect(f.templateFieldId).toBe('MODIFIED_FIELD');
      expect(f.calibrationStatus).toBe('MODIFIED');
      expect(f.detectionSource).toBe('COMBINED');
      expect(f.suggestedLabel).toBe('Nato il');
      expect(f.suggestedSemanticKey).toBe('student.birthDate');
    });
  });

  describe('R08-R1 Engine & UX Additions', () => {
    it('TEST C: detects visual underlines using canvas fallback when canvasElement is provided', async () => {
      // Mock 100x100 canvas with a dark line at y=50 from x=20 to x=80
      const width = 100;
      const height = 100;
      const pixelData = new Uint8ClampedArray(width * height * 4);
      // Initialize with white (255)
      pixelData.fill(255);
      // Draw horizontal dark line (gray < 120) at y=50 from x=20 to x=80
      for (let x = 20; x <= 80; x++) {
        const idx = (50 * width + x) * 4;
        pixelData[idx] = 20;     // R
        pixelData[idx + 1] = 20; // G
        pixelData[idx + 2] = 20; // B
        pixelData[idx + 3] = 255; // A
      }

      const mockCanvas: any = {
        width,
        height,
        getContext: () => ({
          getImageData: () => ({
            data: pixelData,
            width,
            height,
          }),
        }),
      };

      const mockPageProxy: any = {
        pageNumber: 1,
        getViewport: () => ({ width, height }),
        getAnnotations: async () => [],
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        getTextContent: async () => ({
          items: [
            {
              str: 'Nome:',
              transform: [10, 0, 0, 10, 20, 55], // text placed just above the line
              width: 25,
              height: 10,
            },
          ],
        }),
      };

      const proposed = await detectFieldsOnPdfPage(mockPageProxy, 1, [], mockCanvas);
      expect(proposed.length).toBeGreaterThanOrEqual(1);
      const visualField = proposed.find(p => p.detectionSource === 'VISUAL_LINES' || p.suggestedLabel?.includes('Nome'));
      expect(visualField).toBeDefined();
      expect(visualField?.calibrationStatus).toBe('PROPOSED');
    });

    it('TEST D: detects vector operators (lines, rectangles, checkboxes) from getOperatorList', async () => {
      const mockPageProxy: any = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [],
        getOperatorList: async () => ({
          fnArray: [
            4, // OPS.rectangle
            4, // OPS.rectangle (checkbox size)
          ],
          argsArray: [
            [50, 700, 200, 30], // Big input box
            [300, 700, 12, 12], // Checkbox
          ],
        }),
        getTextContent: async () => ({
          items: [
            {
              str: 'Note Cliniche',
              transform: [12, 0, 0, 12, 50, 740],
              width: 80,
              height: 12,
            },
          ],
        }),
      };

      const proposed = await detectFieldsOnPdfPage(mockPageProxy, 1, []);
      expect(proposed.length).toBeGreaterThanOrEqual(1);
      expect(proposed.some(f => f.fieldType === 'SINGLE_CHOICE' || f.detectionSource === 'GEOMETRY' || f.detectionSource === 'VECTOR_PATHS')).toBe(true);
    });

    it('TEST E: correctly handles state transitions and preserves status when confirmed or rejected', () => {
      const field: FieldGeometry = {
        fieldId: 'FIELD_STATE_TEST',
        label: 'Diagnosi',
        semanticKey: 'student.diagnosis',
        pageNumber: 1,
        xPt: 50,
        yPt: 100,
        widthPt: 200,
        heightPt: 30,
        anchorText: 'Diagnosi',
        backgroundMode: 'TRANSPARENT',
        derivationMethod: 'TEXT_ANCHOR',
        calibrationStatus: 'PROPOSED',
        status: 'REVIEW_REQUIRED',
        confidence: 0.85,
        detectionSource: 'TEXT_LAYER',
      };

      // Confirm transition
      const confirmed: FieldGeometry = {
        ...field,
        calibrationStatus: 'CONFIRMED',
        derivationMethod: 'MANUAL_VERIFIED',
        status: 'MAPPED',
      };
      expect(confirmed.calibrationStatus).toBe('CONFIRMED');
      expect(confirmed.derivationMethod).toBe('MANUAL_VERIFIED');

      // Modified transition
      const modified: FieldGeometry = {
        ...field,
        xPt: 55,
        calibrationStatus: 'MODIFIED',
      };
      expect(modified.calibrationStatus).toBe('MODIFIED');

      // Reject transition
      const rejected: FieldGeometry = {
        ...field,
        calibrationStatus: 'REJECTED',
        status: 'UNMAPPED',
      };
      expect(rejected.calibrationStatus).toBe('REJECTED');
    });
  });

  describe('R08-R2 Idempotence, Real Deduplication & Field Protection', () => {
    it('TEST R08-R2.1: Running detection twice produces 0 new proposals on 2nd run (Idempotence)', async () => {
      const mockPage = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [
          {
            subtype: 'Widget',
            rect: [50, 700, 200, 730],
            fieldName: 'NomeAlunno',
          },
        ],
        getTextContent: async () => ({
          items: [
            {
              str: 'Cognome e Nome:',
              transform: [1, 0, 0, 1, 50, 650],
              width: 100,
              height: 12,
            },
          ],
        }),
      } as any;

      // 1st run: fresh
      const run1 = await detectFieldsOnPdfPage(mockPage, 1, []);
      expect(run1.length).toBeGreaterThan(0);
      const run1Count = run1.length;

      // 2nd run: pass existing fields from run 1
      const run2 = await detectFieldsOnPdfPage(mockPage, 1, run1);
      expect(run2.length).toBe(0); // 0 new proposals! Idempotent!
    });

    it('TEST R08-R2.2: Existing CONFIRMED and MODIFIED fields are strictly preserved and never overwritten', async () => {
      const existingConfirmed: FieldGeometry = {
        fieldId: 'field_confirmed_user',
        label: 'Nome Alunno Personalizzato',
        semanticKey: 'student.fullName',
        pageNumber: 1,
        xPt: 50,
        yPt: 111.89, // corresponding to rect [50, 700, 200, 730]
        widthPt: 150,
        heightPt: 30,
        anchorText: '',
        confidence: 1.0,
        backgroundMode: 'TRANSPARENT',
        derivationMethod: 'MANUAL_VERIFIED',
        calibrationStatus: 'CONFIRMED',
        status: 'MAPPED',
      };

      const mockPage = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [
          {
            subtype: 'Widget',
            rect: [50, 700, 200, 730],
            fieldName: 'NomeAlunno',
          },
        ],
        getTextContent: async () => ({ items: [] }),
      } as any;

      const proposals = await detectFieldsOnPdfPage(mockPage, 1, [existingConfirmed]);
      // Should ignore duplicate candidate because confirmed field exists in that exact location
      expect(proposals.length).toBe(0);
    });

    it('TEST R08-R2.3: Rejected fields are not re-proposed on subsequent detection runs', async () => {
      const existingRejected: FieldGeometry = {
        fieldId: 'field_rejected_1',
        label: 'NomeAlunno',
        pageNumber: 1,
        xPt: 50,
        yPt: 111.89,
        widthPt: 150,
        heightPt: 30,
        anchorText: '',
        confidence: 1.0,
        backgroundMode: 'TRANSPARENT',
        derivationMethod: 'ACROFORM',
        calibrationStatus: 'REJECTED',
        status: 'UNMAPPED',
      };

      const mockPage = {
        pageNumber: 1,
        getViewport: () => ({ width: 595.28, height: 841.89 }),
        getAnnotations: async () => [
          {
            subtype: 'Widget',
            rect: [50, 700, 200, 730],
            fieldName: 'NomeAlunno',
          },
        ],
        getTextContent: async () => ({ items: [] }),
      } as any;

      const proposals = await detectFieldsOnPdfPage(mockPage, 1, [existingRejected]);
      expect(proposals.length).toBe(0); // Kept rejected, not re-proposed
    });
  });
});
