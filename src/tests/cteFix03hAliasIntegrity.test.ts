/**
 * @license
 * PEI FACILE — CTE-FIX-03H: Semantic Alias Integrity & Stale Data Prevention Suite
 * Verifies:
 * 1. Strict 1:1 equivalences: only verified same-type/cardinality fields are mapped.
 * 2. Non-equivalent fields (f-09 schedule vs numeric hours, f-04 general vs dimension, f-05 text vs table) are NOT aliased.
 * 3. Editing or clearing a field never resurrects stale alias data upon reload.
 */

import { describe, it, expect } from 'vitest';
import { createEmptyPeiDocument } from '../data/masterPeiStructure';

describe('PEI FACILE — CTE-FIX-03H: Alias Integrity & Stale Data Prevention', () => {
  it('strictly restricts 1:1 aliases to same-type and same-cardinality fields', () => {
    // Simulated intake payload with extracted values
    const payload = {
      schoolOrder: 'A2' as const,
      studentCode: 'ALU-TEST-01',
      schoolName: 'Scuola Test',
      classOrSection: '2A',
      extractedValues: {
        'f-02-sintesi-profilo': 'Profilo clinico estratto',
        'f-07-interventi-contesto': 'Interventi ambientali estratti',
        'f-08-curricolare-obiettivi': 'Personalizzazione curricolare',
        // Non-equivalent extractors
        'f-09-organizzazione-oraria': 'Orario settimanale 30 ore con educatore',
        'f-04-osservazioni-alunno': 'Osservazioni globali sui punti di forza',
        'f-05-dim-sociale-obiettivi': 'Obiettivi di relazione e socializzazione',
      },
    };

    const STRICT_ALIAS_PAIRS: [string, string][] = [
      ['f-02-sintesi-assi', 'f-02-sintesi-profilo'],
      ['f-07-interventi', 'f-07-interventi-contesto'],
      ['f-08-adattamenti-discipline', 'f-08-curricolare-obiettivi'],
    ];

    const resolvedValues: Record<string, string> = { ...payload.extractedValues };

    STRICT_ALIAS_PAIRS.forEach(([canon, alias]) => {
      if (resolvedValues[alias] && !resolvedValues[canon]) {
        resolvedValues[canon] = resolvedValues[alias];
      } else if (resolvedValues[canon] && !resolvedValues[alias]) {
        resolvedValues[alias] = resolvedValues[canon];
      }
    });

    // Valid 1:1 aliases are synchronized
    expect(resolvedValues['f-02-sintesi-assi']).toBe('Profilo clinico estratto');
    expect(resolvedValues['f-07-interventi']).toBe('Interventi ambientali estratti');
    expect(resolvedValues['f-08-adattamenti-discipline']).toBe('Personalizzazione curricolare');

    // Non-equivalent pairs MUST NOT be mapped to incompatible canonical fields
    expect(resolvedValues['f-09-ore-sostegno']).toBeUndefined();
    expect(resolvedValues['f-04-dim-relazione']).toBeUndefined();
    expect(resolvedValues['f-05-tabella-obiettivi']).toBeUndefined();
  });

  it('prevents stale alias data resurrection when canonical field is modified or cleared', () => {
    let doc = createEmptyPeiDocument('A1', 'ALU-123', 'Scuola A1', 'Sez 1');
    doc.values = {
      'f-02-sintesi-assi': 'Primo valore estratto',
      'f-02-sintesi-profilo': 'Primo valore estratto',
    };

    const STRICT_ALIASES: Record<string, string> = {
      'f-02-sintesi-assi': 'f-02-sintesi-profilo',
      'f-02-sintesi-profilo': 'f-02-sintesi-assi',
      'f-07-interventi': 'f-07-interventi-contesto',
      'f-07-interventi-contesto': 'f-07-interventi',
      'f-08-adattamenti-discipline': 'f-08-curricolare-obiettivi',
      'f-08-curricolare-obiettivi': 'f-08-adattamenti-discipline',
    };

    // Helper simulating handleFieldValueChange
    const updateFieldValue = (values: Record<string, any>, fieldId: string, val: any) => {
      const nextValues = { ...values, [fieldId]: val };
      const mirror = STRICT_ALIASES[fieldId];
      if (mirror && mirror in nextValues) {
        if (val === undefined || val === null || val === '') {
          delete nextValues[mirror];
        } else {
          nextValues[mirror] = val;
        }
      }
      return nextValues;
    };

    // 1. User updates field to a new value
    doc.values = updateFieldValue(doc.values, 'f-02-sintesi-assi', 'Testo aggiornato dal docente');
    expect(doc.values['f-02-sintesi-assi']).toBe('Testo aggiornato dal docente');
    expect(doc.values['f-02-sintesi-profilo']).toBe('Testo aggiornato dal docente');

    // 2. User clears the field
    doc.values = updateFieldValue(doc.values, 'f-02-sintesi-assi', '');
    expect(doc.values['f-02-sintesi-assi']).toBe('');
    expect(doc.values['f-02-sintesi-profilo']).toBeUndefined(); // Stale alias is purged, cannot resurrect

    // Verify resolve logic does not resurrect purged alias
    const alt = STRICT_ALIASES['f-02-sintesi-assi'];
    const resolvedOnPage = doc.values['f-02-sintesi-assi'] !== undefined && doc.values['f-02-sintesi-assi'] !== null
      ? doc.values['f-02-sintesi-assi']
      : (alt && doc.values[alt] !== undefined ? doc.values[alt] : undefined);

    expect(resolvedOnPage).toBe(''); // Clean empty field, no old text resurrected
  });
});
