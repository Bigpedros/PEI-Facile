/**
 * @license
 * PEI FACILE — Regression Test Suite: Confidence & Protection of Manual Choices
 * Verifies:
 * 1. Missing confidence -> "Non disponibile", zero -> 0%, finite values -> correct percentage.
 * 2. Manual choices (semanticKey, backgroundMode, fieldType, geometry) preserved through reverse engineering, conversion, and reload.
 * 3. Rejected fields remain rejected and are not reactivated.
 * 4. Unreviewed automatic fields can still receive suggestions while keeping user confirmation distinct.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { formatConfidenceDisplay } from '../components/calibration/TemplateCalibrationWorkspace';
import { reverseEngineerSchema } from '../core/semanticReverseEngineering';
import {
  saveTemplateSchema,
  getTemplateSchema,
  createTemplateSchemaFromCandidates,
} from '../core/templateSchemaService';
import type { TemplateSchema, TemplateSchemaField } from '../core/templateSchemaTypes';
import type { ModelGeometry } from '../data/geometry/types';
import type { PeiDocument } from '../types/pei';

describe('PEI FACILE — Confidenza e Protezione Scelte Manuali', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('1. Confidenza: Valore Mancante, Zero e Valori Finiti', () => {
    it('restituisce "Non disponibile" per confidenza assente, null o non finita o fuori scala', () => {
      expect(formatConfidenceDisplay(undefined)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(null)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(NaN)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(Infinity)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(-Infinity)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(-0.5)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(1595)).toBe('Non disponibile');
    });

    it('tratta lo zero come valore valido e restituisce 0%', () => {
      expect(formatConfidenceDisplay(0)).toBe('0%');
      expect(formatConfidenceDisplay(0.0)).toBe('0%');
    });

    it('converte correttamente valori validi nella scala 0..1 e gestisce compatibilità legacy', () => {
      expect(formatConfidenceDisplay(0.95)).toBe('95%');
      expect(formatConfidenceDisplay(0.88)).toBe('88%');
      expect(formatConfidenceDisplay(1.0)).toBe('100%');
      expect(formatConfidenceDisplay(0.5)).toBe('50%');
      // Punto di compatibilità legacy per percentuali > 1.0
      expect(formatConfidenceDisplay(85)).toBe('85%');
    });

    it('preserva l’assenza di confidenza senza fallback a 1.0 (certezza arbitraria)', () => {
      const fieldWithoutConf: TemplateSchemaField = {
        templateFieldId: 'f-test-no-conf',
        pageNumber: 1,
        geometry: { xPt: 10, yPt: 10, widthPt: 100, heightPt: 20 },
        label: 'Campo Senza Confidenza',
        fieldType: 'TEXT_SHORT',
        required: false,
        overflowPolicy: 'RIGID',
        status: 'CANDIDATE',
        confidence: undefined,
      };

      const schema: TemplateSchema = {
        schemaId: 'SCHEMA_TEST_CONF',
        templateId: 'test_conf_model',
        sourceSha256: 'sha256',
        sourcePdfFileName: 'test.pdf',
        version: '1.0.0',
        totalPages: 1,
        pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
        fields: [fieldWithoutConf],
        calibrationStatus: 'REVIEW_REQUIRED',
        geometryValidationStatus: 'PASS',
        visualReviewStatus: 'REQUIRED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = reverseEngineerSchema(null, schema, null, null);
      const outputField = result.calibratedSchema.fields[0];

      // L’assenza di confidenza deve rimanere assente (undefined)
      expect(outputField.confidence).toBeUndefined();
      expect(formatConfidenceDisplay(outputField.confidence)).toBe('Non disponibile');
    });
  });

  describe('2. Protezione delle Scelte Manuali dall’Analisi Automatica', () => {
    it('conserva associazione semantica e sfondo OPAQUE_WHITE scelti manualmente', () => {
      const manualField: TemplateSchemaField = {
        templateFieldId: 'f-manual-1',
        pageNumber: 1,
        geometry: { xPt: 50, yPt: 80, widthPt: 200, heightPt: 25 },
        label: 'Classe / Sezione e Plesso', // Etichetta che un analizzatore potrebbe provare a mappare
        semanticKey: 'student.class', // Scelta manuale dell'utente
        backgroundMode: 'OPAQUE_WHITE', // Scelta manuale dell'utente
        fieldType: 'TEXT_SHORT',
        required: true,
        overflowPolicy: 'RIGID',
        calibrationStatus: 'CONFIRMED', // Confermato dall'utente
        status: 'MANUAL_VERIFIED',
        detectionSource: 'MANUAL_ENTRY',
        confidence: undefined, // L'utente non assegna una finta confidenza di rilevamento
      };

      const schema: TemplateSchema = {
        schemaId: 'SCHEMA_MANUAL_TEST',
        templateId: 'tpl_manual_test',
        sourceSha256: 'sha256',
        sourcePdfFileName: 'manual.pdf',
        version: '1.0.0',
        totalPages: 1,
        pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
        fields: [manualField],
        calibrationStatus: 'CALIBRATED',
        geometryValidationStatus: 'PASS',
        visualReviewStatus: 'COMPLETED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Simula evidenza reale che suggerirebbe valori diversi
      const mockEvidence: PeiDocument = {
        id: 'doc-1',
        schoolOrder: 'A1',
        schoolYear: '2025/2026',
        studentCode: 'ALU-TEST-1',
        schoolName: 'Scuola Test',
        classOrSection: 'Sezione 1',
        creationDate: '2026-09-30',
        lastModifiedDate: '2026-09-30',
        fieldStatuses: {},
        notes: {},
        values: {
          'f-manual-1': 'Testo molto lungo che eccede 120 caratteri per tentare di forzare una conversione automatica in TEXT_LONG da parte dell’inferenza dell’evidenza',
        },
      };

      const { calibratedSchema } = reverseEngineerSchema(null, schema, mockEvidence, null);
      const testedField = calibratedSchema.fields[0];

      // Scelta manuale dell'associazione semantica preservata
      expect(testedField.semanticKey).toBe('student.class');
      // Scelta manuale dello sfondo OPAQUE_WHITE preservata
      expect(testedField.backgroundMode).toBe('OPAQUE_WHITE');
      // Tipo scelto manualmente preservato
      expect(testedField.fieldType).toBe('TEXT_SHORT');
      // Stato di conferma manuale preservato
      expect(testedField.calibrationStatus).toBe('CONFIRMED');
      // Nessuna confidenza arbitraria aggiunta al campo manuale
      expect(testedField.confidence).toBeUndefined();
    });

    it('conserva le scelte manuali dopo conversione, salvataggio e ricaricamento', async () => {
      const templateId = 'tpl_persist_manual_test';
      const candidate = {
        fieldId: 'fld_user_custom',
        label: 'Istituzione Scolastica Speciale',
        semanticKey: 'school.institutionName',
        backgroundMode: 'OPAQUE_WHITE' as const,
        calibrationStatus: 'MODIFIED' as const,
        confidence: undefined,
        detectionSource: 'MANUAL_ENTRY',
        pageNumber: 1,
        xPt: 150,
        yPt: 90,
        widthPt: 300,
        heightPt: 30,
        fieldType: 'TEXT_SHORT',
      };

      const createdSchema = createTemplateSchemaFromCandidates(
        templateId,
        'custom.pdf',
        'sha256-test',
        [{ pageNumber: 1, widthPt: 595, heightPt: 842, fields: [] }],
        [candidate],
        'CALIBRATED'
      );

      expect(createdSchema.fields[0].semanticKey).toBe('school.institutionName');
      expect(createdSchema.fields[0].backgroundMode).toBe('OPAQUE_WHITE');
      expect(createdSchema.fields[0].calibrationStatus).toBe('MODIFIED');
      expect(createdSchema.fields[0].confidence).toBeUndefined();

      // Salva nel registro locale
      await saveTemplateSchema(createdSchema);

      // Ricarica lo schema
      const reloadedSchema = await getTemplateSchema(templateId);
      expect(reloadedSchema).not.toBeNull();
      const reloadedField = reloadedSchema!.fields[0];

      expect(reloadedField.semanticKey).toBe('school.institutionName');
      expect(reloadedField.backgroundMode).toBe('OPAQUE_WHITE');
      expect(reloadedField.calibrationStatus).toBe('MODIFIED');
      expect(reloadedField.confidence).toBeUndefined();
    });

    it('garantisce che un campo scartato rimanga scartato e non venga riattivato', () => {
      const rejectedField: TemplateSchemaField = {
        templateFieldId: 'f-rejected-1',
        pageNumber: 1,
        geometry: { xPt: 20, yPt: 20, widthPt: 100, heightPt: 20 },
        label: 'Riga Sporca da Ignorare',
        fieldType: 'TEXT_SHORT',
        required: false,
        overflowPolicy: 'RIGID',
        calibrationStatus: 'REJECTED',
        status: 'REJECTED',
      };

      const schema: TemplateSchema = {
        schemaId: 'SCHEMA_REJECTED_TEST',
        templateId: 'tpl_rejected_test',
        sourceSha256: 'sha256',
        sourcePdfFileName: 'test.pdf',
        version: '1.0.0',
        totalPages: 1,
        pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
        fields: [rejectedField],
        calibrationStatus: 'REVIEW_REQUIRED',
        geometryValidationStatus: 'PASS',
        visualReviewStatus: 'REQUIRED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { calibratedSchema } = reverseEngineerSchema(null, schema, null, null);
      const resField = calibratedSchema.fields[0];

      // Il campo scartato deve rimanere rigorosamente REJECTED
      expect(resField.calibrationStatus).toBe('REJECTED');
      expect(resField.status).toBe('REJECTED');
    });

    it('consente a un campo automatico non revisionato di ricevere suggerimenti senza sovrascrivere come confermato dall’utente', () => {
      const unreviewedField: TemplateSchemaField = {
        templateFieldId: 'f-auto-candidate',
        pageNumber: 1,
        geometry: { xPt: 20, yPt: 20, widthPt: 150, heightPt: 20 },
        label: 'Data del verbale collegiale accertamento',
        fieldType: 'TEXT_SHORT',
        required: false,
        overflowPolicy: 'RIGID',
        calibrationStatus: 'PROPOSED',
        status: 'CANDIDATE',
        confidence: 0.82,
      };

      const schema: TemplateSchema = {
        schemaId: 'SCHEMA_AUTO_TEST',
        templateId: 'tpl_auto_test',
        sourceSha256: 'sha256',
        sourcePdfFileName: 'test.pdf',
        version: '1.0.0',
        totalPages: 1,
        pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
        fields: [unreviewedField],
        calibrationStatus: 'REVIEW_REQUIRED',
        geometryValidationStatus: 'PASS',
        visualReviewStatus: 'REQUIRED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { calibratedSchema } = reverseEngineerSchema(null, schema, null, null);
      const resField = calibratedSchema.fields[0];

      // Riceve suggerimento semantico
      expect(resField.suggestedSemanticKey).toBe('functionalProfile.medicalReportDate');
      // La conferma dell'utente resta distinta (non diventa CONFIRMED dall'utente)
      expect(resField.calibrationStatus).toBe('PROPOSED');
      // Confidenza esistente incrementata in scala normalizzata
      expect(resField.confidence).toBe(0.82);
    });

    it('garantisce che uno schema già approvato (CALIBRATED) non venga alterato silenziosamente', () => {
      const approvedField: TemplateSchemaField = {
        templateFieldId: 'f-approved-1',
        pageNumber: 1,
        geometry: { xPt: 100, yPt: 150, widthPt: 250, heightPt: 30 },
        label: 'Istituzione Scolastica Approvata',
        semanticKey: 'school.institutionName',
        backgroundMode: 'OPAQUE_WHITE',
        fieldType: 'TEXT_SHORT',
        required: true,
        overflowPolicy: 'RIGID',
        calibrationStatus: 'CONFIRMED',
        status: 'MANUAL_VERIFIED',
        confidence: undefined,
      };

      const approvedSchema: TemplateSchema = {
        schemaId: 'SCHEMA_APPROVED_STABLE',
        templateId: 'tpl_approved_stable',
        sourceSha256: 'sha256',
        sourcePdfFileName: 'stable.pdf',
        version: '1.0.0',
        totalPages: 1,
        pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
        fields: [approvedField],
        calibrationStatus: 'CALIBRATED',
        geometryValidationStatus: 'PASS',
        visualReviewStatus: 'COMPLETED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const { calibratedSchema } = reverseEngineerSchema(null, approvedSchema, null, null);
      const resField = calibratedSchema.fields[0];

      expect(calibratedSchema.calibrationStatus).toBe('CALIBRATED');
      expect(resField.semanticKey).toBe('school.institutionName');
      expect(resField.backgroundMode).toBe('OPAQUE_WHITE');
      expect(resField.fieldType).toBe('TEXT_SHORT');
      expect(resField.calibrationStatus).toBe('CONFIRMED');
      expect(resField.status).toBe('MANUAL_VERIFIED');
      expect(resField.confidence).toBeUndefined();
    });
  });
});
