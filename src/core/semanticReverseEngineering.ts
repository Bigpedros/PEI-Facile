/**
 * @license
 * PEI FACILE — Semantic Reverse Engineering Engine (Phase 1E R01)
 * Aligning: Ministerial Baseline ↔ Acquired Model ↔ Real Compiled PEI (Evidence)
 * Rules: Winning layout is Acquired Model, semantic reference is Ministerial Baseline,
 * PEI compiled serves as temporary run-time evidence for reverse engineering without PII persistence.
 */

import type { TemplateSchema, TemplateSchemaField, TemplateFieldType } from './templateSchemaTypes';
import type { PeiDocument } from '../types/pei';

export interface SemanticReverseEngineeringDiagnostics {
  baselinePresent: boolean;
  calibrationSource: 'CUSTOM' | 'BUILT_IN' | 'DERIVED';
  evidenceSource: 'PRESENT' | 'ABSENT';
  semanticMappingsFound: number;
  localFieldsFound: number;
  evidenceConfirmedFields: number;
  evidenceDiscoveredFields: number;
  evidenceConflicts: number;
  backgroundTransparentSuggested: number;
  backgroundOpaqueSuggested: number;
}

export interface SemanticReverseEngineeringResult {
  calibratedSchema: TemplateSchema;
  diagnostics: SemanticReverseEngineeringDiagnostics;
}

const SEMANTIC_KEY_ALIASES: Record<string, string[]> = {
  studentName: ['alunno', 'alunna', 'bambino', 'bambina', 'studente', 'nome', 'cognome', 'codice', 'identificativo'],
  schoolInstitution: ['scuola', 'istituzione', 'istituto', 'plesso', 'sede', 'circolo'],
  classSection: ['classe', 'sezione', 'gruppo'],
  compilationDate: ['data', 'redazione', 'approvazione', 'data del glo', 'glo'],
  familyContext: ['famiglia', 'genitori', 'contesto familiare', 'prospettiva'],
  clinicalProfile: ['profilo di funzionamento', 'diagnosi', 'profilo', 'sintesi del profilo', 'icf'],
  individualProject: ['progetto individuale', 'raccordo', 'art. 14', 'legge 328'],
  observations: ['osservazioni', 'punti di forza', 'potenzialità'],
  barriersFacilitators: ['barriere', 'facilitatori', 'contesto', 'fattori ambientali'],
  supportHours: ['sostegno', 'ore sostegno', 'fabbisogno', 'richiesta ore'],
  finalReview: ['relazione finale', 'verifica finale', 'esito globale'],
};

/**
 * Trova la migliore semanticKey per una determinata etichetta locale.
 */
export function findBestSemanticKey(label: string): string | null {
  const lower = label.toLowerCase();
  for (const [key, aliases] of Object.entries(SEMANTIC_KEY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) {
      return key;
    }
  }
  return null;
}

function isLabelValid(label: string): boolean {
  const clean = label.trim();
  if (!clean) return false;

  // 1. Check if label has any letters (alpha characters)
  const hasLetters = /[a-zA-ZàèìòùéÀÈÌÒÙÉ]/.test(clean);
  if (!hasLetters) {
    return false;
  }

  // 2. Short brief OCR garbage or symbols: e.g. "L]", "l)", "i)"
  if (clean.length <= 2) {
    if (/^[a-zA-Z\d][\]\)\|\/\\_]+$/.test(clean) || /^[^a-zA-Z\d]+$/.test(clean) || /^[\]\)\|\/\\_]+[a-zA-Z\d]$/.test(clean)) {
      return false;
    }
  }

  // 3. Common noise strings / OCR fragments to reject as autonomous labels
  const noise = ['di', 'da', 'del', 'al', 'il', 'la', 'i', 'gli', 'le', 'un', 'una', 'data', 'personale', 'rivedibilità', 'scelta opzione', 'campo da identificare', 'riga', 'opzione'];
  if (noise.includes(clean.toLowerCase())) {
    return false;
  }

  return true;
}

/**
 * Esegue il reverse engineering semantico coordinando:
 * 1. La Baseline Ministeriale (struttura normativa)
 * 2. Il Modello Acquisito (layout fisico e geometrie reali)
 * 3. Il PEI reale compilato (come evidenza d'uso temporanea priva di salvataggio)
 */
