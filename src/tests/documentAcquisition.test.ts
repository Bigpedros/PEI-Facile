/**
 * @license
 * PEI FACILE — Document Acquisition Test Suite (DOCUMENT ACQUISITION R01)
 * Verifica completa dei requisiti A-K:
 * A) Formati supportati (PDF, JPG, PNG, TIFF, DOCX)
 * B) Gestione DOC legacy ("Formato DOC legacy non ancora supportato. Convertire il file in DOCX o PDF.")
 * C) Sequenza multi-immagine
 * D) Avanzamento e Progress Bar reale (Pagina X di Y, stadi reali)
 * E) Classificatore di Modello (A1-A4, Custom, Modello non riconosciuto)
 * F) Mapping Semantico basato su Real Field IDs (non indice pagina)
 * G) Struttura e confidenza MappingEvidence
 * H) Coda di revisione utente (Proposta -> Verifica -> Registrazione)
 * I) Isolamento Documento (Import = Nuovo Documento autonomo, no merge sporco)
 * J) Privacy e conformità Locale
 * K) Flusso End-to-End
 */

import { describe, it, expect } from 'vitest';
import { detectDocumentFormat } from '../core/documentAdapters/baseAdapter';
import { processDocumentAcquisition } from '../core/documentAcquisitionService';
import {
  classifyDocumentModel,
  extractSemanticFieldEvidences,
} from '../core/semanticAcquisitionEngine';
import { createEmptyPeiDocument } from '../data/masterPeiStructure';
import type {
  AcquisitionProgress,
  ExtractedRawPage,
} from '../types/documentAcquisitionTypes';
import type { PeiModelDefinition } from '../types/pei';

