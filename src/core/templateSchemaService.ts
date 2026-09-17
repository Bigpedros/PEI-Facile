/**
 * @license
 * PEI FACILE — Template Schema Service (Phase 1C R01)
 * Manages ministerial and custom template schemas, field typing, validation gates,
 * and persistence.
 */

import type { SchoolOrder } from '../types/pei';
import type { ModelGeometry, PageGeometry, FieldGeometry } from '../data/geometry/types';
import type {
  TemplateSchema,
  TemplateSchemaField,
  TemplateFieldType,
  FieldOverflowPolicy,
  TemplateCalibrationStatus,
  GeometryValidationStatus,
  VisualReviewStatus,
} from './templateSchemaTypes';
import { MASTER_SECTIONS } from '../data/masterPeiStructure';
import {
  MINISTERIAL_CANONICAL_MAP,
  resolveMinisterialOrder,
  MINISTERIAL_PEI_MODELS,
} from '../data/peiModelRegistry';

import A1Data from '../data/geometry/A1.geometry.json';
import A2Data from '../data/geometry/A2.geometry.json';
import A3Data from '../data/geometry/A3.geometry.json';
import A4Data from '../data/geometry/A4.geometry.json';

const MINISTERIAL_GEOMETRIES: Record<string, ModelGeometry> = {
  A1: A1Data as unknown as ModelGeometry,
  A2: A2Data as unknown as ModelGeometry,
  A3: A3Data as unknown as ModelGeometry,
  A4: A4Data as unknown as ModelGeometry,
};

const MINISTERIAL_PDF_FILES: Record<string, string> = {
  A1: 'ALLEGATO_A1_PEI_INFANZIA.pdf',
  A2: 'ALLEGATO_A2_PEI_PRIMARIA.pdf',
  A3: 'ALLEGATO_A3_PEI_SEC_1_GRADO.pdf',
  A4: 'ALLEGATO_A4_PEI_SEC_2_GRADO.pdf',
};

// Quick lookup map from fieldId to PeiFieldDefinition in master structure
const MASTER_FIELDS_MAP = new Map<string, { label: string; componentType: string; sectionId: string; required?: boolean }>();
MASTER_SECTIONS.forEach((sec) => {
  sec.fields.forEach((f) => {
    MASTER_FIELDS_MAP.set(f.id, {
      label: f.label,
      componentType: f.componentType,
      sectionId: sec.id,
      required: f.required,
    });
  });
});

/**
 * Maps componentType to standardized TemplateFieldType
 */
export function mapComponentTypeToFieldType(compType?: string, heightPt = 20): TemplateFieldType {
  if (!compType) {
    return heightPt > 45 ? 'TEXT_LONG' : 'TEXT_SHORT';
  }
  switch (compType) {
    case 'CMP-01':
    case 'TEXT_SHORT':
    case 'text':
      return 'TEXT_SHORT';
    case 'CMP-02':
    case 'TEXT_LONG':
    case 'textarea':
      return 'TEXT_LONG';
    case 'CMP-03':
    case 'SINGLE_CHOICE':
    case 'radio':
      return 'SINGLE_CHOICE';
    case 'CMP-04':
    case 'MULTI_CHOICE':
    case 'checkbox':
      return 'MULTI_CHOICE';
    case 'CMP-05':
    case 'TABLE':
    case 'table':
      return 'TABLE';
    case 'CMP-08':
    case 'DATE':
    case 'date':
      return 'DATE';
    default:
      return heightPt > 45 ? 'TEXT_LONG' : 'TEXT_SHORT';
  }
}

/**
 * Builds a precalibrated ministerial TemplateSchema for A1, A2, A3, or A4 (BUILT_IN_BASELINE).
 * Reuses existing PEI fieldIds without creating an incompatible second set.
 */
