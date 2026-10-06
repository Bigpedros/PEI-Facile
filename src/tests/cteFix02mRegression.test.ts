/**
 * @license
 * PEI FACILE — CTE-FIX-02M Regression Test Suite
 * Verify Custom Model selection, correct identification, and prevention of silente ministerial fallback for A1-A4 orders.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTemplateSource, computeSha256 } from '../core/templateSourceResolver';
import { saveTemplateSchema } from '../core/templateSchemaService';
import type { PeiModelDefinition } from '../types/pei';
import type { TemplateSchema } from '../core/templateSchemaTypes';

describe('CTE-FIX-02M — Regression Test for Custom Model Selection & Resolution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('demonstrates that custom model with schoolOrder A1 is identified correctly and remains custom/institution', async () => {
    const dummyBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4]);
    const expectedSha = await computeSha256(dummyBytes);

    // 1. Setup Custom Model Definition (ID = model_custom_roma_test, schoolOrder = A1)
    const customModel: PeiModelDefinition = {
      id: 'model_custom_roma_test',
      name: 'PEI Comune di Roma - Infanzia',
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
      templateId: 'model_custom_roma_test',
      calibrationStatus: 'CALIBRATED',
      calibrationOrigin: 'USER_REVIEW',
    };

    // 2. Setup corresponding TemplateSchema in storage via saveTemplateSchema
    const customSchema: TemplateSchema = {
      schemaId: 'SCHEMA_model_custom_roma_test',
      templateId: 'model_custom_roma_test',
      sourceSha256: expectedSha,
      sourcePdfFileName: 'custom_roma_infanzia.pdf',
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

    // 3. Resolve the template source using resolveTemplateSource
    const resolved = await resolveTemplateSource({
      modelDef: null,
      modelId: 'model_custom_roma_test',
      schoolOrder: 'A1',
      customModels: [customModel],
      providedBinary: dummyBytes,
    });

    // Verify 1: A1 does NOT automatically fallback or coerce to ministerial if modelId refers to custom
    expect(resolved.sourceKind).toBe('USER_IMPORTED');
    expect(resolved.modelDef.isMinisterial).toBe(false);

    // Verify 2: resolveTemplateSource successfully identified the custom model
    expect(resolved.templateId).toBe('model_custom_roma_test');
    expect(resolved.modelDef.id).toBe('model_custom_roma_test');

    // Verify 3: No TEMPLATE_SOURCE_MISSING error is generated
    expect(resolved.templateSchema).toBeDefined();
    expect(resolved.templateSchema.schemaId).toBe('SCHEMA_model_custom_roma_test');

    // Verify 4: The source/origin identity remains custom/institution
    expect(resolved.modelDef.originType).toBe('INSTITUTION');
    expect(resolved.modelDef.sourceKind).toBe('USER_IMPORTED');
    expect(resolved.modelDef.originName).toBe('Comune di Roma');
  });
});
