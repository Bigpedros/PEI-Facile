/**
 * Canonical Template Engine (CTE) - Release R03
 * Centralized Structural Matching Thresholds
 *
 * Requirements:
 * - >= 99%: Template Identico
 * - 95 - 98%: Template Compatibile
 * - 85 - 94%: Template Derivato
 * - < 85%: Template Differente
 *
 * NOTE: Thresholds are centralized in constants and can be easily recalibrated.
 */

import { TemplateMatchClassification } from '../types';

export const MATCH_THRESHOLDS = {
  IDENTICAL: 99.0,
  COMPATIBLE: 95.0,
  DERIVED: 85.0,
} as const;

export const CLASSIFICATION_LABELS: Record<TemplateMatchClassification, string> = {
  IDENTICAL: 'Template Identico',
  COMPATIBLE: 'Template Compatibile',
  DERIVED: 'Template Derivato',
  DIFFERENT: 'Template Differente',
};

/**
 * Classifies a numerical similarity score (0-100) into its canonical classification and label.
 */
export function classifyMatchScore(score: number): {
  classification: TemplateMatchClassification;
  label: string;
} {
  if (score >= MATCH_THRESHOLDS.IDENTICAL) {
    return {
      classification: TemplateMatchClassification.IDENTICAL,
      label: CLASSIFICATION_LABELS.IDENTICAL,
    };
  }
  if (score >= MATCH_THRESHOLDS.COMPATIBLE) {
    return {
      classification: TemplateMatchClassification.COMPATIBLE,
      label: CLASSIFICATION_LABELS.COMPATIBLE,
    };
  }
  if (score >= MATCH_THRESHOLDS.DERIVED) {
    return {
      classification: TemplateMatchClassification.DERIVED,
      label: CLASSIFICATION_LABELS.DERIVED,
    };
  }
  return {
    classification: TemplateMatchClassification.DIFFERENT,
    label: CLASSIFICATION_LABELS.DIFFERENT,
  };
}
