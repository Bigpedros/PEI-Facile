/**
 * Canonical Template Engine (CTE) - Release R08 Test Suite
 * Candidate Clustering & Structural Evolution Engine
 *
 * Verifies:
 * TEST 1: Template identici.
 * TEST 2: Template con piccole modifiche.
 * TEST 3: Template con modifiche importanti.
 * TEST 4: Template completamente differente.
 * TEST 5: Creazione automatica del Cluster.
 * TEST 6: Assegnazione corretta al Cluster.
 * TEST 7: Generazione Evolution Report.
 * TEST 8: Compatibilità completa con R07.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  StructuralDifferenceAnalyzer,
  ClusterRegistry,
  CandidateClusterEngine,
} from '../clustering';
import {
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
  TemplateVersion,
  StructuralSimilarityClassification,
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
  pageMutator?: (index: number) => Partial<Parameters<typeof createSyntheticPageFingerprint>[1]>
): CanonicalDocumentFingerprint {
  const pages: CanonicalPageFingerprint[] = [];
  for (let i = 0; i < pageCount; i++) {
    const extra = pageMutator ? pageMutator(i) : {};
    pages.push(
      createSyntheticPageFingerprint(i, {
        textCount: 100 + i * 20,
        structureHash: `sh_${i}_${salt}`,
        ...extra,
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
      overallGeometryScore: 98.0,
      overallConfidence: 0.98,
      pages: [],
      diagnosticSummary: 'Geometric analysis ok',
    },
  };
}

describe('Canonical Template Engine (CTE) - Release R08 Candidate Clustering & Structural Evolution Engine', () => {
  let diffAnalyzer: StructuralDifferenceAnalyzer;
  let clusterRegistry: ClusterRegistry;
  let clusterEngine: CandidateClusterEngine;
  let templateRegistry: CanonicalTemplateRegistry;

  beforeEach(() => {
    diffAnalyzer = new StructuralDifferenceAnalyzer();
    clusterRegistry = new ClusterRegistry();
    clusterEngine = new CandidateClusterEngine(clusterRegistry, diffAnalyzer);
    templateRegistry = new CanonicalTemplateRegistry();
  });

  // =========================================================================
  // TEST 1: Template identici
  // =========================================================================
  it('TEST 1: Template identici producono classificazione EXACT e 100% similarità', () => {
    const fpSource = createSyntheticFingerprint(12, 'primaria_base');
    const fpCandidate = createSyntheticFingerprint(12, 'primaria_base');

    const diffResult = diffAnalyzer.analyze(fpSource, fpCandidate);

    expect(diffResult.similarityPercentage).toBe(100);
    expect(diffResult.classification).toBe(StructuralSimilarityClassification.EXACT);
    expect(diffResult.totalAddedBoxes).toBe(0);
    expect(diffResult.totalRemovedBoxes).toBe(0);
    expect(diffResult.totalShiftedBoxes).toBe(0);
    expect(diffResult.layoutShiftScore).toBe(0);
    expect(diffResult.contentPreservationScore).toBe(100);

    const report = clusterEngine.evaluateEvolution(fpSource, fpCandidate);
    expect(report.isIdentical).toBe(true);
    expect(report.isVariantOfExisting).toBe(false);
    expect(report.isNewTemplate).toBe(false);
    expect(report.suggestedAction).toBe('BIND_EXISTING');
    expect(report.similarityPercentage).toBe(100);
  });

  // =========================================================================
  // TEST 2: Template con piccole modifiche
  // =========================================================================
  it('TEST 2: Template con piccole modifiche produce classificazione SIMILAR e rileva spostamenti/aggiunte', () => {
    const fpSource = createSyntheticFingerprint(10, 'base');
    // Candidate with small variations in 2 pages (slightly more text objects / vector objects)
    const fpCandidate = createSyntheticFingerprint(10, 'minor_variant', i => {
      if (i === 1 || i === 2) {
        return { textCount: 115, vectorCount: 15 };
      }
      return {};
    });

    const diffResult = diffAnalyzer.analyze(fpSource, fpCandidate);

    expect(diffResult.similarityPercentage).toBeGreaterThanOrEqual(80);
    expect(diffResult.similarityPercentage).toBeLessThan(100);
    expect(diffResult.classification).toBe(StructuralSimilarityClassification.SIMILAR);

    const report = clusterEngine.evaluateEvolution(fpSource, fpCandidate);
    expect(report.isIdentical).toBe(false);
    expect(report.isVariantOfExisting).toBe(true);
    expect(report.isNewTemplate).toBe(false);
    expect(report.suggestedAction).toBe('CREATE_VARIANT_IN_CLUSTER');
  });

  // =========================================================================
  // TEST 3: Template con modifiche importanti
  // =========================================================================
  it('TEST 3: Template con modifiche importanti produce classificazione DERIVED', () => {
    const fpSource = createSyntheticFingerprint(12, 'riforma_2024');
    // Significant structural shift (e.g. 14 pages, major vector & text changes across all pages)
    const fpCandidate = createSyntheticFingerprint(14, 'riforma_2027', i => ({
      textCount: 180 + i * 15,
      vectorCount: 25 + i * 2,
    }));

    const diffResult = diffAnalyzer.analyze(fpSource, fpCandidate);

    expect(diffResult.similarityPercentage).toBeGreaterThanOrEqual(50);
    expect(diffResult.similarityPercentage).toBeLessThan(80);
    expect(diffResult.classification).toBe(StructuralSimilarityClassification.DERIVED);
    expect(diffResult.geometricDifferences.pageCountDelta).toBe(2);

    const report = clusterEngine.evaluateEvolution(fpSource, fpCandidate);
    expect(report.isVariantOfExisting).toBe(true);
    expect(report.isNewTemplate).toBe(false);
    expect(report.suggestedAction).toBe('CREATE_VARIANT_IN_CLUSTER');
    expect(report.structuralDifferences.pageCountDelta).toBe(2);
  });

  // =========================================================================
  // TEST 4: Template completamente differente
  // =========================================================================
  it('TEST 4: Template completamente differente produce classificazione UNKNOWN', () => {
    const fpSource = createSyntheticFingerprint(12, 'infanzia');
    // Completely different page count and structure
    const fpDifferent = createSyntheticFingerprint(3, 'verbale_gloo', i => ({
      textCount: 500 + i * 100,
      vectorCount: 80,
      width: 841.89, // Landscape dimensions
      height: 595.28,
    }));

    const diffResult = diffAnalyzer.analyze(fpSource, fpDifferent);

    expect(diffResult.similarityPercentage).toBeLessThan(50);
    expect(diffResult.classification).toBe(StructuralSimilarityClassification.UNKNOWN);

    const report = clusterEngine.evaluateEvolution(fpSource, fpDifferent);
    expect(report.isVariantOfExisting).toBe(false);
    expect(report.isNewTemplate).toBe(true);
    expect(report.suggestedAction).toBe('CREATE_NEW_CLUSTER');
  });

  // =========================================================================
  // TEST 5: Creazione automatica del Cluster
  // =========================================================================
  it('TEST 5: Creazione automatica del Cluster da parte di ClusterRegistry', () => {
    const cluster = clusterRegistry.createCluster({
      id: 'CLUSTER_PEI_PRIMARIA',
      nome: 'Famiglia PEI Scuola Primaria',
      descrizione: 'Cluster evolutivo modelli nazionali primaria',
      ordineScolastico: 'primaria',
      baseTemplateId: 'PEI_PRIMARIA_2024',
      tags: ['primaria', 'ministeriale'],
    });

    expect(cluster.id).toBe('CLUSTER_PEI_PRIMARIA');
    expect(cluster.baseTemplateId).toBe('PEI_PRIMARIA_2024');
    expect(cluster.templateIds).toContain('PEI_PRIMARIA_2024');
    expect(clusterRegistry.count()).toBe(1);
    expect(clusterRegistry.hasCluster('CLUSTER_PEI_PRIMARIA')).toBe(true);

    const found = clusterRegistry.findClusterByTemplateId('PEI_PRIMARIA_2024');
    expect(found).toBeDefined();
    expect(found?.nome).toBe('Famiglia PEI Scuola Primaria');
  });

  // =========================================================================
  // TEST 6: Assegnazione corretta al Cluster (Evoluzione Primaria 2024 -> 2027 -> 2030)
  // =========================================================================
  it('TEST 6: Assegnazione corretta di multiple versioni evolutive allo stesso Cluster', () => {
    const v2024: TemplateVersion = {
      id: 'PEI_PRIMARIA_2024',
      nome: 'PEI Primaria 2024',
      descrizione: 'Edizione D.I. 153/2023',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2024',
      versione: '2024',
      annoValidita: 2024,
      hash: 'h_2024',
      fingerprint: createSyntheticFingerprint(12, 'primaria_2024'),
      geometry: { overallGeometryScore: 98 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const v2027: TemplateVersion = {
      id: 'PEI_PRIMARIA_2027',
      nome: 'PEI Primaria 2027',
      descrizione: 'Riforma 2027',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2027',
      versione: '2027',
      annoValidita: 2027,
      hash: 'h_2027',
      fingerprint: createSyntheticFingerprint(12, 'primaria_2027', i => ({
        textCount: 110 + i * 20, // small evolution
      })),
      geometry: { overallGeometryScore: 97 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const v2030: TemplateVersion = {
      id: 'PEI_PRIMARIA_2030',
      nome: 'PEI Primaria 2030',
      descrizione: 'Riforma 2030',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2030',
      versione: '2030',
      annoValidita: 2030,
      hash: 'h_2030',
      fingerprint: createSyntheticFingerprint(13, 'primaria_2030', i => ({
        textCount: 120 + i * 20, // further evolution
      })),
      geometry: { overallGeometryScore: 96 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    // Auto cluster all three versions
    const pool = [v2024, v2027, v2030];
    const clusteredReg = clusterEngine.autoClusterAll(pool);

    expect(clusteredReg.count()).toBeGreaterThanOrEqual(1);

    // All templates must map to an evolutionary cluster
    const c2024 = clusteredReg.findClusterByTemplateId('PEI_PRIMARIA_2024');
    const c2027 = clusteredReg.findClusterByTemplateId('PEI_PRIMARIA_2027');
    const c2030 = clusteredReg.findClusterByTemplateId('PEI_PRIMARIA_2030');

    expect(c2024).toBeDefined();
    expect(c2027).toBeDefined();
    expect(c2030).toBeDefined();

    // 2024 and 2027 are in the same cluster
    expect(c2024?.id).toBe(c2027?.id);
    expect(c2024?.templateIds).toContain('PEI_PRIMARIA_2024');
    expect(c2024?.templateIds).toContain('PEI_PRIMARIA_2027');
  });

  // =========================================================================
  // TEST 7: Generazione Evolution Report
  // =========================================================================
  it('TEST 7: Generazione completa di TemplateEvolutionReport con tutte le metriche strutturali', () => {
    const vSource: TemplateVersion = {
      id: 'SRC_INFANZIA_A1',
      nome: 'PEI Infanzia A1 Modello Nazionale',
      descrizione: 'Modello Sorgente',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'v1.0',
      versione: 'v1.0',
      annoValidita: 2024,
      hash: 'h_infanzia_src',
      fingerprint: createSyntheticFingerprint(12, 'infanzia_orig'),
      geometry: { overallGeometryScore: 99 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const vCandidate: TemplateVersion = {
      id: 'CAND_INFANZIA_REV',
      nome: 'PEI Infanzia Revisione Regionale',
      descrizione: 'Modello Candidato con lievi modifiche',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'v1.1',
      versione: 'v1.1',
      annoValidita: 2025,
      hash: 'h_infanzia_cand',
      fingerprint: createSyntheticFingerprint(12, 'infanzia_rev', i => {
        if (i === 0) return { textCount: 140, vectorCount: 18 };
        return {};
      }),
      geometry: { overallGeometryScore: 98 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const report = clusterEngine.evaluateEvolution(vSource, vCandidate);

    expect(report).toBeDefined();
    expect(report.id).toMatch(/^EVO_REP_/);
    expect(report.sourceTemplateId).toBe('SRC_INFANZIA_A1');
    expect(report.sourceTemplateName).toBe('PEI Infanzia A1 Modello Nazionale');
    expect(report.candidateTemplateId).toBe('CAND_INFANZIA_REV');
    expect(report.candidateTemplateName).toBe('PEI Infanzia Revisione Regionale');
    expect(report.similarityPercentage).toBeGreaterThanOrEqual(80);
    expect(report.classification).toBe(StructuralSimilarityClassification.SIMILAR);
    expect(report.classificationLabel).toBeDefined();
    expect(report.geometricDifferences).toBeDefined();
    expect(report.structuralDifferences).toBeDefined();
    expect(report.structuralDifferences.pageDifferences).toHaveLength(12);
    expect(report.diagnosticNotes.length).toBeGreaterThan(0);
    expect(report.summary).toContain('Analisi strutturale completata');
  });

  // =========================================================================
  // TEST 8: Compatibilità completa con R07
  // =========================================================================
  it('TEST 8: Compatibilità completa con R07 (CanonicalTemplateRegistry e Catalog)', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const analyzer = new PdfDocumentAnalyzer();
    const analysis = await analyzer.analyze(buffer);

    const ministerialModel: TemplateVersion = {
      id: 'MINISTERIAL_A1_OFFICIAL',
      nome: "PEI Infanzia Ufficiale Ministero",
      descrizione: 'Modello acquisito da PDF reale',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'D.I. 153/2023',
      versione: 'D.I. 153/2023',
      annoValidita: 2024,
      hash: 'hash_official_a1',
      fingerprint: analysis.structuralFingerprint,
      geometry: analysis.geometricAnalysis!,
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    templateRegistry.register(ministerialModel);
    expect(templateRegistry.has('MINISTERIAL_A1_OFFICIAL')).toBe(true);

    const catalog = new CanonicalTemplateCatalog(undefined, undefined, templateRegistry);
    expect(catalog.has('MINISTERIAL_A1_OFFICIAL')).toBe(true);

    // Clustering with the registered model
    const candidateEvaluation = clusterEngine.clusterCandidate(
      ministerialModel,
      templateRegistry
    );

    expect(candidateEvaluation).toBeDefined();
    expect(candidateEvaluation.bestReport.similarityPercentage).toBe(100);
    expect(candidateEvaluation.assignedClusterId).toBeDefined();

    const cluster = clusterRegistry.findClusterByTemplateId('MINISTERIAL_A1_OFFICIAL');
    expect(cluster).toBeDefined();
    expect(cluster?.baseTemplateId).toBe('MINISTERIAL_A1_OFFICIAL');
  });
});
