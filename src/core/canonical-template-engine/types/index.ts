/**
 * Canonical Template Engine (CTE) - Release R01 Foundation
 * Core domain contracts and interfaces for canonical document analysis.
 */

/**
 * Type of source document processed by the Canonical Template Engine.
 */
export type DocumentSourceType =
  | 'pdf'
  | 'docx'
  | 'image'
  | 'scan'
  | 'unknown';

export const DocumentSourceType = {
  PDF: 'pdf',
  DOCX: 'docx',
  IMAGE: 'image',
  SCAN: 'scan',
  UNKNOWN: 'unknown',
} as const;

/**
 * 4-element tuple representing a PDF rectangular boundary: [x0, y0, x1, y1]
 */
export type PdfBox = [number, number, number, number];

/**
 * Canonical structural fingerprint of a single document page.
 * Describes purely geometric and structural layout, independent of compiled text values.
 */
export interface CanonicalPageFingerprint {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  mediaBox: PdfBox;
  cropBox: PdfBox;
  vectorObjectCount: number;
  rasterImageCount: number;
  textObjectCount: number;
  fontFamilies: string[];
  geometryHash: string;
  structureHash: string;
  confidence: number;
  geometricAnalysis?: GeometricAnalysisResult;
  normalizationPlan?: PageNormalizationPlan;
}

/**
 * Canonical structural fingerprint of an entire multi-page document.
 */
export interface CanonicalDocumentFingerprint {
  pageCount: number;
  pages: CanonicalPageFingerprint[];
  documentGeometryHash: string;
  documentStructureHash: string;
  fingerprint: string;
  geometricAnalysis?: DocumentGeometricAnalysis;
  normalizationPlan?: NormalizationPlan;
}

/**
 * Classification category of structural template match.
 */
export type TemplateMatchClassification =
  | 'IDENTICAL'
  | 'COMPATIBLE'
  | 'DERIVED'
  | 'DIFFERENT';

export const TemplateMatchClassification = {
  IDENTICAL: 'IDENTICAL',
  COMPATIBLE: 'COMPATIBLE',
  DERIVED: 'DERIVED',
  DIFFERENT: 'DIFFERENT',
} as const;

/**
 * Result of comparing two documents via their Canonical Structural Fingerprints.
 */
export interface TemplateMatchResult {
  similarityScore: number;
  geometryScore: number;
  structureScore: number;
  matchedPages: number;
  totalPages: number;
  confidence: number;
  diagnosticSummary: string;
  classification: TemplateMatchClassification;
  classificationLabel: string;
}

/**
 * Canonical Template definition registered in the Canonical Catalog.
 */
export interface CanonicalTemplate {
  id: string;
  nome: string;
  versione: string;
  fingerprint: CanonicalDocumentFingerprint;
  name?: string;
  version?: string;
  description?: string;
}

/**
 * Quality metrics and evaluation for an individual document page.
 */
export interface PageQuality {
  score: number;
  isReadable: boolean;
  skewAngle: number;
  isSkewed: boolean;
  isBlurry: boolean;
  contrast: number;
  brightness: number;
  dpi: number;
  hasArtifacts: boolean;
  issues: string[];
}

/**
 * Margins of page content relative to page boundaries (in points).
 */
export interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Result of geometric measurement and analysis for a document page.
 * Produced by the GeometricAnalysisEngine (Release R04).
 */
export interface GeometricAnalysisResult {
  pageIndex: number;
  width: number;
  height: number;
  aspectRatio: number;
  pageRotation: number;
  orientation: 'portrait' | 'landscape';
  skewAngle: number;
  perspectiveDeviation: number;
  perspectiveScore: number;
  horizontalAlignment: number;
  verticalAlignment: number;
  alignmentScore: number;
  distortionScore: number;
  marginScore: number;
  margins: PageMargins;
  deformation: number;
  translation: { x: number; y: number };
  scale: number;
  symmetry: number;
  borderConsistency: number;
  overallGeometryScore: number;
  confidence: number;
  geometricConfidence: number;
  diagnosticSummary: string;
}

/**
 * Global document-level geometric analysis aggregating all page measurements.
 */
export interface DocumentGeometricAnalysis {
  totalPages: number;
  overallSkewAngle: number;
  overallGeometryScore: number;
  overallConfidence: number;
  pages: GeometricAnalysisResult[];
  diagnosticSummary: string;
}

