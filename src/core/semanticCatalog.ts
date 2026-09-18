/**
 * @license
 * PEI FACILE — Canonical Semantic Catalog & Field Identity System (Phase 1C R07)
 * Defines canonical semantic keys, catalog categories, field ID generation,
 * and custom territorial model binding utilities.
 */

import type { TemplateFieldType } from './templateSchemaTypes';

export type SemanticCategory =
  | 'ANAGRAFICA'
  | 'SCUOLA'
  | 'PROFILO_FUNZIONAMENTO'
  | 'APPROVAZIONI'
  | 'QUADRO_INCLUSIONE'
  | 'RISORSE'
  | 'ALTRO';

export interface SemanticCatalogEntry {
  key: string;
  label: string;
  category: SemanticCategory;
  categoryLabel: string;
  defaultFieldType: TemplateFieldType;
  description?: string;
}

/**
 * Canonical dictionary of standardized PEI semantic keys.
 * Maps logical data fields across ministerial Allegati A1-A4 and custom models.
 */
export const CANONICAL_SEMANTIC_CATALOG: SemanticCatalogEntry[] = [
  // 1. ANAGRAFICA ALUNNO
  {
    key: 'student.firstName',
    label: 'Nome alunno',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Nome proprio dell’alunno/a',
  },
  {
    key: 'student.lastName',
    label: 'Cognome alunno',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Cognome dell’alunno/a',
  },
  {
    key: 'student.fullName',
    label: 'Nome e Cognome alunno',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Nome e cognome uniti in unico campo',
  },
  {
    key: 'student.personalCode',
    label: 'Codice sostitutivo personale (Pseudonimo)',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Codice identificativo pseudonimizzato per la privacy',
  },
  {
    key: 'student.fiscalCode',
    label: 'Codice fiscale alunno',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Codice fiscale ufficiale',
  },
  {
    key: 'student.birthDate',
    label: 'Data di nascita alunno',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'DATE',
    description: 'Data di nascita',
  },
  {
    key: 'student.birthPlace',
    label: 'Luogo di nascita alunno',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Comune o Stato di nascita',
  },
  {
    key: 'student.class',
    label: 'Classe o anno di corso',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Classe frequentata (es. 1ª, 2ª, 3ª)',
  },
  {
    key: 'student.section',
    label: 'Sezione',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Sezione scolastica (es. A, B, Blu, Girasoli)',
  },
  {
    key: 'student.site',
    label: 'Plesso o sede scolastica',
    category: 'ANAGRAFICA',
    categoryLabel: 'Anagrafica Alunno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Denominazione del plesso o sede distaccata',
  },

  // 2. SCUOLA ED ANNO SCOLASTICO
  {
    key: 'school.institutionName',
    label: 'Istituzione scolastica (Nome istituto)',
    category: 'SCUOLA',
    categoryLabel: 'Scuola & Anno Scolastico',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Denominazione ufficiale dell’Istituto Comprensivo o Scuola Polo',
  },
  {
    key: 'school.year',
    label: 'Anno scolastico',
    category: 'SCUOLA',
    categoryLabel: 'Scuola & Anno Scolastico',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Anno scolastico di riferimento (es. 2025/2026)',
  },
  {
    key: 'school.code',
    label: 'Codice meccanografico istituto',
    category: 'SCUOLA',
    categoryLabel: 'Scuola & Anno Scolastico',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Codice meccanografico ministeriale',
  },
  {
    key: 'school.headmaster',
    label: 'Dirigente scolastico',
    category: 'SCUOLA',
    categoryLabel: 'Scuola & Anno Scolastico',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Nome e cognome del Dirigente Scolastico',
  },

  // 3. PROFILO DI FUNZIONAMENTO / DIAGNOSI
  {
    key: 'functionalProfile.date',
    label: 'Data Profilo di Funzionamento',
    category: 'PROFILO_FUNZIONAMENTO',
    categoryLabel: 'Profilo di Funzionamento',
    defaultFieldType: 'DATE',
    description: 'Data di emissione del Profilo di Funzionamento o Diagnosi Funzionale',
  },
  {
    key: 'functionalProfile.issuer',
    label: 'Ente / ASL rilasciante',
    category: 'PROFILO_FUNZIONAMENTO',
    categoryLabel: 'Profilo di Funzionamento',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Unità Operativa Complessa o ASL territorialmente competente',
  },
  {
    key: 'functionalProfile.icfCodes',
    label: 'Codici ICF / Diagnosi clinica',
    category: 'PROFILO_FUNZIONAMENTO',
    categoryLabel: 'Profilo di Funzionamento',
    defaultFieldType: 'TEXT_LONG',
    description: 'Classificazione ICF e codici nosografici correlati',
  },
  {
    key: 'functionalProfile.medicalReportDate',
    label: 'Data Verbale di accertamento (L. 104)',
    category: 'PROFILO_FUNZIONAMENTO',
    categoryLabel: 'Profilo di Funzionamento',
    defaultFieldType: 'DATE',
    description: 'Data del verbale collegiale per l’individuazione dell’alunno con disabilità',
  },
  {
    key: 'functionalProfile.expiryDate',
    label: 'Data scadenza o rivedibilità',
    category: 'PROFILO_FUNZIONAMENTO',
    categoryLabel: 'Profilo di Funzionamento',
    defaultFieldType: 'DATE',
    description: 'Data di scadenza o termine di rivedibilità del verbale o profilo di funzionamento',
  },

  // 4. APPROVAZIONI & VERBALIZZAZIONE GLO
  {
    key: 'pei.draftDate',
    label: 'Data redazione iniziale PEI',
    category: 'APPROVAZIONI',
    categoryLabel: 'Approvazioni & Verbali',
    defaultFieldType: 'DATE',
    description: 'Data di stesura del PEI provvisorio o iniziale',
  },
  {
    key: 'pei.approval.date',
    label: 'Data approvazione PEI',
    category: 'APPROVAZIONI',
    categoryLabel: 'Approvazioni & Verbali',
    defaultFieldType: 'DATE',
    description: 'Data di approvazione da parte del GLO (Gruppo di Lavoro Operativo)',
  },
  {
    key: 'pei.approval.minutesNumber',
    label: 'Verbale approvazione PEI (Numero)',
    category: 'APPROVAZIONI',
    categoryLabel: 'Approvazioni & Verbali',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Numero progressivo del verbale GLO',
  },
  {
    key: 'pei.intermediateReview.date',
    label: 'Data verifica intermedia',
    category: 'APPROVAZIONI',
    categoryLabel: 'Approvazioni & Verbali',
    defaultFieldType: 'DATE',
    description: 'Data dell’incontro GLO di verifica intermedia (metà anno)',
  },
  {
    key: 'pei.finalReview.date',
    label: 'Data verifica finale PEI',
    category: 'APPROVAZIONI',
    categoryLabel: 'Approvazioni & Verbali',
    defaultFieldType: 'DATE',
    description: 'Data di verifica finale e proposte per l’anno successivo (giugno)',
  },
  {
    key: 'pei.signatures',
    label: 'Firme componenti GLO',
    category: 'APPROVAZIONI',
    categoryLabel: 'Approvazioni & Verbali',
    defaultFieldType: 'TEXT_LONG',
    description: 'Firme di docenti, genitori, specialisti ASL e figure professionali',
  },

  // 5. QUADRO INCLUSIONE & DIMENSIONI SVILUPPO
  {
    key: 'dimensions.socialRelation',
    label: 'Dimensione Relazione / Socializzazione',
    category: 'QUADRO_INCLUSIONE',
    categoryLabel: 'Dimensioni & Inclusione',
    defaultFieldType: 'TEXT_LONG',
    description: 'Obiettivi e interventi su relazioni interpersonali e gruppo classe',
  },
  {
    key: 'dimensions.communicationLanguage',
    label: 'Dimensione Comunicazione / Linguaggio',
    category: 'QUADRO_INCLUSIONE',
    categoryLabel: 'Dimensioni & Inclusione',
    defaultFieldType: 'TEXT_LONG',
    description: 'Obiettivi su comprensione, produzione verbale e linguaggi alternativi (CAA)',
  },
  {
    key: 'dimensions.autonomyOrientation',
    label: 'Dimensione Autonomia / Orientamento',
    category: 'QUADRO_INCLUSIONE',
    categoryLabel: 'Dimensioni & Inclusione',
    defaultFieldType: 'TEXT_LONG',
    description: 'Autonomia personale, cura di sé, orientamento spazio-temporale',
  },
  {
    key: 'dimensions.cognitiveNeuropsych',
    label: 'Dimensione Cognitiva / Neuropsicologica',
    category: 'QUADRO_INCLUSIONE',
    categoryLabel: 'Dimensioni & Inclusione',
    defaultFieldType: 'TEXT_LONG',
    description: 'Capacità mnestiche, attentive e organizzazione del pensiero',
  },

  // 6. RISORSE E ORE DI SOSTEGNO
  {
    key: 'resources.supportHours',
    label: 'Ore di sostegno settimanali',
    category: 'RISORSE',
    categoryLabel: 'Risorse e Sostegno',
    defaultFieldType: 'NUMBER',
    description: 'Numero di ore settimanali di sostegno didattico assegnate',
  },
  {
    key: 'resources.assistantHours',
    label: 'Ore di assistenza specialistica / OEPAC / AEC',
    category: 'RISORSE',
    categoryLabel: 'Risorse e Sostegno',
    defaultFieldType: 'NUMBER',
    description: 'Ore settimanali di assistenza all’autonomia e comunicazione',
  },
  {
    key: 'resources.supportTeacherName',
    label: 'Nome docente di sostegno',
    category: 'RISORSE',
    categoryLabel: 'Risorse e Sostegno',
    defaultFieldType: 'TEXT_SHORT',
    description: 'Docente o docenti specializzati sul sostegno',
  },
];

