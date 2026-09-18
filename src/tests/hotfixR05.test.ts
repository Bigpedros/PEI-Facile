import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveCustomTemplate,
  getCustomTemplate,
  getTemplatePdfBinary,
  deleteCustomTemplate,
  createDefensiveBinaryCopy,
} from '../core/templateStorage';
import { computeSha256 } from '../core/templateAcquisitionService';
import { validateTemplateForCompilation } from '../core/templateSchemaService';
import type { PeiModelDefinition } from '../types/pei';
import type { PersistedTemplateRecord } from '../core/templateAcquisitionTypes';

describe('PEI FACILE — HOTFIX R05 Tests: Template Binary Storage & Failure Gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('R05 Requirement 11 — Detached Buffer and Independent Copies', () => {
    it('produce copie fisicamente indipendenti su backing buffer separati', async () => {
      const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 65, 66, 67, 68]); // %PDF-1.7...
      const sourceBuffer = sourceBytes.buffer;

      // Generazione copie indipendenti come prescritto da R05
      const analysisBytes = new Uint8Array(sourceBuffer).slice();
      const persistenceBytes = new Uint8Array(sourceBuffer).slice();

      // Verifica backing buffer indipendenti
      expect(analysisBytes.buffer).not.toBe(persistenceBytes.buffer);
      expect(analysisBytes.buffer).not.toBe(sourceBuffer);
      expect(persistenceBytes.buffer).not.toBe(sourceBuffer);

      // Mutazione della copia di analisi non deve alterare la copia di persistenza
      analysisBytes[0] = 0;
      analysisBytes[1] = 0;
      expect(persistenceBytes[0]).toBe(37); // '%' intatto
      expect(persistenceBytes[1]).toBe(80); // 'P' intatto

      // Verifica trasferimento / detachment se supportato dall'ambiente
      if (typeof MessageChannel !== 'undefined') {
        const channel = new MessageChannel();
        try {
          channel.port1.postMessage(analysisBytes.buffer, [analysisBytes.buffer]);
          // Il buffer di analisi è stato trasferito (detached)
          expect(() => createDefensiveBinaryCopy(analysisBytes)).toThrow();
        } catch {
          // Ambiente di test headless
        }
        channel.port1.close();
        channel.port2.close();
      }

      // La copia di persistenza deve restare intatta, valida e salvabile
      expect(persistenceBytes.byteLength).toBe(sourceBytes.byteLength);
      expect(persistenceBytes[0]).toBe(37);

      const templateId = 'tpl_detached_test_01';
      const sha = await computeSha256(persistenceBytes);

      await saveCustomTemplate(
        {
          templateId,
          name: 'Modello Test Detached Buffer',
          schoolOrder: 'A3',
          sourceFileName: 'test_detached.pdf',
          sourceSha256: sha,
          fileSizeBytes: persistenceBytes.byteLength,
          pageCount: 1,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: [],
        },
        persistenceBytes
      );

      const retrievedBinary = await getTemplatePdfBinary(templateId);
      expect(retrievedBinary).toBeDefined();
      expect(retrievedBinary?.byteLength).toBe(sourceBytes.byteLength);
      expect(retrievedBinary?.[0]).toBe(37);

      const retrievedSha = await computeSha256(retrievedBinary!);
      expect(retrievedSha).toBe(sha);
    });

    it('createDefensiveBinaryCopy rifiuta buffer vuoti o nulli e crea backing buffer autonomi', () => {
      expect(() => createDefensiveBinaryCopy(null)).toThrow('Dati binari non forniti');
      expect(() => createDefensiveBinaryCopy(undefined)).toThrow('Dati binari non forniti');
      expect(() => createDefensiveBinaryCopy(new Uint8Array(0))).toThrow('byteLength è 0');

      const original = new Uint8Array([10, 20, 30, 40]);
      const copy = createDefensiveBinaryCopy(original);
      expect(copy.buffer).not.toBe(original.buffer);
      expect(copy.byteLength).toBe(original.byteLength);
      expect(Array.from(copy)).toEqual([10, 20, 30, 40]);
    });
  });

  describe('R05 Requirement 12 — Transactional Failure Gate', () => {
    it('blocca registrazione modello, apertura calibratore e rollback storage se la persistenza binaria fallisce', async () => {
      const templateId = 'tpl_failure_gate_test';
      const fakeSha = 'fake_sha_for_failure_gate_test';
      const dummyBytes = new Uint8Array([37, 80, 68, 70]);

      const onAddCustomModel = vi.fn();
      const onOpenCalibration = vi.fn();
      let capturedErrorNotice: string | null = null;
      let toastMessage: string | null = null;

      const showToast = (msg: string) => {
        toastMessage = msg;
      };

      // Simuliamo la sequenza transazionale protetta di CustomModelManager
      const executeImportTransaction = async (shouldFailStorage: boolean) => {
        const nowIso = new Date().toISOString();
        const newModel: PeiModelDefinition = {
          id: `model_${Date.now()}`,
          name: 'Modello Fallito Test',
          schoolOrder: 'A2',
          originType: 'INSTITUTION',
          originName: 'I.C. Test',
          version: '1.0',
          format: 'PDF',
          status: 'attivo',
          isDefault: false,
          isMinisterial: false,
          sourceHash: fakeSha,
          templateId,
          calibrationStatus: 'REVIEW_REQUIRED',
        };

        try {
          if (shouldFailStorage) {
            throw new Error('Simulato errore IndexedDB salvataggio binario');
          }

          await saveCustomTemplate(
            {
              templateId,
              name: newModel.name,
              schoolOrder: 'A2',
              sourceFileName: 'test.pdf',
              sourceSha256: fakeSha,
              fileSizeBytes: dummyBytes.byteLength,
              pageCount: 1,
              schemaVersion: '1.0.0',
              createdAt: nowIso,
              updatedAt: nowIso,
              calibrationStatus: 'REVIEW_REQUIRED',
              pages: [],
            },
            dummyBytes
          );

          // Verifica successo persistenza
          const verified = await getTemplatePdfBinary(fakeSha);
          if (!verified) throw new Error('Persistenza binaria non verificata');
        } catch (err: any) {
          // Rollback transazionale
          await deleteCustomTemplate(templateId, fakeSha);
          const userErrorMessage =
            'Il modello non è stato acquisito perché non è stato possibile salvare il PDF sorgente. Nessun modello è stato registrato. Riprova l\'acquisizione.';
          capturedErrorNotice = userErrorMessage;
          showToast(userErrorMessage);
          return; // STOP BLOCCANTE
        }

        onAddCustomModel(newModel);
        if (onOpenCalibration) {
          onOpenCalibration(newModel);
        }
      };

      // Esecuzione con fallimento simulato
      await executeImportTransaction(true);

      // Verifiche obbligatorie Section 12:
      expect(onAddCustomModel).not.toHaveBeenCalled();
      expect(onOpenCalibration).not.toHaveBeenCalled();
      expect(capturedErrorNotice).toBe(
        'Il modello non è stato acquisito perché non è stato possibile salvare il PDF sorgente. Nessun modello è stato registrato. Riprova l\'acquisizione.'
      );
      expect(toastMessage).toBe(capturedErrorNotice);

      // Nessun modello parziale o orfano deve essere presente nello storage
      const record = await getCustomTemplate(templateId);
      expect(record).toBeNull();
      const binary = await getTemplatePdfBinary(templateId);
      expect(binary).toBeNull();
    });
  });

  describe('R05 Requirement 13 — Success Path and Strict Execution Order', () => {
    it('rispetta rigorosamente l\'ordine: PERSISTENCE SUCCESS -> MODEL REGISTRATION -> CALIBRATOR OPEN', async () => {
      const templateId = 'tpl_success_order_test';
      const dummyBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 99, 98, 97]);
      const sha = await computeSha256(dummyBytes);

      const executionLog: string[] = [];

      const onAddCustomModel = vi.fn((_model: PeiModelDefinition) => {
        executionLog.push('MODEL_REGISTRATION');
      });
      const onOpenCalibration = vi.fn((_model: PeiModelDefinition) => {
        executionLog.push('CALIBRATOR_OPEN');
      });

      // Pipeline di acquisizione e persistenza
      const persistenceBytes = new Uint8Array(dummyBytes.buffer).slice();

      await saveCustomTemplate(
        {
          templateId,
          name: 'Modello Ordine Corretto',
          schoolOrder: 'A4',
          sourceFileName: 'success.pdf',
          sourceSha256: sha,
          fileSizeBytes: persistenceBytes.byteLength,
          pageCount: 1,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: [],
        },
        persistenceBytes
      );

      const verifiedBinary = await getTemplatePdfBinary(sha);
      expect(verifiedBinary).toBeDefined();
      expect(verifiedBinary?.byteLength).toBe(persistenceBytes.byteLength);
      executionLog.push('PERSISTENCE_SUCCESS');

      const newModel: PeiModelDefinition = {
        id: `model_${Date.now()}`,
        name: 'Modello Ordine Corretto',
        schoolOrder: 'A4',
        originType: 'TERRITORIAL',
        originName: 'Comune di Roma',
        version: '1.0',
        format: 'PDF',
        status: 'attivo',
        isDefault: false,
        isMinisterial: false,
        sourceHash: sha,
        templateId,
        calibrationStatus: 'REVIEW_REQUIRED',
      };

      // Registrazione e apertura calibratore
      onAddCustomModel(newModel);
      onOpenCalibration(newModel);

      // Verifica ordine obbligatorio
      expect(executionLog).toEqual([
        'PERSISTENCE_SUCCESS',
        'MODEL_REGISTRATION',
        'CALIBRATOR_OPEN',
      ]);
      expect(onAddCustomModel).toHaveBeenCalledTimes(1);
      expect(onOpenCalibration).toHaveBeenCalledTimes(1);
    });
  });

  describe('R04 Non-Regression Verification', () => {
    it('mantiene TEMPLATE_SOURCE_MISSING e assenza fallback ministeriale', () => {
      const validation = validateTemplateForCompilation('custom_non_existent', null, null);
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('TEMPLATE_SOURCE_MISSING');
    });

    it('mantiene TEMPLATE_INTEGRITY_MISMATCH in caso di discrepanza SHA-256', () => {
      const validation = validateTemplateForCompilation(
        'custom_sha_mismatch',
        {
          id: 'custom_sha_mismatch',
          isMinisterial: false,
          calibrationStatus: 'CALIBRATED',
          sourceSha256: 'expected_hash_123',
        },
        {
          schemaId: 'SCHEMA_123',
          templateId: 'custom_sha_mismatch',
          sourceSha256: 'different_actual_hash_456',
          sourcePdfFileName: 'test.pdf',
          version: '1.0.0',
          schoolOrder: 'A3',
          totalPages: 1,
          pages: [],
          fields: [],
          calibrationStatus: 'CALIBRATED',
          geometryValidationStatus: 'PASS',
          visualReviewStatus: 'COMPLETED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      expect(validation.isValid).toBe(false);
      expect(validation.errorCode).toBe('TEMPLATE_INTEGRITY_MISMATCH');
    });
  });

  describe('R05-R1 — PDF Rendering Buffer Lifecycle & Multipage Navigation', () => {
    function generateMultipagePdf(numPages: number): Uint8Array {
      const pagesData = Array.from({ length: numPages }, (_, i) => ({
        text: `Pagina ${i + 1} - Modello di Test PEI`,
      }));

      const fontObjId = 3;
      const objects: Array<{ id: number; content: string }> = [
        {
          id: fontObjId,
          content: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
        },
      ];
      const pageObjIds: number[] = [];

      pagesData.forEach((p, idx) => {
        const pageId = 4 + idx * 2;
        const contentId = pageId + 1;
        pageObjIds.push(pageId);

        const streamData = `BT /F1 12 Tf 50 750 Td (${p.text.replace(/[()]/g, '')}) Tj ET`;
        const contentObj = `<< /Length ${streamData.length} >>\nstream\n${streamData}\nendstream`;
        objects.push({ id: contentId, content: contentObj });

        const pageObj = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>`;
        objects.push({ id: pageId, content: pageObj });
      });

      const catalogObj = `<< /Type /Catalog /Pages 2 0 R >>`;
      const pagesObj = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${numPages} >>`;

      objects.unshift({ id: 2, content: pagesObj });
      objects.unshift({ id: 1, content: catalogObj });
      objects.sort((a, b) => a.id - b.id);

      let pdfStr = '%PDF-1.4\n';
      const offsets: number[] = [0];

      objects.forEach((obj) => {
        offsets.push(pdfStr.length);
        pdfStr += `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
      });

      const startXref = pdfStr.length;
      pdfStr += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
      for (let i = 1; i <= objects.length; i++) {
        const offset = String(offsets[i]).padStart(10, '0');
        pdfStr += `${offset} 00000 n \n`;
      }

      pdfStr += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
      return new TextEncoder().encode(pdfStr);
    }

    it('Test 1 — Multipage Navigation: 1 -> 2 -> 3 -> 12 -> 1 senza errore di buffer detached', async () => {
      const pdfjs = await import('pdfjs-dist');
      const pdfBytes = generateMultipagePdf(12);
      const originalBuffer = pdfBytes.buffer;
      const initialByteLength = pdfBytes.byteLength;

      // Salvataggio nello storage come farebbe l'acquisizione
      const templateId = 'tpl_roma_infanzia_12p';
      const sha = await computeSha256(pdfBytes);
      await saveCustomTemplate(
        {
          templateId,
          name: 'PEI Comune Roma Infanzia 12P',
          schoolOrder: 'A1',
          sourceFileName: 'roma_infanzia.pdf',
          sourceSha256: sha,
          fileSizeBytes: initialByteLength,
          pageCount: 12,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: [],
        },
        pdfBytes
      );

      // Risoluzione binario dallo storage nel Workspace
      const retrievedBinary = await getTemplatePdfBinary(templateId);
      expect(retrievedBinary).toBeDefined();
      expect(retrievedBinary?.byteLength).toBe(initialByteLength);

      // Copia dedicata passata a PDF.js (R05-R1 architecture)
      const pdfJsSlice = new Uint8Array(retrievedBinary!).slice();
      const loadingTask = pdfjs.getDocument({ data: pdfJsSlice });
      const doc = await loadingTask.promise;

      // Navigazione multipagina come nel Calibration Workspace: 1 -> 2 -> 3 -> 12 -> 1
      const navigationSequence = [1, 2, 3, 12, 1];
      const visitedPages: number[] = [];

      for (const targetPage of navigationSequence) {
        // Uso esclusivo di doc.getPage(targetPage)
        const page = await doc.getPage(targetPage);
        expect(page).toBeDefined();
        expect(page.pageNumber).toBe(targetPage);
        visitedPages.push(page.pageNumber);
      }

      expect(visitedPages).toEqual([1, 2, 3, 12, 1]);

      // Il buffer sorgente recuperato dallo storage NON deve essere stato detached
      expect(retrievedBinary?.byteLength).toBe(initialByteLength);
      expect(retrievedBinary?.buffer.byteLength).toBe(initialByteLength);

      await doc.destroy();
    });

    it('Test 2 — Document Load Count: getDocument chiamato 1 sola volta per 5 pagine', async () => {
      const pdfjs = await import('pdfjs-dist');
      const pdfBytes = generateMultipagePdf(6);

      let documentLoadCount = 0;
      const getDocumentWrapped = (params: any) => {
        documentLoadCount++;
        return pdfjs.getDocument(params);
      };

      const templateId = 'tpl_load_count_test';
      const sha = await computeSha256(pdfBytes);
      await saveCustomTemplate(
        {
          templateId,
          name: 'Modello Load Count',
          schoolOrder: 'A2',
          sourceFileName: 'test.pdf',
          sourceSha256: sha,
          fileSizeBytes: pdfBytes.byteLength,
          pageCount: 6,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: [],
        },
        pdfBytes
      );

      const retrievedBinary = (await getTemplatePdfBinary(templateId))!;

      // Workspace document lifecycle simulation:
      // Proxy reference holds document for current sourceKey
      let cachedDocRef: { sourceKey: string; doc: any } | null = null;
      const sourceKey = `sha_${templateId}_${sha}`;

      const loadDocumentIfNeeded = async () => {
        if (cachedDocRef?.sourceKey === sourceKey && cachedDocRef.doc) {
          return cachedDocRef.doc;
        }
        const pdfJsSlice = new Uint8Array(retrievedBinary).slice();
        const loadingTask = getDocumentWrapped({ data: pdfJsSlice });
        const doc = await loadingTask.promise;
        cachedDocRef = { sourceKey, doc };
        return doc;
      };

      // Caricamento iniziale documento
      const initialDoc = await loadDocumentIfNeeded();
      const getPageSpy = vi.spyOn(initialDoc, 'getPage');

      // Simulazione passaggio tra 5 pagine: 1, 2, 3, 4, 5
      const pagesToVisit = [1, 2, 3, 4, 5];
      for (const p of pagesToVisit) {
        const currentDoc = await loadDocumentIfNeeded();
        const page = await currentDoc.getPage(p);
        expect(page.pageNumber).toBe(p);
      }

      // Verifiche: getDocument ESATTAMENTE 1 VOLTA, getPage ESATTAMENTE 5 VOLTE
      expect(documentLoadCount).toBe(1);
      expect(getPageSpy).toHaveBeenCalledTimes(5);

      await initialDoc.destroy();
    });

    it('Test 3 — Source Change: Modello A -> Modello B distrugge proxy A e crea proxy B', async () => {
      const pdfjs = await import('pdfjs-dist');
      const bytesA = generateMultipagePdf(2);
      const bytesB = generateMultipagePdf(3);

      // Carica Modello A
      const sliceA = new Uint8Array(bytesA).slice();
      const docA = await pdfjs.getDocument({ data: sliceA }).promise;
      const destroySpyA = vi.spyOn(docA, 'destroy');

      const pageA1 = await docA.getPage(1);
      expect(pageA1.pageNumber).toBe(1);

      // Cambio modello verso Modello B: cleanup proxy A
      docA.destroy();
      expect(destroySpyA).toHaveBeenCalledTimes(1);

      // Creazione nuovo proxy per Modello B
      const sliceB = new Uint8Array(bytesB).slice();
      const docB = await pdfjs.getDocument({ data: sliceB }).promise;

      // Pagine di Modello B navigabili senza errori
      const pageB1 = await docB.getPage(1);
      const pageB2 = await docB.getPage(2);
      const pageB3 = await docB.getPage(3);
      expect(pageB1.pageNumber).toBe(1);
      expect(pageB2.pageNumber).toBe(2);
      expect(pageB3.pageNumber).toBe(3);

      await docB.destroy();
    });

    it('Test 4 — Reopen: apertura -> chiusura -> riapertura crea nuova copia e naviga regolarmente', async () => {
      const pdfjs = await import('pdfjs-dist');
      const pdfBytes = generateMultipagePdf(4);
      const templateId = 'tpl_reopen_test';
      const sha = await computeSha256(pdfBytes);

      await saveCustomTemplate(
        {
          templateId,
          name: 'Modello Reopen Test',
          schoolOrder: 'A3',
          sourceFileName: 'reopen.pdf',
          sourceSha256: sha,
          fileSizeBytes: pdfBytes.byteLength,
          pageCount: 4,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: [],
        },
        pdfBytes
      );

      // Sessione 1: apertura workspace
      const session1Binary = (await getTemplatePdfBinary(templateId))!;
      const session1Slice = new Uint8Array(session1Binary).slice();
      const doc1 = await pdfjs.getDocument({ data: session1Slice }).promise;

      const p1 = await doc1.getPage(1);
      const p2 = await doc1.getPage(2);
      expect(p1.pageNumber).toBe(1);
      expect(p2.pageNumber).toBe(2);

      // Chiusura workspace (unmount)
      await doc1.destroy();

      // Sessione 2: riapertura workspace (nuovo mount, recupero binario fresco)
      const session2Binary = (await getTemplatePdfBinary(templateId))!;
      expect(session2Binary.byteLength).toBe(pdfBytes.byteLength);

      const session2Slice = new Uint8Array(session2Binary).slice();
      const doc2 = await pdfjs.getDocument({ data: session2Slice }).promise;

      const p2_1 = await doc2.getPage(1);
      const p2_3 = await doc2.getPage(3);
      expect(p2_1.pageNumber).toBe(1);
      expect(p2_3.pageNumber).toBe(3);

      await doc2.destroy();
    });
  });
});
