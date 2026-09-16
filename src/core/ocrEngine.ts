import { createWorker } from 'tesseract.js';
import {
  computeFileHash,
  createDocumentImageVariants,
  evaluateGenericOcrQuality,
} from './imagePreprocessing';
import type { EngineProgress, GenericOcrResult, OcrVariantResult, OcrWord } from './types';

export interface AnalyzeImageOptions {
  rotationDegrees?: number;
  onProgress?: EngineProgress;
  maxDimension?: number;
}

/**
 * Core OCR neutro derivato dalla baseline Motore-OCR v1.0.0.
 * Non contiene parser di scontrini né regole PEI.
 * Input previsto: immagine già disponibile come File browser.
 * Per PDF: estrarre prima il text layer; renderizzare in immagine solo le pagine/zone che richiedono OCR.
 */
export async function analyzeDocumentImage(
  file: File,
  options: AnalyzeImageOptions = {},
): Promise<GenericOcrResult> {
  const startedAt = performance.now();
  const rotationDegrees = options.rotationDegrees ?? 0;
  const onProgress = options.onProgress ?? (() => undefined);
  const inputHash = await computeFileHash(file);

  onProgress('Generazione varianti immagine', 5);
  const variants = await createDocumentImageVariants(file, {
    rotationDegrees,
    maxDimension: options.maxDimension ?? 2400,
  });

  if (variants.length === 0) throw new Error('Nessuna variante immagine generata');

  onProgress('Inizializzazione Tesseract italiano', 10);
  const worker = await createWorker('ita', 1, {
    langPath: '/tessdata',
    gzip: false,
    logger: (message) => {
      if (message.status === 'recognizing text') {
        onProgress('Riconoscimento OCR', 10 + Math.round((message.progress ?? 0) * 80));
      }
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_pageseg_mode: '4' as never,
    });

    const candidates: Array<OcrVariantResult & { words: OcrWord[] }> = [];

    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const variantStartedAt = performance.now();
      onProgress(`Analisi variante ${variant.label}`, 10 + Math.round((index / variants.length) * 80));

      const recognition = await worker.recognize(variant.dataUrl, {}, { blocks: true });
      const rawText = recognition.data.text || '';
      const confidence = Math.round(recognition.data.confidence || 0);
      const evaluation = evaluateGenericOcrQuality(rawText, confidence);
      const words: OcrWord[] = [];

      for (const block of recognition.data.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const line of paragraph.lines ?? []) {
            for (const word of line.words ?? []) {
              if (word.text?.trim() && word.bbox && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0) {
                words.push({
                  text: word.text,
                  confidence: Number.isFinite(word.confidence) ? word.confidence : 0,
                  bbox: {
                    x0: word.bbox.x0,
                    y0: word.bbox.y0,
                    x1: word.bbox.x1,
                    y1: word.bbox.y1,
                  },
                });
              }
            }
          }
        }
      }

      candidates.push({
        variant: variant.name,
        label: variant.label,
        confidence,
        evaluation,
        rawText,
        snippet: rawText.slice(0, 180).replace(/\n+/g, ' '),
        durationMs: Math.round(performance.now() - variantStartedAt),
        words,
      });
    }

    if (candidates.length === 0) throw new Error('Tesseract non ha prodotto alcun candidato OCR');

    const winner = candidates.reduce((best, current) =>
      current.evaluation.overallScore > best.evaluation.overallScore ? current : best,
    );

    onProgress('Completato', 100);
    return {
      schema: 'PEI_FACILE_OCR_CORE_V1',
      input: {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        sha256: inputHash,
        rotationDegrees,
      },
      selectedVariant: winner.variant,
      confidence: winner.confidence,
      rawText: winner.rawText,
      words: winner.words,
      variants: candidates.map(({ words: _words, ...candidate }) => candidate),
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await worker.terminate();
  }
}
