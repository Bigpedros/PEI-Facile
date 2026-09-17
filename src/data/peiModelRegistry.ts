import type { SchoolOrder, PeiModelDefinition, ModelOriginType } from '../types/pei';

export type { PeiModelDefinition, ModelOriginType };

/**
 * Modelli Ministeriali Ufficiali di base (A1, A2, A3, A4)
 * Conforme a D.I. 182/2020 e D.I. 153/2023
 */
export const MINISTERIAL_PEI_MODELS: PeiModelDefinition[] = [
  {
    id: 'MINISTERIAL_A1',
    name: "Allegato A1 — Scuola dell'Infanzia",
    schoolOrder: 'A1',
    originType: 'MINISTERIAL',
    originName: 'Ministero dell’Istruzione e del Merito',
    version: 'D.I. 182/2020 - D.I. 153/2023',
    format: 'PDF',
    status: 'attivo',
    isDefault: true,
    isMinisterial: true,
    sourceHash: 'affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c',
    description: 'Modello ministeriale ufficiale per la Scuola dell’Infanzia (12 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A1_PEI_INFANZIA.pdf',
    templateId: 'A1',
    sourceSha256: 'affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A1',
    geometryMappingId: 'A1',
    calibrationStatus: 'CALIBRATED',
    calibrationOrigin: 'BUILT_IN_BASELINE',
    geometryValidationStatus: 'PASS',
    visualReviewStatus: 'REQUIRED',
  },
  {
    id: 'MINISTERIAL_A2',
    name: 'Allegato A2 — Scuola Primaria',
    schoolOrder: 'A2',
    originType: 'MINISTERIAL',
    originName: 'Ministero dell’Istruzione e del Merito',
    version: 'D.I. 182/2020 - D.I. 153/2023',
    format: 'PDF',
    status: 'attivo',
    isDefault: true,
    isMinisterial: true,
    sourceHash: '3eb708f7ae405308858505bf160d8d1dbdb3cf9d291c1bbaf072835ac8521a1f',
    description: 'Modello ministeriale ufficiale per la Scuola Primaria (13 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A2_PEI_PRIMARIA.pdf',
    templateId: 'A2',
    sourceSha256: '3eb708f7ae405308858505bf160d8d1dbdb3cf9d291c1bbaf072835ac8521a1f',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A2',
    geometryMappingId: 'A2',
    calibrationStatus: 'CALIBRATED',
    calibrationOrigin: 'BUILT_IN_BASELINE',
    geometryValidationStatus: 'PASS',
    visualReviewStatus: 'REQUIRED',
  },
  {
    id: 'MINISTERIAL_A3',
    name: 'Allegato A3 — Scuola Secondaria di I Grado',
    schoolOrder: 'A3',
    originType: 'MINISTERIAL',
    originName: 'Ministero dell’Istruzione e del Merito',
    version: 'D.I. 182/2020 - D.I. 153/2023',
    format: 'PDF',
    status: 'attivo',
    isDefault: true,
    isMinisterial: true,
    sourceHash: '8975f4ffb763c9faa914d6b1f8c34c30b68c5fb167e9d8751befcdc0cb695728',
    description: 'Modello ministeriale ufficiale per la Scuola Secondaria di I Grado (12 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A3_PEI_SEC_1_GRADO.pdf',
    templateId: 'A3',
    sourceSha256: '8975f4ffb763c9faa914d6b1f8c34c30b68c5fb167e9d8751befcdc0cb695728',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A3',
    geometryMappingId: 'A3',
    calibrationStatus: 'CALIBRATED',
    calibrationOrigin: 'BUILT_IN_BASELINE',
    geometryValidationStatus: 'PASS',
    visualReviewStatus: 'REQUIRED',
  },
  {
    id: 'MINISTERIAL_A4',
    name: 'Allegato A4 — Scuola Secondaria di II Grado',
    schoolOrder: 'A4',
    originType: 'MINISTERIAL',
    originName: 'Ministero dell’Istruzione e del Merito',
    version: 'D.I. 182/2020 - D.I. 153/2023',
    format: 'PDF',
    status: 'attivo',
    isDefault: true,
    isMinisterial: true,
    sourceHash: '9fef25e6eafc03f7a63f6812cd9a7dab9490a056f37ac6b5f384c30be5e73b47',
    description: 'Modello ministeriale ufficiale per la Scuola Secondaria di II Grado (14 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A4_PEI_SEC_2_GRADO.pdf',
    templateId: 'A4',
    sourceSha256: '9fef25e6eafc03f7a63f6812cd9a7dab9490a056f37ac6b5f384c30be5e73b47',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A4',
    geometryMappingId: 'A4',
    calibrationStatus: 'CALIBRATED',
    calibrationOrigin: 'BUILT_IN_BASELINE',
    geometryValidationStatus: 'PASS',
    visualReviewStatus: 'REQUIRED',
  },
];

/**
 * Modello custom di test / seed iniziale per mostrare il supporto territoriale
 */