export function buildMinisterialTemplateSchema(order: 'A1' | 'A2' | 'A3' | 'A4'): TemplateSchema {
  const geom = MINISTERIAL_GEOMETRIES[order];
  if (!geom) {
    throw new Error(`Ministerial geometry not found for school order: ${order}`);
  }

  const fields: TemplateSchemaField[] = [];

  geom.pages.forEach((page) => {
    page.fields.forEach((f) => {
      const masterMeta = MASTER_FIELDS_MAP.get(f.fieldId);
      const fieldType = mapComponentTypeToFieldType(masterMeta?.componentType, f.heightPt);

      fields.push({
        templateFieldId: f.fieldId,
        pageNumber: f.pageNumber,
        geometry: {
          xPt: f.xPt,
          yPt: f.yPt,
          widthPt: f.widthPt,
          heightPt: f.heightPt,
        },
        label: f.label || masterMeta?.label || f.fieldId,
        fieldType,
        required: masterMeta?.required ?? false,
        overflowPolicy: fieldType === 'TABLE' ? 'EXPANDABLE_OR_TABULAR' : 'RIGID',
        status: 'AUTO_VERIFIED',
        sourceEvidence: f.anchorText,
        sectionId: masterMeta?.sectionId,
      });
    });
  });

  return {
    schemaId: `SCHEMA_MINISTERIAL_${order}`,
    templateId: order,
    sourceSha256: geom.sourcePdfSha256,
    sourcePdfFileName: MINISTERIAL_PDF_FILES[order] || geom.sourcePdf,
    version: '1.0.0',
    schoolOrder: order as SchoolOrder,
    totalPages: geom.totalPages,
    pages: geom.pages.map((p) => ({
      pageNumber: p.pageNumber,
      widthPt: p.widthPt,
      heightPt: p.heightPt,
    })),
    fields,
    // Baseline interna approvata (Built-in baseline precalibrata):
    calibrationStatus: 'CALIBRATED',
    geometryValidationStatus: 'PASS',
    visualReviewStatus: 'REQUIRED', // Test pass != human visual review complete
    createdAt: '2020-12-29T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
  };
}

export const MINISTERIAL_SCHEMAS: Record<string, TemplateSchema> = {
  A1: buildMinisterialTemplateSchema('A1'),
  A2: buildMinisterialTemplateSchema('A2'),
  A3: buildMinisterialTemplateSchema('A3'),
  A4: buildMinisterialTemplateSchema('A4'),
};

const CUSTOM_SCHEMAS_CACHE = new Map<string, TemplateSchema>();

/**
 * Retrieves a template schema by templateId.
 * For ministerial A1-A4, returns the precalibrated schema immediately.
 * For custom models, checks memory cache and IndexedDB.
 */
export async function getTemplateSchema(templateId: string): Promise<TemplateSchema | null> {
  if (MINISTERIAL_SCHEMAS[templateId]) {
    return MINISTERIAL_SCHEMAS[templateId];
  }

  if (CUSTOM_SCHEMAS_CACHE.has(templateId)) {
    return CUSTOM_SCHEMAS_CACHE.get(templateId)!;
  }

  // Check localStorage schema registry as secondary fallback
  try {
    const raw = localStorage.getItem(`pei_template_schema_${templateId}`);
    if (raw) {
      const schema = JSON.parse(raw) as TemplateSchema;
      CUSTOM_SCHEMAS_CACHE.set(templateId, schema);
      return schema;
    }
  } catch (err) {
    console.warn(`Could not read schema for ${templateId} from storage:`, err);
  }

  return null;
}

/**
 * Persists a custom TemplateSchema.
 */
export async function saveTemplateSchema(schema: TemplateSchema): Promise<void> {
  CUSTOM_SCHEMAS_CACHE.set(schema.templateId, schema);
  try {
    localStorage.setItem(`pei_template_schema_${schema.templateId}`, JSON.stringify(schema));
  } catch (err) {
    console.warn(`Could not save schema for ${schema.templateId}:`, err);
  }
}

