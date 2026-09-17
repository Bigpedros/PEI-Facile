/**
 * @license
 * PEI FACILE — Base Document Format Adapter
 */

import type {
  SupportedDocumentFormat,
  ExtractedRawPage,
  DocumentAcquisitionOptions,
} from '../../types/documentAcquisitionTypes';

export interface DocumentFormatAdapter {
  format: SupportedDocumentFormat;
  canHandle(fileName: string, mimeType?: string): boolean;
  extractPages(
    input: File | File[] | ArrayBuffer,
    fileName: string,
    options: DocumentAcquisitionOptions
  ): Promise<ExtractedRawPage[]>;
}

export function detectDocumentFormat(fileName: string, mimeType?: string): SupportedDocumentFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    return 'PDF';
  }
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    mimeType === 'image/jpeg'
  ) {
    return 'IMAGE_JPEG';
  }
  if (lower.endsWith('.png') || mimeType === 'image/png') {
    return 'IMAGE_PNG';
  }
  if (
    lower.endsWith('.tiff') ||
    lower.endsWith('.tif') ||
    mimeType === 'image/tiff' ||
    mimeType === 'image/tif'
  ) {
    return 'IMAGE_TIFF';
  }
  if (
    lower.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'DOCX';
  }
  if (lower.endsWith('.doc') || mimeType === 'application/msword') {
    return 'UNSUPPORTED_LEGACY_DOC';
  }
  return 'UNKNOWN';
}
