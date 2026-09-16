import { describe, it, expect } from 'vitest';
import {
  MASTER_PEI_SECTIONS,
  SCHOOL_ORDERS_METADATA,
  filterSectionsForSchoolOrder,
  createEmptyPeiDocument,
  createSamplePeiDocument,
  DEMO_PEI_DOCUMENT,
} from '../data/masterPeiStructure';
import type { SchoolOrder } from '../types/pei';

describe('PEI FACILE — Master Structure & Domain Model', () => {
  it('contiene le 12 sezioni ministeriali conformi a D.I. 182/2020 e D.I. 153/2023', () => {
    expect(MASTER_PEI_SECTIONS.length).toBe(12);
    expect(MASTER_PEI_SECTIONS[0].number).toBe(1);
    expect(MASTER_PEI_SECTIONS[11].number).toBe(12);
  });

  it('filtra correttamente le sezioni per ordine scolastico', () => {
    const orders: SchoolOrder[] = ['A1', 'A2', 'A3', 'A4'];

    orders.forEach((order) => {
      const sections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, order);
      expect(sections.length).toBeGreaterThan(0);

      // Ogni sezione deve appartenere all'ordine corrente
      sections.forEach((sec) => {
        expect(sec.applicableModels).toContain(order);
      });
    });

    // Sezione 10 (Certificazione Competenze) non è presente nell'Infanzia (A1)
    const infanziaSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, 'A1');
    const hasSec10Infanzia = infanziaSections.some((s) => s.id === 'sec-10');
    expect(hasSec10Infanzia).toBe(false);

    // Sezione 10 è invece presente in Primaria (A2), Sec I (A3), Sec II (A4)
    ['A2', 'A3', 'A4'].forEach((ord) => {
      const sec = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, ord as SchoolOrder);
      expect(sec.some((s) => s.id === 'sec-10')).toBe(true);
    });
  });

  it('comprende tutti i 10 tipi di componenti editor (CMP-01..10)', () => {
    const allFields = MASTER_PEI_SECTIONS.flatMap((s) => s.fields);
    const componentTypes = new Set(allFields.map((f) => f.componentType));

    const expectedTypes = [
      'CMP-01',
      'CMP-02',
      'CMP-03',
      'CMP-04',
      'CMP-05',
      'CMP-06',
      'CMP-07',
      'CMP-08',
      'CMP-09',
      'CMP-10',
    ];

    expectedTypes.forEach((cmp) => {
      expect(componentTypes.has(cmp as any)).toBe(true);
    });
  });

  it('genera correttamente un documento vuoto e un documento demo con dati fittizi', () => {
    const emptyDoc = createEmptyPeiDocument('A2', 'ALU-PROVA', 'Scuola Test', '1^ A');
    expect(emptyDoc.schoolOrder).toBe('A2');
    expect(emptyDoc.studentCode).toBe('ALU-PROVA');
    expect(emptyDoc.schoolName).toBe('Scuola Test');
    expect(emptyDoc.classOrSection).toBe('1^ A');

    const sampleDoc = createSamplePeiDocument('A2');
    expect(sampleDoc.schoolOrder).toBe('A2');
    expect(sampleDoc.values['f-01-situazione-famiglia']).toBeDefined();
    expect(sampleDoc.values['f-09-ore-sostegno']).toBe(18);
    expect(sampleDoc.fieldStatuses['f-01-situazione-famiglia']).toBe('compilato');
  });

  it('garantisce i metadati dei 4 modelli ministeriali con conteggio pagine ufficiale', () => {
    expect(SCHOOL_ORDERS_METADATA.A1.pageCount).toBe(12);
    expect(SCHOOL_ORDERS_METADATA.A2.pageCount).toBe(13);
    expect(SCHOOL_ORDERS_METADATA.A3.pageCount).toBe(12);
    expect(SCHOOL_ORDERS_METADATA.A4.pageCount).toBe(14);
  });
});