/**
 * Group catalog entries by category for select dropdowns.
 */
export const CATEGORIZED_SEMANTIC_CATALOG: Record<
  SemanticCategory,
  { label: string; entries: SemanticCatalogEntry[] }
> = {
  ANAGRAFICA: {
    label: 'Anagrafica Alunno',
    entries: CANONICAL_SEMANTIC_CATALOG.filter((e) => e.category === 'ANAGRAFICA'),
  },
  SCUOLA: {
    label: 'Scuola & Anno Scolastico',
    entries: CANONICAL_SEMANTIC_CATALOG.filter((e) => e.category === 'SCUOLA'),
  },
  PROFILO_FUNZIONAMENTO: {
    label: 'Profilo di Funzionamento',
    entries: CANONICAL_SEMANTIC_CATALOG.filter((e) => e.category === 'PROFILO_FUNZIONAMENTO'),
  },
  APPROVAZIONI: {
    label: 'Approvazioni & Verbali',
    entries: CANONICAL_SEMANTIC_CATALOG.filter((e) => e.category === 'APPROVAZIONI'),
  },
  QUADRO_INCLUSIONE: {
    label: 'Dimensioni & Inclusione',
    entries: CANONICAL_SEMANTIC_CATALOG.filter((e) => e.category === 'QUADRO_INCLUSIONE'),
  },
  RISORSE: {
    label: 'Risorse e Sostegno',
    entries: CANONICAL_SEMANTIC_CATALOG.filter((e) => e.category === 'RISORSE'),
  },
  ALTRO: {
    label: 'Altro / Non Specificato',
    entries: [],
  },
};