export const INITIAL_CUSTOM_PEI_MODELS: PeiModelDefinition[] = [
  {
    id: 'model_demo_1',
    name: 'Modello PEI Inclusivo Territoriale',
    schoolOrder: 'A3',
    originType: 'TERRITORIAL',
    originName: 'Comune / ATS di Riferimento',
    version: '2.1',
    format: 'PDF',
    status: 'attivo',
    isDefault: false,
    isMinisterial: false,
    sourceKind: 'USER_IMPORTED',
    sourceHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    sourceSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    description: 'Adattamento territoriale per la Secondaria di I Grado in accordo di programma.',
    acquisitionDate: '2026-01-15',
    usedCount: 1,
    templateId: 'model_demo_1',
    templateSchemaId: 'SCHEMA_model_demo_1',
    geometryMappingId: 'model_demo_1',
    calibrationStatus: 'REVIEW_REQUIRED',
    calibrationOrigin: 'USER_REVIEW',
    geometryValidationStatus: 'NOT_RUN',
    visualReviewStatus: 'REQUIRED',
  },
];

/**
 * Canonical Mapping Table per i 4 modelli ministeriali (A1, A2, A3, A4)
 * Garantisce determinismo assoluto tra modelId, schoolOrder, templateId, geometryMappingId e sourcePath.
 */
export interface MinisterialCanonicalRecord {
  modelId: string;
  order: SchoolOrder;
  templateId: string;
  geometryMappingId: string;
  templateSchemaId: string;
  sourceKind: 'BUILT_IN';
  sourcePath: string;
  sourcePdfFileName: string;
  sourceSha256: string;
  name: string;
  totalPages: number;
  aliases: string[];
}

export const MINISTERIAL_CANONICAL_MAP: Record<SchoolOrder, MinisterialCanonicalRecord> = {
  A1: {
    modelId: 'MINISTERIAL_A1',
    order: 'A1',
    templateId: 'A1',
    geometryMappingId: 'A1',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A1',
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A1_PEI_INFANZIA.pdf',
    sourcePdfFileName: 'ALLEGATO_A1_PEI_INFANZIA.pdf',
    sourceSha256: 'affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c',
    name: "Allegato A1 — Scuola dell'Infanzia",
    totalPages: 12,
    aliases: ['A1', 'MINISTERIAL_A1', 'ministerial_a1', 'template_a1', 'model_a1', 'SCHEMA_MINISTERIAL_A1'],
  },
  A2: {
    modelId: 'MINISTERIAL_A2',
    order: 'A2',
    templateId: 'A2',
    geometryMappingId: 'A2',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A2',
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A2_PEI_PRIMARIA.pdf',
    sourcePdfFileName: 'ALLEGATO_A2_PEI_PRIMARIA.pdf',
    sourceSha256: '3eb708f7ae405308858505bf160d8d1dbdb3cf9d291c1bbaf072835ac8521a1f',
    name: 'Allegato A2 — Scuola Primaria',
    totalPages: 13,
    aliases: ['A2', 'MINISTERIAL_A2', 'ministerial_a2', 'template_a2', 'model_a2', 'SCHEMA_MINISTERIAL_A2'],
  },
  A3: {
    modelId: 'MINISTERIAL_A3',
    order: 'A3',
    templateId: 'A3',
    geometryMappingId: 'A3',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A3',
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A3_PEI_SEC_1_GRADO.pdf',
    sourcePdfFileName: 'ALLEGATO_A3_PEI_SEC_1_GRADO.pdf',
    sourceSha256: '8975f4ffb763c9faa914d6b1f8c34c30b68c5fb167e9d8751befcdc0cb695728',
    name: 'Allegato A3 — Scuola Secondaria di I Grado',
    totalPages: 12,
    aliases: ['A3', 'MINISTERIAL_A3', 'ministerial_a3', 'template_a3', 'model_a3', 'SCHEMA_MINISTERIAL_A3'],
  },
  A4: {
    modelId: 'MINISTERIAL_A4',
    order: 'A4',
    templateId: 'A4',
    geometryMappingId: 'A4',
    templateSchemaId: 'SCHEMA_MINISTERIAL_A4',
    sourceKind: 'BUILT_IN',
    sourcePath: '/models/ALLEGATO_A4_PEI_SEC_2_GRADO.pdf',
    sourcePdfFileName: 'ALLEGATO_A4_PEI_SEC_2_GRADO.pdf',
    sourceSha256: '9fef25e6eafc03f7a63f6812cd9a7dab9490a056f37ac6b5f384c30be5e73b47',
    name: 'Allegato A4 — Scuola Secondaria di II Grado',
    totalPages: 14,
    aliases: ['A4', 'MINISTERIAL_A4', 'ministerial_a4', 'template_a4', 'model_a4', 'SCHEMA_MINISTERIAL_A4'],
  },
};

/**
 * Risolve in modo deterministico se un identificatore corrisponde a uno dei modelli ministeriali A1-A4.
 */
export function resolveMinisterialOrder(idOrAlias?: string | null): SchoolOrder | null {
  if (!idOrAlias) return null;
  const trimmed = idOrAlias.trim();
  const upper = trimmed.toUpperCase();

  for (const [order, info] of Object.entries(MINISTERIAL_CANONICAL_MAP)) {
    if (order === upper) return order as SchoolOrder;
    if (info.modelId === trimmed || info.modelId.toUpperCase() === upper) return order as SchoolOrder;
    if (info.aliases.some((a) => a.toUpperCase() === upper || a === trimmed)) return order as SchoolOrder;
  }
  return null;
}

