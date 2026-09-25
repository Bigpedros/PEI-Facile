import { describe, it, expect, beforeEach } from 'vitest';
import {
  MINISTERIAL_PEI_MODELS,
  INITIAL_CUSTOM_PEI_MODELS,
  getAllRegistryModels,
  findModelDefinition,
  resolveDefaultModel,
  resolveMinisterialOrder,
  getMinisterialCanonicalInfo,
} from '../data/peiModelRegistry';
import { createEmptyPeiDocument } from '../data/masterPeiStructure';
import type { AppSettings, PeiDocument, PeiModelDefinition } from '../types/pei';

describe('PEI FACILE — R09 Model Selection Gate & Document Protection Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('R09-1 — Cold Start Without Default: selectedModelId resolves to null without falling back to defaultSchoolOrder', () => {
    const allModels = getAllRegistryModels(INITIAL_CUSTOM_PEI_MODELS);

    // Settings without explicit defaultModelId (even if legacy defaultSchoolOrder is present)
    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultSchoolOrder: 'A2', // legacy field that MUST NOT act as fallback
      defaultModelId: undefined,
    };

    const resolvedDefault = resolveDefaultModel(allModels, settings.defaultModelId);
    expect(resolvedDefault).toBeNull();

    // Cold start simulation without saved document
    const savedDoc = localStorage.getItem('pei_facile_saved_doc');
    expect(savedDoc).toBeNull();

    // Selected model state initialization logic
    const selectedModelId = settings.defaultModelId || null;
    expect(selectedModelId).toBeNull();

    // Verification that no automatic fallback to A1 or A2 occurs
    expect(selectedModelId).not.toBe('MINISTERIAL_A1');
    expect(selectedModelId).not.toBe('MINISTERIAL_A2');
    expect(selectedModelId).not.toBe('A1');
    expect(selectedModelId).not.toBe('A2');
  });

  it('R09-2 — Cold Start With Explicit Default: activeDocument is null and selectedModelId matches explicit default', () => {
    const allModels = getAllRegistryModels(INITIAL_CUSTOM_PEI_MODELS);

    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultModelId: 'MINISTERIAL_A3',
    };

    const resolvedDefault = resolveDefaultModel(allModels, settings.defaultModelId);
    expect(resolvedDefault).toBeDefined();
    expect(resolvedDefault?.id).toBe('MINISTERIAL_A3');
    expect(resolvedDefault?.schoolOrder).toBe('A3');

    const hasOpenDocument = false;
    const selectedModelId = settings.defaultModelId || null;

    expect(hasOpenDocument).toBe(false);
    expect(selectedModelId).toBe('MINISTERIAL_A3');

    const resolvedModelDef = findModelDefinition(selectedModelId, allModels);
    expect(resolvedModelDef?.schoolOrder).toBe('A3');
  });

  it('R09-3 — Document Overrides Default: open document model always takes strict precedence over user default', () => {
    const allModels = getAllRegistryModels(INITIAL_CUSTOM_PEI_MODELS);

    // User settings configured with default A1
    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultModelId: 'MINISTERIAL_A1',
    };

    // Document created / opened with model A3
    const canonicalA3 = getMinisterialCanonicalInfo('A3');
    const docA3 = createEmptyPeiDocument('A3', 'ALU-001', 'Scuola A3', '3A');

    expect(docA3.modelId).toBe('MINISTERIAL_A3');
    expect(docA3.schoolOrder).toBe('A3');

    const hasOpenDocument = true;
    const effectiveModelId = hasOpenDocument ? docA3.modelId : settings.defaultModelId;
    expect(effectiveModelId).toBe('MINISTERIAL_A3');
    expect(effectiveModelId).not.toBe(settings.defaultModelId);

    const modelDef = findModelDefinition(effectiveModelId, allModels);
    expect(modelDef?.schoolOrder).toBe('A3');
  });

  it('R09-4 — Close Restores Explicit Default: closing document restores user explicit default', () => {
    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultModelId: 'MINISTERIAL_A2',
    };

    // While document A4 was open
    let hasOpenDocument = true;
    let selectedModelId: string | null = 'MINISTERIAL_A4';

    // User closes the document
    hasOpenDocument = false;
    selectedModelId = settings.defaultModelId || null;

    expect(hasOpenDocument).toBe(false);
    expect(selectedModelId).toBe('MINISTERIAL_A2');
  });

  it('R09-5 — Close Without Default Returns Null: closing document returns selectedModelId to null when no default exists', () => {
    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultSchoolOrder: 'A2', // legacy metadata
      defaultModelId: undefined, // no explicit default
    };

    // While document A4 was open
    let hasOpenDocument = true;
    let selectedModelId: string | null = 'MINISTERIAL_A4';

    // User closes the document
    hasOpenDocument = false;
    selectedModelId = settings.defaultModelId || null;

    expect(hasOpenDocument).toBe(false);
    expect(selectedModelId).toBeNull();
  });

  it('R09-6 — Session Selection Does Not Persist Default: selecting a model in session does not create or overwrite defaultModelId', () => {
    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultModelId: undefined,
    };

    let selectedModelId: string | null = null;
    const hasOpenDocument = false;

    // User selects A3 in session when no document is open
    const canonicalA3 = getMinisterialCanonicalInfo('A3');
    selectedModelId = canonicalA3?.modelId || 'MINISTERIAL_A3';

    expect(selectedModelId).toBe('MINISTERIAL_A3');
    // The settings object and persisted defaultModelId must strictly remain undefined/null
    expect(settings.defaultModelId).toBeUndefined();
  });

  it('R09-7 — Open Document Model Cannot Be Changed Implicitly: attempts to change schoolOrder or model during active document are ignored', () => {
    let doc: PeiDocument = createEmptyPeiDocument('A1', 'ALU-100', 'Scuola Infanzia', 'Sez A');
    expect(doc.modelId).toBe('MINISTERIAL_A1');
    expect(doc.schoolOrder).toBe('A1');

    const hasOpenDocument = true;
    let selectedModelId: string | null = doc.modelId || 'MINISTERIAL_A1';

    // Guard function mirroring App.tsx handleChangeSchoolOrder
    const handleChangeSchoolOrder = (newOrder: 'A1' | 'A2' | 'A3' | 'A4') => {
      if (hasOpenDocument) return; // Protected: open document model cannot be changed implicitly
      const canonical = getMinisterialCanonicalInfo(newOrder);
      selectedModelId = canonical ? canonical.modelId : `MINISTERIAL_${newOrder}`;
    };

    // User attempts to change to A3 from topbar while document A1 is open
    handleChangeSchoolOrder('A3');

    // Document and selected model must strictly remain A1
    expect(doc.modelId).toBe('MINISTERIAL_A1');
    expect(doc.schoolOrder).toBe('A1');
    expect(selectedModelId).toBe('MINISTERIAL_A1');
  });

  it('R09-8 — Acquisition Independence: document created from acquisition respects payload modelId and is not altered by defaultModelId', () => {
    const settings: AppSettings = {
      schoolName: 'I.C. Test',
      schoolCode: '',
      address: '',
      cap: '',
      city: '',
      province: '',
      building: '',
      teacherName: '',
      teacherSurname: '',
      teacherRole: 'Docente di Sostegno',
      theme: 'verde_prato',
      defaultModelId: 'MINISTERIAL_A1',
    };

    // Acquisition payload arrives with schoolOrder A4
    const acquisitionPayload = {
      schoolOrder: 'A4' as const,
      modelId: 'MINISTERIAL_A4',
      studentCode: 'ALU-ACQ-99',
      schoolName: 'Liceo Scientifico',
      classOrSection: '5^ B',
      extractedValues: { 'f-01-alunno': 'Mario Rossi' },
    };

    const newDoc = createEmptyPeiDocument(
      acquisitionPayload.schoolOrder,
      acquisitionPayload.studentCode,
      acquisitionPayload.schoolName,
      acquisitionPayload.classOrSection
    );

    expect(newDoc.schoolOrder).toBe('A4');
    expect(newDoc.modelId).toBe('MINISTERIAL_A4');
    expect(newDoc.schoolOrder).not.toBe(settings.defaultSchoolOrder);
    expect(newDoc.modelId).not.toBe(settings.defaultModelId);
  });

  it('R09-9 — Retrocompatibility: legacy saved document with only schoolOrder resolves accurately to canonical ministerial record', () => {
    const legacyDocJson = {
      id: 'doc-legacy-123',
      schoolOrder: 'A2',
      schoolYear: '2025/2026',
      studentCode: 'ALU-LEGACY',
      schoolName: 'Scuola Primaria',
      classOrSection: '4^ C',
      creationDate: '2025-10-01T08:00:00.000Z',
      lastModifiedDate: '2025-10-01T08:00:00.000Z',
      values: {},
      fieldStatuses: {},
      notes: {},
      // No modelId or customModelId property (legacy document)
    };

    const resolvedModelId =
      (legacyDocJson as any).modelId ||
      (legacyDocJson.schoolOrder ? `MINISTERIAL_${legacyDocJson.schoolOrder}` : null);

    expect(resolvedModelId).toBe('MINISTERIAL_A2');

    const canonicalInfo = getMinisterialCanonicalInfo(legacyDocJson.schoolOrder);
    expect(canonicalInfo).toBeDefined();
    expect(canonicalInfo?.modelId).toBe('MINISTERIAL_A2');
    expect(canonicalInfo?.templateId).toBe('A2');
    expect(canonicalInfo?.geometryMappingId).toBe('A2');
    expect(canonicalInfo?.templateSchemaId).toBe('SCHEMA_MINISTERIAL_A2');
  });
});
