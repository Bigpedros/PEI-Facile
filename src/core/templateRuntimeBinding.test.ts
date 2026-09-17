/**
 * @license
 * PEI FACILE — Phase 1C-R1 Mandatory Runtime Binding Test Suite
 *
 * Formal verification of the 8 mandatory runtime checks specified in Phase 1C-R1:
 * - TEST 1: Storage template vuoto + A1 → PDF A1 bundled visibile.
 * - TEST 2: Storage template vuoto + A2 → PDF A2 bundled visibile.
 * - TEST 3: Storage template vuoto + A3 → PDF A3 bundled visibile.
 * - TEST 4: Storage template vuoto + A4 → PDF A4 bundled visibile.
 * - TEST 5: Custom senza sorgente IndexedDB → TEMPLATE_SOURCE_MISSING.
 * - TEST 6: Custom non calibrato → MODEL_CALIBRATION_REQUIRED.
 * - TEST 7: Built-in hash errato → TEMPLATE_INTEGRITY_MISMATCH.
 * - TEST 8: Built-in A1 → NON deve mostrare messaggi relativi ai modelli custom.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveTemplateSource,
  TemplateSourceError,
  computeSha256,
} from './templateSourceResolver';
import { clearAllCustomTemplates } from './templateStorage';
import { validateTemplateForCompilation } from './templateSchemaService';
import {
  MINISTERIAL_PEI_MODELS,
  MINISTERIAL_CANONICAL_MAP,
  resolveMinisterialOrder,
} from '../data/peiModelRegistry';
import type { PeiModelDefinition } from '../types/pei';

describe('Phase 1C-R1 — Ministerial Template Runtime Binding Tests', () => {
  beforeEach(async () => {
    // Ensure both IndexedDB and memory stores are completely empty
    await clearAllCustomTemplates();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // ============================================================
  // TEST 1: Storage template vuoto + A1 → PDF A1 bundled visibile
  // ============================================================
  it('TEST 1: Storage template vuoto + A1 risolve il PDF A1 bundled originale', async () => {
    const resolved = await resolveTemplateSource({
      modelId: 'MINISTERIAL_A1',
      schoolOrder: 'A1',
    });

    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.sourcePath).toBe('/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    expect(resolved.sourceBinary.byteLength).toBeGreaterThan(100000);
    expect(resolved.schoolOrder).toBe('A1');
    expect(resolved.calibrationStatus).toBe('CALIBRATED');
    expect(resolved.calibrationOrigin).toBe('BUILT_IN_BASELINE');
    expect(resolved.templateSchema).toBeDefined();
    expect(resolved.templateSchema.totalPages).toBe(12);
    expect(resolved.geometryMapping).toBeDefined();
    expect(resolved.geometryMapping.totalPages).toBe(12);

    // Verify SHA-256 matches baseline exactly
    const calculatedSha = await computeSha256(resolved.sourceBinary);
    expect(calculatedSha).toBe(MINISTERIAL_CANONICAL_MAP.A1.sourceSha256);
  });

  // ============================================================
  // TEST 2: Storage template vuoto + A2 → PDF A2 bundled visibile
  // ============================================================
  it('TEST 2: Storage template vuoto + A2 risolve il PDF A2 bundled originale', async () => {
    const resolved = await resolveTemplateSource({
      modelId: 'MINISTERIAL_A2',
      schoolOrder: 'A2',
    });

    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.sourcePath).toBe('/models/ALLEGATO_A2_PEI_PRIMARIA.pdf');
    expect(resolved.sourceBinary.byteLength).toBeGreaterThan(100000);
    expect(resolved.schoolOrder).toBe('A2');
    expect(resolved.calibrationStatus).toBe('CALIBRATED');
    expect(resolved.calibrationOrigin).toBe('BUILT_IN_BASELINE');
    expect(resolved.templateSchema.totalPages).toBe(13);
    expect(resolved.geometryMapping.totalPages).toBe(13);

    const calculatedSha = await computeSha256(resolved.sourceBinary);
    expect(calculatedSha).toBe(MINISTERIAL_CANONICAL_MAP.A2.sourceSha256);
  });

  // ============================================================
  // TEST 3: Storage template vuoto + A3 → PDF A3 bundled visibile
  // ============================================================
  it('TEST 3: Storage template vuoto + A3 risolve il PDF A3 bundled originale', async () => {
    const resolved = await resolveTemplateSource({
      modelId: 'MINISTERIAL_A3',
      schoolOrder: 'A3',
    });

    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.sourcePath).toBe('/models/ALLEGATO_A3_PEI_SEC_1_GRADO.pdf');
    expect(resolved.sourceBinary.byteLength).toBeGreaterThan(100000);
    expect(resolved.schoolOrder).toBe('A3');
    expect(resolved.calibrationStatus).toBe('CALIBRATED');
    expect(resolved.calibrationOrigin).toBe('BUILT_IN_BASELINE');
    expect(resolved.templateSchema.totalPages).toBe(12);
    expect(resolved.geometryMapping.totalPages).toBe(12);

    const calculatedSha = await computeSha256(resolved.sourceBinary);
    expect(calculatedSha).toBe(MINISTERIAL_CANONICAL_MAP.A3.sourceSha256);
  });

  // ============================================================
  // TEST 4: Storage template vuoto + A4 → PDF A4 bundled visibile
  // ============================================================
  it('TEST 4: Storage template vuoto + A4 risolve il PDF A4 bundled originale', async () => {
    const resolved = await resolveTemplateSource({
      modelId: 'MINISTERIAL_A4',
      schoolOrder: 'A4',
    });

    expect(resolved.sourceKind).toBe('BUILT_IN');
    expect(resolved.sourcePath).toBe('/models/ALLEGATO_A4_PEI_SEC_2_GRADO.pdf');
    expect(resolved.sourceBinary.byteLength).toBeGreaterThan(100000);
    expect(resolved.schoolOrder).toBe('A4');
    expect(resolved.calibrationStatus).toBe('CALIBRATED');
    expect(resolved.calibrationOrigin).toBe('BUILT_IN_BASELINE');
    expect(resolved.templateSchema.totalPages).toBe(14);
    expect(resolved.geometryMapping.totalPages).toBe(14);

    const calculatedSha = await computeSha256(resolved.sourceBinary);
    expect(calculatedSha).toBe(MINISTERIAL_CANONICAL_MAP.A4.sourceSha256);
  });

  // ============================================================
  // TEST 5: Custom senza sorgente IndexedDB → TEMPLATE_SOURCE_MISSING
  // ============================================================
  it('TEST 5: Custom senza sorgente in IndexedDB genera errore TEMPLATE_SOURCE_MISSING', async () => {
    const customCalibratedModel: PeiModelDefinition = {
      id: 'custom_calibrated_without_file',
      name: 'Modello Territoriale Milano Ovest',
      schoolOrder: 'A2',
      originType: 'TERRITORIAL',
      originName: 'CTS Milano',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
      sourceSha256: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
      calibrationStatus: 'CALIBRATED',
      calibrationOrigin: 'USER_REVIEW',
      geometryValidationStatus: 'PASS',
      visualReviewStatus: 'COMPLETED',
    };

    try {
      await resolveTemplateSource({
        modelDef: customCalibratedModel,
      });
      expect.fail('Dovrebbe lanciare un errore');
    } catch (err: any) {
      expect(err).toBeInstanceOf(TemplateSourceError);
      expect(err.code).toBe('TEMPLATE_SOURCE_MISSING');
      expect(err.message).toContain('TEMPLATE SOURCE MISSING');
    }
  });

  // ============================================================
  // TEST 6: Custom non calibrato → MODEL_CALIBRATION_REQUIRED
  // ============================================================
  it('TEST 6: Custom non calibrato genera errore MODEL_CALIBRATION_REQUIRED', async () => {
    const uncalibratedCustomModel: PeiModelDefinition = {
      id: 'custom_uncalibrated_model',
      name: 'Modello Bozza Territoriale',
      schoolOrder: 'A3',
      originType: 'TERRITORIAL',
      originName: 'Rete Inclusione',
      version: '0.9',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: 'abc123hash',
      calibrationStatus: 'REVIEW_REQUIRED',
      geometryValidationStatus: 'NOT_RUN',
      visualReviewStatus: 'REQUIRED',
    };

    try {
      await resolveTemplateSource({
        modelDef: uncalibratedCustomModel,
      });
      expect.fail('Dovrebbe lanciare un errore');
    } catch (err: any) {
      expect(err).toBeInstanceOf(TemplateSourceError);
      expect(err.code).toBe('MODEL_CALIBRATION_REQUIRED');
      expect(err.message).toContain('MODEL CALIBRATION REQUIRED');
    }
  });

  // ============================================================
  // TEST 7: Built-in hash errato → TEMPLATE_INTEGRITY_MISMATCH
  // ============================================================
  it('TEST 7: Built-in con hash non corrispondente genera errore TEMPLATE_INTEGRITY_MISMATCH', async () => {
    try {
      await resolveTemplateSource({
        modelId: 'MINISTERIAL_A1',
        schoolOrder: 'A1',
        mockCorruptedHash: true, // Simulates corrupted or altered file content
      });
      expect.fail('Dovrebbe lanciare TEMPLATE_INTEGRITY_MISMATCH');
    } catch (err: any) {
      expect(err).toBeInstanceOf(TemplateSourceError);
      expect(err.code).toBe('TEMPLATE_INTEGRITY_MISMATCH');
      expect(err.message).toContain('TEMPLATE INTEGRITY MISMATCH');
      expect(err.details?.expectedSha).toBe(MINISTERIAL_CANONICAL_MAP.A1.sourceSha256);
    }
  });

  // ============================================================
  // TEST 8: Built-in A1 → NON deve mostrare messaggi relativi ai modelli custom
  // ============================================================
  it('TEST 8: Built-in A1 convalida con successo e non produce errori semantici custom', () => {
    // 1. Gating validation must be valid
    const validation = validateTemplateForCompilation('MINISTERIAL_A1');
    expect(validation.isValid).toBe(true);
    expect(validation.errorMessage).toBeUndefined();
    expect(validation.errorCode).toBeUndefined();

    // 2. Canonical resolution confirms ministerial identity
    const resolvedOrder = resolveMinisterialOrder('MINISTERIAL_A1');
    expect(resolvedOrder).toBe('A1');

    // 3. For any ministerial order, it should never return a custom error message
    const orders: Array<'A1' | 'A2' | 'A3' | 'A4'> = ['A1', 'A2', 'A3', 'A4'];
    for (const ord of orders) {
      const v = validateTemplateForCompilation(ord);
      expect(v.isValid).toBe(true);
      const minModel = MINISTERIAL_PEI_MODELS.find((m) => m.schoolOrder === ord);
      expect(minModel).toBeDefined();
      expect(minModel?.isMinisterial).toBe(true);
      expect(minModel?.sourceKind).toBe('BUILT_IN');
      expect(minModel?.calibrationStatus).toBe('CALIBRATED');
      expect(minModel?.calibrationOrigin).toBe('BUILT_IN_BASELINE');
    }
  });
});