/**
 * Converts candidate geometries into a persistent TemplateSchema.
 */
export function createTemplateSchemaFromCandidates(
  templateId: string,
  sourceFileName: string,
  sourceSha256: string,
  pages: PageGeometry[],
  candidates: Array<{
    fieldId: string;
    label?: string;
    pageNumber: number;
    xPt: number;
    yPt: number;
    widthPt: number;
    heightPt: number;
    anchorText?: string;
    fieldType?: string;
    overflowPolicy?: any;
    required?: boolean;
  }>,
  calibrationStatus: TemplateCalibrationStatus = 'REVIEW_REQUIRED',
  schoolOrder?: SchoolOrder
): TemplateSchema {
  const fields: TemplateSchemaField[] = candidates.map((c, idx) => {
    const isMultiline = c.heightPt > 40;
    const fType: TemplateFieldType = c.fieldType
      ? mapComponentTypeToFieldType(c.fieldType, c.heightPt)
      : isMultiline
      ? 'TEXT_LONG'
      : 'TEXT_SHORT';

    // Disallow CLIP - map to RIGID if legacy or missing
    let policy: FieldOverflowPolicy = 'RIGID';
    if (c.overflowPolicy === 'CONTINUABLE' || c.overflowPolicy === 'EXPANDABLE_OR_TABULAR' || c.overflowPolicy === 'RIGID') {
      policy = c.overflowPolicy;
    } else if (fType === 'TABLE') {
      policy = 'EXPANDABLE_OR_TABULAR';
    }

    return {
      templateFieldId: c.fieldId || `cust_field_${c.pageNumber}_${idx + 1}`,
      pageNumber: c.pageNumber,
      geometry: {
        xPt: c.xPt,
        yPt: c.yPt,
        widthPt: c.widthPt,
        heightPt: c.heightPt,
      },
      label: c.label || `Campo Pag. ${c.pageNumber} (#${idx + 1})`,
      fieldType: fType,
      required: c.required ?? false,
      overflowPolicy: policy,
      status: calibrationStatus === 'CALIBRATED' ? 'MANUAL_VERIFIED' : 'CANDIDATE',
      sourceEvidence: c.anchorText,
    };
  });

  return {
    schemaId: `SCHEMA_${templateId}`,
    templateId,
    sourceSha256,
    sourcePdfFileName: sourceFileName,
    version: '1.0.0',
    schoolOrder,
    totalPages: pages.length,
    pages: pages.map((p) => ({
      pageNumber: p.pageNumber,
      widthPt: p.widthPt,
      heightPt: p.heightPt,
    })),
    fields,
    calibrationStatus,
    geometryValidationStatus: calibrationStatus === 'CALIBRATED' ? 'PASS' : 'NOT_RUN',
    visualReviewStatus: 'REQUIRED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Gate validation for compilation (Phase 1C-R1)
 *
 * Strict separation between BUILT_IN (ministerial) and USER_IMPORTED (custom).
 * Ministerial models are recognized deterministically by ID/alias and are never
 * subjected to custom-model restrictions or error messages.
 */
export function validateTemplateForCompilation(
  templateId?: string,
  modelDef?: {
    id?: string;
    isMinisterial?: boolean;
    sourceKind?: string;
    originType?: string;
    schoolOrder?: SchoolOrder;
    calibrationStatus?: TemplateCalibrationStatus | string;
    sourceHash?: string;
    sourceSha256?: string;
    sourcePdfSha256?: string;
  } | null,
  schema?: TemplateSchema | null
): {
  isValid: boolean;
  errorCode?:
    | 'TEMPLATE_SOURCE_MISSING'
    | 'MODEL_CALIBRATION_REQUIRED'
    | 'TEMPLATE_INTEGRITY_MISMATCH'
    | 'SCHEMA_MISSING';
  errorMessage?: string;
} {
  // Check canonical ministerial resolution
  const ministerialOrder =
    resolveMinisterialOrder(templateId) ||
    resolveMinisterialOrder(modelDef?.id) ||
    resolveMinisterialOrder(modelDef?.schoolOrder);

  const isMinisterial =
    Boolean(ministerialOrder) ||
    Boolean(modelDef?.isMinisterial) ||
    modelDef?.sourceKind === 'BUILT_IN' ||
    modelDef?.originType === 'MINISTERIAL';

  if (isMinisterial) {
    // Ministerial templates are backed by built-in baseline schemas and geometries
    return { isValid: true };
  }

  // Custom template validation
  if (!schema && !modelDef) {
    return {
      isValid: false,
      errorCode: 'TEMPLATE_SOURCE_MISSING',
      errorMessage: 'TEMPLATE SOURCE MISSING — Impossibile trovare la definizione del modello personalizzato specificato.',
    };
  }

  const effectiveStatus = schema?.calibrationStatus || modelDef?.calibrationStatus;

  // Strict Policy: Only CALIBRATED custom models are permitted for compilation
  if (effectiveStatus !== 'CALIBRATED') {
    return {
      isValid: false,
      errorCode: 'MODEL_CALIBRATION_REQUIRED',
      errorMessage:
        'MODEL CALIBRATION REQUIRED — Il modello personalizzato non dispone di uno schema geometrico approvato (stato attuale: ' +
        (effectiveStatus || 'NON CALIBRATO') +
        '). È richiesta la calibrazione preventiva prima della compilazione.',
    };
  }

  // SHA Integrity check for custom model
  const expectedHash = modelDef?.sourceSha256 || modelDef?.sourceHash;
  const actualHash = schema?.sourceSha256;
  if (expectedHash && actualHash && expectedHash !== actualHash) {
    return {
      isValid: false,
      errorCode: 'TEMPLATE_INTEGRITY_MISMATCH',
      errorMessage: 'TEMPLATE INTEGRITY MISMATCH — L’hash SHA-256 del modello sorgente non corrisponde alla definizione del template.',
    };
  }

  return { isValid: true };
}

/**
 * Convenience helper to check if a TemplateSchema is eligible for compilation.
 */
export function isTemplateEligibleForCompilation(schema: TemplateSchema): {
  eligible: boolean;
  calibrationStatus: TemplateCalibrationStatus;
  reason?: string;
} {
  if (schema.calibrationStatus === 'CALIBRATED') {
    return {
      eligible: true,
      calibrationStatus: 'CALIBRATED',
    };
  }

  return {
    eligible: false,
    calibrationStatus: schema.calibrationStatus,
    reason: `REQUISITO BLOCCANTE — Modello non approvato per compilazione. Stato calibrazione: ${schema.calibrationStatus}. È richiesta calibrazione preventiva.`,
  };
}

/**
 * Calculates font size reduction ratio to fit long text within given rectangular dimensions.
 */
export function computeFitScale(
  text: string,
  widthPt: number,
  heightPt: number,
  baseFontSize = 11,
  minFontSize = 8
): number {
  if (!text || text.length === 0) return 1.0;

  // Approx 0.55 width per char at base font size
  const charWidth = baseFontSize * 0.55;
  const charsPerLine = Math.max(1, Math.floor(widthPt / charWidth));
  const linesNeeded = Math.ceil(text.length / charsPerLine);
  const totalHeightNeeded = linesNeeded * (baseFontSize * 1.25);

  if (totalHeightNeeded <= heightPt) {
    return 1.0;
  }

  const effectiveMinFontSize = Math.max(8, minFontSize); // Strict rule: font sizes below 8 pt are prohibited
  const calculatedScale = heightPt / totalHeightNeeded;
  const minScale = effectiveMinFontSize / baseFontSize;
  return Math.max(minScale, Math.min(1.0, calculatedScale));
}
