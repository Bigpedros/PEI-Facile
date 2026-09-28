/**
 * @license
 * PEI FACILE — CTE-FIX-02Q Regression Test Suite
 * Hierarchical model classification with versioned ministerial baseline, school year awareness,
 * semantic signatures for DOCX, and backward compatibility.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDocumentModel,
  extractAndNormalizeSchoolYear,
  inferSchoolYearFromDates,
  isSchoolYearInRange,
  calculateCustomModelSemanticScore,
} from '../core/semanticAcquisitionEngine';
import type { PeiModelDefinition } from '../types/pei';

describe('CTE-FIX-02Q — Hierarchical Model Classification & Signature Suite', () => {
  const customModelRoma: PeiModelDefinition = {
    id: 'model_custom_roma_infanzia',
    name: 'PEI Comune di Roma Infanzia',
    schoolOrder: 'A1',
    originType: 'INSTITUTION',
    originName: 'Comune di Roma',
    version: '1.2',
    format: 'DOCX',
    status: 'attivo',
    isDefault: false,
    isMinisterial: false,
    sourceHash: 'sha256-roma-infanzia-test-hash',
    baselineValidFromSchoolYear: '2024/2025',
    baselineValidToSchoolYear: '2026/2027',
    semanticSignature: ['comune di roma', 'campi di esperienza', 'capitolo infanzia', 'roma capitale'],
  };

  it('TEST A: pure A1 ministerial text resolves to MINISTERIAL_A1 when no compatible custom models exist', () => {
    const text = 'Questo è un PEI scolastico compilato per la Scuola dell\'Infanzia allegato a1. Campi di esperienza.';
    const result = classifyDocumentModel(text, []);

    expect(result.detectedOrder).toBe('A1');
    expect(result.detectedModelId).toBe('MINISTERIAL_A1');
    expect(result.isModelRecognized).toBe(true);
    expect(result.schoolYear).toBeUndefined();
  });

  it('TEST B: DOCX Comune Roma Infanzia text with A1 markers + derived signature resolves to custom model', () => {
    const text = 'Unione Europea. Roma Capitale - Comune di Roma. Allegato A1 - Scuola dell\'Infanzia. Campi di esperienza. Capitolo Infanzia.';
    const result = classifyDocumentModel(text, [customModelRoma]);

    expect(result.detectedOrder).toBe('A1');
    expect(result.detectedModelId).toBe('model_custom_roma_infanzia');
    expect(result.detectedModelName).toBe('PEI Comune di Roma Infanzia');
    expect(result.isModelRecognized).toBe(true);
  });

  it('TEST C: PDF equivalent is still recognized and backward compatible with geometry/hashes', () => {
    const text = 'Firma del file: sha256-roma-infanzia-test-hash. Progetto educativo individualizzato.';
    const result = classifyDocumentModel(text, [customModelRoma]);

    expect(result.detectedOrder).toBe('A1');
    expect(result.detectedModelId).toBe('model_custom_roma_infanzia');
    expect(result.isModelRecognized).toBe(true);
  });

  it('TEST D: different filename does not affect recognition (since we use semantic signature of the full text)', () => {
    const text = 'test_random_filename_xyz.docx\nRoma Capitale. Comune di Roma. Allegato A1 - Campi di esperienza. Capitolo Infanzia.';
    const result = classifyDocumentModel(text, [customModelRoma]);

    expect(result.detectedModelId).toBe('model_custom_roma_infanzia');
    expect(result.isModelRecognized).toBe(true);
  });

  it('TEST E: rimosso Comune di Roma ma altre evidenze sufficienti -> custom riconosciuto se score sufficiente', () => {
    // Missing "Comune di Roma", but still contains "Campi di esperienza", "Capitolo Infanzia", "Roma Capitale"
    const text = 'Allegato A1. Roma Capitale. Campi di esperienza. Capitolo Infanzia.';
    const result = classifyDocumentModel(text, [customModelRoma]);

    expect(result.detectedModelId).toBe('model_custom_roma_infanzia');
    expect(result.isModelRecognized).toBe(true);
  });

  it('TEST F: A1 ambiguo con testo generico -> fallback ministeriale coerente', () => {
    const text = 'Allegato A1 genertico con campi di esperienza.';
    const result = classifyDocumentModel(text, [customModelRoma]); // Score on Roma is very low since no "Roma" tokens exist

    expect(result.detectedModelId).toBe('MINISTERIAL_A1');
    expect(result.isModelRecognized).toBe(true);
  });

  it('TEST G: schoolYear 2025/2026 is correctly extracted and normalized', () => {
    const text1 = 'Modello valido per l\'anno scolastico 2025/2026';
    const text2 = 'a.s. 2025-2026';
    const text3 = 'A.S. 2025 / 2026';
    const text4 = 'a.s. 2025/26';

    expect(extractAndNormalizeSchoolYear(text1)).toBe('2025/2026');
    expect(extractAndNormalizeSchoolYear(text2)).toBe('2025/2026');
    expect(extractAndNormalizeSchoolYear(text3)).toBe('2025/2026');
    expect(extractAndNormalizeSchoolYear(text4)).toBe('2025/2026');
  });

  it('TEST H: two baselines of same family, document matching schoolYear 2025/2026 filters correctly', () => {
    const customOld: PeiModelDefinition = {
      id: 'old_model',
      name: 'PEI Vecchio',
      schoolOrder: 'A1',
      originType: 'INSTITUTION',
      originName: 'Comune di Roma',
      version: '1.0',
      format: 'DOCX',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: 'old-hash',
      baselineValidFromSchoolYear: '2022/2023',
      baselineValidToSchoolYear: '2023/2024',
    };

    const customNew: PeiModelDefinition = {
      id: 'new_model',
      name: 'PEI Nuovo',
      schoolOrder: 'A1',
      originType: 'INSTITUTION',
      originName: 'Comune di Roma',
      version: '2.0',
      format: 'DOCX',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: 'new-hash',
      baselineValidFromSchoolYear: '2024/2025',
      baselineValidToSchoolYear: '2026/2027',
    };

    const text = 'Comune di Roma. Anno Scolastico 2025/2026. Allegato A1 Infanzia.';
    const result = classifyDocumentModel(text, [customOld, customNew]);

    expect(result.detectedModelId).toBe('new_model');
    expect(result.schoolYear).toBe('2025/2026');
  });

  it('TEST I: schoolYear absent -> not invented, continues with reduced confidence', () => {
    const text = 'Modello Comune di Roma. Allegato A1.';
    const result = classifyDocumentModel(text, [customModelRoma]);

    expect(result.schoolYear).toBeUndefined();
    expect(result.detectedModelId).toBe('model_custom_roma_infanzia');
  });

  it('TEST J: temporal date inference maps Dec 2005 and Jan 2006 to same school year 2005/2006', () => {
    const textProvvisorio = 'PEI Provvisorio redatto in data 15 dicembre 2005';
    const textDefinitivo = 'PEI Definitivo approvato il 10 gennaio 2006';

    const yProvv = inferSchoolYearFromDates(textProvvisorio);
    const yDef = inferSchoolYearFromDates(textDefinitivo);

    expect(yProvv).toBe('2005/2006');
    expect(yDef).toBe('2005/2006');
    expect(yProvv).toEqual(yDef);
  });

  it('TEST K: custom legacy models without new metadata do not crash and remain fully compatible', () => {
    const legacyModel: PeiModelDefinition = {
      id: 'legacy_model_1',
      name: 'Modello Custom Legacy',
      schoolOrder: 'A1',
      originType: 'OTHER',
      originName: 'Scuola Test',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: 'legacy-hash',
    };

    const text = 'Questo è il Modello Custom Legacy per la scuola dell\'infanzia.';
    const result = classifyDocumentModel(text, [legacyModel]);

    expect(result.detectedModelId).toBe('legacy_model_1');
    expect(result.isModelRecognized).toBe(true);
  });
});
