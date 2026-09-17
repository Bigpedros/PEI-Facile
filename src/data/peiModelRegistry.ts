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
    sourceHash: 'min_a1_di182_di153_official_sha256',
    description: 'Modello ministeriale ufficiale per la Scuola dell’Infanzia (12 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
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
    sourceHash: 'min_a2_di182_di153_official_sha256',
    description: 'Modello ministeriale ufficiale per la Scuola Primaria (13 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
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
    sourceHash: 'min_a3_di182_di153_official_sha256',
    description: 'Modello ministeriale ufficiale per la Scuola Secondaria di I Grado (12 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
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
    sourceHash: 'min_a4_di182_di153_official_sha256',
    description: 'Modello ministeriale ufficiale per la Scuola Secondaria di II Grado (14 pagine).',
    acquisitionDate: '2020-12-29',
    usedCount: 0,
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
    sourceHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    description: 'Adattamento territoriale per la Secondaria di I Grado in accordo di programma.',
    acquisitionDate: '2026-01-15',
    usedCount: 1,
  },
];

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