/**
 * Types of planned geometric normalization operations.
 */
export type PlannedOperationType =
  | 'rotate'
  | 'deskew'
  | 'perspective'
  | 'translate'
  | 'scale'
  | 'margin_adjustment';

/**
 * A discrete planned theoretical transformation step.
 */
export interface PlannedOperation {
  step: number;
  type: PlannedOperationType;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  expectedImpact: {
    targetMetric: string;
    before: number | string;
    estimatedAfter: number | string;
  };
}

/**
 * Theoretical perspective correction plan for a page.
 */
export interface PerspectiveCorrectionPlan {
  needed: boolean;
  deviation: number;
  description?: string;
  quadrilateralCorners?: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
}

/**
 * Theoretical margin adjustment plan (in points) to reach canonical margins.
 */
export interface MarginCorrectionPlan {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Theoretical normalization plan for a single page (Release R05).
 */
export interface PageNormalizationPlan {
  pageIndex: number;
  requiresCorrection: boolean;
  rotationCorrection: number; // in degrees, e.g. 0, -90, 180, -270
  skewCorrection: number; // in degrees, e.g. -3.5 to cancel +3.5 skew
  perspectiveCorrection: PerspectiveCorrectionPlan;
  translation: { x: number; y: number }; // delta to align origin (0, 0)
  scaling: { scaleX: number; scaleY: number }; // scaling factor to reach canonical A4 dimensions
  marginCorrection: MarginCorrectionPlan; // margin adjustments in points
  expectedGeometryScore: number; // simulated post-normalization score
  estimatedConfidence: number; // simulated post-normalization confidence
  operationSequence: PlannedOperation[];
  summary: string;
}

/**
 * Complete document-level normalization plan (Release R05).
 */
export interface NormalizationPlan {
  id: string;
  targetTemplateId: string;
  targetVersion: string;
  createdAt: string;
  requiresNormalization: boolean;
  totalPages: number;
  pagePlans: PageNormalizationPlan[];
  totalOperations: number;
  expectedOverallGeometryScore: number;
  estimatedOverallConfidence: number;
  summary: string;
}

/**
 * Analysis representation of a single page within a document.
 */
export interface PageAnalysis {
  pageNumber: number;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  rotation: number;
  rotate: number;
  mediaBox: PdfBox;
  cropBox: PdfBox;
  text: string;
  charCount: number;
  hasText: boolean;
  hasImages: boolean;
  hasRaster: boolean;
  hasVectors: boolean;
  rasterCount: number;
  vectorCount: number;
  fonts: string[];
  hasTables: boolean;
  hasForms: boolean;
  confidence: number;
  quality: PageQuality;
  structuralFingerprint: CanonicalPageFingerprint;
  geometricAnalysis?: GeometricAnalysisResult;
  normalizationPlan?: PageNormalizationPlan;
}

/**
 * Overall quality report for the analyzed document.
 */
export interface GlobalQualityReport {
  overallScore: number;
  isAcceptable: boolean;
  averagePageQuality: number;
  pageCount: number;
  degradedPages: number[];
  issues: string[];
  recommendations: string[];
  summary: string;
}

/**
 * Complete document analysis result produced by the Canonical Template Engine.
 */
export interface DocumentAnalysis {
  id: string;
  sourceType: DocumentSourceType;
  totalPages: number;
  pages: PageAnalysis[];
  quality: GlobalQualityReport;
  fingerprint: string;
  structuralFingerprint: CanonicalDocumentFingerprint;
  geometricAnalysis?: DocumentGeometricAnalysis;
  normalizationPlan?: NormalizationPlan;
  byteSize: number;
  createdAt: string;
  status: 'completed' | 'failed' | 'partial' | 'pending';
  fonts: string[];
  hasText: boolean;
  hasImages: boolean;
  hasRaster: boolean;
  hasVectors: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Record of an executed or skipped transformation operation (Release R06).
 */
export interface AppliedOperation {
  step: number;
  type: PlannedOperationType;
  name: string;
  pageIndex: number;
  parameters: Record<string, unknown>;
  reversible: boolean;
  status: 'applied' | 'skipped' | 'failed';
  reason?: string;
}

/**
 * Comprehensive report generated upon completing normalization execution (Release R06).
 */
export interface NormalizationReport {
  documentId: string;
  executionId: string;
  executedAt: string;
  targetTemplateId: string;
  targetVersion: string;
  totalPages: number;
  pagesModified: number;
  totalPlannedOperations: number;
  appliedOperationsCount: number;
  skippedOperationsCount: number;
  geometryScoreBefore: number;
  geometryScoreAfter: number;
  improvementScore: number;
  matchingScoreBefore: number;
  matchingScoreAfter: number;
  isImproved: boolean;
  contentPreserved: boolean;
  summary: string;
}

/**
 * The normalized document resulting from NormalizationExecutionEngine (Release R06).
 */
export interface NormalizedDocument {
  document: ArrayBuffer;
  documentAnalysis?: DocumentAnalysis;
  normalizationReport: NormalizationReport;
  appliedOperations: AppliedOperation[];
  skippedOperations: AppliedOperation[];
  geometryScoreBefore: number;
  geometryScoreAfter: number;
  improvementScore: number;
  newFingerprint: CanonicalDocumentFingerprint;
  newMatchResult: TemplateMatchResult;
  newGeometricAnalysis: DocumentGeometricAnalysis;
}

/**
 * Status lifecycle of a canonical template version in the registry (Release R07).
 */
export type TemplateStatus = 'active' | 'deprecated' | 'archived';

/**
 * Validation issue reported during template validation (Release R07).
 */
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  field?: string;
}

/**
 * Comprehensive validation report for a template version (Release R07).
 */
export interface RegistryValidationReport {
  isValid: boolean;
  modelId: string;
  isReadable: boolean;
  hasValidFingerprint: boolean;
  hasCoherentGeometry: boolean;
  hasCoherentSchema: boolean;
  isDuplicate: boolean;
  issues: ValidationIssue[];
  summary: string;
  timestamp: string;
}

/**
 * Complete versioned definition of a Canonical Model in the Registry (Release R07).
 */
export interface TemplateVersion {
  id: string;
  nome: string;
  descrizione: string;
  ordineScolastico: string;
  versioneMinisteriale: string;
  annoValidita: number | string;
  hash: string;
  fingerprint: CanonicalDocumentFingerprint;
  geometry: DocumentGeometricAnalysis | Record<string, unknown>;
  templateSchema: Record<string, unknown>;
  dataRegistrazione: string;
  stato: TemplateStatus;
  versione: string;

