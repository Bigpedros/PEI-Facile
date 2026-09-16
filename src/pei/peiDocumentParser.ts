import type { GenericOcrResult } from '../core/types';

export type PeiSchoolOrder = 'INFANZIA' | 'PRIMARIA' | 'SECONDARIA_I' | 'SECONDARIA_II' | 'UNKNOWN';

export interface PeiFieldCandidate {
  sectionId: string;
  label: string;
  text: string;
  confidence: number;
  source: 'PDF_TEXT_LAYER' | 'OCR';
  needsHumanReview: boolean;
}

export interface PeiImportDraft {
  schoolOrder: PeiSchoolOrder;
  fields: PeiFieldCandidate[];
  warnings: string[];
}

/**
 * CONTRATTO, non implementazione definitiva.
 * Gemini dovrà costruire qui il parser dei modelli ministeriali PEI.
 * Regola: niente hardcoding di nomi di alunni; mappare sezioni/campi strutturali.
 */
export function buildPeiDraftFromOcr(_ocr: GenericOcrResult): PeiImportDraft {
  return {
    schoolOrder: 'UNKNOWN',
    fields: [],
    warnings: ['PEI parser non ancora implementato: usare questo file come contratto iniziale.'],
  };
}
