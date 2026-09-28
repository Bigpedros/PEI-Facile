/**
 * @license
 * PEI FACILE — CTE-FIX-02O Regression Test Suite
 * Verify complete binary reconstruction after JSON serialization and deserialization from localStorage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTemplateSource, computeSha256 } from '../core/templateSourceResolver';
import { saveTemplateSchema } from '../core/templateSchemaService';
import { restorePeiDocumentBinaries, restoreUint8Array } from '../App';
import type { PeiModelDefinition, PeiDocument } from '../types/pei';
import type { TemplateSchema } from '../core/templateSchemaTypes';

describe('CTE-FIX-02O — Binary Reload & Custom Identity Preservation Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TEST: simulates full reload pipeline, restores Uint8Array, and resolves template source successfully', async () => {
    const originalBytes = new Uint8Array([12, 34, 56, 78, 90]);
    const expectedSha = await computeSha256(originalBytes);

    // 1. Setup Custom Model Definition (ID = model_custom_roma_reload_test)
    const customModel: PeiModelDefinition = {
      id: 'model_custom_roma_reload_test',
      name: 'PEI Comune di Roma - Riapertura Test',
      schoolOrder: 'A1',
      originType: 'INSTITUTION',
      originName: 'Comune di Roma',
      version: '1.0',
      acquisitionDate: '2026-09-27',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: expectedSha,
      sourceSha256: expectedSha,
      templateId: 'model_custom_roma_reload_test',
      calibrationStatus: 'CALIBRATED',
      calibrationOrigin: 'USER_REVIEW',
    };

    // 2. Setup Template Schema
    const customSchema: TemplateSchema = {
      schemaId: 'SCHEMA_model_custom_roma_reload_test',
      templateId: 'model_custom_roma_reload_test',
      sourceSha256: expectedSha,
      sourcePdfFileName: 'custom_roma_infanzia_reload.pdf',
      version: '1.0.0',
      schoolOrder: 'A1',
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
        },
      ],
      fields: [],
      calibrationStatus: 'CALIBRATED',
      geometryValidationStatus: 'PASS',
      visualReviewStatus: 'REQUIRED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveTemplateSchema(customSchema);

    // 3. Create a PeiDocument custom
    const originalDoc: PeiDocument = {
      id: 'doc_session_test_123',
      schoolOrder: 'A1',
      modelId: 'model_custom_roma_reload_test',
      templateId: 'model_custom_roma_reload_test',
      sourcePdfBinary: originalBytes,
      canonicalDocument: originalBytes,
      values: {},
      fieldStatuses: {},
      notes: {},
      schoolYear: '2026/2027',
      studentCode: 'STUDENT-RELOAD',
      schoolName: 'School Test',
      classOrSection: '1A',
      creationDate: new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
    };

    // 4. Serialize to string (simulating localStorage.setItem)
    const serialized = JSON.stringify(originalDoc);

    // 5. Deserialize to object (simulating JSON.parse(localStorage.getItem(...)))
    const deserialized = JSON.parse(serialized);

    // 6. Demonstrate BEFORE the reviver that type identity is lost
    expect(deserialized.sourcePdfBinary).toBeDefined();
    expect(deserialized.sourcePdfBinary instanceof Uint8Array).toBe(false);
    expect(deserialized.canonicalDocument instanceof Uint8Array).toBe(false);

    // 7. Apply restorePeiDocumentBinaries
    const restoredDoc = restorePeiDocumentBinaries(deserialized);

    // 8. Verify post-restore type identity
    expect(restoredDoc.sourcePdfBinary instanceof Uint8Array).toBe(true);
    expect(restoredDoc.canonicalDocument instanceof Uint8Array).toBe(true);

    // 9. Verify length and content are perfectly intact
    expect(restoredDoc.sourcePdfBinary.byteLength).toBe(originalBytes.byteLength);
    expect(Array.from(restoredDoc.sourcePdfBinary)).toEqual(Array.from(originalBytes));

    expect(restoredDoc.canonicalDocument.byteLength).toBe(originalBytes.byteLength);
    expect(Array.from(restoredDoc.canonicalDocument)).toEqual(Array.from(originalBytes));

    // 10. Pass the restored document to resolveTemplateSource
    const resolved = await resolveTemplateSource({
      modelDef: null,
      modelId: restoredDoc.modelId,
      templateId: restoredDoc.templateId,
      schoolOrder: restoredDoc.schoolOrder,
      customModels: [customModel],
      providedBinary: restoredDoc.sourcePdfBinary,
    });

    // 11. Verify Custom Identity is fully preserved and resilient
    expect(resolved.sourceKind).toBe('USER_IMPORTED');
    expect(resolved.modelDef.isMinisterial).toBe(false);
    expect(resolved.modelDef.id).toBe('model_custom_roma_reload_test');
    expect(resolved.templateId).toBe('model_custom_roma_reload_test');
    expect(resolved.templateSchema.schemaId).toBe('SCHEMA_model_custom_roma_reload_test');

    // Confirm absolutely no fallback to ministerial built-ins occurred
    expect(resolved.modelDef.originType).toBe('INSTITUTION');
    expect(resolved.modelDef.originName).toBe('Comune di Roma');
  });
});
