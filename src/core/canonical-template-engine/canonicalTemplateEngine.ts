/**
 * Canonical Template Engine (CTE) - Release R10
 * Pipeline Orchestrator (CanonicalTemplateEngine)
 *
 * The single public unified entry point for the entire Canonical Template Engine.
 * Integrates and orchestrates the complete lifecycle:
 *
 * Documento acquisito
 *       ↓
 * Fingerprint (R01, R02)
 *       ↓
 * Structural Matching (R03)
 *       ↓
 * Geometric Analysis (R04)
 *       ↓
 * Cluster Engine & Evolution (R08)
 *       ↓
 * Decision Engine & Action Planner (R09)
 *       ↓
 * Execution Engine (R10)
 *       ↓
 * Canonical Output (CanonicalExecutionResult)
 */

import {
  CanonicalExecutionResult,
  CteExecutionOptions,
  DocumentAnalysis,
  TemplateVersion,
  TemplateCluster,
  TemplateMatchResult,
  TemplateEvolutionReport,
  CteDecision,
  CteDecisionReport,
} from './types';
import { PdfDocumentAnalyzer } from './analyzer/pdfDocumentAnalyzer';
import { CanonicalTemplateMatcher } from './matcher/canonicalTemplateMatcher';
import { CanonicalTemplateRegistry, CanonicalTemplateCatalog } from './catalog';
import { StructuralDifferenceAnalyzer } from './clustering/structuralDifferenceAnalyzer';
import { ClusterRegistry } from './clustering/clusterRegistry';
import { CandidateClusterEngine } from './clustering/candidateClusterEngine';
import { DecisionEngine } from './decision/decisionEngine';
import { CanonicalExecutionEngine } from './execution/canonicalExecutionEngine';

export interface CanonicalTemplateEngineConfig {
  analyzer?: PdfDocumentAnalyzer;
  matchingEngine?: CanonicalTemplateMatcher;
  templateRegistry?: CanonicalTemplateRegistry;
  catalog?: CanonicalTemplateCatalog;
  diffAnalyzer?: StructuralDifferenceAnalyzer;
  clusterRegistry?: ClusterRegistry;
  clusterEngine?: CandidateClusterEngine;
  decisionEngine?: DecisionEngine;
  executionEngine?: CanonicalExecutionEngine;
}

export class CanonicalTemplateEngine {
  private static defaultInstance?: CanonicalTemplateEngine;

  private analyzer: PdfDocumentAnalyzer;
  private matchingEngine: CanonicalTemplateMatcher;
  private templateRegistry: CanonicalTemplateRegistry;
  private catalog: CanonicalTemplateCatalog;
  private diffAnalyzer: StructuralDifferenceAnalyzer;
  private clusterRegistry: ClusterRegistry;
  private clusterEngine: CandidateClusterEngine;
  private decisionEngine: DecisionEngine;
  private executionEngine: CanonicalExecutionEngine;

  constructor(config?: CanonicalTemplateEngineConfig) {
    this.analyzer = config?.analyzer || new PdfDocumentAnalyzer();
    this.matchingEngine = config?.matchingEngine || new CanonicalTemplateMatcher();
    this.templateRegistry = config?.templateRegistry || new CanonicalTemplateRegistry();
    this.catalog = config?.catalog || new CanonicalTemplateCatalog(undefined, this.matchingEngine, this.templateRegistry);
    this.diffAnalyzer = config?.diffAnalyzer || new StructuralDifferenceAnalyzer();
    this.clusterRegistry = config?.clusterRegistry || new ClusterRegistry();
    this.clusterEngine = config?.clusterEngine || new CandidateClusterEngine(this.clusterRegistry, this.diffAnalyzer);
    this.decisionEngine = config?.decisionEngine || new DecisionEngine();
    this.executionEngine = config?.executionEngine || new CanonicalExecutionEngine({
      templateRegistry: this.templateRegistry,
      clusterRegistry: this.clusterRegistry,
      catalog: this.catalog,
    });
  }

  /**
   * Returns the shared singleton instance of the CanonicalTemplateEngine.
   */
  public static getInstance(config?: CanonicalTemplateEngineConfig): CanonicalTemplateEngine {
    if (!CanonicalTemplateEngine.defaultInstance || config) {
      CanonicalTemplateEngine.defaultInstance = new CanonicalTemplateEngine(config);
    }
    return CanonicalTemplateEngine.defaultInstance;
  }

  /**
   * Static convenience entry point to execute the full pipeline on a PDF buffer.
   */
  public static async execute(
    pdfBuffer: ArrayBuffer,
    options?: CteExecutionOptions
  ): Promise<CanonicalExecutionResult> {
    const engine = CanonicalTemplateEngine.getInstance();
    return engine.execute(pdfBuffer, options);
  }

  // Registries and modules accessors
  public getTemplateRegistry(): CanonicalTemplateRegistry {
    return this.templateRegistry;
  }

  public getClusterRegistry(): ClusterRegistry {
    return this.clusterRegistry;
  }

  public getCatalog(): CanonicalTemplateCatalog {
    return this.catalog;
  }

  public getDecisionEngine(): DecisionEngine {
    return this.decisionEngine;
  }

  public getExecutionEngine(): CanonicalExecutionEngine {
    return this.executionEngine;
  }