export function reverseEngineerSchema(
  baseline: TemplateSchema | null,
  sourceModel: TemplateSchema,
  evidenceDoc: PeiDocument | null,
  rawPagesText?: string[] | null
): SemanticReverseEngineeringResult {
  const diagnostics: SemanticReverseEngineeringDiagnostics = {
    baselinePresent: !!baseline,
    calibrationSource: sourceModel.schoolOrder ? 'DERIVED' : 'CUSTOM',
    evidenceSource: !!evidenceDoc || (!!rawPagesText && rawPagesText.length > 0) ? 'PRESENT' : 'ABSENT',
    semanticMappingsFound: 0,
    localFieldsFound: 0,
    evidenceConfirmedFields: 0,
    evidenceDiscoveredFields: 0,
    evidenceConflicts: 0,
    backgroundTransparentSuggested: 0,
    backgroundOpaqueSuggested: 0,
  };

  const calibratedFields: TemplateSchemaField[] = sourceModel.fields.map((field) => {
    const calibratedField = { ...field };
    const localLabel = field.label;
    const lowerLabel = localLabel.toLowerCase();

    // Guard against invalid/noise/false positive candidates
    if (!isLabelValid(localLabel)) {
      calibratedField.semanticKey = null;
      calibratedField.suggestedSemanticKey = undefined;
      return calibratedField;
    }

    // 1. Semantic Mapping (Sinonimi e varianti con la Baseline Ministeriale)
    const matchedKey = findBestSemanticKey(localLabel);
    if (matchedKey) {
      calibratedField.semanticKey = matchedKey;
      calibratedField.suggestedSemanticKey = matchedKey;
      diagnostics.semanticMappingsFound++;
    } else {
      calibratedField.semanticKey = field.semanticKey || null;
      diagnostics.localFieldsFound++;
    }

    // 2. Analisi Evidenza (PEI Reale Compilato)
    let hasEvidence = false;
    let evidenceVal: string | undefined = undefined;

    if (evidenceDoc) {
      // Cerca per ID o per chiave semantica
      if (field.templateFieldId && evidenceDoc.values[field.templateFieldId] !== undefined) {
        evidenceVal = String(evidenceDoc.values[field.templateFieldId]);
        hasEvidence = true;
      } else if (calibratedField.semanticKey && evidenceDoc.values[calibratedField.semanticKey] !== undefined) {
        evidenceVal = String(evidenceDoc.values[calibratedField.semanticKey]);
        hasEvidence = true;
      }
    }

    // Fallback: Field Discovery per Differenza basato sul testo grezzo
    if (!hasEvidence && rawPagesText && rawPagesText.length > 0) {
      const fullText = rawPagesText.join('\n');
      const escapedLabel = localLabel.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      // Identifica se nel testo reale segue una stringa compilata in corrispondenza del segnaposto
      const regex = new RegExp(`${escapedLabel}\\s*[:\\-]?\\s*([^\\n\\r_]{2,100})`, 'i');
      const match = fullText.match(regex);
      if (match) {
        evidenceVal = match[1].trim();
        hasEvidence = true;
        diagnostics.evidenceDiscoveredFields++;
      }
    }

    // 3. Inferenza Tipo Campo e Background Mode basati sull'evidenza
    if (hasEvidence && evidenceVal && evidenceVal.length > 0) {
      diagnostics.evidenceConfirmedFields++;

      // Inferenza Tipo
      if (evidenceVal.length > 120) {
        calibratedField.fieldType = 'TEXT_LONG';
      } else if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}$/.test(evidenceVal)) {
        calibratedField.fieldType = 'DATE';
      } else if (evidenceVal.toLowerCase() === 'x' || evidenceVal.toLowerCase() === 'si' || evidenceVal.toLowerCase() === 'no') {
        calibratedField.fieldType = 'MULTI_CHOICE'; // checkbox/choice
      } else {
        calibratedField.fieldType = 'TEXT_SHORT';
      }

      // Inferenza Background (OPAQUE_WHITE se sovrascrive un placeholder testuale, TRANSPARENT se linea o area vuota)
      const hasTextPlaceholder = lowerLabel.includes('[') || lowerLabel.includes(']') || lowerLabel.includes('intestazione') || lowerLabel.includes('placeholder');
      if (hasTextPlaceholder) {
        calibratedField.backgroundMode = 'OPAQUE_WHITE';
        diagnostics.backgroundOpaqueSuggested++;
      } else {
        calibratedField.backgroundMode = 'TRANSPARENT';
        diagnostics.backgroundTransparentSuggested++;
      }

      calibratedField.confidence = Math.min(100, (calibratedField.confidence || 80) + 15);
      calibratedField.status = 'AUTO_VERIFIED';
    } else {
      // Fallback deterministico basato su placeholders locali
      const hasTextPlaceholder = lowerLabel.includes('[') || lowerLabel.includes(']') || lowerLabel.includes('intestazione') || lowerLabel.includes('placeholder');
      if (hasTextPlaceholder) {
        calibratedField.backgroundMode = 'OPAQUE_WHITE';
        diagnostics.backgroundOpaqueSuggested++;
      } else {
        calibratedField.backgroundMode = 'TRANSPARENT';
        diagnostics.backgroundTransparentSuggested++;
      }
    }

    // 4. SICUREZZA E PRIVACY: Nessuna PII (valore personale) deve MAI essere persistita nello schema
    calibratedField.defaultValue = undefined;
    calibratedField.placeholder = undefined;

    return calibratedField;
  });

  const calibratedSchema: TemplateSchema = {
    ...sourceModel,
    fields: calibratedFields,
    calibrationStatus: 'CALIBRATED',
    updatedAt: new Date().toISOString(),
  };

  return {
    calibratedSchema,
    diagnostics,
  };
}
