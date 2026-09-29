/**
 * @license
 * PEI FACILE — CTE-FIX-03F Acquired Template Source Continuity Suite
 *
 * Verifies continuity between acquired custom models and PDF source binaries:
 * - TEST A: Acquire custom A1-derived model -> selectedModelId remains custom model ID.
 * - TEST B: Acquire model -> source binary exists and is saved to storage.
 * - TEST C: Persist + reload -> source binary still exists and SHA-256 matches.
 * - TEST D: Generate fields / resolveTemplateSource -> resolves custom model ID, NOT MINISTERIAL_A1.
 * - TEST E: family/schoolOrder = A1 does NOT imply modelId = MINISTERIAL_A1.
 * - TEST F: Missing custom source binary -> explicit custom-source error (NO silent fallback to built-in).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveTemplateSource,
  TemplateSourceError,
  computeSha256,
} from '../core/templateSourceResolver';
import {
  saveCustomTemplate,
  getCustomTemplate,
  getTemplatePdfBinary,
  clearAllCustomTemplates,
} from '../core/templateStorage';
import {
  findModelDefinition,
  MINISTERIAL_PEI_MODELS,
} from '../data/peiModelRegistry';
import type { PeiModelDefinition } from '../types/pei';
import type { PersistedTemplateRecord } from '../core/templateAcquisitionTypes';
import { saveTemplateSchema } from '../core/templateSchemaService';

describe('CTE-FIX-03F — Acquired Template Source Continuity Suite', () => {
  const dummyPdfBytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3,
    0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a, 0x0a, 0x3c, 0x3c, 0x2f, 0x54, 0x79,
    0x70, 0x65, 0x2f, 0x43, 0x61, 0x74, 0x61, 0x6c, 0x6f, 0x67, 0x3e, 0x3e, 0x0a, 0x65,
    0x6e, 0x64, 0x6f, 0x62, 0x6a, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a,
  ]);

  let dummySha256: string;

  beforeEach(async () => {
    await clearAllCustomTemplates();
    dummySha256 = await computeSha256(dummyPdfBytes);
  });

  it('TEST A: Acquiring custom A1-derived model preserves custom selectedModelId', () => {
    const customModel: PeiModelDefinition = {
      id: 'custom_model_comune_roma_infanzia',
      name: 'PEI Comune di Roma — Scuola dell’Infanzia',
      schoolOrder: 'A1',
      originType: 'TERRITORIAL',
      originName: 'Comune di Roma',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: dummySha256,
      sourceSha256: dummySha256,
      templateId: 'custom_model_comune_roma_infanzia',
      calibrationStatus: 'CALIBRATED',
    };

    const found = findModelDefinition('custom_model_comune_roma_infanzia', [customModel]);
    expect(found).toBeDefined();
    expect(found?.id).toBe('custom_model_comune_roma_infanzia');
    expect(found?.id).not.toBe('MINISTERIAL_A1');
  });

  it('TEST B: Acquired custom model saves source binary and metadata to storage', async () => {
    const templateRecord: PersistedTemplateRecord = {
      templateId: 'custom_model_comune_roma_infanzia',
      name: 'PEI Comune di Roma — Scuola dell’Infanzia',
      schoolOrder: 'A1',
      sourceFileName: 'pei_comune_roma_infanzia.pdf',
      sourceSha256: dummySha256,
      fileSizeBytes: dummyPdfBytes.byteLength,
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
          fields: [],
        },
      ],
      calibrationStatus: 'CALIBRATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
    };

    await saveCustomTemplate(templateRecord, dummyPdfBytes);

    const savedRecord = await getCustomTemplate('custom_model_comune_roma_infanzia', true);
    expect(savedRecord).toBeDefined();
    expect(savedRecord?.templateId).toBe('custom_model_comune_roma_infanzia');
    expect(savedRecord?.pdfBinary).toBeDefined();
    expect(savedRecord?.pdfBinary?.byteLength).toBe(dummyPdfBytes.byteLength);
  });

  it('TEST C: Persist + reload preserves custom source binary and matches SHA-256', async () => {
    const templateRecord: PersistedTemplateRecord = {
      templateId: 'custom_model_comune_roma_infanzia',
      name: 'PEI Comune di Roma — Scuola dell’Infanzia',
      schoolOrder: 'A1',
      sourceFileName: 'pei_comune_roma_infanzia.pdf',
      sourceSha256: dummySha256,
      fileSizeBytes: dummyPdfBytes.byteLength,
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
          fields: [],
        },
      ],
      calibrationStatus: 'CALIBRATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
    };

    await saveCustomTemplate(templateRecord, dummyPdfBytes);

    const loadedBinary = await getTemplatePdfBinary(dummySha256);
    expect(loadedBinary).toBeDefined();
    expect(loadedBinary).not.toBeNull();

    const recomputedSha = await computeSha256(loadedBinary!);
    expect(recomputedSha).toBe(dummySha256);
  });

  it('TEST D: Generate fields / resolveTemplateSource resolves custom model ID, NOT MINISTERIAL_A1', async () => {
    const customModel: PeiModelDefinition = {
      id: 'custom_model_comune_roma_infanzia',
      name: 'PEI Comune di Roma — Scuola dell’Infanzia',
      schoolOrder: 'A1',
      originType: 'TERRITORIAL',
      originName: 'Comune di Roma',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: dummySha256,
      sourceSha256: dummySha256,
      templateId: 'custom_model_comune_roma_infanzia',
      calibrationStatus: 'CALIBRATED',
    };

    const templateRecord: PersistedTemplateRecord = {
      templateId: 'custom_model_comune_roma_infanzia',
      name: 'PEI Comune di Roma — Scuola dell’Infanzia',
      schoolOrder: 'A1',
      sourceFileName: 'pei_comune_roma_infanzia.pdf',
      sourceSha256: dummySha256,
      fileSizeBytes: dummyPdfBytes.byteLength,
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
          fields: [],
        },
      ],
      calibrationStatus: 'CALIBRATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: '1.0.0',
    };

    await saveCustomTemplate(templateRecord, dummyPdfBytes);

    await saveTemplateSchema({
      schemaId: 'SCHEMA_custom_model_comune_roma_infanzia',
      templateId: 'custom_model_comune_roma_infanzia',
      sourceSha256: dummySha256,
      sourcePdfFileName: 'pei_comune_roma_infanzia.pdf',
      version: '1.0.0',
      schoolOrder: 'A1',
      totalPages: 1,
      pages: [{ pageNumber: 1, widthPt: 595.32, heightPt: 841.92 }],
      fields: [],
      calibrationStatus: 'CALIBRATED',
      geometryValidationStatus: 'PASS',
      visualReviewStatus: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const resolved = await resolveTemplateSource({
      modelDef: customModel,
      modelId: 'custom_model_comune_roma_infanzia',
      schoolOrder: 'A1',
      customModels: [customModel],
      providedBinary: dummyPdfBytes,
    });

    expect(resolved.sourceKind).toBe('USER_IMPORTED');
    expect(resolved.modelDef.id).toBe('custom_model_comune_roma_infanzia');
    expect(resolved.modelDef.id).not.toBe('MINISTERIAL_A1');
    expect(resolved.schoolOrder).toBe('A1');
  });

  it('TEST E: schoolOrder = A1 does NOT imply modelId = MINISTERIAL_A1 for custom models', () => {
    const customModel: PeiModelDefinition = {
      id: 'custom_infanzia_model',
      name: 'Modello Personalizzato Infanzia',
      schoolOrder: 'A1',
      originType: 'TERRITORIAL',
      originName: 'ATS Territoriale',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: 'abc123sha256',
      sourceSha256: 'abc123sha256',
      templateId: 'custom_infanzia_model',
      calibrationStatus: 'CALIBRATED',
    };

    const resolvedDef = findModelDefinition('custom_infanzia_model', [customModel]);
    expect(resolvedDef).toBeDefined();
    expect(resolvedDef?.id).toBe('custom_infanzia_model');
    expect(resolvedDef?.isMinisterial).toBe(false);
  });

  it('TEST F: Missing custom source binary raises TEMPLATE_SOURCE_MISSING for custom model (NO fallback to built-in)', async () => {
    const customModel: PeiModelDefinition = {
      id: 'custom_model_missing_source',
      name: 'Modello Personalizzato Senza PDF',
      schoolOrder: 'A1',
      originType: 'TERRITORIAL',
      originName: 'ATS Territoriale',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: 'deadbeef1234567890',
      sourceSha256: 'deadbeef1234567890',
      templateId: 'custom_model_missing_source',
      calibrationStatus: 'CALIBRATED',
    };

    await expect(
      resolveTemplateSource({
        modelDef: customModel,
        modelId: 'custom_model_missing_source',
        schoolOrder: 'A1',
        customModels: [customModel],
      })
    ).rejects.toThrowError(TemplateSourceError);

    try {
      await resolveTemplateSource({
        modelDef: customModel,
        modelId: 'custom_model_missing_source',
        schoolOrder: 'A1',
        customModels: [customModel],
      });
    } catch (err: any) {
      expect(err).toBeInstanceOf(TemplateSourceError);
      expect(err.code).toBe('TEMPLATE_SOURCE_MISSING');
      expect(err.message).toContain('Modello Personalizzato Senza PDF');
      expect(err.details?.modelId).toBe('custom_model_missing_source');
      expect(err.message).not.toContain('ALLEGATO_A1');
    }
  });
});
