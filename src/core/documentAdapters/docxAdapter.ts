/**
 * @license
 * PEI FACILE — DOCX Document Format Adapter (Local-First via Mammoth)
 */

import mammoth from 'mammoth';
import type { DocumentFormatAdapter } from './baseAdapter';
import type {
  ExtractedRawPage,
  DocumentAcquisitionOptions,
} from '../../types/documentAcquisitionTypes';
import { normalizeInputData } from '../pdfIntakeService';

export class DocxFormatAdapter implements DocumentFormatAdapter {
  format = 'DOCX' as const;

  canHandle(fileName: string, mimeType?: string): boolean {
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith('.docx') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  async extractPages(
    input: File | File[] | ArrayBuffer,
    fileName: string,
    options: DocumentAcquisitionOptions = {}
  ): Promise<ExtractedRawPage[]> {
    const rawInput = Array.isArray(input) ? input[0] : input;
    if (!rawInput) {
      throw new Error('Nessun file DOCX fornito.');
    }

    const { onProgress } = options;

    if (onProgress) {
      onProgress({
        currentPage: 1,
        totalPages: 1,
        percentage: 10,
        stage: 'READING',
        stageLabel: 'Lettura documento',
        detail: `Lettura file Word DOCX (${fileName})...`,
      });
    }

    const u8 = await normalizeInputData(rawInput);
    const arrayBuffer = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

    if (onProgress) {
      onProgress({
        currentPage: 1,
        totalPages: 1,
        percentage: 45,
        stage: 'TEXT_EXTRACTION',
        stageLabel: 'Estrazione testo',
        detail: 'Estrazione testo nativo da struttura DOCX...',
      });
    }

    const result = await mammoth.extractRawText({ arrayBuffer });
    const fullText = (result.value || '').trim();

    if (!fullText) {
      throw new Error('Il documento DOCX non contiene testo leggibile.');
    }

    // Split text into logical section-pages if large or containing standard PEI markers
    const sectionSplits = fullText.split(/(?=(?:SEZIONE\s+\d+|QUADRO\s+INFORMATIVO|Allegato\s+A\d))/i);
    const extractedPages: ExtractedRawPage[] = [];

    if (sectionSplits.length > 1) {
      sectionSplits.forEach((chunk, idx) => {
        const trimmed = chunk.trim();
        if (trimmed.length > 0) {
          extractedPages.push({
            pageNumber: idx + 1,
            text: trimmed,
            confidence: 99,
            pageType: 'DOCUMENT_PARSED',
            nativeCharCount: trimmed.length,
          });
        }
      });
    } else {
      extractedPages.push({
        pageNumber: 1,
        text: fullText,
        confidence: 99,
        pageType: 'DOCUMENT_PARSED',
        nativeCharCount: fullText.length,
      });
    }

    if (onProgress) {
      onProgress({
        currentPage: extractedPages.length,
        totalPages: extractedPages.length,
        percentage: 85,
        stage: 'TEXT_EXTRACTION',
        stageLabel: 'Estrazione testo',
        detail: `Completata estrazione di ${extractedPages.length} sezioni/pagine dal file DOCX.`,
      });
    }

    return extractedPages;
  }
}