  // Dual-naming / backwards compatibility aliases
  name?: string;
  description?: string;
  version?: string;
  status?: TemplateStatus;
  validFromYear?: number;
  validToYear?: number;
  sourceType?: DocumentSourceType;
  metadata?: Record<string, unknown>;
}

/**
 * Options for acquiring/importing a canonical template into the registry (Release R07).
 */
export interface ImportTemplateOptions {
  id?: string;
  nome: string;
  descrizione?: string;
  ordineScolastico: string;
  versioneMinisteriale: string;
  annoValidita: number | string;
  validFromYear?: number;
  validToYear?: number;
  sourceType?: DocumentSourceType;
  fileName?: string;
  mimeType?: string;
  templateSchema?: Record<string, unknown>;
  geometry?: DocumentGeometricAnalysis | Record<string, unknown>;
  status?: TemplateStatus;
  metadata?: Record<string, unknown>;
  throwOnError?: boolean;
}

/**
 * Structural similarity classification levels (Release R08).
 */
export type StructuralSimilarityClassification =
  | 'EXACT'
  | 'SIMILAR'
  | 'DERIVED'
  | 'UNKNOWN';

export const StructuralSimilarityClassification = {
  EXACT: 'EXACT',
  SIMILAR: 'SIMILAR',
  DERIVED: 'DERIVED',
  UNKNOWN: 'UNKNOWN',
} as const;

/**
 * Difference between two matching boxes across source and candidate templates (Release R08).
 */
export interface BoxShiftDifference {
  sourceBox: PdfBox;
  candidateBox: PdfBox;
  pageIndex: number;
  deltaX: number;
  deltaY: number;
  deltaWidth: number;
  deltaHeight: number;
  distance: number;
}

/**
 * Detailed structural difference report for a specific page (Release R08).
 */
export interface PageStructuralDifference {
  pageIndex: number;
  sourcePageExists: boolean;
  candidatePageExists: boolean;
  addedBoxesCount: number;
  removedBoxesCount: number;
  shiftedBoxesCount: number;
  addedBoxes: PdfBox[];
  removedBoxes: PdfBox[];
  shiftedBoxes: BoxShiftDifference[];
  vectorDelta: number;
  rasterDelta: number;
  textObjectDelta: number;
  dimensionDelta: {
    widthDelta: number;
    heightDelta: number;
    aspectRatioDelta: number;
  };
  rotationDelta: number;
  pageSimilarityScore: number;
}

/**
 * Geometric difference summary between two templates (Release R08).
 */
export interface GeometricDifferenceSummary {
  overallGeometryScoreDelta: number;
  skewAngleDelta: number;
  dimensionConsistent: boolean;
  aspectRatioConsistent: boolean;
  pageCountDelta: number;
  averageAlignmentDelta: number;
}

/**
 * Complete result produced by StructuralDifferenceAnalyzer (Release R08).
 */
export interface StructuralDifferenceResult {
  totalAddedBoxes: number;
  totalRemovedBoxes: number;
  totalShiftedBoxes: number;
  addedBoxes: Array<{ pageIndex: number; box: PdfBox }>;
  removedBoxes: Array<{ pageIndex: number; box: PdfBox }>;
  shiftedBoxes: BoxShiftDifference[];
  pageDifferences: PageStructuralDifference[];
  geometricDifferences: GeometricDifferenceSummary;
  layoutShiftScore: number;
  contentPreservationScore: number;
  similarityPercentage: number;
  classification: StructuralSimilarityClassification;
  summary: string;
}

/**
 * Comprehensive Evolution Report comparing a candidate against a source template (Release R08).
 */
export interface TemplateEvolutionReport {
  id: string;
  createdAt: string;
  sourceTemplateId?: string;
  sourceTemplateName?: string;
  sourceVersion?: string;
  candidateTemplateId?: string;
  candidateTemplateName?: string;
  candidateVersion?: string;
  similarityPercentage: number;
  classification: StructuralSimilarityClassification;
  classificationLabel: string;
  isVariantOfExisting: boolean;
  isNewTemplate: boolean;
  isIdentical: boolean;
  suggestedAction: 'BIND_EXISTING' | 'CREATE_VARIANT_IN_CLUSTER' | 'CREATE_NEW_CLUSTER';
  geometricDifferences: GeometricDifferenceSummary;
  structuralDifferences: {
    totalAddedBoxes: number;
    totalRemovedBoxes: number;
    totalShiftedBoxes: number;
    pageCountDelta: number;
    pageDifferences: PageStructuralDifference[];
  };
  clusterId?: string;
  diagnosticNotes: string[];
  summary: string;
}

/**
 * Cluster grouping multiple structural evolution variants of a template family (Release R08).
 */
export interface TemplateCluster {
  id: string;
  nome: string;
  descrizione?: string;
  ordineScolastico?: string;
  baseTemplateId: string;
  templateIds: string[];
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options for candidate clustering (Release R08).
 */
export interface ClusteringOptions {
  similarityThresholdExact?: number;
  similarityThresholdSimilar?: number;
  similarityThresholdDerived?: number;
  autoCreateCluster?: boolean;
}

/**
 * Decision Engine Classifications (Release R09).
 */
export type CteDecision =
  | 'BIND_CANONICAL'
  | 'NORMALIZE_TO_TEMPLATE'
  | 'REGISTER_VARIANT'
  | 'CREATE_NEW_CLUSTER'
  | 'REJECT';

export const CteDecision = {
  BIND_CANONICAL: 'BIND_CANONICAL',
  NORMALIZE_TO_TEMPLATE: 'NORMALIZE_TO_TEMPLATE',
  REGISTER_VARIANT: 'REGISTER_VARIANT',
  CREATE_NEW_CLUSTER: 'CREATE_NEW_CLUSTER',
  REJECT: 'REJECT',
} as const;

/**
 * Single step in an execution action plan generated by R09 Action Planner.
 */
export interface CteActionStep {
  stepNumber: number;
  code: string;
  name: string;
  description: string;
  targetModule: 'CATALOG' | 'PLANNER' | 'NORMALIZER' | 'CLUSTER_REGISTRY' | 'EXECUTION_R10';
  payload?: Record<string, unknown>;
}

/**
 * Complete action plan produced by R09 Action Planner.
 */
export interface CteActionPlan {
  id: string;
  createdAt: string;
  decision: CteDecision;
  totalSteps: number;
  steps: CteActionStep[];
  readyForR10: boolean;
  notes?: string[];
}

/**
 * Configurable policy rules for CTE Decision Engine (Release R09).
 */
export interface CteDecisionPolicyConfig {
  bindCanonicalThreshold?: number;     // e.g. >= 99.0
  normalizeThreshold?: number;         // e.g. >= 90.0 (90 - 98.9%)
  registerVariantThreshold?: number;   // e.g. >= 75.0 (75 - 89.9%)
  minConfidenceThreshold?: number;     // e.g. 0.40 (below this -> REJECT)
  minGeometryScoreThreshold?: number;  // e.g. 30.0 (below this -> REJECT)
  minPagesRequired?: number;           // e.g. 1 (0 pages -> REJECT)
  requireCoherentGeometry?: boolean;   // e.g. true
}

/**
 * Input context provided to the Decision Engine (Release R09).
 */
export interface CteDecisionContext {
  candidateFingerprint: CanonicalDocumentFingerprint;
  bestMatchResult?: TemplateMatchResult | null;
  similarityPercentage?: number;
  evolutionReport?: TemplateEvolutionReport | null;
  cluster?: TemplateCluster | null;
  confidence?: number;
  candidateTemplate?: TemplateVersion | null;
  targetTemplate?: TemplateVersion | null;
  diagnosticNotes?: string[];
}

/**
 * Comprehensive Decision Report produced by the CTE Decision Engine (Release R09).
 */
export interface CteDecisionReport {
  id: string;
  createdAt: string;
  decision: CteDecision;
  decisionLabel: string;
  confidence: number;
  reasons: string[];
  clusterId?: string;
  clusterName?: string;
  selectedTemplateId?: string;
  selectedTemplateName?: string;
  sourceTemplateId?: string;
  targetTemplateId?: string;
  suggestedOperation: string;
  differences: string[];
  similarityPercentage: number;
  policyUsed: Required<CteDecisionPolicyConfig>;
  actionPlan: CteActionPlan;
  summary: string;
}

/**
 * Execution status resulting from Canonical Execution Engine (Release R10).
 */
export type CanonicalExecutionStatus =
  | 'success'
  | 'normalized'
  | 'variant_registered'
  | 'cluster_created'
  | 'rejected'
  | 'failed';

/**
 * Detailed performance and metric statistics for full CTE execution (Release R10).
 */
export interface CanonicalExecutionStatistics {
  totalDurationMs: number;
  phaseTimings: Record<string, number>;
  totalPages: number;
  totalBoxes: number;
  totalTransformations: number;
  memoryUsageMb?: number;
}

/**
 * Final execution report summarizing the entire canonical pipeline (Release R10).
 */
export interface CanonicalExecutionReport {
  id: string;
  executedAt: string;
  decisionExecuted: CteDecision;
  status: CanonicalExecutionStatus;
  targetTemplateId?: string;
  targetTemplateName?: string;
  clusterId?: string;
  clusterName?: string;
  operationsExecuted: string[];
  warnings: string[];
  errors: string[];
  statistics: CanonicalExecutionStatistics;
  normalizationReport?: NormalizationReport;
  decisionReport?: CteDecisionReport;
  summary: string;
}

/**
 * Final unified output returned by the Canonical Template Engine (Release R10).
 */
export interface CanonicalExecutionResult {
  sourceDocument: ArrayBuffer;
  canonicalDocument: ArrayBuffer | null;
  documentFingerprint: CanonicalDocumentFingerprint;
  templateUsed?: TemplateVersion | null;
  cluster?: TemplateCluster | null;
  decision: CteDecision;
  report: CanonicalExecutionReport;
  statistics: CanonicalExecutionStatistics;
}

/**
 * Execution configuration options for the Pipeline Orchestrator (Release R10).
 */
export interface CteExecutionOptions {
  targetTemplateId?: string;
  forceDecision?: CteDecision;
  policyConfig?: Partial<CteDecisionPolicyConfig>;
  autoRegisterVariant?: boolean;
  autoCreateCluster?: boolean;
  preserveOriginalOnError?: boolean;
}