/**
 * Quick lookup map for canonical entries by semanticKey.
 */
const CATALOG_MAP = new Map<string, SemanticCatalogEntry>();
CANONICAL_SEMANTIC_CATALOG.forEach((item) => CATALOG_MAP.set(item.key, item));

export function getSemanticCatalogEntry(key?: string | null): SemanticCatalogEntry | undefined {
  if (!key) return undefined;
  return CATALOG_MAP.get(key);
}

/**
 * Formats a semanticKey into a friendly display label.
 */
export function formatSemanticKeyLabel(key?: string | null): string {
  if (!key) return 'Nessuna associazione (Non assegnata)';
  const entry = CATALOG_MAP.get(key);
  if (entry) return `${entry.categoryLabel} > ${entry.label}`;
  if (key.startsWith('custom.')) {
    const parts = key.split('.');
    const fieldPart = parts.slice(2).join('.') || parts[1] || 'campo';
    return `Campo Personalizzato: ${fieldPart}`;
  }
  return key;
}

/**
 * Generates an immutable, collision-free field ID decoupled from creation sequence.
 * Examples: fld_8a3f910b, fld_419c8f003e
 */
export function generateFieldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fld_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
  }
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `fld_${randomPart}_${timePart}`;
}

/**
 * Creates a stable custom semanticKey for local/territorial models.
 * E.g., custom.tpl_roma_infanzia.orario_accoglienza
 */
