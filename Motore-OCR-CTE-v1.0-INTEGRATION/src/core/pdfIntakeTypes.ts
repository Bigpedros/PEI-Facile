/**
 * @license
 * PEI FACILE — PDF Intake Technical Types (Blocco 1 R1)
 * Modello contrattuale neutrale per l'ingestione, classificazione e instradamento PDF.
 */

import type { GenericOcrResult } from './types';

/**
 * Classificazione tecnica minima e conservativa del contenuto di una pagina PDF.
 * - TEXT_NATIVE: la pagina contiene testo digitale estraibile senza elementi raster contrastanti.
 * - IMAGE_ONLY: la pagina è una scansione o immagine priva di testo vettoriale.
 * - MIXED_UNRESOLVED: la pagina contiene sia testo nativo che elementi raster contemporaneamente (stato misto non risolto).
 */
export type PageContentType = 'TEXT_NATIVE' | 'IMAGE_ONLY' | 'MIXED_UNRESOLVED';

/**
 * Singolo elemento di testo nativo estratto con relative coordinate posizionali.
 */
export interface NativeTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

/**
 * Risultato normalizzato per il fallback OCR.
 */
export interface PdfIntakeOcrResult {
  text: string;
  confidence?: number;
  variant?: string;
  rawResult?: GenericOcrResult | any;
}

/**
 * Risultato dell'elaborazione di una singola pagina del documento.
 */
export interface IntakePageResult {
  pageNumber: number;
  pageType: PageContentType;
  text: string;
  nativeItems?: NativeTextItem[];
  nativeCharCount: number;
  rasterImageCount: number;
  ocrConfidence?: number;
  ocrVariantUsed?: string;
  ocrResult?: PdfIntakeOcrResult | GenericOcrResult | any;
  hasWarnings: boolean;
  warnings: string[];
}

/**
 * Risultato complessivo dell'ingestione documentale (PdfIntakeResult).
 */
export interface PdfIntakeResult {
  fileName: string;
  totalPages: number;
  textNativePageCount: number;
  imageOnlyPageCount: number;
  mixedPageCount: number;
  pages: IntakePageResult[];
  fullText: string;
  processingTimeMs: number;
  warnings: string[];
}

/**
 * Opzioni di configurazione per il servizio di intake.
 */
export interface PdfIntakeOptions {
  /**
   * Fattore di scala di rendering per la generazione del Canvas in caso di OCR.
   * La base geometrica di PDF.js è 72 pt/inch.
   * Default: 2.0 (~144 DPI equivalenti), scelto per garantire il miglior compromesso tra leggibilità OCR e consumo di memoria RAM.
   */
  renderScale?: number;

  /**
   * Runner OCR personalizzato (consente injection/mocking nei test e disaccoppiamento).
   */
  customOcrRunner?: (canvas: HTMLCanvasElement) => Promise<PdfIntakeOcrResult>;
}

