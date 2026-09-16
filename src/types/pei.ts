export type SchoolOrder = 'A1' | 'A2' | 'A3' | 'A4';

export type ThemeType = 'sabbia' | 'navy' | 'antracite';

export type ScreenId = 'SCR-001' | 'SCR-002' | 'SCR-003';

export type FieldComponentType =
  | 'CMP-01' // Testo breve
  | 'CMP-02' // Testo esteso
  | 'CMP-03' // Testo assistito
  | 'CMP-04' // Traccia guidata
  | 'CMP-05' // Scelta singola
  | 'CMP-06' // Scelta multipla
  | 'CMP-07' // Campo numerico
  | 'CMP-08' // Data o periodo
  | 'CMP-09' // Tabella ripetibile
  | 'CMP-10'; // Campo calcolato o riepilogativo

export type FieldStatus =
  | 'vuoto'
  | 'attivo'
  | 'compilato'
  | 'incompleto'
  | 'da_verificare'
  | 'obbligatorio_mancante'
  | 'disabilitato'
  | 'non_applicabile'
  | 'sola_lettura';

export interface FieldOption {
  value: string;
  label: string;
  description?: string;
  isOther?: boolean;
}

export interface GuidedQuestion {
  id: string;
  prompt: string;
  placeholder?: string;
  options?: string[];
}

export interface TableColumn {
  id: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'date';
  width?: string;
  options?: string[];
}

export interface PeiFieldDefinition {
  id: string;
  code: string; // e.g. "SEC-01-F01"
  label: string;
  componentType: FieldComponentType;
  required?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  helpText?: string;
  legalReference?: string;
  // Component-specific config
  maxLength?: number;
  minLength?: number;
  minLines?: number;
  // CMP-03
  suggestedPhrases?: string[];
  // CMP-04
  guidedQuestions?: GuidedQuestion[];
  // CMP-05, CMP-06
  options?: FieldOption[];
  allowOther?: boolean;
  maxSelections?: number;
  // CMP-07
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  // CMP-08
  isRange?: boolean;
  isSchoolYear?: boolean;
  // CMP-09
  columns?: TableColumn[];
  minRows?: number;
  maxRows?: number;
  // CMP-10
  calculationType?: 'sum' | 'count_completed' | 'progress_percentage' | 'formula';
  sourceFieldIds?: string[];
  // Layout in official A4 page
  pageNumber: number;
}

export interface PeiSectionDefinition {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  description: string;
  applicableModels: SchoolOrder[];
  pageRange: [number, number];
  fields: PeiFieldDefinition[];
}

export interface PeiDocument {
  id: string;
  schoolOrder: SchoolOrder;
  schoolYear: string;
  studentCode: string; // Fittizio, es. "ALU-2026-X9"
  schoolName: string;
  classOrSection: string;
  creationDate: string;
  lastModifiedDate: string;
  // Values keyed by fieldId
  values: Record<string, any>;
  fieldStatuses: Record<string, FieldStatus>;
  notes: Record<string, string>;
}

export interface SchoolOrderMetadata {
  id: SchoolOrder;
  name: string;
  schoolLevel: string;
  description: string;
  officialAllegato: string;
  decree: string;
  pdfFileName: string;
  pageCount: number;
  specialRules?: string;
}

export interface AppSettings {
  schoolName: string;
  schoolCode: string;
  address: string;
  cap: string;
  city: string;
  province: string;
  building: string;
  teacherName: string;
  teacherSurname: string;
  teacherRole: string;
  defaultSchoolOrder: SchoolOrder;
  theme: ThemeType;
}