export function buildCustomSemanticKey(templateId: string, rawKey: string): string {
  const sanitizedTemplate = (templateId || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  const sanitizedKey = (rawKey || 'field')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return `custom.${sanitizedTemplate}.${sanitizedKey}`;
}

/**
 * Checks if a key is a custom territorial semantic key.
 */
export function isCustomSemanticKey(key?: string | null): boolean {
  return typeof key === 'string' && key.startsWith('custom.');
}

export interface SemanticSuggestionResult {
  semanticKey: string | null;
  suggestedLabel: string;
  confidence: number;
  suggestedFieldType: TemplateFieldType;
}

interface SemanticPattern {
  semanticKey: string;
  patterns: RegExp[];
  canonicalLabel: string;
  fieldType: TemplateFieldType;
  confidence: number;
}

export const SEMANTIC_PATTERNS: SemanticPattern[] = [
  // Anagrafica Alunno
  {
    semanticKey: 'student.fullName',
    patterns: [
      /cognome\s+(?:e\s+)?nome/i,
      /nome\s+(?:e\s+)?cognome/i,
      /\balunno(?:\/a)?\b/i,
      /\bbambino(?:\/a)?\b/i,
      /\ballievo(?:\/a)?\b/i,
      /\bstudente(?:\/essa)?\b/i,
      /nominativo\s+(?:alunno|bambino|studente)/i,
    ],
    canonicalLabel: 'Nome e Cognome alunno',
    fieldType: 'TEXT_SHORT',
    confidence: 0.92,
  },
  {
    semanticKey: 'student.firstName',
    patterns: [/^nome\b/i, /nome\s+alunno/i, /nome\s+del\s+bambino/i],
    canonicalLabel: 'Nome alunno',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },
  {
    semanticKey: 'student.lastName',
    patterns: [/^cognome\b/i, /cognome\s+alunno/i, /cognome\s+del\s+bambino/i],
    canonicalLabel: 'Cognome alunno',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },
  {
    semanticKey: 'student.fiscalCode',
    patterns: [/codice\s+fiscale/i, /\bc\.?\s*f\.?\b/i, /cod\.?\s*fisc/i],
    canonicalLabel: 'Codice fiscale alunno',
    fieldType: 'TEXT_SHORT',
    confidence: 0.95,
  },
  {
    semanticKey: 'student.personalCode',
    patterns: [
      /codice\s+(?:personale|sostitutivo|pseudonimo|identificativo)/i,
      /codice\s+sostitutivo\s+personale/i,
      /id\s+alunno/i,
      /pseudonimo\b/i,
    ],
    canonicalLabel: 'Codice sostitutivo personale (Pseudonimo)',
    fieldType: 'TEXT_SHORT',
    confidence: 0.90,
  },
  {
    semanticKey: 'student.birthDate',
    patterns: [/data\s+di\s+nascita/i, /nat[oa]\s+il/i, /nascita\s+il/i, /data\s+nascita/i],
    canonicalLabel: 'Data di nascita alunno',
    fieldType: 'DATE',
    confidence: 0.92,
  },
  {
    semanticKey: 'student.birthPlace',
    patterns: [/luogo\s+di\s+nascita/i, /nat[oa]\s+a\b/i, /comune\s+di\s+nascita/i],
    canonicalLabel: 'Luogo di nascita alunno',
    fieldType: 'TEXT_SHORT',
    confidence: 0.90,
  },
  {
    semanticKey: 'student.class',
    patterns: [/^classe\b/i, /anno\s+di\s+corso/i, /frequenta\s+la\s+classe/i],
    canonicalLabel: 'Classe o anno di corso',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },
  {
    semanticKey: 'student.section',
    patterns: [/\bsezione\b/i, /\bsez\./i, /gruppo\s+sezione/i],
    canonicalLabel: 'Sezione',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },
  {
    semanticKey: 'student.site',
    patterns: [/plesso\s+(?:o\s+)?sede/i, /\bplesso\b/i, /sede\s+scolastica/i, /scuola\s+dell.infanzia\s+di/i, /plesso\s+di/i],
    canonicalLabel: 'Plesso o sede scolastica',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },

  // Scuola & Anno Scolastico
  {
    semanticKey: 'school.institutionName',
    patterns: [
      /istituzione\s+scolastica/i,
      /istituto\s+comprensivo/i,
      /denominazione\s+scuola/i,
      /scuola\s*:\s*$/i,
      /i\.?\s*c\.?\s+/i,
      /nome\s+istituto/i,
      /circolo\s+didattico/i,
    ],
    canonicalLabel: 'Istituzione scolastica (Nome istituto)',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },
  {
    semanticKey: 'school.year',
    patterns: [/anno\s+scolastico/i, /\ba\.?\s*s\.?\b/i, /a\.s\.\s*\d{4}/i, /anno\s+scol\./i],
    canonicalLabel: 'Anno scolastico',
    fieldType: 'TEXT_SHORT',
    confidence: 0.92,
  },
  {
    semanticKey: 'school.code',
    patterns: [/codice\s+meccanografico/i, /cod\.?\s*mecc\./i],
    canonicalLabel: 'Codice meccanografico istituto',
    fieldType: 'TEXT_SHORT',
    confidence: 0.95,
  },
  {
    semanticKey: 'school.headmaster',
    patterns: [/dirigente\s+scolastico/i, /preside\b/i, /dirigente\s*:\s*$/i],
    canonicalLabel: 'Dirigente scolastico',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },

  // Profilo di Funzionamento
  {
    semanticKey: 'functionalProfile.date',
    patterns: [
      /data\s+profilo\s+di\s+funzionamento/i,
      /profilo\s+(?:di\s+)?funzionamento(?:\s+redatto)?\s+(?:in\s+data|il)/i,
      /redatto\s+in\s+data/i,
      /data\s+diagnosi/i,
      /diagnosi\s+funzionale\s+del/i,
    ],
    canonicalLabel: 'Data Profilo di Funzionamento',
    fieldType: 'DATE',
    confidence: 0.88,
  },
  {
    semanticKey: 'functionalProfile.issuer',
    patterns: [/ente\s+rilasciante/i, /asl\s+rilasciante/i, /uonpia/i, /asl\s+competente/i, /ente\s*\/\s*asl/i],
    canonicalLabel: 'Ente / ASL rilasciante',
    fieldType: 'TEXT_SHORT',
    confidence: 0.85,
  },
  {
    semanticKey: 'functionalProfile.icfCodes',
    patterns: [/codici\s+icf/i, /diagnosi\s+clinica/i, /codice\s+icd/i, /icf/i],
    canonicalLabel: 'Codici ICF / Diagnosi clinica',
    fieldType: 'TEXT_LONG',
    confidence: 0.82,
  },
  {
    semanticKey: 'functionalProfile.medicalReportDate',
    patterns: [/verbale\s+(?:di\s+)?accertamento/i, /collegio\s+medico\s+del/i, /data\s+verbale\s+104/i],
    canonicalLabel: 'Data Verbale di accertamento (L. 104)',
    fieldType: 'DATE',
    confidence: 0.86,
  },
  {
    semanticKey: 'functionalProfile.expiryDate',
    patterns: [/data\s+(?:di\s+)?scadenza/i, /scadenza\s+o\s+rivedibilit/i, /rivedibilit[aà]/i, /termine\s+rivedibilit/i],
    canonicalLabel: 'Data scadenza o rivedibilità',
    fieldType: 'DATE',
    confidence: 0.88,
  },

  // Approvazioni & Verbali
  {
    semanticKey: 'pei.draftDate',
    patterns: [/data\s+redazione/i, /redatto\s+in\s+data/i, /data\s+stesura/i],
    canonicalLabel: 'Data redazione iniziale PEI',
    fieldType: 'DATE',
    confidence: 0.85,
  },
  {
    semanticKey: 'pei.approval.date',
    patterns: [/data\s+approvazione/i, /approvato\s+il/i, /approvato\s+in\s+data/i, /data\s+glo/i],
    canonicalLabel: 'Data approvazione PEI',
    fieldType: 'DATE',
    confidence: 0.88,
  },
  {
    semanticKey: 'pei.approval.minutesNumber',
    patterns: [/verbale\s+(?:n\.?|numero)/i, /verbale\s+glo\s+n/i, /delibera\s+n/i],
    canonicalLabel: 'Verbale approvazione PEI (Numero)',
    fieldType: 'TEXT_SHORT',
    confidence: 0.85,
  },
  {
    semanticKey: 'pei.intermediateReview.date',
    patterns: [/verifica\s+intermedia/i, /incontro\s+intermedio/i, /data\s+verifica\s+intermedia/i],
    canonicalLabel: 'Data verifica intermedia',
    fieldType: 'DATE',
    confidence: 0.88,
  },
  {
    semanticKey: 'pei.finalReview.date',
    patterns: [/verifica\s+finale/i, /valutazione\s+finale/i, /data\s+verifica\s+finale/i],
    canonicalLabel: 'Data verifica finale PEI',
    fieldType: 'DATE',
    confidence: 0.88,
  },
  {
    semanticKey: 'pei.signatures',
    patterns: [/firme\s+(?:componenti\s+)?glo/i, /firme\s+dei\s+presenti/i, /^firme\b/i, /^firma\b/i],
    canonicalLabel: 'Firme componenti GLO',
    fieldType: 'TEXT_LONG',
    confidence: 0.85,
  },

  // Risorse e Sostegno
  {
    semanticKey: 'resources.supportHours',
    patterns: [/ore\s+(?:settimanali\s+)?(?:di\s+)?sostegno/i, /sostegno\s+ore/i, /ore\s+di\s+docenza\s+specializzata/i],
    canonicalLabel: 'Ore di sostegno settimanali',
    fieldType: 'NUMBER',
    confidence: 0.90,
  },
  {
    semanticKey: 'resources.assistantHours',
    patterns: [/ore\s+(?:di\s+)?assistenza/i, /oepac/i, /aec/i, /assistente\s+specialistic[ao]/i],
    canonicalLabel: 'Ore di assistenza specialistica / OEPAC / AEC',
    fieldType: 'NUMBER',
    confidence: 0.90,
  },
  {
    semanticKey: 'resources.supportTeacherName',
    patterns: [/docente\s+(?:di\s+)?sostegno/i, /insegnante\s+di\s+sostegno/i],
    canonicalLabel: 'Nome docente di sostegno',
    fieldType: 'TEXT_SHORT',
    confidence: 0.88,
  },

  // Dimensioni dello sviluppo
  {
    semanticKey: 'dimensions.socialRelation',
    patterns: [/dimensione\s+relazion/i, /relazione\s+e\s+socializzazione/i, /area\s+sociale/i],
    canonicalLabel: 'Dimensione Relazione / Socializzazione',
    fieldType: 'TEXT_LONG',
    confidence: 0.85,
  },
  {
    semanticKey: 'dimensions.communicationLanguage',
    patterns: [/dimensione\s+comunicazion/i, /comunicazione\s+e\s+linguaggio/i, /linguaggio\s+e\s+caa/i],
    canonicalLabel: 'Dimensione Comunicazione / Linguaggio',
    fieldType: 'TEXT_LONG',
    confidence: 0.85,
  },
  {
    semanticKey: 'dimensions.autonomyOrientation',
    patterns: [/dimensione\s+autonomia/i, /autonomia\s+e\s+orientamento/i],
    canonicalLabel: 'Dimensione Autonomia / Orientamento',
    fieldType: 'TEXT_LONG',
    confidence: 0.85,
  },
  {
    semanticKey: 'dimensions.cognitiveNeuropsych',
    patterns: [/dimensione\s+cognitiva/i, /neuropsicologica/i, /sviluppo\s+cognitivo/i],
    canonicalLabel: 'Dimensione Cognitiva / Neuropsicologica',
    fieldType: 'TEXT_LONG',
    confidence: 0.85,
  },
];

/**
 * Suggests semantic key and field type based on label or text context.
 */
export function suggestSemanticKey(label: string, context = ''): SemanticSuggestionResult {
  const combined = `${label} ${context}`.trim();
  if (!combined) {
    return {
      semanticKey: null,
      suggestedLabel: label || 'Campo',
      confidence: 0.5,
      suggestedFieldType: 'TEXT_SHORT',
    };
  }

  for (const item of SEMANTIC_PATTERNS) {
    for (const pat of item.patterns) {
      if (pat.test(combined)) {
        return {
          semanticKey: item.semanticKey,
          suggestedLabel: label.trim() || item.canonicalLabel,
          confidence: item.confidence,
          suggestedFieldType: item.fieldType,
        };
      }
    }
  }

  // Generic heuristics for field type if no exact semanticKey match
  let suggestedType: TemplateFieldType = 'TEXT_SHORT';
  if (/data|il\s+\d{2}|scadenza|rivedibilit|giorno/i.test(combined)) {
    suggestedType = 'DATE';
  } else if (/ore|n\.|numero|quantità|totale/i.test(combined)) {
    suggestedType = 'NUMBER';
  } else if (/note|osservazioni|descrizione|interventi|obiettivi|sintesi/i.test(combined)) {
    suggestedType = 'TEXT_LONG';
  }

  return {
    semanticKey: null,
    suggestedLabel: label.trim() || 'Campo Rilevato',
    confidence: 0.65,
    suggestedFieldType: suggestedType,
  };
}
