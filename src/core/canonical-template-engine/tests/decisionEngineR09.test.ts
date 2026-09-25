/**
 * Canonical Template Engine (CTE) - Release R09 Test Suite
 * Decision Engine & Action Planner
 *
 * Verifies:
 * TEST 1: Match perfetto -> BIND_CANONICAL
 * TEST 2: Template simile -> NORMALIZE_TO_TEMPLATE
 * TEST 3: Nuova variante -> REGISTER_VARIANT
 * TEST 4: Nuovo cluster -> CREATE_NEW_CLUSTER
 * TEST 5: Documento insufficiente -> REJECT
 * TEST 6: Decision Report completo.
 * TEST 7: Configurazione soglie personalizzate.
 * TEST 8: Compatibilità completa con R08.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  DecisionEngine,
  DecisionPolicy,
  ActionPlanner,
  DEFAULT_DECISION_POLICY_CONFIG,
} from '../decision';
import {
  CandidateClusterEngine,
  StructuralDifferenceAnalyzer,
  ClusterRegistry,
} from '../clustering';
import {
  CteDecision,
  CteDecisionContext,
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  TemplateVersion,
  TemplateMatchResult,
} from '../types';
import { CanonicalTemplateRegistry, CanonicalTemplateCatalog } from '../catalog';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
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

describe('Canonical Template Engine (CTE) - Release R09 Decision Engine & Action Planner', () => {
  let engine: DecisionEngine;
  let policy: DecisionPolicy;
  let planner: ActionPlanner;

  beforeEach(() => {
    policy = new DecisionPolicy();
    planner = new ActionPlanner();
    engine = new DecisionEngine();
  });

  // =========================================================================
  // TEST 1: Match perfetto -> BIND_CANONICAL
  // =========================================================================
  it('TEST 1: Match perfetto (Similarity >= 99%) determina BIND_CANONICAL e action plan diretto', () => {
    const fp = createSyntheticFingerprint(12, 'primaria_2024');

    const context: CteDecisionContext = {
      candidateFingerprint: fp,
      similarityPercentage: 100.0,
      confidence: 0.99,
      targetTemplate: {
        id: 'MOD_PRIMARIA_2024',
        nome: 'PEI Primaria 2024',
        descrizione: 'Modello Ufficiale Primaria',
        ordineScolastico: 'primaria',
        versioneMinisteriale: '2024',
        versione: '2024',
        annoValidita: 2024,
        hash: 'hash_prim_2024',
        fingerprint: fp,
        geometry: { overallGeometryScore: 99 },
        templateSchema: {},
        dataRegistrazione: new Date().toISOString(),
        stato: 'active',
      },
    };

    const report = engine.decide(context);

    expect(report.decision).toBe(CteDecision.BIND_CANONICAL);
    expect(report.confidence).toBe(0.99);
    expect(report.selectedTemplateId).toBe('MOD_PRIMARIA_2024');
    expect(report.actionPlan.readyForR10).toBe(true);
    expect(report.actionPlan.steps.length).toBeGreaterThanOrEqual(3);
    expect(report.actionPlan.steps[0].code).toBe('OPEN_CANONICAL_TEMPLATE');
    expect(report.actionPlan.steps[1].code).toBe('BIND_DIRECT_LAYOUT');
    expect(report.actionPlan.steps[2].code).toBe('HANDOVER_TO_R10');
    expect(report.reasons.some(r => r.includes('Associazione diretta'))).toBe(true);
  });

  // =========================================================================
  // TEST 2: Template simile -> NORMALIZE_TO_TEMPLATE
  // =========================================================================
  it('TEST 2: Template simile (Similarity 90-98%) determina NORMALIZE_TO_TEMPLATE', () => {
    const fp = createSyntheticFingerprint(12, 'primaria_skewed');

    const context: CteDecisionContext = {
      candidateFingerprint: fp,
      similarityPercentage: 94.5,
      confidence: 0.95,
      targetTemplate: {
        id: 'MOD_PRIMARIA_2024',
        nome: 'PEI Primaria 2024',
        descrizione: 'Modello Target',
        ordineScolastico: 'primaria',
        versioneMinisteriale: '2024',
        versione: '2024',
        annoValidita: 2024,
        hash: 'hash_prim_2024',
        fingerprint: fp,
        geometry: { overallGeometryScore: 98 },
        templateSchema: {},
        dataRegistrazione: new Date().toISOString(),
        stato: 'active',
      },
    };

    const report = engine.decide(context);

    expect(report.decision).toBe(CteDecision.NORMALIZE_TO_TEMPLATE);
    expect(report.similarityPercentage).toBe(94.5);
    expect(report.actionPlan.steps.some(s => s.code === 'BUILD_NORMALIZATION_PLAN')).toBe(true);
    expect(report.actionPlan.steps.some(s => s.code === 'PREPARE_NORMALIZATION_EXECUTION')).toBe(true);
    expect(report.suggestedOperation).toContain('normalizzazione');
  });

  // =========================================================================
  // TEST 3: Nuova variante -> REGISTER_VARIANT
  // =========================================================================
  it('TEST 3: Nuova variante (Similarity 75-89%) determina REGISTER_VARIANT', () => {
    const fp = createSyntheticFingerprint(13, 'primaria_riforma_2027');

    const context: CteDecisionContext = {
      candidateFingerprint: fp,
      similarityPercentage: 82.0,
      confidence: 0.92,
      cluster: {
        id: 'CLUSTER_PRIMARIA',
        nome: 'Cluster PEI Primaria',
        baseTemplateId: 'MOD_PRIMARIA_2024',
        templateIds: ['MOD_PRIMARIA_2024'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      targetTemplate: {
        id: 'MOD_PRIMARIA_2024',
        nome: 'PEI Primaria 2024',
        descrizione: 'Antenato di riferimento',
        ordineScolastico: 'primaria',
        versioneMinisteriale: '2024',
        versione: '2024',
        annoValidita: 2024,
        hash: 'hash_prim_2024',
        fingerprint: fp,
        geometry: { overallGeometryScore: 98 },
        templateSchema: {},
        dataRegistrazione: new Date().toISOString(),
        stato: 'active',
      },
    };

    const report = engine.decide(context);

    expect(report.decision).toBe(CteDecision.REGISTER_VARIANT);
    expect(report.clusterId).toBe('CLUSTER_PRIMARIA');
    expect(report.actionPlan.steps.some(s => s.code === 'CREATE_STRUCTURAL_VARIANT_SPEC')).toBe(true);
    expect(report.actionPlan.steps.some(s => s.code === 'REGISTER_VARIANT_IN_CATALOG')).toBe(true);
  });

  // =========================================================================
  // TEST 4: Nuovo cluster -> CREATE_NEW_CLUSTER
  // =========================================================================
  it('TEST 4: Nuovo cluster (Similarity < 75%) determina CREATE_NEW_CLUSTER', () => {
    const fp = createSyntheticFingerprint(4, 'verbale_nuovo_formato');

    const context: CteDecisionContext = {
      candidateFingerprint: fp,
      similarityPercentage: 42.0,
      confidence: 0.88,
    };

    const report = engine.decide(context);

    expect(report.decision).toBe(CteDecision.CREATE_NEW_CLUSTER);
    expect(report.actionPlan.steps.some(s => s.code === 'INITIALIZE_NEW_CLUSTER')).toBe(true);
    expect(report.actionPlan.steps.some(s => s.code === 'REGISTER_CANONICAL_ROOT_TEMPLATE')).toBe(true);
    expect(report.suggestedOperation).toContain('nuova famiglia');
  });

  // =========================================================================
  // TEST 5: Documento insufficiente -> REJECT
  // =========================================================================
  it('TEST 5: Documento insufficiente (pagine = 0 o confidenza < 0.40) determina REJECT', () => {
    // 5.1 Zero pages
    const emptyFp: CanonicalDocumentFingerprint = {
      pageCount: 0,
      pages: [],
      documentGeometryHash: 'none',
      documentStructureHash: 'none',
      fingerprint: 'none',
    };

    const reportEmpty = engine.decide({
      candidateFingerprint: emptyFp,
    });
    expect(reportEmpty.decision).toBe(CteDecision.REJECT);
    expect(reportEmpty.actionPlan.readyForR10).toBe(false);
    expect(reportEmpty.actionPlan.steps[0].code).toBe('HALT_PROCESSING_PIPELINE');

    // 5.2 Low confidence
    const lowConfFp = createSyntheticFingerprint(10, 'corrupt', 0.25);
    const reportLowConf = engine.decide({
      candidateFingerprint: lowConfFp,
      confidence: 0.25,
      similarityPercentage: 95.0,
    });
    expect(reportLowConf.decision).toBe(CteDecision.REJECT);
    expect(reportLowConf.reasons.some(r => r.includes('confidenza globale insufficiente'))).toBe(true);

    // 5.3 Low geometric score
    const lowGeoFp = createSyntheticFingerprint(10, 'bad_geo', 0.9, 15.0);
    const reportLowGeo = engine.decide({
      candidateFingerprint: lowGeoFp,
      similarityPercentage: 95.0,
    });
    expect(reportLowGeo.decision).toBe(CteDecision.REJECT);
    expect(reportLowGeo.reasons.some(r => r.includes('punteggio geometrico insufficiente'))).toBe(true);
  });

  // =========================================================================
  // TEST 6: Decision Report completo
  // =========================================================================
  it('TEST 6: Decision Report completo contiene tutte le metriche, piano operativo e motivazioni', () => {
    const fp = createSyntheticFingerprint(12, 'primaria_report_test');

    const report = engine.evaluatePipeline({
      candidateFingerprint: fp,
      similarity: 92.0,
      confidence: 0.96,
      targetTemplate: {
        id: 'MINISTERIAL_PRIMARIA',
        nome: 'PEI Primaria Ministeriale',
        descrizione: 'Modello Ufficiale',
        ordineScolastico: 'primaria',
        versioneMinisteriale: '2024',
        versione: '2024',
        annoValidita: 2024,
        hash: 'h_prim',
        fingerprint: fp,
        geometry: { overallGeometryScore: 98 },
        templateSchema: {},
        dataRegistrazione: new Date().toISOString(),
        stato: 'active',
      },
    });

    expect(report.id).toMatch(/^DEC_REP_/);
    expect(report.createdAt).toBeDefined();
    expect(report.decision).toBe(CteDecision.NORMALIZE_TO_TEMPLATE);
    expect(report.decisionLabel).toBeDefined();
    expect(report.confidence).toBe(0.96);
    expect(report.reasons.length).toBeGreaterThan(0);
    expect(report.selectedTemplateId).toBe('MINISTERIAL_PRIMARIA');
    expect(report.selectedTemplateName).toBe('PEI Primaria Ministeriale');
    expect(report.suggestedOperation).toBeDefined();
    expect(report.policyUsed).toEqual(DEFAULT_DECISION_POLICY_CONFIG);
    expect(report.actionPlan).toBeDefined();
    expect(report.actionPlan.totalSteps).toBe(4);
    expect(report.summary).toContain('Decisione CTE: NORMALIZE_TO_TEMPLATE');
  });

  // =========================================================================
  // TEST 7: Configurazione soglie personalizzate
  // =========================================================================
  it('TEST 7: Configurazione soglie personalizzate modifica deterministicamente la decisione senza toccare il codice', () => {
    const customEngine = new DecisionEngine({
      bindCanonicalThreshold: 95.0, // Stricter or relaxed
      normalizeThreshold: 85.0,
      registerVariantThreshold: 60.0,
    });

    const fp = createSyntheticFingerprint(10, 'custom_test');

    // With standard policy, 96.0% would be NORMALIZE_TO_TEMPLATE (standard >= 99% for BIND)
    // With custom policy (>= 95.0%), 96.0% becomes BIND_CANONICAL
    const report96 = customEngine.decide({
      candidateFingerprint: fp,
      similarityPercentage: 96.0,
      confidence: 0.95,
    });
    expect(report96.decision).toBe(CteDecision.BIND_CANONICAL);

    // 70% with custom policy (>= 60.0%) becomes REGISTER_VARIANT
    const report70 = customEngine.decide({
      candidateFingerprint: fp,
      similarityPercentage: 70.0,
      confidence: 0.95,
    });
    expect(report70.decision).toBe(CteDecision.REGISTER_VARIANT);

    // Dynamic policy update
    customEngine.configurePolicy({ bindCanonicalThreshold: 99.5 });
    const report96AfterUpdate = customEngine.decide({
      candidateFingerprint: fp,
      similarityPercentage: 96.0,
      confidence: 0.95,
    });
    expect(report96AfterUpdate.decision).toBe(CteDecision.NORMALIZE_TO_TEMPLATE);
  });

  // =========================================================================
  // TEST 8: Compatibilità completa con R08
  // =========================================================================
  it('TEST 8: Compatibilità completa con R08 (CandidateClusterEngine, StructuralDifferenceAnalyzer, ClusterRegistry)', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const analyzer = new PdfDocumentAnalyzer();
    const analysis = await analyzer.analyze(buffer);

    const clusterRegistry = new ClusterRegistry();
    const diffAnalyzer = new StructuralDifferenceAnalyzer();
    const clusterEngine = new CandidateClusterEngine(clusterRegistry, diffAnalyzer);
    const templateRegistry = new CanonicalTemplateRegistry();

    const ministerialModel: TemplateVersion = {
      id: 'MINISTERIAL_A1_INFANZIA',
      nome: 'PEI Infanzia A1',
      descrizione: 'Modello Ufficiale',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'D.I. 153/2023',
      versione: 'D.I. 153/2023',
      annoValidita: 2024,
      hash: 'hash_a1',
      fingerprint: analysis.structuralFingerprint,
      geometry: analysis.geometricAnalysis!,
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    templateRegistry.register(ministerialModel);
    const cluster = clusterRegistry.createCluster({
      nome: 'Cluster Infanzia',
      baseTemplateId: ministerialModel.id,
      ordineScolastico: 'infanzia',
    });

    // 1. R08 Evolution report
    const evolutionReport = clusterEngine.evaluateEvolution(
      ministerialModel,
      analysis.structuralFingerprint,
      { clusterId: cluster.id }
    );

    expect(evolutionReport.similarityPercentage).toBe(100);

    // 2. Feed R08 evolution report directly into R09 Decision Engine
    const decisionReport = engine.decide({
      candidateFingerprint: analysis.structuralFingerprint,
      evolutionReport,
      cluster,
      targetTemplate: ministerialModel,
      confidence: 0.99,
    });

    expect(decisionReport.decision).toBe(CteDecision.BIND_CANONICAL);
    expect(decisionReport.clusterId).toBe(cluster.id);
    expect(decisionReport.selectedTemplateId).toBe('MINISTERIAL_A1_INFANZIA');
    expect(decisionReport.actionPlan.readyForR10).toBe(true);
    expect(decisionReport.actionPlan.steps.length).toBe(3);
  });
});
