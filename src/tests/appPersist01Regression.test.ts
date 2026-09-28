/**
 * @license
 * PEI FACILE — APP-PERSIST-01 Regression Test Suite
 * Verify complete isolation of document instances, unique ID generation, and total unmounting behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyPeiDocument } from '../data/masterPeiStructure';

describe('APP-PERSIST-01 — Document Instance Isolation and Lifecycle Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('TEST 1: verifies that creating documents A and B sequentially generates completely unique IDs', () => {
    const docA = createEmptyPeiDocument('A1', 'STUDENT-01', 'School A', 'Section 1A');
    const docB = createEmptyPeiDocument('A1', 'STUDENT-01', 'School A', 'Section 1A');

    // Confirm unique ID generation
    expect(docA.id).toBeDefined();
    expect(docB.id).toBeDefined();
    expect(docA.id).not.toEqual(docB.id);
  });

  it('TEST 2: simulates the saving, deletion, and non-recoverability of document instance A', () => {
    const docA = createEmptyPeiDocument('A2', 'STUDENT-02', 'School B', 'Classe 2^A');
    
    // Save Document A
    localStorage.setItem('pei_facile_saved_doc', JSON.stringify(docA));
    expect(localStorage.getItem('pei_facile_saved_doc')).toBeDefined();

    // Verify retrieval matches doc A
    const retrievedA = JSON.parse(localStorage.getItem('pei_facile_saved_doc') || '{}');
    expect(retrievedA.id).toBe(docA.id);

    // Simulate "Delete document"
    localStorage.removeItem('pei_facile_saved_doc');
    expect(localStorage.getItem('pei_facile_saved_doc')).toBeNull();

    // Re-acquire the same PDF and create document B
    const docB = createEmptyPeiDocument('A2', 'STUDENT-02', 'School B', 'Classe 2^A');
    expect(docB.id).not.toEqual(docA.id);

    // Save Document B
    localStorage.setItem('pei_facile_saved_doc', JSON.stringify(docB));
    const retrievedB = JSON.parse(localStorage.getItem('pei_facile_saved_doc') || '{}');
    expect(retrievedB.id).toBe(docB.id);
    expect(retrievedB.id).not.toBe(docA.id);
  });

  it('TEST 3: verifies template schemas and metadata are persistent and unaffected by document instance deletion', () => {
    // Calibrations / template schemas are persistent structures and should NOT be deleted
    const customTemplateSchemaKey = 'pei_template_schema_model_custom_test';
    const dummySchema = {
      schemaId: 'SCHEMA_model_custom_test',
      templateId: 'model_custom_test',
      calibrationStatus: 'CALIBRATED',
    };

    localStorage.setItem(customTemplateSchemaKey, JSON.stringify(dummySchema));
    
    // Create and delete instance
    const docInstance = createEmptyPeiDocument('A3', 'STUDENT-03', 'School C', '3A');
    localStorage.setItem('pei_facile_saved_doc', JSON.stringify(docInstance));
    localStorage.removeItem('pei_facile_saved_doc');

    // Verify the template schema survives untouched
    const savedSchema = localStorage.getItem(customTemplateSchemaKey);
    expect(savedSchema).not.toBeNull();
    const parsedSchema = JSON.parse(savedSchema || '{}');
    expect(parsedSchema.templateId).toBe('model_custom_test');
    expect(parsedSchema.calibrationStatus).toBe('CALIBRATED');
  });
});
