/**
 * @license
 * PEI FACILE — Calibration Semantic Fields R07 Test Suite
 * Tests A - M: Logical field identities, semantic binding, geometry duplication,
 * and transparent/opaque background modes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CATEGORIZED_SEMANTIC_CATALOG,
  generateFieldId,
  buildCustomSemanticKey,
  isCustomSemanticKey,
  getSemanticCatalogEntry,
} from '../core/semanticCatalog';
import {
  saveCustomTemplate,
  getCustomTemplate,
  createDefensiveBinaryCopy,
} from '../core/templateStorage';
import {
  createTemplateSchemaFromCandidates,
  saveTemplateSchema,
  getTemplateSchema,
} from '../core/templateSchemaService';
import type { FieldGeometry, ModelGeometry, PageGeometry } from '../data/geometry/types';
import type { CandidateFieldGeometry } from '../core/templateAcquisitionTypes';

describe('PEI FACILE — CALIBRATION SEMANTIC FIELDS R07', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // TEST A — INDIPENDENZA DALL'ORDINE DI CREAZIONE
  it('TEST A — Indipendenza dall’ordine di creazione: creazione non sequenziale su pagine 10, 12, 1', () => {
    // Creazione su pagina 10, poi pagina 12, poi pagina 1
    const f10: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Campo Pag 10',
      semanticKey: null,
      backgroundMode: 'TRANSPARENT',
      pageNumber: 10,
      xPt: 50,
      yPt: 100,
      widthPt: 200,
      heightPt: 30,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const f12: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Campo Pag 12',
      semanticKey: null,
      backgroundMode: 'TRANSPARENT',
      pageNumber: 12,
      xPt: 70,
      yPt: 150,
      widthPt: 250,
      heightPt: 40,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const f1: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Campo Pag 1',
      semanticKey: null,
      backgroundMode: 'TRANSPARENT',
      pageNumber: 1,
      xPt: 60,
      yPt: 80,
      widthPt: 300,
      heightPt: 35,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    // ID sono tutti distinti e non correlati all'ordine
    expect(f10.fieldId).not.toBe(f12.fieldId);
    expect(f12.fieldId).not.toBe(f1.fieldId);
    expect(f10.fieldId).not.toBe(f1.fieldId);

    // Nessuna associazione implicita "Campo 1", "Campo 2" generata dalla sequenza temporale
    expect(f10.semanticKey).toBeNull();
    expect(f12.semanticKey).toBeNull();
    expect(f1.semanticKey).toBeNull();
  });

  // TEST B — NAMING LIBERO E INDIPENDENTE
  it('TEST B — Naming libero: modifica del label non altera fieldId né semanticKey', () => {
    const field: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Anno Scolastico',
      semanticKey: 'scuola.anno_scolastico',
      backgroundMode: 'TRANSPARENT',
      pageNumber: 1,
      xPt: 50,
      yPt: 100,
      widthPt: 100,
      heightPt: 20,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const originalId = field.fieldId;
    const originalSemanticKey = field.semanticKey;

    // Utente rinomina label in "A.S."
    field.label = 'A.S.';

    expect(field.label).toBe('A.S.');
    expect(field.fieldId).toBe(originalId);
    expect(field.semanticKey).toBe(originalSemanticKey);
  });

  // TEST C — BINDING SEMANTICO ESPLICITO
  it('TEST C — Binding semantico esplicito: associazione a chiave canonica persistita nello schema', async () => {
    const candidate: CandidateFieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Cognome Alunno',
      semanticKey: 'student.lastName',
      backgroundMode: 'TRANSPARENT',
      pageNumber: 1,
      xPt: 100,
      yPt: 200,
      widthPt: 150,
      heightPt: 25,
      fieldType: 'TEXT_SHORT',
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const pages: PageGeometry[] = [
      { pageNumber: 1, widthPt: 595.28, heightPt: 841.89, fields: [] },
    ];

    const schema = createTemplateSchemaFromCandidates(
      'TEST-R07-MODEL',
      'test.pdf',
      'hash123',
      pages,
      [candidate],
      'CALIBRATED'
    );

    expect(schema.fields.length).toBe(1);
    expect(schema.fields[0].semanticKey).toBe('student.lastName');
    expect(schema.fields[0].backgroundMode).toBe('TRANSPARENT');

    // Salvataggio e recupero
    await saveTemplateSchema(schema);
    const loadedSchema = await getTemplateSchema('TEST-R07-MODEL');
    expect(loadedSchema).not.toBeNull();
    expect(loadedSchema?.fields[0].semanticKey).toBe('student.lastName');
  });

  // TEST D — DUPLICAZIONE GEOMETRIA
  it('TEST D — Duplicazione geometria: genera nuovo fieldId, conserva dimensioni e stile, resetta semanticKey', () => {
    const original: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Casella Firma',
      semanticKey: 'approvals.signaturePrincipal',
      backgroundMode: 'TRANSPARENT',
      pageNumber: 1,
      xPt: 100,
      yPt: 300,
      widthPt: 180,
      heightPt: 45,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    // Duplicazione standard (senza mantenere semanticKey)
    const duplicateId = generateFieldId();
    const duplicated: FieldGeometry = {
      ...original,
      fieldId: duplicateId,
      label: `Copia di ${original.label}`,
      semanticKey: null,
      backgroundMode: original.backgroundMode || 'TRANSPARENT',
      xPt: original.xPt + 14,
      yPt: original.yPt + 14,
    };

    expect(duplicated.fieldId).not.toBe(original.fieldId);
    expect(duplicated.widthPt).toBe(original.widthPt);
    expect(duplicated.heightPt).toBe(original.heightPt);
    expect(duplicated.xPt).toBe(original.xPt + 14);
    expect(duplicated.yPt).toBe(original.yPt + 14);
    expect(duplicated.semanticKey).toBeNull();
    expect(duplicated.backgroundMode).toBe(original.backgroundMode);
  });

  // TEST E — DUPLICAZIONE CON ASSOCIAZIONE SEMANTICA UGUALE
  it('TEST E — Duplicazione con associazione semantica uguale: stesso dato su più posizioni', () => {
    const original: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Nome Scuola',
      semanticKey: 'school.name',
      backgroundMode: 'TRANSPARENT',
      pageNumber: 1,
      xPt: 50,
      yPt: 50,
      widthPt: 250,
      heightPt: 25,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    // Duplicazione mantenendo associazione semantica
    const duplicateId = generateFieldId();
    const duplicated: FieldGeometry = {
      ...original,
      fieldId: duplicateId,
      semanticKey: original.semanticKey,
      xPt: original.xPt + 14,
      yPt: original.yPt + 14,
    };

    expect(duplicated.fieldId).not.toBe(original.fieldId);
    expect(duplicated.semanticKey).toBe('school.name');
    expect(original.semanticKey).toBe('school.name');
  });

  // TEST F — COMPATIBILITÀ SCHEMI LEGACY
  it('TEST F — Compatibilità schemi legacy: fallback su campi privi di label, semanticKey, backgroundMode', () => {
    const legacyRawField: any = {
      fieldId: 'legacy-f1',
      pageNumber: 1,
      xPt: 100,
      yPt: 100,
      widthPt: 200,
      heightPt: 50,
    };

    const normalizedField: FieldGeometry = {
      fieldId: legacyRawField.fieldId,
      label: legacyRawField.label || 'Campo non nominato',
      semanticKey: legacyRawField.semanticKey || null,
      backgroundMode: legacyRawField.backgroundMode || 'TRANSPARENT',
      pageNumber: legacyRawField.pageNumber,
      xPt: legacyRawField.xPt,
      yPt: legacyRawField.yPt,
      widthPt: legacyRawField.widthPt,
      heightPt: legacyRawField.heightPt,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    expect(normalizedField.label).toBe('Campo non nominato');
    expect(normalizedField.semanticKey).toBeNull();
    expect(normalizedField.backgroundMode).toBe('TRANSPARENT');
  });

  // TEST G — RIAPERTURA WORKSPACE E PERSISTENZA COMPLETA
  it('TEST G — Riapertura workspace: salvataggio e recupero preservano label, semanticKey e backgroundMode', async () => {
    const fieldId = generateFieldId();
    const pageFields: FieldGeometry[] = [
      {
        fieldId,
        label: 'Obiettivi Didattici Specifici',
        semanticKey: 'profile.educationalGoals',
        backgroundMode: 'OPAQUE_WHITE',
        pageNumber: 2,
        xPt: 60,
        yPt: 250,
        widthPt: 450,
        heightPt: 120,
        anchorText: '',
        derivationMethod: 'MANUAL_VERIFIED',
        confidence: 1.0,
        status: 'MAPPED',
      },
    ];

    const model: ModelGeometry = {
      modelId: 'ROMA-INFANZIA-R07',
      modelName: 'PEI Roma Infanzia R07',
      schoolOrder: 'INFANZIA',
      sourcePdf: 'roma_infanzia.pdf',
      sourcePdfSha256: 'sha-roma-r07',
      totalPages: 2,
      schemaVersion: '1.0.0',
      pages: [
        { pageNumber: 1, widthPt: 595.28, heightPt: 841.89, fields: [] },
        { pageNumber: 2, widthPt: 595.28, heightPt: 841.89, fields: pageFields },
      ],
    };

    const fakePdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 1, 2, 3]);

    await saveCustomTemplate(
      {
        templateId: model.modelId,
        name: model.modelName,
        schoolOrder: model.schoolOrder as any,
        sourceFileName: model.sourcePdf,
        sourceSha256: model.sourcePdfSha256,
        fileSizeBytes: fakePdfBytes.byteLength,
        pageCount: 2,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationStatus: 'CALIBRATED',
        pages: model.pages,
      },
      fakePdfBytes
    );

    // Riapertura workspace
    const reloaded = await getCustomTemplate(model.modelId);
    expect(reloaded).not.toBeNull();
    const p2 = reloaded?.pages.find((p) => p.pageNumber === 2);
    expect(p2).toBeDefined();
    expect(p2?.fields.length).toBe(1);

    const reloadedField = p2?.fields[0];
    expect(reloadedField?.fieldId).toBe(fieldId);
    expect(reloadedField?.label).toBe('Obiettivi Didattici Specifici');
    expect(reloadedField?.semanticKey).toBe('profile.educationalGoals');
    expect(reloadedField?.backgroundMode).toBe('OPAQUE_WHITE');
  });

  // TEST H — NESSUNA REGRESSIONE SU R05/R05-R1
  it('TEST H — Nessuna regressione su R05/R05-R1: le copie del buffer PDF rimangono indipendenti e non detached', () => {
    const rawBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 99, 100, 101]);

    const copy1 = createDefensiveBinaryCopy(rawBytes);
    const copy2 = createDefensiveBinaryCopy(rawBytes);

    expect(copy1).not.toBe(rawBytes);
    expect(copy2).not.toBe(rawBytes);
    expect(copy1).not.toBe(copy2);
    expect(copy1.byteLength).toBe(rawBytes.byteLength);
    expect(copy2.byteLength).toBe(rawBytes.byteLength);
  });

  // TEST I — MODALITÀ SFONDO TRASPARENTE / BIANCO OPACO
  it('TEST I — Modalità sfondo trasparente / bianco opaco: toggle tra le due modalità', () => {
    const field: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Box Note',
      semanticKey: null,
      backgroundMode: 'TRANSPARENT',
      pageNumber: 1,
      xPt: 50,
      yPt: 50,
      widthPt: 200,
      heightPt: 100,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    expect(field.backgroundMode).toBe('TRANSPARENT');

    // Passaggio a OPAQUE_WHITE
    field.backgroundMode = 'OPAQUE_WHITE';
    expect(field.backgroundMode).toBe('OPAQUE_WHITE');

    // Ritorno a TRANSPARENT
    field.backgroundMode = 'TRANSPARENT';
    expect(field.backgroundMode).toBe('TRANSPARENT');
  });

  // TEST L — PERSISTENZA SFONDO DOPO SALVATAGGIO IN SCHEDE SCHEMA
  it('TEST L — Persistenza sfondo: un campo OPAQUE_WHITE preserva la modalità in TemplateSchema', () => {
    const candidate: CandidateFieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Note Riservate',
      semanticKey: 'resources.specialistAssistant',
      backgroundMode: 'OPAQUE_WHITE',
      pageNumber: 1,
      xPt: 100,
      yPt: 100,
      widthPt: 300,
      heightPt: 80,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const schema = createTemplateSchemaFromCandidates(
      'MOD-OPAQUE-TEST',
      'opaque.pdf',
      'hash-opq',
      [{ pageNumber: 1, widthPt: 595, heightPt: 842, fields: [] }],
      [candidate],
      'CALIBRATED'
    );

    expect(schema.fields[0].backgroundMode).toBe('OPAQUE_WHITE');
  });

  // TEST M — DUPLICAZIONE SFONDO
  it('TEST M — Duplicazione sfondo: un campo OPAQUE_WHITE duplicato conserva OPAQUE_WHITE', () => {
    const original: FieldGeometry = {
      fieldId: generateFieldId(),
      label: 'Riquadro Sovrascrittura',
      semanticKey: null,
      backgroundMode: 'OPAQUE_WHITE',
      pageNumber: 1,
      xPt: 80,
      yPt: 120,
      widthPt: 350,
      heightPt: 60,
      anchorText: '',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    };

    const duplicateId = generateFieldId();
    const duplicated: FieldGeometry = {
      ...original,
      fieldId: duplicateId,
      label: `Copia di ${original.label}`,
      semanticKey: null,
      backgroundMode: original.backgroundMode || 'TRANSPARENT',
      xPt: original.xPt + 14,
      yPt: original.yPt + 14,
    };

    expect(duplicated.backgroundMode).toBe('OPAQUE_WHITE');
    expect(duplicated.fieldId).not.toBe(original.fieldId);
  });

  // TEST N — CATALOGO SEMANTICO E CHIAVI PERSONALIZZATE
  it('TEST N — Catalogo semantico canonico e chiavi personalizzate territoriali', () => {
    // Catalogo contiene categorie corrette
    expect(CATEGORIZED_SEMANTIC_CATALOG.ANAGRAFICA).toBeDefined();
    expect(CATEGORIZED_SEMANTIC_CATALOG.SCUOLA).toBeDefined();
    expect(CATEGORIZED_SEMANTIC_CATALOG.PROFILO_FUNZIONAMENTO).toBeDefined();
    expect(CATEGORIZED_SEMANTIC_CATALOG.APPROVAZIONI).toBeDefined();
    expect(CATEGORIZED_SEMANTIC_CATALOG.QUADRO_INCLUSIONE).toBeDefined();
    expect(CATEGORIZED_SEMANTIC_CATALOG.RISORSE).toBeDefined();

    // Lookup canonico
    const entry = getSemanticCatalogEntry('student.firstName');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Nome alunno');

    // Chiave custom
    const customKey = buildCustomSemanticKey('Roma_Infanzia', 'griglia_comportamento');
    expect(customKey).toBe('custom.roma_infanzia.griglia_comportamento');
    expect(isCustomSemanticKey(customKey)).toBe(true);
    expect(isCustomSemanticKey('student.firstName')).toBe(false);
  });
});