  /**
   * Full end-to-end execution of the Canonical Template Engine pipeline.
   */
  public async execute(
    pdfBuffer: ArrayBuffer,
    options?: CteExecutionOptions
  ): Promise<CanonicalExecutionResult> {
    const totalStart = performance.now();
    const phaseTimings: Record<string, number> = {};

    // -----------------------------------------------------------------------
    // PHASE 1: Document Intake & Structural Analysis (R01, R02, R04)
    // -----------------------------------------------------------------------
    const t0 = performance.now();
    let analysis: DocumentAnalysis;
    try {
      analysis = await this.analyzer.analyze(new Uint8Array(pdfBuffer).slice().buffer);
    } catch (err: unknown) {
      // In case of unreadable / malformed buffer
      const errMsg = err instanceof Error ? err.message : String(err);
      const emptyFp = {
        pageCount: 0,
        pages: [],
        documentGeometryHash: 'corrupt',
        documentStructureHash: 'corrupt',
        fingerprint: 'corrupt',
      };
      analysis = {
        id: `corrupt_${Date.now()}`,
        sourceType: 'unknown',
        structuralFingerprint: emptyFp,
        totalPages: 0,
        pages: [],
        quality: {
          overallScore: 0,
          isAcceptable: false,
          averagePageQuality: 0,
          pageCount: 0,
          degradedPages: [],
          issues: [errMsg],
          recommendations: [],
          summary: errMsg,
        },
        fingerprint: 'corrupt',
        byteSize: pdfBuffer.byteLength,
        createdAt: new Date().toISOString(),
        status: 'failed',
        fonts: [],
        hasText: false,
        hasImages: false,
        hasRaster: false,
        hasVectors: false,
        metadata: {},
      };
    }
    phaseTimings.analysisMs = Math.round((performance.now() - t0) * 100) / 100;

    const candidateFingerprint = analysis.structuralFingerprint;

    // -----------------------------------------------------------------------
    // PHASE 2 & 3: Structural Matching against Registry & Catalog (R03, R07)
    // -----------------------------------------------------------------------
    const t1 = performance.now();
    let bestMatchResult: TemplateMatchResult | null = null;
    let targetTemplate: TemplateVersion | null = null;

    if (options?.targetTemplateId && this.templateRegistry.has(options.targetTemplateId)) {
      targetTemplate = this.templateRegistry.get(options.targetTemplateId) || null;
      if (targetTemplate) {
        bestMatchResult = this.matchingEngine.match(
          targetTemplate.fingerprint,
          candidateFingerprint
        );
      }
    } else {
      // Find best match in catalog
      const registered = this.templateRegistry.getAll();
      let highestScore = -1;

      for (const t of registered) {
        const match = this.matchingEngine.match(t.fingerprint, candidateFingerprint);
        if (match.similarityScore > highestScore) {
          highestScore = match.similarityScore;
          bestMatchResult = match;
          targetTemplate = t;
        }
      }
    }
    phaseTimings.matchingMs = Math.round((performance.now() - t1) * 100) / 100;

    // -----------------------------------------------------------------------
    // PHASE 4: Candidate Clustering & Evolution Analysis (R08)
    // -----------------------------------------------------------------------
    const t2 = performance.now();
    let evolutionReport: TemplateEvolutionReport | null = null;
    let cluster: TemplateCluster | null = null;

    if (targetTemplate) {
      cluster = this.clusterRegistry.findClusterByTemplateId(targetTemplate.id) || null;
      evolutionReport = this.clusterEngine.evaluateEvolution(
        targetTemplate,
        candidateFingerprint,
        { clusterId: cluster?.id }
      );
    }
    phaseTimings.clusteringMs = Math.round((performance.now() - t2) * 100) / 100;

    // -----------------------------------------------------------------------
    // PHASE 5: Decision Engine & Action Planner (R09)
    // -----------------------------------------------------------------------
    const t3 = performance.now();
    if (options?.policyConfig) {
      this.decisionEngine.configurePolicy(options.policyConfig);
    }

    let decisionReport: CteDecisionReport = this.decisionEngine.decide({
      candidateFingerprint,
      bestMatchResult,
      similarityPercentage: evolutionReport?.similarityPercentage ?? bestMatchResult?.similarityScore,
      evolutionReport,
      cluster,
      confidence:
        analysis.structuralFingerprint.geometricAnalysis?.overallConfidence ??
        (analysis.quality ? analysis.quality.overallScore / 100 : 0.95),
      targetTemplate,
    });

    // Support forceDecision override if explicitly requested
    if (options?.forceDecision && options.forceDecision !== decisionReport.decision) {
      const forcedPlan = this.decisionEngine.getActionPlanner().plan(options.forceDecision, {
        candidateFingerprint,
        bestMatchResult,
        evolutionReport,
        cluster,
        targetTemplate,
      });
      decisionReport = {
        ...decisionReport,
        decision: options.forceDecision,
        decisionLabel: `Forzatura: ${options.forceDecision}`,
        actionPlan: forcedPlan,
        summary: `Decisione forzata a ${options.forceDecision} per override applicativo.`,
      };
    }
    phaseTimings.decisionMs = Math.round((performance.now() - t3) * 100) / 100;

    // -----------------------------------------------------------------------
    // PHASE 6: Canonical Execution Engine (R10)
    // -----------------------------------------------------------------------
    phaseTimings.totalOrchestrationMs = Math.round((performance.now() - totalStart) * 100) / 100;

    return this.executionEngine.execute({
      sourceDocument: pdfBuffer,
      documentAnalysis: analysis,
      decisionReport,
      targetTemplate,
      cluster,
      phaseTimings,
    });
  }
}
