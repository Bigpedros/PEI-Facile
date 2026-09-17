/**
 * @license
 * PEI FACILE — TIFF Document Format Adapter
 */

import UTIF from 'utif';
import type { DocumentFormatAdapter } from './baseAdapter';
import type {
  ExtractedRawPage,
  DocumentAcquisitionOptions,
} from '../../types/documentAcquisitionTypes';
import { normalizeInputData } from '../pdfIntakeService';
import { analyzeDocumentImage } from '../ocrEngine';

export class TiffFormatAdapter implements DocumentFormatAdapter {
  format = 'IMAGE_TIFF' as const;

  canHandle(fileName: string, mimeType?: string): boolean {
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith('.tiff') ||
      lower.endsWith('.tif') ||
      mimeType === 'image/tiff' ||
      mimeType === 'image/tif'
    );
  }

  async extractPages(
    input: File | File[] | ArrayBuffer,
    fileName: string,
    options: DocumentAcquisitionOptions = {}
  ): Promise<ExtractedRawPage[]> {
    const rawInput = Array.isArray(input) ? input[0] : input;
    if (!rawInput) {
      throw new Error('Nessun file TIFF fornito.');
    }

    const { onProgress, customOcrRunner } = options;

    if (onProgress) {
      onProgress({
        currentPage: 0,
        totalPages: 0,
        percentage: 5,
        stage: 'READING',
        stageLabel: 'Lettura documento',
        detail: `Decodifica immagine TIFF (${fileName})...`,
      });
    }

    const u8 = await normalizeInputData(rawInput);
    const ifds = UTIF.decode(u8.buffer);
    if (!ifds || ifds.length === 0) {
      throw new Error('Impossibile decodificare le pagine del file TIFF.');
    }

    const totalPages = ifds.length;
    const extractedPages: ExtractedRawPage[] = [];

    for (let i = 0; i < totalPages; i++) {
      const pageNum = i + 1;
      const ifd = ifds[i];
      UTIF.decodeImage(u8.buffer, ifd);
      const rgba = UTIF.toRGBA8(ifd);
      const width = ifd.width;
      const height = ifd.height;

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

      if (typeof document !== 'undefined' && document.createElement) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const imgData = ctx.createImageData(width, height);
          for (let p = 0; p < rgba.length; p++) {
            imgData.data[p] = rgba[p];
          }
          ctx.putImageData(imgData, 0, 0);

          if (customOcrRunner) {
            const res = await customOcrRunner(canvas);
            text = res.text;
            confidence = res.confidence;
          } else {
            const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
            if (blob) {
              const file = new File([blob], `tiff-page-${pageNum}.png`, { type: 'image/png' });
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
          }
        }
      } else if (customOcrRunner) {
        const mockCanvas = { width, height } as HTMLCanvasElement;
        const res = await customOcrRunner(mockCanvas);
        text = res.text;
        confidence = res.confidence;
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
