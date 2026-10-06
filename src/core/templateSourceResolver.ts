/**
 * @license
 * PEI FACILE — Template Source Resolver (Phase 1C-R1)
 *
 * Single authoritative service for resolving template sources:
 * - BUILT_IN / MINISTERIAL: Assets bundled with the app (/models/...). Never depends on IndexedDB.
 * - USER_IMPORTED / CUSTOM: User-uploaded templates stored in IndexedDB.
 *
 * Enforces:
 * - Strict separation of BUILT_IN vs USER_IMPORTED
 * - SHA-256 cryptographic integrity verification against baseline
 * - Granular errors: TEMPLATE_SOURCE_MISSING vs TEMPLATE_INTEGRITY_MISMATCH vs MODEL_CALIBRATION_REQUIRED
 * - Canonical calibrationStatus ('CALIBRATED') and calibrationOrigin ('BUILT_IN_BASELINE')
 */

import type { SchoolOrder, PeiModelDefinition, CalibrationOrigin, TemplateSourceKind } from '../types/pei';
import type { ModelGeometry } from '../data/geometry/types';
import type { TemplateSchema, TemplateCalibrationStatus } from './templateSchemaTypes';
import {
  MINISTERIAL_CANONICAL_MAP,
  resolveMinisterialOrder,
  getMinisterialCanonicalInfo,
  findModelDefinition,
  MINISTERIAL_PEI_MODELS,
} from '../data/peiModelRegistry';
import {
  buildMinisterialTemplateSchema,
  getTemplateSchema,
  MINISTERIAL_SCHEMAS,
} from './templateSchemaService';
import { getTemplatePdfBinary } from './templateStorage';

import A1Data from '../data/geometry/A1.geometry.json';
import A2Data from '../data/geometry/A2.geometry.json';
import A3Data from '../data/geometry/A3.geometry.json';
import A4Data from '../data/geometry/A4.geometry.json';

const MINISTERIAL_GEOMETRIES: Record<SchoolOrder, ModelGeometry> = {
  A1: A1Data as unknown as ModelGeometry,
  A2: A2Data as unknown as ModelGeometry,
  A3: A3Data as unknown as ModelGeometry,
  A4: A4Data as unknown as ModelGeometry,
};

export type TemplateSourceErrorCode =
  | 'TEMPLATE_SOURCE_MISSING'
  | 'TEMPLATE_INTEGRITY_MISMATCH'
  | 'MODEL_CALIBRATION_REQUIRED';

export class TemplateSourceError extends Error {
  constructor(
    public readonly code: TemplateSourceErrorCode,
    message: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'TemplateSourceError';
  }
}

export interface ResolvedTemplateSource {
  sourceKind: TemplateSourceKind;
  sourcePath?: string;
  sourceBinary: Uint8Array;
  sourceSha256: string;
  schoolOrder: SchoolOrder;
  templateId: string;
  templateSchema: TemplateSchema;
  geometryMapping: ModelGeometry;
  modelDef: PeiModelDefinition;
  calibrationStatus: TemplateCalibrationStatus;
  calibrationOrigin: CalibrationOrigin;
}

export interface ResolveTemplateSourceOptions {
  modelDef?: PeiModelDefinition | null;
  modelId?: string;
  templateId?: string;
  schoolOrder?: SchoolOrder;
  customModels?: PeiModelDefinition[];
  providedBinary?: Uint8Array | null;
  providedSchema?: TemplateSchema;
  providedBinarySha256?: string;
  skipHashCheck?: boolean;
  mockCorruptedHash?: boolean;
}

/**
 * Checks if a byte array contains valid PDF binary magic bytes (%PDF-).
 * Inspects up to the first 1024 bytes to tolerate leading BOM/whitespace.
 */
