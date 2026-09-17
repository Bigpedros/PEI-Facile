/**
 * @license
 * PEI FACILE — Document Acquisition Types (DOCUMENT ACQUISITION R01)
 * Contratti e strutture dati per l'acquisizione multiformato, la classificazione semantica,
 * l'evidenza di mapping e la coda di revisione utente.
 */

import type { SchoolOrder, PeiModelDefinition } from './pei';

/** Formati di documento supportati dal sistema */
export type SupportedDocumentFormat =
  | 'PDF'
  | 'IMAGE_JPEG'
  | 'IMAGE_PNG'
  | 'IMAGE_TIFF'
  | 'DOCX'
  | 'UNSUPPORTED_LEGACY_DOC'
  | 'UNKNOWN';

/** Fasi dell'avanzamento reale dell'acquisizione */
export type AcquisitionStage =
  | 'READING'
  | 'TEXT_EXTRACTION'
  | 'OCR'
  | 'SEMANTIC_ANALYSIS'
  | 'REVIEW_READY';

/** Oggetto di avanzamento reale riportato alla UI */
export interface AcquisitionProgress {
  currentPage: number;
  totalPages: number;
  percentage: number;
  stage: AcquisitionStage;
  stageLabel: string;
  detail?: string;
  subProgress?: number; // 0-100 per OCR specifico
}

/** Rappresentazione di una singola pagina immagine in una sequenza multipagina */
export interface MultiPageImageItem {
  id: string;
  file: File;
  previewUrl: string;
  pageNumber: number;
  rotationDegrees: number; // 0, 90, 180, 270
}

/** Pagina grezza estratta (da PDF nativo, OCR immagine, TIFF o DOCX) */
export interface ExtractedRawPage {
  pageNumber: number;
  text: string;
  confidence?: number;
  pageType: 'TEXT_NATIVE' | 'IMAGE_ONLY' | 'MIXED' | 'DOCUMENT_PARSED';
  nativeCharCount?: number;
  warnings?: string[];
}

/** Evidenza semantica per ciascun campo proposto durante l'acquisizione */
export interface MappingEvidence {
  fieldId: string;
  fieldLabel: string;
  sectionId: string;
  sectionTitle: string;
  pageNumber: number;
  sourceSnippet: string;
  extractedValue: string;
  confidence: number; // 0-100
  mappingReason: string;
  status: 'ACCEPTED' | 'MODIFIED' | 'IGNORED';
  userModifiedValue?: string;
}

/** Risultato della classificazione del modello */
export interface ModelClassificationResult {
  detectedOrder?: SchoolOrder;
  detectedModelId?: string;
  detectedModelName?: string;
  isModelRecognized: boolean;
  recognitionReason: string;
  confidence: number;
}

/** Risultato complessivo dell'acquisizione del documento */
export interface DocumentAcquisitionResult {
  fileName: string;
  detectedFormat: SupportedDocumentFormat;
  totalPages: number;
  classification: ModelClassificationResult;
  rawPages: ExtractedRawPage[];
  fullText: string;
  evidenceList: MappingEvidence[];
  studentCode?: string;
  schoolName?: string;
  classOrSection?: string;
  compilationDate?: string;
  processingTimeMs: number;
  warnings: string[];
  logs: string[];
}

/** Opzioni per il processo di acquisizione */
export interface DocumentAcquisitionOptions {
  renderScale?: number;
  onProgress?: (progress: AcquisitionProgress) => void;
  customOcrRunner?: (canvas: HTMLCanvasElement) => Promise<{ text: string; confidence?: number }>;
  forcedSchoolOrder?: SchoolOrder;
  customModels?: PeiModelDefinition[];
}
