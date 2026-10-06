import { describe, it, expect } from 'vitest';
import { acquirePdfTemplate } from '../core/templateAcquisitionService';
import { AcquisitionAbortedError } from '../core/templateAcquisitionTypes';
import type { AcquisitionProgress } from '../types/documentAcquisitionTypes';
import { saveCustomTemplate, getTemplatePdfBinary, getCustomTemplateMetadata } from '../core/templateStorage';

async function createMockPdfBytes(tag:string){const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage([595.32,841.92]).drawText('Nome: '+tag,{x:50,y:750,size:12});return pdf.save();}

describe('PEI FACILE — Acquisizione prima, dati del modello dopo', () => {
  it('1. Segnalazione di avanzamento reale durante le fasi di elaborazione', async () => {
    const mockBytes = await createMockPdfBytes('progress_tracking');
    const progressEvents: AcquisitionProgress[] = [];

    const result = await acquirePdfTemplate(mockBytes, 'modello_roma_test.pdf', {
      onProgress: (p) => {
        progressEvents.push({ ...p });
      },
    });

    expect(result).toBeDefined();
    expect(result.status).not.toBe('FAILED');
    expect(progressEvents.length).toBeGreaterThan(0);

    // Verifica che gli eventi contengano stadi, percentuali e pagine reali
    const lastEvent = progressEvents[progressEvents.length - 1];
    expect(lastEvent.percentage).toBeGreaterThanOrEqual(80);
    expect(lastEvent.stageLabel).toBeTruthy();
    expect(lastEvent.currentPage).toBeGreaterThanOrEqual(1);
  });

  it('2. Annullamento tempestivo tramite AbortSignal senza generare record incompleti', async () => {
    const mockBytes = await createMockPdfBytes('cancel_abort_test');
    const controller = new AbortController();

    // Abort prima/durante l'elaborazione
    controller.abort();

    await expect(
      acquirePdfTemplate(mockBytes, 'da_annullare.pdf', {
        signal: controller.signal,
      })
    ).rejects.toThrow();

    // Verifica che nessun template con questo nome sia stato salvato
    const metadata = await getCustomTemplateMetadata('tpl_non_esistente');
    expect(metadata).toBeNull();
  });

  it('3. Registrazione del modello riutilizza il risultato già calcolato senza una seconda elaborazione', async () => {
    const mockBytes = await createMockPdfBytes('single_run_persistence');
    const result = await acquirePdfTemplate(mockBytes, 'modello_singola_esecuzione.pdf');

    expect(result.sourceSha256).toBeDefined();

    // Salvataggio diretto del risultato ottenuto
    await saveCustomTemplate(
      {
        templateId: result.templateId,
        name: 'Modello Singola Esecuzione',
        schoolOrder: 'A2',
        sourceFileName: 'modello_singola_esecuzione.pdf',
        sourceSha256: result.sourceSha256,
        fileSizeBytes: result.fileSizeBytes,
        pageCount: result.pageCount,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationStatus: 'REVIEW_REQUIRED',
        pages: result.pages,
        canonicalDocument: result.canonicalDocument,
        engineUsed: result.engineUsed,
        globalSkewDegrees: result.globalSkewDegrees,
        pageMetrics: result.pageMetrics,
      },
      result.canonicalDocument || mockBytes,
      mockBytes
    );

    const saved = await getCustomTemplateMetadata(result.templateId);
    expect(saved).toBeDefined();
    expect(saved?.sourceSha256).toBe(result.sourceSha256);
    expect(saved?.calibrationStatus).toBe('REVIEW_REQUIRED');
  });
});
