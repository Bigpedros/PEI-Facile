/**
 * @license
 * PEI FACILE — PDF Document Format Adapter
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { DocumentFormatAdapter } from './baseAdapter';
import type {
  ExtractedRawPage,
  DocumentAcquisitionOptions,
} from '../../types/documentAcquisitionTypes';
import {
  normalizeInputData,
  extractNativePageText,
  countRasterImagesInPage,
  classifyPageContent,
  renderPdfPageToCanvas,
} from '../pdfIntakeService';
import { analyzeDocumentImage } from '../ocrEngine';

// Ensure PDF.js worker is properly configured
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

export class PdfFormatAdapter implements DocumentFormatAdapter {
  format = 'PDF' as const;

  canHandle(fileName: string, mimeType?: string): boolean {
    const lower = fileName.toLowerCase();
    return lower.endsWith('.pdf') || mimeType === 'application/pdf';
  }

  async extractPages(
    input: File | File[] | ArrayBuffer,
    fileName: string,
    options: DocumentAcquisitionOptions = {}
  ): Promise<ExtractedRawPage[]> {
    const rawInput = Array.isArray(input) ? input[0] : input;
    if (!rawInput) {
      throw new Error('Nessun file PDF fornito.');
    }

    const { onProgress, renderScale = 2.0, customOcrRunner } = options;

    if (onProgress) {
      onProgress({
        currentPage: 0,
        totalPages: 0,
        percentage: 5,
        stage: 'READING',
        stageLabel: 'Lettura documento',
        detail: `Apertura documento PDF (${fileName})...`,
      });
    }

    const normalizedData = await normalizeInputData(rawInput);
    const loadingTask = pdfjsLib.getDocument({
      data: normalizedData,
      useSystemFonts: true,
      isEvalSupported: false,
    });

    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    const extractedPages: ExtractedRawPage[] = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageBasePercent = 10 + Math.round(((pageNum - 1) / totalPages) * 75);
      const pageEndPercent = 10 + Math.round((pageNum / totalPages) * 75);

      if (onProgress) {
        onProgress({
          currentPage: pageNum,
          totalPages,
          percentage: pageBasePercent,
          stage: 'TEXT_EXTRACTION',
          stageLabel: 'Estrazione testo',
          detail: `Pagina ${pageNum} di ${totalPages} — ${pageBasePercent}%`,
        });
      }

      const page = await pdfDoc.getPage(pageNum);
      const { text: nativeText, items: nativeItems, charCount: nativeCharCount } =
        await extractNativePageText(page);
      const rasterCount = await countRasterImagesInPage(page);
      const pageType = classifyPageContent(nativeCharCount, rasterCount);

      let finalText = '';
      let pageConfidence: number | undefined;
      const pageWarnings: string[] = [];

      if (pageType === 'TEXT_NATIVE') {
        finalText = nativeText;
        pageConfidence = 98;
      } else if (pageType === 'IMAGE_ONLY') {
        if (onProgress) {
          onProgress({
            currentPage: pageNum,
            totalPages,
            percentage: pageBasePercent,
            stage: 'OCR',
            stageLabel: 'OCR',
            detail: `Pagina ${pageNum} di ${totalPages} — ${pageBasePercent}% (Scansione rilevata)`,
          });
        }

        pageWarnings.push('Pagina raster: applicato OCR locale.');
        const canvas = await renderPdfPageToCanvas(page, renderScale);

        if (customOcrRunner) {
          const res = await customOcrRunner(canvas);
          finalText = res.text;
          pageConfidence = res.confidence;
        } else {
          // Convert canvas to File and run OCR with progress forwarding
          const dataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : '';
          const arr = dataUrl.split(',');
          const bstr = atob(arr[1] || '');
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const imageFile = new File([u8arr], `page-${pageNum}.png`, { type: 'image/png' });

          const ocrRes = await analyzeDocumentImage(imageFile, {
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

          finalText = ocrRes.rawText;
          pageConfidence = ocrRes.confidence;
        }
      } else {
        // MIXED_UNRESOLVED: Preserve native text
        finalText = nativeText;
        pageConfidence = 85;
        pageWarnings.push(
          `Pagina mista (${nativeCharCount} caratteri, ${rasterCount} elementi raster): preservato testo nativo.`
        );
      }

      extractedPages.push({
        pageNumber: pageNum,
        text: finalText,
        confidence: pageConfidence,
        pageType: pageType === 'TEXT_NATIVE' ? 'TEXT_NATIVE' : pageType === 'IMAGE_ONLY' ? 'IMAGE_ONLY' : 'MIXED',
        nativeCharCount,
        warnings: pageWarnings.length > 0 ? pageWarnings : undefined,
      });

      if (onProgress) {
        onProgress({
          currentPage: pageNum,
          totalPages,
          percentage: pageEndPercent,
          stage: 'TEXT_EXTRACTION',
          stageLabel: 'Estrazione testo',
          detail: `Pagina ${pageNum} di ${totalPages} — ${pageEndPercent}%`,
        });
      }
    }

    return extractedPages;
  }
}
