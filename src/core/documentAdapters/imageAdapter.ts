/**
 * @license
 * PEI FACILE — Image Document Format Adapter (JPG / PNG / Multi-Page Image)
 */

import type { DocumentFormatAdapter } from './baseAdapter';
import type {
  ExtractedRawPage,
  DocumentAcquisitionOptions,
} from '../../types/documentAcquisitionTypes';
import { analyzeDocumentImage } from '../ocrEngine';

export class ImageFormatAdapter implements DocumentFormatAdapter {
  format = 'IMAGE_JPEG' as const; // handles both JPEG and PNG

  canHandle(fileName: string, mimeType?: string): boolean {
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      mimeType === 'image/jpeg' ||
      mimeType === 'image/png'
    );
  }

  async extractPages(
    input: File | File[] | ArrayBuffer,
    fileName: string,
    options: DocumentAcquisitionOptions = {}
  ): Promise<ExtractedRawPage[]> {
    let files: File[] = [];

    if (Array.isArray(input)) {
      files = input;
    } else if (input instanceof File) {
      files = [input];
    } else {
      // ArrayBuffer: wrap as File
      const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
      const isPng = fileName.toLowerCase().endsWith('.png');
      const f = new File([u8], fileName, { type: isPng ? 'image/png' : 'image/jpeg' });
      files = [f];
    }

    if (files.length === 0) {
      throw new Error('Nessuna immagine fornita per l’acquisizione.');
    }

    const { onProgress, customOcrRunner } = options;
    const totalPages = files.length;
    const extractedPages: ExtractedRawPage[] = [];

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      const file = files[i];
      const pageBasePercent = 10 + Math.round((i / totalPages) * 75);
      const pageEndPercent = 10 + Math.round(((i + 1) / totalPages) * 75);

      if (onProgress) {
        onProgress({
          currentPage: pageNum,
          totalPages,
          percentage: pageBasePercent,
          stage: 'OCR',
          stageLabel: 'OCR',
          detail: `Pagina ${pageNum} di ${totalPages} — ${pageBasePercent}%`,
        });
      }

      let text = '';
      let confidence: number | undefined = 80;

      if (customOcrRunner) {
        if (
          typeof window !== 'undefined' &&
          typeof URL !== 'undefined' &&
          typeof URL.createObjectURL === 'function' &&
          typeof document !== 'undefined' &&
          document.createElement
        ) {
          // Render file to canvas for mock/custom runner in browser
          const img = new Image();
          const url = URL.createObjectURL(file);
          try {
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.width || 800;
            canvas.height = img.height || 1100;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.drawImage(img, 0, 0);
            const res = await customOcrRunner(canvas);
            text = res.text;
            confidence = res.confidence;
          } finally {
            URL.revokeObjectURL(url);
          }
        } else {
          // Node or headless mock canvas
          const mockCanvas = { width: 800, height: 1100 } as HTMLCanvasElement;
          const res = await customOcrRunner(mockCanvas);
          text = res.text;
          confidence = res.confidence;
        }
      } else {
        const ocrRes = await analyzeDocumentImage(file, {
          onProgress: (stage, subP) => {
            if (onProgress) {
              const calculatedPercent =
                pageBasePercent + Math.round((subP / 100) * (pageEndPercent - pageBasePercent));
              onProgress({
                currentPage: pageNum,
                totalPages,
                percentage: Math.min(calculatedPercent, pageEndPercent),
                stage: 'OCR',
                stageLabel: 'OCR',
                detail: `Pagina ${pageNum} di ${totalPages} — ${stage} (${subP}%)`,
                subProgress: subP,
              });
            }
          },
        });
        text = ocrRes.rawText;
        confidence = ocrRes.confidence;
      }

      extractedPages.push({
        pageNumber: pageNum,
        text,
        confidence,
        pageType: 'IMAGE_ONLY',
      });

      if (onProgress) {
        onProgress({
          currentPage: pageNum,
          totalPages,
          percentage: pageEndPercent,
          stage: 'OCR',
          stageLabel: 'OCR',
          detail: `Pagina ${pageNum} di ${totalPages} — ${pageEndPercent}% (OCR completato)`,
        });
      }
    }

    return extractedPages;
  }
}