/**
 * Recupera le informazioni canoniche per un modello ministeriale noto.
 */
export function getMinisterialCanonicalInfo(idOrAlias?: string | null): MinisterialCanonicalRecord | null {
  const order = resolveMinisterialOrder(idOrAlias);
  return order ? MINISTERIAL_CANONICAL_MAP[order] : null;
}

/**
 * Risolve la PeiModelDefinition per un qualsiasi ID (ministeriale o custom).
 */
export function findModelDefinition(
  identifier?: string | null,
  customModels: PeiModelDefinition[] = []
): PeiModelDefinition | null {
  if (!identifier) return null;

  // 1. Check ministerial canonical
  const minOrder = resolveMinisterialOrder(identifier);
  if (minOrder) {
    const minModel = MINISTERIAL_PEI_MODELS.find((m) => m.schoolOrder === minOrder);
    if (minModel) return minModel;
  }

  // 2. Check direct ID or templateId match in ministerial list
  const directMin = MINISTERIAL_PEI_MODELS.find(
    (m) => m.id === identifier || m.templateId === identifier || m.schoolOrder === identifier
  );
  if (directMin) return directMin;

  // 3. Check custom models
  const foundCustom = customModels.find(
    (m) => m.id === identifier || m.templateId === identifier
  );
  if (foundCustom) return foundCustom;

  return null;
}

/**
 * Helper per restituire la corretta etichetta descrittiva di origine del modello secondo le linee guida:
 * - "Modello ministeriale ufficiale"
 * - "Modello territoriale — [ente]"
 * - "Modello di istituto — [istituto]"
 * - "Modello importato dall'utente"
 */
export function getModelOriginDisplayLabel(model: PeiModelDefinition): string {
  if (model.isMinisterial || model.originType === 'MINISTERIAL') {
    return 'Modello ministeriale ufficiale';
  }
  if (model.originType === 'TERRITORIAL') {
    return model.originName ? `Modello territoriale — ${model.originName}` : 'Modello territoriale';
  }
  if (model.originType === 'INSTITUTION') {
    return model.originName ? `Modello di istituto — ${model.originName}` : 'Modello di istituto';
  }
  return model.originName ? `Modello importato dall'utente — ${model.originName}` : "Modello importato dall'utente";
}

/**
 * Helper per ottenere la lista unificata di tutti i modelli noti (Ministeriali + Custom salvati)
 */
export function getAllRegistryModels(customModels: PeiModelDefinition[]): PeiModelDefinition[] {
  // Unico registro: Modelli Ministeriali fissi + Modelli Personalizzati / Territoriali / Istituto
  return [...MINISTERIAL_PEI_MODELS, ...customModels];
}

/**
 * Helper per filtrare solo i modelli attivi utilizzabili per la creazione di nuovi PEI
 */
export function getActiveRegistryModels(customModels: PeiModelDefinition[]): PeiModelDefinition[] {
  return getAllRegistryModels(customModels).filter((m) => m.status === 'attivo');
}

/**
 * Helper per separare i modelli in due gruppi: Ministeriali e Altri Disponibili
 */
export function getGroupedActiveModels(customModels: PeiModelDefinition[]) {
  const active = getActiveRegistryModels(customModels);
  return {
    ministerial: active.filter((m) => m.isMinisterial),
    other: active.filter((m) => !m.isMinisterial),
  };
}

/**
 * Trova il modello predefinito in base alle impostazioni dell'utente:
 * 1. Cerca se c'è un defaultModelId specificato nelle impostazioni che è ancora attivo
 * 2. Altrimenti cerca un modello con isDefault === true per il defaultSchoolOrder selezionato
 * 3. Fallback sul modello ministeriale per quell'ordine scolastico
 */
export function resolveDefaultModel(
  allModels: PeiModelDefinition[],
  defaultSchoolOrder: SchoolOrder = 'A2',
  preferredDefaultModelId?: string
): PeiModelDefinition {
  const activeModels = allModels.filter((m) => m.status === 'attivo');

  if (preferredDefaultModelId) {
    const foundPreferred = activeModels.find((m) => m.id === preferredDefaultModelId);
    if (foundPreferred) return foundPreferred;
  }

  // Cerca eventuale modello esplicitamente contrassegnato come predefinito per quell'ordine
  const foundDefaultForOrder = activeModels.find(
    (m) => m.schoolOrder === defaultSchoolOrder && m.isDefault
  );
  if (foundDefaultForOrder) return foundDefaultForOrder;

  // Cerca il ministeriale per quell'ordine
  const foundMinisterial = activeModels.find(
    (m) => m.schoolOrder === defaultSchoolOrder && m.isMinisterial
  );
  if (foundMinisterial) return foundMinisterial;

  // Ultimo fallback sul primo modello attivo disponibile
  return activeModels[0] || MINISTERIAL_PEI_MODELS[1];
}
