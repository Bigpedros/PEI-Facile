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
  skipHashCheck?: boolean;
  mockCorruptedHash?: boolean;
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

  // 1. Determine canonical identifier
  const candidateIdentifier =
    inputModelDef?.id ||
    inputModelId ||
    inputTemplateId ||
    inputModelDef?.templateId ||
    inputOrder;

  // Check if explicitly custom (USER_IMPORTED or isMinisterial === false)
  const isExplicitCustom =
    inputModelDef?.sourceKind === 'USER_IMPORTED' ||
    (inputModelDef !== undefined && inputModelDef !== null && inputModelDef.isMinisterial === false);

  // Check if ministerial built-in:
  // Must NOT be an explicit custom model, AND candidate identifier or definition must be ministerial
  const candidateOrder = resolveMinisterialOrder(candidateIdentifier);
  const fallbackOrder = !inputModelDef && !inputModelId && !inputTemplateId ? resolveMinisterialOrder(inputOrder) : null;
  const ministerialOrder = candidateOrder || fallbackOrder;

  const isBuiltIn =
    !isExplicitCustom &&
    (Boolean(ministerialOrder) ||
      inputModelDef?.isMinisterial === true ||
      inputModelDef?.sourceKind === 'BUILT_IN');

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

    // Retrieve PDF bytes directly from bundled asset (or provided binary)
    let bytes: Uint8Array;
    if (providedBinary && providedBinary.byteLength > 0) {
      bytes = providedBinary;
    } else {
      bytes = await loadBuiltInAssetBytes(canonical.sourcePath);
    }

    // Verify SHA-256 against baseline
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

    // Retrieve Schema & Geometry
    const templateSchema =
      MINISTERIAL_SCHEMAS[order] || buildMinisterialTemplateSchema(order);
    const geometryMapping = MINISTERIAL_GEOMETRIES[order];

    return {
      sourceKind: 'BUILT_IN',
      sourcePath: canonical.sourcePath,
      sourceBinary: bytes,
      sourceSha256: canonical.sourceSha256,
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

  // Retrieve PDF bytes from IndexedDB or provided binary
  let bytes: Uint8Array | null = null;
  if (providedBinary && providedBinary.byteLength > 0) {
    bytes = providedBinary;
  } else {
    const hashToLookup = modelDef.sourceSha256 || modelDef.sourceHash;
    if (hashToLookup) {
      bytes = await getTemplatePdfBinary(hashToLookup);
    }
  }

  if (!bytes || bytes.byteLength === 0) {
    throw new TemplateSourceError(
      'TEMPLATE_SOURCE_MISSING',
      `TEMPLATE SOURCE MISSING — Impossibile reperire il file PDF binario da IndexedDB per il modello "${modelDef.name}".`,
      {
        modelId: modelDef.id,
        sourceHash: modelDef.sourceSha256 || modelDef.sourceHash,
      }
    );
  }

  // Integrity check for custom model
  const expectedHash = modelDef.sourceSha256 || modelDef.sourceHash;
  if (!skipHashCheck && expectedHash) {
    const actualSha = mockCorruptedHash
      ? '0000000000000000000000000000000000000000000000000000000000000000'
      : await computeSha256(bytes);

    if (actualSha !== expectedHash) {
      throw new TemplateSourceError(
        'TEMPLATE_INTEGRITY_MISMATCH',
        `TEMPLATE INTEGRITY MISMATCH — L'hash SHA-256 del modello custom non corrisponde alla definizione registrata.\nAtteso:  ${expectedHash}\nRilevato: ${actualSha}`,
        {
          expectedSha: expectedHash,
          actualSha,
          modelId: modelDef.id,
        }
      );
    }
  }

  // Retrieve or build TemplateSchema
  const effectiveTplId = modelDef.templateId || modelDef.id;
  const templateSchema = await getTemplateSchema(effectiveTplId);
  if (!templateSchema) {
    throw new TemplateSourceError(
      'TEMPLATE_SOURCE_MISSING',
      `TEMPLATE SOURCE MISSING — Schema geometrico non trovato per il modello "${modelDef.name}".`
    );
  }

  const geometryMapping: ModelGeometry = {
    schemaVersion: '1.0.0',
    modelId: modelDef.id,
    schoolOrder: modelDef.schoolOrder,
    modelName: modelDef.name,
    sourcePdf: templateSchema.sourcePdfFileName || `${modelDef.id}.pdf`,
    sourcePdfSha256: expectedHash || '',
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
    sourceSha256: expectedHash || '',
    schoolOrder: modelDef.schoolOrder,
    templateId: effectiveTplId,
    templateSchema,
    geometryMapping,
    modelDef,
    calibrationStatus: 'CALIBRATED',
    calibrationOrigin: modelDef.calibrationOrigin || 'USER_REVIEW',
  };
}
