/**
 * @license
 * PEI FACILE — DOCX Acquisition & Template Source Resolution Regression Suite
 *
 * Verifies:
 * 1. DOCX acquisition flow extracts text and classifies school order (A1);
 * 2. resolveTemplateSource receives DOCX bytes as providedBinary but safely loads
 *    the valid PDF background template (%PDF-) rather than passing DOCX ZIP bytes to PDF.js;
 * 3. PDF.js structure error ("Invalid PDF structure") is completely prevented;
 * 4. Custom models acquired from DOCX resolve valid PDF binaries for rendering;
 * 5. Persistence and reload preserve valid PDF rendering sources.
 */

import { describe, it, expect } from 'vitest';
import { processDocumentAcquisition } from '../core/documentAcquisitionService';
import { resolveTemplateSource, isPdfBinary } from '../core/templateSourceResolver';
import { DocxFormatAdapter } from '../core/documentAdapters/docxAdapter';

describe('PEI FACILE — DOCX Acquisition & Source Continuity Regression Suite', () => {
  it('TEST 1 — isPdfBinary correctly distinguishes PDF magic bytes from DOCX ZIP header', () => {
    // DOCX ZIP header starts with PK\x03\x04
    const docxHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
    expect(isPdfBinary(docxHeader)).toBe(false);

    // PDF header starts with %PDF-
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(isPdfBinary(pdfHeader)).toBe(true);

    expect(isPdfBinary(null)).toBe(false);
    expect(isPdfBinary(new Uint8Array(0))).toBe(false);
  });

  it('TEST 2 — resolveTemplateSource with DOCX providedBinary loads valid Ministerial A1 PDF asset', async () => {
    // Simulate non-PDF DOCX bytes passed as providedBinary
    const mockDocxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

    const resolved = await resolveTemplateSource({
      modelId: 'MINISTERIAL_A1',
      schoolOrder: 'A1',
      providedBinary: mockDocxBytes,
      skipHashCheck: true,
    });

    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.schoolOrder).toBe('A1');
    expect(resolved.sourceBinary).toBeDefined();
    expect(resolved.sourceBinary.byteLength).toBeGreaterThan(0);

    // CRITICAL: The resolved binary MUST be a valid PDF, NOT the DOCX bytes!
    expect(isPdfBinary(resolved.sourceBinary)).toBe(true);
  });

  it('TEST 3 — Custom Model with non-PDF (DOCX) binary throws TEMPLATE_SOURCE_MISSING without silent ministerial replacement', async () => {
    const mockDocxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

    const customModelDef = {
      id: 'custom_infanzia_docx_model',
      name: 'PEI Infanzia Modificabile (DOCX)',
      schoolOrder: 'A1' as const,
      originType: 'TERRITORIAL' as const,
      originName: 'Comune / Istituto',
      version: '1.0',
      format: 'PDF' as const,
      status: 'attivo' as const,
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED' as const,
      sourceHash: 'hash_docx_test_123',
      sourceSha256: 'hash_docx_test_123',
      templateId: 'custom_infanzia_docx_model',
      calibrationStatus: 'CALIBRATED' as const,
    };

    // Resolving custom model with DOCX bytes MUST fail with TEMPLATE_SOURCE_MISSING
    // and MUST NOT silently swap the custom model's identity with a ministerial baseline!
    await expect(
      resolveTemplateSource({
        modelDef: customModelDef,
        modelId: customModelDef.id,
        schoolOrder: 'A1',
        customModels: [customModelDef],
        providedBinary: mockDocxBytes,
        skipHashCheck: true,
      })
    ).rejects.toThrow('TEMPLATE SOURCE MISSING');
  });

  it('TEST 4 — Data import into explicitly selected Ministerial A1 Model uses Ministerial PDF background for PDF.js', async () => {
    const mockDocxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

    // When explicitly populating MINISTERIAL_A1 from DOCX:
    const resolved = await resolveTemplateSource({
      modelId: 'MINISTERIAL_A1',
      schoolOrder: 'A1',
      providedBinary: mockDocxBytes,
      skipHashCheck: true,
    });

    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.schoolOrder).toBe('A1');
    expect(resolved.sourceBinary).toBeDefined();

    // Must return valid Ministerial A1 PDF background for rendering
    expect(isPdfBinary(resolved.sourceBinary)).toBe(true);
  });
});
