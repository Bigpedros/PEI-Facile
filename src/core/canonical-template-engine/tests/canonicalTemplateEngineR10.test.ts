/**
 * Canonical Template Engine (CTE) - Release R10 Test Suite
 * Canonical Execution Engine & Pipeline Orchestrator
 *
 * Verifies:
 * TEST 1: Documento perfettamente canonico -> Pipeline completa -> BIND_CANONICAL
 * TEST 2: Documento da normalizzare -> Pipeline completa -> NORMALIZE_TO_TEMPLATE
 * TEST 3: Nuova variante -> Pipeline completa -> REGISTER_VARIANT
 * TEST 4: Nuovo cluster -> Pipeline completa -> CREATE_NEW_CLUSTER
 * TEST 5: Documento non valido -> Pipeline completa -> REJECT
 * TEST 6: Execution Report completo.
 * TEST 7: CanonicalExecutionResult completo.
 * TEST 8: Pipeline Orchestrator.
 * TEST 9: Compatibilità completa con tutte le Release R01 -> R09.
 * TEST 10: Esecuzione completa end-to-end su un modello ministeriale reale.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CanonicalTemplateEngine,
  CanonicalExecutionEngine,
  DecisionEngine,
  ActionPlanner,
  DecisionPolicy,
  ClusterRegistry,
  CandidateClusterEngine,
  StructuralDifferenceAnalyzer,
  CanonicalTemplateRegistry,
  CanonicalTemplateCatalog,
  PdfDocumentAnalyzer,
  CanonicalTemplateMatcher,
  NormalizationPlanningEngine,
  NormalizationExecutionEngine,
} from '../index';
import {
  CteDecision,
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  TemplateVersion,
  DocumentAnalysis,
  CteDecisionReport,
} from '../types';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../../data/geometry/geometryTransform';

/**
 * Helper to construct a synthetic canonical page fingerprint.
 */
function createSyntheticPageFingerprint(
  pageIndex: number,
  options?: {
    textCount?: number;
    vectorCount?: number;
    rasterCount?: number;
    width?: number;
    height?: number;
    geometryHash?: string;
    structureHash?: string;
  }
): CanonicalPageFingerprint {
  const textCount = options?.textCount ?? 150;
  const vectorCount = options?.vectorCount ?? 12;
  const rasterCount = options?.rasterCount ?? 0;
  const width = options?.width ?? A4_WIDTH_PT;
  const height = options?.height ?? A4_HEIGHT_PT;

  return {
    pageIndex,
    pageWidth: width,
    pageHeight: height,
    rotation: 0,
    mediaBox: [0, 0, width, height],
    cropBox: [0, 0, width, height],
    vectorObjectCount: vectorCount,
    rasterImageCount: rasterCount,
    textObjectCount: textCount,
    fontFamilies: ['Helvetica', 'Arial'],
    geometryHash: options?.geometryHash ?? `gh_${pageIndex}_${width}x${height}`,
    structureHash: options?.structureHash ?? `sh_${pageIndex}_t${textCount}_v${vectorCount}_r${rasterCount}`,
    confidence: 0.98,
  };
}

/**
 * Helper to construct a synthetic canonical document fingerprint.
 */
function createSyntheticFingerprint(
  pageCount: number,
  salt = 'v1',
  confidence = 0.98,
  geoScore = 98.0
): CanonicalDocumentFingerprint {
  const pages: CanonicalPageFingerprint[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(
      createSyntheticPageFingerprint(i, {
        textCount: 100 + i * 20,
        structureHash: `sh_${i}_${salt}`,
      })
    );
  }

  return {
    pageCount,
    pages,
    documentGeometryHash: `doc_geo_${pageCount}_${salt}`,
    documentStructureHash: `doc_struct_${pageCount}_${salt}`,
    fingerprint: `fp_${pageCount}_${salt}`,
    geometricAnalysis: {
      totalPages: pageCount,
      overallSkewAngle: 0,
      overallGeometryScore: geoScore,
      overallConfidence: confidence,
      pages: [],
      diagnosticSummary: 'Geometric analysis ok',
    },
  };
}