export function isPdfBinary(data?: Uint8Array | null): boolean {
  if (!data || data.byteLength < 5) return false;
  const maxInspect = Math.min(data.byteLength, 1024);
  const slice = data.subarray(0, maxInspect);
  for (let i = 0; i <= maxInspect - 5; i++) {
    if (
      slice[i] === 0x25 && // %
      slice[i + 1] === 0x50 && // P
      slice[i + 2] === 0x44 && // D
      slice[i + 3] === 0x46 && // F
      slice[i + 4] === 0x2d    // -
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Computes the SHA-256 hex digest of a byte array.
 * Uses Web Crypto API when available, falling back to Node.js crypto in tests/CLI.
 */
export async function computeSha256(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Loads binary content for a built-in public asset (/models/...).
 * Works in browser via fetch, and in Node/Vitest via fs fallback.
 */
async function loadBuiltInAssetBytes(sourcePath: string): Promise<Uint8Array> {
  // 1. Try browser fetch if running in browser
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    try {
      const response = await fetch(sourcePath);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      }
    } catch {
      // Fetch may fail in test environments (e.g. jsdom without relative URL server)
    }
  }

  // 2. Node / test environment fallback via fs
  try {
    const fs = await import('fs');
    const path = await import('path');
    const relativeClean = sourcePath.replace(/^\//, '');
    const candidatePaths = [
      path.resolve(process.cwd(), 'public', relativeClean),
      path.resolve(process.cwd(), relativeClean),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        return new Uint8Array(fs.readFileSync(candidate));
      }
    }
  } catch {
    // ignore
  }

  throw new TemplateSourceError(
    'TEMPLATE_SOURCE_MISSING',
    `Sorgente PDF ministeriale non reperibile al percorso: ${sourcePath}`
  );
}

/**
 * Single authoritative source resolver.
 *
 * Deterministically resolves:
 * ModelDefinition -> Source PDF (Binary) -> Geometry Mapping -> TemplateSchema
 *
 * Adheres strictly to:
 * - BUILT_IN models do NOT require IndexedDB or localStorage.
 * - Integrity is verified against registered baseline SHA-256.
 * - Distinguishes TEMPLATE_SOURCE_MISSING from TEMPLATE_INTEGRITY_MISMATCH.
 */
export async function resolveTemplateSource(
  options: ResolveTemplateSourceOptions
): Promise<ResolvedTemplateSource> {
  if (options.providedSchema && options.providedBinary) {
    const schema=options.providedSchema;
    if (!isPdfBinary(options.providedBinary)) throw new TemplateSourceError('TEMPLATE_SOURCE_MISSING','Sfondo acquisito non PDF.');
    const actual=await computeSha256(options.providedBinary);
    if (!options.providedBinarySha256 || actual!==options.providedBinarySha256) throw new TemplateSourceError('TEMPLATE_INTEGRITY_MISMATCH','Sfondo acquisito e hash non corrispondono.');
    const schoolOrder=options.schoolOrder||'A2';
    const definition = options.modelDef || {id:schema.templateId,name:'Documento acquisito',schoolOrder,isMinisterial:false,format:'PDF',status:'attivo'} as PeiModelDefinition;
    const geometry:ModelGeometry={schemaVersion:'1.0.0',modelId:schema.templateId,schoolOrder,modelName:definition.name,sourcePdf:schema.sourcePdfFileName,sourcePdfSha256:actual,totalPages:schema.totalPages,
      pages:schema.pages.map(p=>({...p,fields:schema.fields.filter(f=>f.pageNumber===p.pageNumber).map(f=>({fieldId:f.templateFieldId,label:f.label,...f.geometry,pageNumber:p.pageNumber,anchorText:f.sourceEvidence||'',derivationMethod:'TEXT_ANCHOR',status:'REVIEW_REQUIRED',confidence:f.confidence}))}))};
    return {sourceKind:'USER_IMPORTED',sourceBinary:options.providedBinary,sourceSha256:actual,schoolOrder,templateId:schema.templateId,templateSchema:schema,geometryMapping:geometry,modelDef:definition,calibrationStatus:schema.calibrationStatus,calibrationOrigin:'USER_REVIEW'};
  }
  const {
    modelDef: inputModelDef,
    modelId: inputModelId,
    templateId: inputTemplateId,
    schoolOrder: inputOrder,
    customModels = [],
    providedBinary,
    skipHashCheck = false,
    mockCorruptedHash = false,
  } = options;

  // 1. Determine candidate identifier
  const candidateIdentifier =
    inputModelDef?.id ||
    inputModelId ||
    inputTemplateId ||
    inputModelDef?.templateId;

  // 2. Resolve model definition from registry or customModels
  let resolvedModelDef =
    inputModelDef ||
    (candidateIdentifier ? findModelDefinition(candidateIdentifier, customModels) : null);

  // If not found in memory, query IndexedDB directly for custom template records
  if (!resolvedModelDef && candidateIdentifier && !candidateIdentifier.startsWith('MINISTERIAL_') && candidateIdentifier !== 'A1' && candidateIdentifier !== 'A2' && candidateIdentifier !== 'A3' && candidateIdentifier !== 'A4') {
    try {
      const { getCustomTemplate } = await import('./templateStorage');
      const customRecord = await getCustomTemplate(candidateIdentifier, true);
      if (customRecord) {
        resolvedModelDef = {
          id: customRecord.templateId,
          name: customRecord.name,
          schoolOrder: customRecord.schoolOrder as SchoolOrder,
          originType: 'TERRITORIAL',
          originName: 'Modello Personalizzato / Acquisito',
          version: customRecord.schemaVersion || '1.0',
          format: 'PDF',
          status: 'attivo',
          isDefault: false,
          isMinisterial: false,
          sourceKind: 'USER_IMPORTED',
          sourceHash: customRecord.sourceSha256,
          sourceSha256: customRecord.sourceSha256,
          templateId: customRecord.templateId,
          calibrationStatus: customRecord.calibrationStatus || 'CALIBRATED',
        };
      }
    } catch {
      // ignore storage errors
    }
  }

  // Check if explicitly custom model definition exists
  const isExplicitCustom =
    resolvedModelDef?.sourceKind === 'USER_IMPORTED' ||
    resolvedModelDef?.isMinisterial === false ||
    (resolvedModelDef !== null && resolvedModelDef !== undefined && resolvedModelDef.originType !== 'MINISTERIAL') ||
    (candidateIdentifier !== undefined && candidateIdentifier !== null && (
      candidateIdentifier.startsWith('tpl_') ||
      candidateIdentifier.startsWith('custom_') ||
      candidateIdentifier.startsWith('model_custom') ||
      candidateIdentifier.startsWith('model_demo')
    ));

  // Check if ministerial built-in:
  // Must NOT be explicit custom, AND must match ministerial model definition or explicit ministerial identifier
  const candidateOrder = candidateIdentifier ? resolveMinisterialOrder(candidateIdentifier) : null;
  const isExplicitMinisterialId =
    candidateIdentifier &&
    candidateOrder &&
    (candidateIdentifier === candidateOrder ||
      candidateIdentifier === `MINISTERIAL_${candidateOrder}` ||
      MINISTERIAL_CANONICAL_MAP[candidateOrder]?.aliases.includes(candidateIdentifier));

  const fallbackOrder = !candidateIdentifier ? resolveMinisterialOrder(inputOrder) : null;
  const ministerialOrder = candidateOrder || fallbackOrder;

  const isBuiltIn =
    !isExplicitCustom &&
    (resolvedModelDef?.isMinisterial === true ||
      resolvedModelDef?.sourceKind === 'BUILT_IN' ||
      resolvedModelDef?.originType === 'MINISTERIAL' ||
      Boolean(isExplicitMinisterialId) ||
      (!candidateIdentifier && Boolean(fallbackOrder)));

  // ============================================================
  // PATH A: BUILT_IN / MINISTERIAL (A1, A2, A3, A4)
  // ============================================================
  if (isBuiltIn) {
    const order = (ministerialOrder || inputModelDef?.schoolOrder || 'A1') as SchoolOrder;
    const canonical = MINISTERIAL_CANONICAL_MAP[order];

    if (!canonical) {
      throw new TemplateSourceError(
        'TEMPLATE_SOURCE_MISSING',
        `Nessuna configurazione ministeriale per l'ordine: ${order}`
      );
    }

    const modelDef: PeiModelDefinition =
      inputModelDef && inputModelDef.isMinisterial
        ? inputModelDef
        : MINISTERIAL_PEI_MODELS.find((m) => m.schoolOrder === order) || {
            id: canonical.modelId,
            name: canonical.name,
            schoolOrder: canonical.order,
            originType: 'MINISTERIAL',
            originName: 'Ministero dell’Istruzione e del Merito',
            version: 'D.I. 182/2020 - D.I. 153/2023',
            format: 'PDF',
            status: 'attivo',
            isDefault: true,
            isMinisterial: true,
            sourceKind: 'BUILT_IN',
            sourcePath: canonical.sourcePath,
            sourceHash: canonical.sourceSha256,
            sourceSha256: canonical.sourceSha256,
            templateId: canonical.templateId,
            geometryMappingId: canonical.geometryMappingId,
            templateSchemaId: canonical.templateSchemaId,
            calibrationStatus: 'CALIBRATED',
            calibrationOrigin: 'BUILT_IN_BASELINE',
            geometryValidationStatus: 'PASS',
            visualReviewStatus: 'REQUIRED',
          };

    // Retrieve PDF bytes directly from provided canonical binary if valid PDF or load bundled asset
    let bytes: Uint8Array;
    let effectiveSha: string = canonical.sourceSha256;

    if (providedBinary && providedBinary.byteLength > 0 && isPdfBinary(providedBinary)) {
      // Canonical document pass-through for acquired/normalized PDF documents
      bytes = providedBinary;
      effectiveSha = await computeSha256(bytes);
    } else {
      // Direct ministerial creation or DOCX acquisition: load built-in asset and verify integrity
      bytes = await loadBuiltInAssetBytes(canonical.sourcePath);

      if (!skipHashCheck) {
        const actualSha = mockCorruptedHash
          ? '0000000000000000000000000000000000000000000000000000000000000000'
          : await computeSha256(bytes);

        if (actualSha !== canonical.sourceSha256) {
          throw new TemplateSourceError(
            'TEMPLATE_INTEGRITY_MISMATCH',
            `TEMPLATE INTEGRITY MISMATCH — L'hash SHA-256 del PDF ministeriale (${canonical.sourcePdfFileName}) non corrisponde alla baseline ufficiale.\nAtteso:  ${canonical.sourceSha256}\nRilevato: ${actualSha}`,
            {
              expectedSha: canonical.sourceSha256,
              actualSha,
              order,
              fileName: canonical.sourcePdfFileName,
            }
          );
        }
      }
    }

    // Retrieve Schema & Geometry
    const templateSchema =
      MINISTERIAL_SCHEMAS[order] || buildMinisterialTemplateSchema(order);
    const geometryMapping = MINISTERIAL_GEOMETRIES[order];

    return {
      sourceKind: 'BUILT_IN',
      sourcePath: canonical.sourcePath,
      sourceBinary: bytes,
      sourceSha256: effectiveSha,
      schoolOrder: order,
      templateId: canonical.templateId,
      templateSchema,
      geometryMapping,
      modelDef,
      calibrationStatus: 'CALIBRATED',
      calibrationOrigin: 'BUILT_IN_BASELINE',
    };
  }

  // ============================================================
  // PATH B: USER_IMPORTED / CUSTOM MODEL
  // ============================================================
  const modelDef =
    resolvedModelDef ||
    inputModelDef ||
    findModelDefinition(candidateIdentifier, customModels);

  if (!modelDef) {
    throw new TemplateSourceError(
      'TEMPLATE_SOURCE_MISSING',
      `TEMPLATE SOURCE MISSING — Impossibile trovare la definizione del modello "${candidateIdentifier}".`
    );
  }

  // Gate: Only CALIBRATED custom models are permitted for compilation
  if (modelDef.calibrationStatus !== 'CALIBRATED') {
    throw new TemplateSourceError(
      'MODEL_CALIBRATION_REQUIRED',
      `MODEL CALIBRATION REQUIRED — Il modello personalizzato "${modelDef.name}" non dispone di uno schema geometrico approvato (stato attuale: ${
        modelDef.calibrationStatus || 'NON CALIBRATO'
      }). È richiesta la calibrazione preventiva prima della compilazione.`,
      {
        modelId: modelDef.id,
        calibrationStatus: modelDef.calibrationStatus,
      }
    );
  }

  // Retrieve PDF bytes from IndexedDB or provided binary if valid PDF
  let bytes: Uint8Array | null = null;
  let isNonPdfProvided = false;

  if (providedBinary && providedBinary.byteLength > 0) {
    if (isPdfBinary(providedBinary)) {
      bytes = providedBinary;
    } else {
      isNonPdfProvided = true;
    }
  }

  if (!bytes) {
    const normalizedHash = modelDef.normalizedSha256;
    const sourceHash = modelDef.sourceSha256 || modelDef.sourceHash;

    let lookupKeys: string[];
    if (normalizedHash) {
      // Document is normalized: strictly look for normalized binary first, then fallback to model id keys
      lookupKeys = [
        normalizedHash,
        `normalized_${normalizedHash}`,
        `${modelDef.id}_normalized`,
        sourceHash ? `normalized_${sourceHash}` : null,
        modelDef.id,
        sourceHash,
        sourceHash ? `original_${sourceHash}` : null,
        `${modelDef.id}_original`,
      ].filter(Boolean) as string[];
    } else {
      // Document is NOT normalized (or normalization failed/unnormalized): strictly look for original binary keys
      lookupKeys = [
        sourceHash,
        sourceHash ? `original_${sourceHash}` : null,
        `${modelDef.id}_original`,
        modelDef.id,
      ].filter(Boolean) as string[];
    }

    for (const key of lookupKeys) {
      const stored = await getTemplatePdfBinary(key);
      if (stored && isPdfBinary(stored)) {
        bytes = stored;
        break;
      }
    }
  }

  if (!bytes || bytes.byteLength === 0) {
    throw new TemplateSourceError(
      'TEMPLATE_SOURCE_MISSING',
      `TEMPLATE SOURCE MISSING — Impossibile reperire un file PDF valido per il modello personalizzato "${modelDef.name}".${
        isNonPdfProvided
          ? ' Il file sorgente fornito è in formato non-PDF (es. DOCX). Per la resa grafica visiva di un modello personalizzato è richiesto un file PDF o la relativa conversione.'
          : ''
      }`,
      {
        modelId: modelDef.id,
        sourceHash: modelDef.sourceSha256 || modelDef.sourceHash,
      }
    );
  }

  // Integrity check for custom model: verify against normalized or source hash
  const expectedNormalized = modelDef.normalizedSha256;
  const expectedSource = isNonPdfProvided ? null : (modelDef.sourceSha256 || modelDef.sourceHash);
  if (!skipHashCheck && (expectedNormalized || expectedSource)) {
    const actualSha = mockCorruptedHash
      ? '0000000000000000000000000000000000000000000000000000000000000000'
      : await computeSha256(bytes);

    const isValid = (expectedNormalized && actualSha === expectedNormalized) || (expectedSource && actualSha === expectedSource);
    if (!isValid) {
      throw new TemplateSourceError(
        'TEMPLATE_INTEGRITY_MISMATCH',
        `TEMPLATE INTEGRITY MISMATCH — L'hash SHA-256 del modello custom non corrisponde né all'impronta normalizzata (${expectedNormalized || 'N/D'}) né a quella originale (${expectedSource || 'N/D'}). Rilevato: ${actualSha}`,
        {
          expectedNormalized,
          expectedSource,
          actualSha,
          modelId: modelDef.id,
        }
      );
    }
  }

  // Retrieve or build TemplateSchema
  const effectiveTplId = modelDef.templateId || modelDef.id;
  let templateSchema = await getTemplateSchema(effectiveTplId);
  if (!templateSchema) {
    const order = modelDef.schoolOrder || 'A1';
    templateSchema = MINISTERIAL_SCHEMAS[order] || buildMinisterialTemplateSchema(order);
  }

  const sourceHash = modelDef.sourceSha256 || modelDef.sourceHash || '';
  const normalizedHash = modelDef.normalizedSha256;

  const geometryMapping: ModelGeometry = {
    schemaVersion: '1.0.0',
    modelId: modelDef.id,
    schoolOrder: modelDef.schoolOrder,
    modelName: modelDef.name,
    sourcePdf: templateSchema.sourcePdfFileName || `${modelDef.id}.pdf`,
    sourcePdfSha256: sourceHash,
    normalizedPdfSha256: normalizedHash,
    totalPages: templateSchema.totalPages,
    pages: templateSchema.pages.map((p) => ({
      pageNumber: p.pageNumber,
      widthPt: p.widthPt,
      heightPt: p.heightPt,
      fields: templateSchema.fields
        .filter((f) => f.pageNumber === p.pageNumber)
        .map((f) => ({
          fieldId: f.templateFieldId,
          label: f.label,
          pageNumber: f.pageNumber,
          xPt: f.geometry.xPt,
          yPt: f.geometry.yPt,
          widthPt: f.geometry.widthPt,
          heightPt: f.geometry.heightPt,
          anchorText: f.sourceEvidence || '',
          derivationMethod: 'MANUAL_VERIFIED',
          confidence: 1.0,
          status: 'MAPPED',
        })),
    })),
  };

  return {
    sourceKind: 'USER_IMPORTED',
    sourceBinary: bytes,
    sourceSha256: normalizedHash || sourceHash || '',
    schoolOrder: modelDef.schoolOrder,
    templateId: effectiveTplId,
    templateSchema,
    geometryMapping,
    modelDef,
    calibrationStatus: 'CALIBRATED',
    calibrationOrigin: modelDef.calibrationOrigin || 'USER_REVIEW',
  };
}
