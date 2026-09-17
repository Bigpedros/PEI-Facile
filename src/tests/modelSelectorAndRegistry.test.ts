import { describe, it, expect } from 'vitest';
import {
  MINISTERIAL_PEI_MODELS,
  INITIAL_CUSTOM_PEI_MODELS,
  getAllRegistryModels,
  getActiveRegistryModels,
  findModelDefinition,
  resolveMinisterialOrder,
  getMinisterialCanonicalInfo,
} from '../data/peiModelRegistry';
import { createEmptyPeiDocument } from '../data/masterPeiStructure';
import type { PeiModelDefinition, PeiDocument } from '../types/pei';

describe('PEI FACILE — UI Corrective R01: Model Registry & Selector Requirements', () => {
  it('TEST 1: Il registry unico contiene tutti i 4 modelli ministeriali A1-A4', () => {
    const all = getAllRegistryModels(INITIAL_CUSTOM_PEI_MODELS);
    const ministerial = all.filter((m) => m.isMinisterial);
    expect(ministerial.length).toBe(4);
    expect(ministerial.map((m) => m.schoolOrder)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('TEST 2: Risoluzione corretta di modelli ministeriali e modelli custom registrati', () => {
    // Risoluzione A1-A4
    expect(resolveMinisterialOrder('A1')).toBe('A1');
    expect(resolveMinisterialOrder('MINISTERIAL_A2')).toBe('A2');
    expect(resolveMinisterialOrder('A3')).toBe('A3');
    expect(resolveMinisterialOrder('A4')).toBe('A4');

    // Canonical info
    const infoA2 = getMinisterialCanonicalInfo('A2');
    expect(infoA2?.modelId).toBe('MINISTERIAL_A2');
    expect(infoA2?.geometryMappingId).toBe('A2');
    expect(infoA2?.templateSchemaId).toBe('SCHEMA_MINISTERIAL_A2');

    // Risoluzione modello custom
    const customDef = findModelDefinition('model_demo_1', INITIAL_CUSTOM_PEI_MODELS);
    expect(customDef).toBeDefined();
    expect(customDef?.name).toBe('Modello PEI Inclusivo Territoriale');
    expect(customDef?.schoolOrder).toBe('A3');
  });

  it('TEST 3: Creazione documento con modello custom popola atomicamente tutti i metadata', () => {
    const customModel: PeiModelDefinition = {
      id: 'model_custom_test_roma',
      name: 'PEI Istituto Comprensivo Roma Centro',
      schoolOrder: 'A3',
      originType: 'INSTITUTION',
      originName: 'I.C. Roma Centro',
      version: '2.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: 'SHA256:TEST',
      templateId: 'model_custom_test_roma',
      geometryMappingId: 'model_custom_test_roma',
      templateSchemaId: 'SCHEMA_model_custom_test_roma',
      calibrationStatus: 'CALIBRATED',
    };

    const doc: PeiDocument = createEmptyPeiDocument('A3', 'ALU-TEST', 'Scuola Roma', 'Classe 1^ A', customModel);

    expect(doc.modelId).toBe('model_custom_test_roma');
    expect(doc.modelName).toBe('PEI Istituto Comprensivo Roma Centro');
    expect(doc.schoolOrder).toBe('A3');
    expect(doc.modelVersion).toBe('2.0');
    expect(doc.modelOrigin).toBe('INSTITUTION');
    expect(doc.customModelId).toBe('model_custom_test_roma');
    expect(doc.customModelName).toBe('PEI Istituto Comprensivo Roma Centro');
  });

  it('TEST 4: Modello non calibrato mantiene calibrationStatus REVIEW_REQUIRED', () => {
    const uncalibratedModel = INITIAL_CUSTOM_PEI_MODELS.find((m) => m.id === 'model_demo_1');
    expect(uncalibratedModel).toBeDefined();
    expect(uncalibratedModel?.calibrationStatus).toBe('REVIEW_REQUIRED');

    const doc = createEmptyPeiDocument('A3', 'ALU-TEST', 'Scuola Roma', 'Classe 1^ A', uncalibratedModel);
    const resolved = findModelDefinition(doc.modelId, INITIAL_CUSTOM_PEI_MODELS);
    expect(resolved?.calibrationStatus).toBe('REVIEW_REQUIRED');
  });

  it('TEST 5: Il filtro modelli attivi restituisce solo modelli con status "attivo"', () => {
    const customList: PeiModelDefinition[] = [
      {
        id: 'model_active',
        name: 'Modello Attivo',
        schoolOrder: 'A2',
        originType: 'TERRITORIAL',
        originName: 'Territorio X',
        version: '1.0',
        format: 'PDF',
        status: 'attivo',
        isDefault: false,
        isMinisterial: false,
        sourceHash: 'H1',
      },
      {
        id: 'model_archived',
        name: 'Modello Archiviato',
        schoolOrder: 'A2',
        originType: 'TERRITORIAL',
        originName: 'Territorio Y',
        version: '1.0',
        format: 'PDF',
        status: 'archiviato',
        isDefault: false,
        isMinisterial: false,
        sourceHash: 'H2',
      },
    ];

    const active = getActiveRegistryModels(customList);
    expect(active.some((m) => m.id === 'model_active')).toBe(true);
    expect(active.some((m) => m.id === 'model_archived')).toBe(false);
  });
});