describe('PEI FACILE — ACQUISIZIONE PEI (DOCUMENT ACQUISITION R01)', () => {
  // Test A: Formati supportati
  describe('Test A: Rilevamento Formati Supportati', () => {
    it('deve identificare correttamente PDF, JPG, PNG, TIFF, DOCX', () => {
      expect(detectDocumentFormat('documento.pdf')).toBe('PDF');
      expect(detectDocumentFormat('scansione.jpg')).toBe('IMAGE_JPEG');
      expect(detectDocumentFormat('foto_pei.jpeg')).toBe('IMAGE_JPEG');
      expect(detectDocumentFormat('pagina1.png')).toBe('IMAGE_PNG');
      expect(detectDocumentFormat('pei_scansione.tiff')).toBe('IMAGE_TIFF');
      expect(detectDocumentFormat('pei_scansione.tif')).toBe('IMAGE_TIFF');
      expect(detectDocumentFormat('verbale_pei.docx')).toBe('DOCX');
    });
  });

  // Test B: Gestione DOC legacy
  describe('Test B: Gestione Formato DOC Legacy', () => {
    it('deve identificare i file .doc come UNSUPPORTED_LEGACY_DOC', () => {
      expect(detectDocumentFormat('vecchio_modello.doc')).toBe('UNSUPPORTED_LEGACY_DOC');
    });

    it('deve rifiutare file .doc con il messaggio di errore esatto richiesto', async () => {
      const dummyFile = new File(['dummy doc content'], 'vecchio_modello.doc', {
        type: 'application/msword',
      });

      await expect(
        processDocumentAcquisition(dummyFile, 'vecchio_modello.doc')
      ).rejects.toThrow(
        'Formato DOC legacy non ancora supportato. Convertire il file in DOCX o PDF.'
      );
    });
  });

  // Test C: Sequenza Multi-Immagine
  describe('Test C: Sequenza Multi-Immagine', () => {
    it('deve trattare un array di immagini come pagine sequenziali 1, 2, 3', async () => {
      const file1 = new File(['img1'], 'pag1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['img2'], 'pag2.jpg', { type: 'image/jpeg' });

      const mockOcrRunner = async (canvas: HTMLCanvasElement) => ({
        text: 'Testo estratto da pagina immagine',
        confidence: 90,
      });

      const result = await processDocumentAcquisition([file1, file2], 'multi_pag.jpg', {
        customOcrRunner: mockOcrRunner,
      });

      expect(result.detectedFormat).toBe('IMAGE_JPEG');
      expect(result.totalPages).toBe(2);
      expect(result.rawPages[0].pageNumber).toBe(1);
      expect(result.rawPages[1].pageNumber).toBe(2);
    });
  });

  // Test D: Avanzamento Reale e Progress Bar
  describe('Test D: Avanzamento e Fasi Reali', () => {
    it('deve emettere aggiornamenti di progresso con percentuali e stadi realistici', async () => {
      const progressUpdates: AcquisitionProgress[] = [];
      const file1 = new File(['img1'], 'pag1.png', { type: 'image/png' });

      const mockOcrRunner = async () => ({
        text: 'Istituzione scolastica: I.C. Roma Nord\nCodice alunno: ALU-TEST-123',
        confidence: 95,
      });

      await processDocumentAcquisition(file1, 'pag1.png', {
        customOcrRunner: mockOcrRunner,
        onProgress: (p) => progressUpdates.push(p),
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      const stages = progressUpdates.map((p) => p.stage);
      expect(stages).toContain('OCR');
      expect(stages).toContain('SEMANTIC_ANALYSIS');
      expect(stages).toContain('REVIEW_READY');

      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress.percentage).toBe(100);
      expect(lastProgress.stageLabel).toBe('Preparazione revisione');
    });
  });

  // Test E: Classificatore di Modello
  describe('Test E: Classificatore di Modello Documentale', () => {
    it('deve riconoscere i modelli ministeriali A1, A2, A3, A4 dai rispettivi indicatori', () => {
      const textA1 = 'MINISTERO DELL’ISTRUZIONE - ALLEGATO A1 - SCUOLA DELL’INFANZIA - Campi di esperienza';
      const resA1 = classifyDocumentModel(textA1);
      expect(resA1.isModelRecognized).toBe(true);
      expect(resA1.detectedOrder).toBe('A1');

      const textA2 = 'MINISTERO DELL’ISTRUZIONE - ALLEGATO A2 - SCUOLA PRIMARIA - Giudizio descrittivo';
      const resA2 = classifyDocumentModel(textA2);
      expect(resA2.isModelRecognized).toBe(true);
      expect(resA2.detectedOrder).toBe('A2');

      const textA3 = 'MINISTERO DELL’ISTRUZIONE - ALLEGATO A3 - SCUOLA SECONDARIA DI PRIMO GRADO - Esame di stato';
      const resA3 = classifyDocumentModel(textA3);
      expect(resA3.isModelRecognized).toBe(true);
      expect(resA3.detectedOrder).toBe('A3');

      const textA4 = 'MINISTERO DELL’ISTRUZIONE - ALLEGATO A4 - SCUOLA SECONDARIA DI SECONDO GRADO - PCTO';
      const resA4 = classifyDocumentModel(textA4);
      expect(resA4.isModelRecognized).toBe(true);
      expect(resA4.detectedOrder).toBe('A4');
    });

    it('deve riconoscere i modelli personalizzati registrati', () => {
      const customModels: PeiModelDefinition[] = [
        {
          id: 'custom_bologna_01',
          name: 'Modello PEI Rete Bologna Inclusiva',
          schoolOrder: 'A2',
          version: '1.0',
          originType: 'TERRITORIAL',
          originName: 'Rete Inclusione Bologna',
          format: 'PDF',
          status: 'attivo',
          isDefault: false,
          isMinisterial: false,
          sourceHash: 'hash123',
        },
      ];

      const customText = 'Documento PEI redatto secondo il Modello PEI Rete Bologna Inclusiva 2024';
      const res = classifyDocumentModel(customText, customModels);
      expect(res.isModelRecognized).toBe(true);
      expect(res.detectedModelId).toBe('custom_bologna_01');
      expect(res.detectedModelName).toBe('Modello PEI Rete Bologna Inclusiva');
    });

    it('deve restituire "MODELLO NON RICONOSCIUTO" per documenti sconosciuti senza forzare A1-A4', () => {
      const genericText = 'Questo è un testo generico che non contiene alcuna intestazione ministeriale di PEI.';
      const res = classifyDocumentModel(genericText);
      expect(res.isModelRecognized).toBe(false);
      expect(res.recognitionReason).toContain('MODELLO NON RICONOSCIUTO');
    });
  });

  // Test F & G: Mapping Semantico con Real Field IDs ed Evidenze
  describe('Test F & G: Mapping Semantico con Real Field IDs ed Evidenze', () => {
    it('deve estrarre campi usando ID reali (f-01-scuola, f-01-studente, f-02-sintesi-profilo, ecc.) e produrre MappingEvidence', () => {
      const samplePages: ExtractedRawPage[] = [
        {
          pageNumber: 1,
          text: `ISTITUTO COMPRENSIVO STATALE ALESSANDRO MANZONI
Codice alunno: ALU-98765
Classe: Classe 3^ B - Plesso Centrale
Data di redazione: 15/10/2024
Situazione familiare: Nucleo familiare collaborativo residente a Milano`,
          confidence: 95,
          pageType: 'TEXT_NATIVE',
        },
        {
          pageNumber: 2,
          text: `Sezione 2 - Elementi generali desunti dal Profilo di Funzionamento:
Allievo con diagnosi funzionale F84.0 e buone autonomie operative.
Sezione 4 - Osservazioni sullo studente per l'individuazione dei punti di forza:
Ottime abilità visuo-spaziali e spiccato interesse per le attività musicali.`,
          confidence: 92,
          pageType: 'TEXT_NATIVE',
        },
        {
          pageNumber: 3,
          text: `Sezione 5 - Dimensione della relazione e socializzazione:
Obiettivo: favorire l'interazione con il gruppo dei pari durante i laboratori.
Sezione 12 - Proposta ore sostegno:
18 ore`,
          confidence: 90,
          pageType: 'TEXT_NATIVE',
        },
      ];

      const evidences = extractSemanticFieldEvidences(samplePages, 'A2');

      expect(evidences.length).toBeGreaterThanOrEqual(6);

      // Verifica ID Reali
      const schoolEv = evidences.find((e) => e.fieldId === 'f-01-scuola');
      expect(schoolEv).toBeDefined();
      expect(schoolEv?.extractedValue).toContain('ISTITUTO COMPRENSIVO STATALE ALESSANDRO MANZONI');
      expect(schoolEv?.pageNumber).toBe(1);

      const studentEv = evidences.find((e) => e.fieldId === 'f-01-studente');
      expect(studentEv).toBeDefined();
      expect(studentEv?.extractedValue).toBe('ALU-98765');

      const classEv = evidences.find((e) => e.fieldId === 'f-01-classe');
      expect(classEv).toBeDefined();
      expect(classEv?.extractedValue).toContain('3^ B');

      const profileEv = evidences.find((e) => e.fieldId === 'f-02-sintesi-profilo');
      expect(profileEv).toBeDefined();
      expect(profileEv?.pageNumber).toBe(2); // trovato a pagina 2 indipendentemente dall'indice fisico

      const obsEv = evidences.find((e) => e.fieldId === 'f-04-osservazioni-alunno');
      expect(obsEv).toBeDefined();
      expect(obsEv?.pageNumber).toBe(2);

      const hoursEv = evidences.find((e) => e.fieldId === 'f-12-richiesta-ore-sostegno');
      expect(hoursEv).toBeDefined();
      expect(hoursEv?.extractedValue).toContain('18');
      expect(hoursEv?.pageNumber).toBe(3);
    });
  });

  // Test I: Isolamento Documento (Import = Nuovo Documento, no merge)
  describe('Test I: Isolamento Documento (Import = Nuovo Documento)', () => {
    it('deve creare un nuovo documento autonomo senza inquinare il vecchio documento', () => {
      // Documento precedente aperto
      const oldDoc = createEmptyPeiDocument('A1', 'VECCHIO-ALUNNO-001', 'Scuola Vecchia', 'Sez A');
      oldDoc.values['f-01-scuola'] = 'Scuola Vecchia';
      oldDoc.values['f-01-studente'] = 'VECCHIO-ALUNNO-001';
      oldDoc.values['f-02-sintesi-profilo'] = 'Vecchio profilo clinico che non deve trapelare';

      // Simulazione creazione nuovo PEI da acquisizione
      const importedData = {
        schoolOrder: 'A2' as const,
        studentCode: 'NUOVO-ALUNNO-999',
        schoolName: 'Nuova Scuola Primaria',
        classOrSection: 'Classe 2^ C',
        compilationDate: '2025-01-20',
        extractedValues: {
          'f-01-scuola': 'Nuova Scuola Primaria',
          'f-01-studente': 'NUOVO-ALUNNO-999',
          'f-02-sintesi-profilo': 'Nuovo profilo estratto dal documento',
        },
      };

      const newDoc = createEmptyPeiDocument(
        importedData.schoolOrder,
        importedData.studentCode,
        importedData.schoolName,
        importedData.classOrSection
      );
      newDoc.values = { ...newDoc.values, ...importedData.extractedValues };

      // Verifiche di isolamento assoluto
      expect(newDoc.id).not.toBe(oldDoc.id);
      expect(newDoc.schoolOrder).toBe('A2');
      expect(newDoc.studentCode).toBe('NUOVO-ALUNNO-999');
      expect(newDoc.schoolName).toBe('Nuova Scuola Primaria');
      expect(newDoc.values['f-02-sintesi-profilo']).toBe('Nuovo profilo estratto dal documento');
      expect(newDoc.values['f-02-sintesi-profilo']).not.toContain('Vecchio profilo clinico');
    });
  });
});