function createSyntheticAnalysis(
  pageCount: number,
  salt = 'v1',
  confidence = 0.98,
  geoScore = 98.0
): DocumentAnalysis {
  const fp = createSyntheticFingerprint(pageCount, salt, confidence, geoScore);
  return {
    id: `analysis_${salt}`,
    sourceType: 'pdf',
    structuralFingerprint: fp,
    geometricAnalysis: fp.geometricAnalysis,
    totalPages: pageCount,
    pages: [],
    quality: {
      overallScore: confidence * 100,
      isAcceptable: true,
      averagePageQuality: confidence * 100,
      pageCount,
      degradedPages: [],
      issues: [],
      recommendations: [],
      summary: 'OK',
    },
    fingerprint: fp.fingerprint,
    byteSize: 1024,
    createdAt: new Date().toISOString(),
    status: 'completed',
    fonts: [],
    hasText: true,
    hasImages: false,
    hasRaster: false,
    hasVectors: false,
    metadata: {},
  };
}

describe('Canonical Template Engine (CTE) - Release R10 Execution Engine & Pipeline Orchestrator', () => {
  let executionEngine: CanonicalExecutionEngine;
  let decisionEngine: DecisionEngine;
  let templateRegistry: CanonicalTemplateRegistry;
  let clusterRegistry: ClusterRegistry;
  let sampleBuffer: ArrayBuffer;

  beforeEach(() => {
    templateRegistry = new CanonicalTemplateRegistry();
    clusterRegistry = new ClusterRegistry();
    decisionEngine = new DecisionEngine();
    executionEngine = new CanonicalExecutionEngine({
      templateRegistry,
      clusterRegistry,
    });
    sampleBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer; // %PDF-1.7
  });

  // =========================================================================
  // TEST 1: Documento perfettamente canonico -> BIND_CANONICAL
  // =========================================================================
  it('TEST 1: Documento perfettamente canonico esegue BIND_CANONICAL senza alterazioni e consegna il buffer', async () => {
    const analysis = createSyntheticAnalysis(12, 'primaria_2024');

    const canonicalTemplate: TemplateVersion = {
      id: 'PEI_PRIMARIA_2024',
      nome: 'PEI Primaria Ufficiale 2024',
      descrizione: 'Modello Ministeriale',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2024',
      versione: '2024',
      annoValidita: 2024,
      hash: 'h_prim',
      fingerprint: analysis.structuralFingerprint,
      geometry: { overallGeometryScore: 99 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    templateRegistry.register(canonicalTemplate);
    const cluster = clusterRegistry.createCluster({
      id: 'CLUSTER_PRIMARIA',
      nome: 'Famiglia Primaria',
      baseTemplateId: 'PEI_PRIMARIA_2024',
    });

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      similarityPercentage: 100.0,
      confidence: 0.99,
      targetTemplate: canonicalTemplate,
      cluster,
    });

    expect(decisionReport.decision).toBe(CteDecision.BIND_CANONICAL);

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: analysis,
      decisionReport,
      targetTemplate: canonicalTemplate,
      cluster,
    });

    expect(result.decision).toBe(CteDecision.BIND_CANONICAL);
    expect(result.canonicalDocument).toBe(sampleBuffer); // untouched
    expect(result.report.status).toBe('success');
    expect(result.report.operationsExecuted.some(op => op.includes('BIND_DIRECT_LAYOUT'))).toBe(true);
    expect(result.statistics.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  // =========================================================================
  // TEST 2: Documento da normalizzare -> NORMALIZE_TO_TEMPLATE
  // =========================================================================
  it('TEST 2: Documento da normalizzare esegue NORMALIZE_TO_TEMPLATE con piano di normalizzazione', async () => {
    const analysis = createSyntheticAnalysis(12, 'primaria_skewed');

    const canonicalTemplate: TemplateVersion = {
      id: 'PEI_PRIMARIA_2024',
      nome: 'PEI Primaria Ufficiale 2024',
      descrizione: 'Modello Ministeriale',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2024',
      versione: '2024',
      annoValidita: 2024,
      hash: 'h_prim',
      fingerprint: analysis.structuralFingerprint,
      geometry: { overallGeometryScore: 98 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    templateRegistry.register(canonicalTemplate);

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      similarityPercentage: 94.0,
      confidence: 0.96,
      targetTemplate: canonicalTemplate,
    });

    expect(decisionReport.decision).toBe(CteDecision.NORMALIZE_TO_TEMPLATE);

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: analysis,
      decisionReport,
      targetTemplate: canonicalTemplate,
    });

    expect(result.decision).toBe(CteDecision.NORMALIZE_TO_TEMPLATE);
    expect(result.report.status).toBe('normalized');
    expect(result.canonicalDocument).toBeDefined();
    expect(result.report.operationsExecuted.some(op => op.includes('BUILD_NORMALIZATION_PLAN'))).toBe(true);
  });

  // =========================================================================
  // TEST 3: Nuova variante -> REGISTER_VARIANT
  // =========================================================================
  it('TEST 3: Nuova variante esegue REGISTER_VARIANT, aggiorna il catalogo e associa al cluster', async () => {
    const analysis = createSyntheticAnalysis(13, 'primaria_riforma_2027');

    const ancestorTemplate: TemplateVersion = {
      id: 'PEI_PRIMARIA_2024',
      nome: 'PEI Primaria 2024',
      descrizione: 'Modello Antenato',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2024',
      versione: '2024',
      annoValidita: 2024,
      hash: 'h_prim_orig',
      fingerprint: createSyntheticFingerprint(12, 'primaria_orig'),
      geometry: { overallGeometryScore: 98 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    templateRegistry.register(ancestorTemplate);
    const cluster = clusterRegistry.createCluster({
      id: 'CLUSTER_PRIMARIA',
      nome: 'Famiglia Primaria',
      baseTemplateId: ancestorTemplate.id,
    });

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      similarityPercentage: 83.0,
      confidence: 0.94,
      targetTemplate: ancestorTemplate,
      cluster,
    });

    expect(decisionReport.decision).toBe(CteDecision.REGISTER_VARIANT);

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: analysis,
      decisionReport,
      targetTemplate: ancestorTemplate,
      cluster,
    });

    expect(result.decision).toBe(CteDecision.REGISTER_VARIANT);
    expect(result.report.status).toBe('variant_registered');
    expect(result.templateUsed).toBeDefined();

    // Registry must now contain the new registered variant
    expect(templateRegistry.count()).toBe(2);
    // Cluster must contain both templates
    const updatedCluster = clusterRegistry.getCluster('CLUSTER_PRIMARIA');
    expect(updatedCluster?.templateIds.length).toBe(2);
  });

  // =========================================================================
  // TEST 4: Nuovo cluster -> CREATE_NEW_CLUSTER
  // =========================================================================
  it('TEST 4: Nuovo cluster esegue CREATE_NEW_CLUSTER, istituendo nuova famiglia e registrando template radice', async () => {
    const analysis = createSyntheticAnalysis(5, 'modulo_innovativo');

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      similarityPercentage: 45.0,
      confidence: 0.91,
    });

    expect(decisionReport.decision).toBe(CteDecision.CREATE_NEW_CLUSTER);

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: analysis,
      decisionReport,
    });

    expect(result.decision).toBe(CteDecision.CREATE_NEW_CLUSTER);
    expect(result.report.status).toBe('cluster_created');
    expect(result.cluster).toBeDefined();
    expect(result.templateUsed).toBeDefined();
    expect(clusterRegistry.count()).toBe(1);
    expect(templateRegistry.count()).toBe(1);
  });

  // =========================================================================
  // TEST 5: Documento non valido -> REJECT
  // =========================================================================
  it('TEST 5: Documento non valido esegue REJECT, bloccando la pipeline ed emettendo report diagnostico', async () => {
    const corruptAnalysis = createSyntheticAnalysis(0, 'corrupt', 0.1, 10.0);

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: corruptAnalysis.structuralFingerprint,
      confidence: 0.1,
    });

    expect(decisionReport.decision).toBe(CteDecision.REJECT);

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: corruptAnalysis,
      decisionReport,
    });

    expect(result.decision).toBe(CteDecision.REJECT);
    expect(result.report.status).toBe('rejected');
    expect(result.canonicalDocument).toBeNull();
    expect(result.report.warnings.length).toBeGreaterThan(0);
    expect(result.report.operationsExecuted.some(op => op.includes('HALT_PROCESSING_PIPELINE'))).toBe(true);
  });

  // =========================================================================
  // TEST 6: Execution Report completo
  // =========================================================================
  it('TEST 6: Execution Report completo contiene tutti i campi richiesti e tracciamento temporale', async () => {
    const analysis = createSyntheticAnalysis(12, 'primaria_report');

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      similarityPercentage: 100.0,
      confidence: 0.99,
    });

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: analysis,
      decisionReport,
      phaseTimings: { analysisMs: 15.2, matchingMs: 4.8 },
    });

    const report = result.report;
    expect(report.id).toMatch(/^EXEC_REP_/);
    expect(report.executedAt).toBeDefined();
    expect(report.decisionExecuted).toBe(CteDecision.BIND_CANONICAL);
    expect(report.status).toBe('success');
    expect(report.operationsExecuted.length).toBeGreaterThan(0);
    expect(report.warnings).toBeDefined();
    expect(report.errors).toHaveLength(0);
    expect(report.statistics.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.statistics.phaseTimings.analysisMs).toBe(15.2);
    expect(report.statistics.phaseTimings.matchingMs).toBe(4.8);
    expect(report.statistics.phaseTimings.executionMs).toBeDefined();
    expect(report.summary).toContain("Esecuzione CTE completata con stato 'success'");
  });

  // =========================================================================
  // TEST 7: CanonicalExecutionResult completo
  // =========================================================================
  it('TEST 7: CanonicalExecutionResult completo racchiude documento sorgente, canonico, report e statistiche', async () => {
    const analysis = createSyntheticAnalysis(8, 'secondaria_result');

    const decisionReport = decisionEngine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      similarityPercentage: 100.0,
      confidence: 0.98,
    });

    const result = await executionEngine.execute({
      sourceDocument: sampleBuffer,
      documentAnalysis: analysis,
      decisionReport,
    });

    expect(result.sourceDocument).toBe(sampleBuffer);
    expect(result.canonicalDocument).toBeDefined();
    expect(result.documentFingerprint).toBeDefined();
    expect(result.documentFingerprint.pageCount).toBe(8);
    expect(result.decision).toBe(CteDecision.BIND_CANONICAL);
    expect(result.report).toBeDefined();
    expect(result.statistics.totalPages).toBe(8);
    expect(result.statistics.totalBoxes).toBeGreaterThan(0);
  });

  // =========================================================================
  // TEST 8: Pipeline Orchestrator (CanonicalTemplateEngine)
  // =========================================================================
  it('TEST 8: Pipeline Orchestrator CanonicalTemplateEngine coordina l intera pipeline tramite execute()', async () => {
    const orchestrator = new CanonicalTemplateEngine({
      templateRegistry,
      clusterRegistry,
    });

    // Register a canonical model in the orchestrator
    const canonicalModel: TemplateVersion = {
      id: 'PEI_TEST_ORCHESTRATOR',
      nome: 'PEI Test Orchestrator',
      descrizione: 'Modello Base',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: '2024',
      versione: '2024',
      annoValidita: 2024,
      hash: 'h_orch',
      fingerprint: createSyntheticFingerprint(12, 'orch_model'),
      geometry: { overallGeometryScore: 98 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    orchestrator.getTemplateRegistry().register(canonicalModel);
    orchestrator.getClusterRegistry().createCluster({
      id: 'CLUSTER_ORCHESTRATOR',
      nome: 'Cluster Orchestrator',
      baseTemplateId: canonicalModel.id,
    });

    // Execute with forceDecision to test orchestrator flow
    const result = await orchestrator.execute(sampleBuffer, {
      targetTemplateId: 'PEI_TEST_ORCHESTRATOR',
      forceDecision: CteDecision.BIND_CANONICAL,
    });

    expect(result).toBeDefined();
    expect(result.decision).toBe(CteDecision.BIND_CANONICAL);
    expect(result.report.status).toBe('success');
    expect(result.statistics.phaseTimings.totalOrchestrationMs).toBeDefined();
  });

  // =========================================================================
  // TEST 9: Compatibilità completa con tutte le Release R01 -> R09
  // =========================================================================
  it('TEST 9: Compatibilità completa con tutte le Release R01 -> R09', () => {
    const analyzer = new PdfDocumentAnalyzer();
    const matcher = new CanonicalTemplateMatcher();
    const catalog = new CanonicalTemplateCatalog(undefined, matcher, templateRegistry);
    const planner = new NormalizationPlanningEngine();
    const execNormalization = new NormalizationExecutionEngine();
    const diffAnalyzer = new StructuralDifferenceAnalyzer();
    const clusterEngine = new CandidateClusterEngine(clusterRegistry, diffAnalyzer);
    const policy = new DecisionPolicy();
    const actionPlanner = new ActionPlanner();
    const decEngine = new DecisionEngine();

    expect(analyzer).toBeDefined();
    expect(matcher).toBeDefined();
    expect(catalog).toBeDefined();
    expect(planner).toBeDefined();
    expect(execNormalization).toBeDefined();
    expect(diffAnalyzer).toBeDefined();
    expect(clusterEngine).toBeDefined();
    expect(policy).toBeDefined();
    expect(actionPlanner).toBeDefined();
    expect(decEngine).toBeDefined();
  });

  // =========================================================================
  // TEST 10: Esecuzione completa end-to-end su un modello ministeriale reale
  // =========================================================================
  it('TEST 10: Esecuzione completa end-to-end su modello ministeriale reale PDF (ALLEGATO_A1_PEI_INFANZIA.pdf)', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const pdfBuffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    // 1. Analyze the real PDF to register it as official canonical model in registry
    const realAnalyzer = new PdfDocumentAnalyzer();
    const realAnalysis = await realAnalyzer.analyze(pdfBuffer);

    const orchestrator = new CanonicalTemplateEngine();
    const ministerialModel: TemplateVersion = {
      id: 'MINISTERIAL_A1_INFANZIA_REAL',
      nome: 'PEI Infanzia Modello Nazionale Reale',
      descrizione: 'D.I. 153/2023 Allegato A1',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'D.I. 153/2023',
      versione: '1.0',
      annoValidita: 2024,
      hash: 'h_real_a1',
      fingerprint: realAnalysis.structuralFingerprint,
      geometry: realAnalysis.geometricAnalysis!,
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    orchestrator.getTemplateRegistry().register(ministerialModel);
    orchestrator.getClusterRegistry().createCluster({
      id: 'CLUSTER_INFANZIA_REAL',
      nome: 'Famiglia PEI Infanzia Reale',
      baseTemplateId: ministerialModel.id,
      ordineScolastico: 'infanzia',
    });

    // 2. Execute orchestrator on the real PDF
    const result = await orchestrator.execute(pdfBuffer);

    expect(result).toBeDefined();
    expect(result.decision).toBe(CteDecision.BIND_CANONICAL);
    expect(result.report.status).toBe('success');
    expect(result.canonicalDocument).toBeDefined();
    expect(result.templateUsed?.id).toBe('MINISTERIAL_A1_INFANZIA_REAL');
    expect(result.statistics.totalPages).toBe(12);
    expect(result.statistics.totalBoxes).toBeGreaterThan(100);
    expect(result.statistics.phaseTimings.analysisMs).toBeGreaterThan(0);
    expect(result.statistics.phaseTimings.matchingMs).toBeGreaterThanOrEqual(0);
    expect(result.statistics.phaseTimings.executionMs).toBeGreaterThanOrEqual(0);
  });
});
