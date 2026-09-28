/**
 * @license
 * PEI FACILE — CTE-FIX-02R Test Suite
 * Dual-Source Calibration & Semantic Reverse Engineering
 * Baseline Ministerial ↔ Acquired Model ↔ Real Compiled PEI
 */

import { describe, it, expect } from 'vitest';
import { reverseEngineerSchema, findBestSemanticKey } from '../core/semanticReverseEngineering';
import { classifyDocumentModel } from '../core/semanticAcquisitionEngine';
import { restorePeiDocumentBinaries } from '../App';
import type { TemplateSchema, TemplateSchemaField } from '../core/templateSchemaTypes';
import type { PeiDocument, PeiModelDefinition } from '../types/pei';

describe('CTE-FIX-02R — Semantic Calibration Reverse Engineering Suite', () => {
  // 1. Setup Mock Baseline Ministerial Schema
  const mockBaseline: TemplateSchema = {
    schemaId: 'SCHEMA_MINISTERIAL_A1',
    templateId: 'A1',
    sourceSha256: 'baseline-sha256',
    sourcePdfFileName: 'baseline.pdf',
    version: '1.0.0',
    schoolOrder: 'A1',
    totalPages: 12,
    pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
    fields: [
      {
        templateFieldId: 'f-01-studente',
        pageNumber: 1,
        geometry: { xPt: 10, yPt: 20, widthPt: 100, heightPt: 30 },
        label: 'Alunno/a',
        semanticKey: 'studentName',
        fieldType: 'TEXT_SHORT',
        required: true,
        overflowPolicy: 'RIGID',
        status: 'AUTO_VERIFIED',
      },
      {
        templateFieldId: 'f-01-scuola',
        pageNumber: 1,
        geometry: { xPt: 10, yPt: 60, widthPt: 150, heightPt: 30 },
        label: 'Istituzione scolastica',
        semanticKey: 'schoolInstitution',
        fieldType: 'TEXT_SHORT',
        required: true,
        overflowPolicy: 'RIGID',
        status: 'AUTO_VERIFIED',
      },
    ],
    calibrationStatus: 'CALIBRATED',
    geometryValidationStatus: 'PASS',
    visualReviewStatus: 'COMPLETED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 2. Setup Mock Acquired Custom Model Schema (with local geometries and local terminologies)
  const mockAcquired: TemplateSchema = {
    schemaId: 'SCHEMA_custom_roma_infanzia',
    templateId: 'model_custom_roma_infanzia',
    sourceSha256: 'custom-sha256',
    sourcePdfFileName: 'custom_roma_infanzia.pdf',
    version: '1.0.0',
    schoolOrder: 'A1',
    totalPages: 1,
    pages: [{ pageNumber: 1, widthPt: 595, heightPt: 842 }],
    fields: [
      {
        templateFieldId: 'field_bambino_local',
        pageNumber: 1,
        geometry: { xPt: 50, yPt: 50, widthPt: 250, heightPt: 22 }, // Local geometry
        label: 'BAMBINO/A [INTESTAZIONE]', // Local label placeholder
        fieldType: 'TEXT_SHORT',
        required: false,
        overflowPolicy: 'RIGID',
        status: 'CANDIDATE',
      },
      {
        templateFieldId: 'field_line_local',
        pageNumber: 1,
        geometry: { xPt: 50, yPt: 100, widthPt: 180, heightPt: 20 }, // Local geometry
        label: 'Sezione ______', // Local fillable line
        fieldType: 'TEXT_SHORT',
        required: false,
        overflowPolicy: 'RIGID',
        status: 'CANDIDATE',
      },
      {
        templateFieldId: 'field_local_only',
        pageNumber: 1,
        geometry: { xPt: 50, yPt: 200, widthPt: 200, heightPt: 20 },
        label: 'Informazioni ausiliarie Comune di Roma', // Local-only field
        fieldType: 'TEXT_SHORT',
        required: false,
        overflowPolicy: 'RIGID',
        status: 'CANDIDATE',
      },
    ],
    calibrationStatus: 'REVIEW_REQUIRED',
    geometryValidationStatus: 'NOT_RUN',
    visualReviewStatus: 'REQUIRED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('TEST A: maps local label "BAMBINO/A" to studentName, preserving local geometry', () => {
    // Evidence provides actual compiled name
    const mockEvidence: PeiDocument = {
      id: 'doc_evidence_1',
      schoolOrder: 'A1',
      schoolYear: '2025/2026',
      studentCode: 'ALU-REVERSE',
      schoolName: 'Scuola Test',
      classOrSection: 'Sezione A',
      creationDate: new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
      values: {
        field_bambino_local: 'ALUNNO TEST CORISPETTIVO',
      },
      fieldStatuses: {},
      notes: {},
    };

    const { calibratedSchema, diagnostics } = reverseEngineerSchema(
      mockBaseline,
      mockAcquired,
      mockEvidence,
      null
    );

    const childField = calibratedSchema.fields.find((f) => f.templateFieldId === 'field_bambino_local');
    expect(childField).toBeDefined();
    expect(childField!.semanticKey).toBe('studentName'); // Mapped to standard key
    expect(childField!.geometry.xPt).toBe(50); // Preserved local geometry (Winning Layout)
    expect(childField!.geometry.widthPt).toBe(250);
    expect(childField!.label).toBe('BAMBINO/A [INTESTAZIONE]'); // Local label preserved
    expect(diagnostics.semanticMappingsFound).toBeGreaterThan(0);
  });

  it('TEST B: preserves local labels and correct mappings when terminology differs', () => {
    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    const childField = calibratedSchema.fields.find((f) => f.templateFieldId === 'field_bambino_local');
    expect(childField!.label).toBe('BAMBINO/A [INTESTAZIONE]');
  });

  it('TEST C: local placeholder triggers OPAQUE_WHITE background mode deduction', () => {
    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    const childField = calibratedSchema.fields.find((f) => f.templateFieldId === 'field_bambino_local');
    expect(childField!.backgroundMode).toBe('OPAQUE_WHITE');
  });

  it('TEST D: line placeholder triggers TRANSPARENT background mode deduction', () => {
    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    const lineField = calibratedSchema.fields.find((f) => f.templateFieldId === 'field_line_local');
    expect(lineField!.backgroundMode).toBe('TRANSPARENT');
  });

  it('TEST E: local field without direct baseline equivalent is preserved as LOCAL_FIELD with empty mapping', () => {
    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    const localOnlyField = calibratedSchema.fields.find((f) => f.templateFieldId === 'field_local_only');
    expect(localOnlyField).toBeDefined();
    expect(localOnlyField!.semanticKey).toBeNull(); // No direct baseline mapping
  });

  it('TEST F: baseline fields absent from local template are NOT fabricated or invented', () => {
    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    // Baseline contains f-01-scuola mapping, but acquired does not.
    // We demonstrate that no extra fields have been added into the physical fields list.
    expect(calibratedSchema.fields.length).toBe(mockAcquired.fields.length);
    const foundSchool = calibratedSchema.fields.some((f) => f.templateFieldId === 'f-01-scuola');
    expect(foundSchool).toBe(false);
  });

  it('TEST G: works seamlessly on translated/displaced document inputs using anchor keys', () => {
    const textEvidence = [
      'BAMBINO/A [INTESTAZIONE] MARIO DE ROSSI',
      'Sezione ______ Sezione B',
    ];
    const { calibratedSchema } = reverseEngineerSchema(mockBaseline, mockAcquired, null, textEvidence);
    const childField = calibratedSchema.fields.find((f) => f.templateFieldId === 'field_bambino_local');
    expect(childField!.fieldType).toBe('TEXT_SHORT');
    expect(childField!.status).toBe('AUTO_VERIFIED');
  });

  it('TEST H: operates perfectly even if no compiled evidence is provided (graceful degradation)', () => {
    const { calibratedSchema, diagnostics } = reverseEngineerSchema(mockBaseline, mockAcquired, null, null);
    expect(calibratedSchema).toBeDefined();
    expect(diagnostics.evidenceSource).toBe('ABSENT');
  });

  it('TEST I: serializing the calibrated schema guarantees absolutely NO PII/compiled values are persisted', () => {
    const mockEvidence: PeiDocument = {
      id: 'doc_evidence_pii',
      schoolOrder: 'A1',
      schoolYear: '2025/2026',
      studentCode: 'PRIVATE_CODE_123',
      schoolName: 'Scuola Riservata',
      classOrSection: 'Sezione 5',
      creationDate: new Date().toISOString(),
      lastModifiedDate: new Date().toISOString(),
      values: {
        field_bambino_local: 'PIETRO BELLOTTI SECRET NAME',
      },
      fieldStatuses: {},
      notes: {},
    };

    const { calibratedSchema } = reverseEngineerSchema(
      mockBaseline,
      mockAcquired,
      mockEvidence,
      null
    );

    const serialized = JSON.stringify(calibratedSchema);
    expect(serialized).not.toContain('PIETRO');
    expect(serialized).not.toContain('BELLOTTI');
    expect(serialized).not.toContain('SECRET');
  });

  it('TEST J: CTE-FIX-02Q (Hierarchical Model Classification) continues to function perfectly', () => {
    const text = 'Questo è un PEI per la Scuola dell\'Infanzia allegato a1. Campi di esperienza.';
    const result = classifyDocumentModel(text, []);
    expect(result.detectedOrder).toBe('A1');
    expect(result.detectedModelId).toBe('MINISTERIAL_A1');
  });

  it('TEST K: CTE-FIX-02O (Uint8Array Reload Preservation) remains fully functional', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const doc = {
      sourcePdfBinary: bytes,
      canonicalDocument: bytes,
    };
    const restored = restorePeiDocumentBinaries(doc);
    expect(restored.sourcePdfBinary instanceof Uint8Array).toBe(true);
    expect(restored.canonicalDocument instanceof Uint8Array).toBe(true);
    expect(Array.from(restored.sourcePdfBinary)).toEqual([1, 2, 3, 4, 5]);
  });
});
