/**
 * Canonical Template Engine (CTE) - Release R08
 * CandidateClusterEngine
 *
 * Core Responsibilities:
 * 1. Automatic Candidate Clustering: Group similar templates into evolutionary clusters.
 * 2. Structural Evolution Reporting: Compare candidate against canonical templates and generate
 *    a detailed TemplateEvolutionReport (source, candidate, similarity%, geometric & structural deltas, classification).
 * 3. Variant vs New Template Decision:
 *    - EXACT -> Identical to known template (BIND_EXISTING)
 *    - SIMILAR / DERIVED -> Structural variant of existing template family (CREATE_VARIANT_IN_CLUSTER)
 *    - UNKNOWN -> Brand new template family (CREATE_NEW_CLUSTER)
 * 4. Cluster Management: Integrates with ClusterRegistry and CanonicalTemplateRegistry.
 */

import {
  CanonicalDocumentFingerprint,
  TemplateVersion,
  TemplateEvolutionReport,
  ClusteringOptions,
  StructuralSimilarityClassification,
  StructuralDifferenceResult,
} from '../types';
import { StructuralDifferenceAnalyzer } from './structuralDifferenceAnalyzer';
import { ClusterRegistry } from './clusterRegistry';
import { CanonicalTemplateRegistry } from '../catalog/canonicalRegistry';

export interface CandidateEvaluationOptions extends ClusteringOptions {
  sourceTemplate?: TemplateVersion;
  clusterId?: string;
  sourceTemplateId?: string;
}

export class CandidateClusterEngine {
  private diffAnalyzer: StructuralDifferenceAnalyzer;
  private clusterRegistry: ClusterRegistry;
  private options: Required<ClusteringOptions>;

  constructor(
    clusterRegistry?: ClusterRegistry,
    diffAnalyzer?: StructuralDifferenceAnalyzer,
    options?: ClusteringOptions
  ) {
    this.clusterRegistry = clusterRegistry || new ClusterRegistry();
    this.diffAnalyzer = diffAnalyzer || new StructuralDifferenceAnalyzer();
    this.options = {
      similarityThresholdExact: options?.similarityThresholdExact ?? 98.0,
      similarityThresholdSimilar: options?.similarityThresholdSimilar ?? 80.0,
      similarityThresholdDerived: options?.similarityThresholdDerived ?? 50.0,
      autoCreateCluster: options?.autoCreateCluster ?? true,
    };
  }

  /**
   * Returns the underlying ClusterRegistry.
   */
  public getClusterRegistry(): ClusterRegistry {
    return this.clusterRegistry;
  }

  /**
   * Returns the underlying StructuralDifferenceAnalyzer.
   */
  public getDifferenceAnalyzer(): StructuralDifferenceAnalyzer {
    return this.diffAnalyzer;
  }

  /**
   * Evaluates a candidate fingerprint or TemplateVersion against a source template.
   * Generates a detailed TemplateEvolutionReport.
   */
  public evaluateEvolution(
    source: TemplateVersion | CanonicalDocumentFingerprint,
    candidate: TemplateVersion | CanonicalDocumentFingerprint,
    options?: CandidateEvaluationOptions
  ): TemplateEvolutionReport {
    const sourceFp: CanonicalDocumentFingerprint = 'fingerprint' in source && typeof source.fingerprint === 'object'
      ? source.fingerprint
      : (source as CanonicalDocumentFingerprint);

    const candidateFp: CanonicalDocumentFingerprint = 'fingerprint' in candidate && typeof candidate.fingerprint === 'object'
      ? candidate.fingerprint
      : (candidate as CanonicalDocumentFingerprint);

    const sourceVersion = 'versioneMinisteriale' in source ? (source as TemplateVersion) : undefined;
    const candidateVersion = 'versioneMinisteriale' in candidate ? (candidate as TemplateVersion) : undefined;

    const diffResult: StructuralDifferenceResult = this.diffAnalyzer.analyze(sourceFp, candidateFp);

    const isIdentical = diffResult.classification === StructuralSimilarityClassification.EXACT;
    const isVariant =
      diffResult.classification === StructuralSimilarityClassification.SIMILAR ||
      diffResult.classification === StructuralSimilarityClassification.DERIVED;
    const isNew = diffResult.classification === StructuralSimilarityClassification.UNKNOWN;

    let suggestedAction: 'BIND_EXISTING' | 'CREATE_VARIANT_IN_CLUSTER' | 'CREATE_NEW_CLUSTER';
    if (isIdentical) {
      suggestedAction = 'BIND_EXISTING';
    } else if (isVariant) {
      suggestedAction = 'CREATE_VARIANT_IN_CLUSTER';
    } else {
      suggestedAction = 'CREATE_NEW_CLUSTER';
    }

    const diagnosticNotes: string[] = [];
    if (isIdentical) {
      diagnosticNotes.push('Struttura geometrica e layout identici al template sorgente.');
    } else if (diffResult.classification === StructuralSimilarityClassification.SIMILAR) {
      diagnosticNotes.push('Piccole variazioni strutturali rilevate (variante minore / aggiornamento impaginazione).');
    } else if (diffResult.classification === StructuralSimilarityClassification.DERIVED) {
      diagnosticNotes.push('Modifiche strutturali significative rilevate (evoluzione / riforma ministeriale correlata).');
    } else {
      diagnosticNotes.push('Differenze strutturali incompatibili con il modello di riferimento (nuovo modello indipendente).');
    }

    if (diffResult.totalAddedBoxes > 0) {
      diagnosticNotes.push(`Rilevati ${diffResult.totalAddedBoxes} riquadri strutturali aggiuntivi.`);
    }
    if (diffResult.totalRemovedBoxes > 0) {
      diagnosticNotes.push(`Rilevati ${diffResult.totalRemovedBoxes} riquadri strutturali rimossi.`);
    }
    if (diffResult.totalShiftedBoxes > 0) {
      diagnosticNotes.push(`Rilevati ${diffResult.totalShiftedBoxes} riquadri strutturali traslati o ridimensionati.`);
    }
    if (diffResult.geometricDifferences.pageCountDelta !== 0) {
      diagnosticNotes.push(`Variazione numero pagine: delta = ${diffResult.geometricDifferences.pageCountDelta}.`);
    }

    const reportId = `EVO_REP_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const report: TemplateEvolutionReport = {
      id: reportId,
      createdAt: now,
      sourceTemplateId: sourceVersion?.id || options?.sourceTemplateId,
      sourceTemplateName: sourceVersion?.nome,
      sourceVersion: sourceVersion?.versioneMinisteriale || sourceVersion?.versione,
      candidateTemplateId: candidateVersion?.id,
      candidateTemplateName: candidateVersion?.nome,
      candidateVersion: candidateVersion?.versioneMinisteriale || candidateVersion?.versione,
      similarityPercentage: diffResult.similarityPercentage,
      classification: diffResult.classification,
      classificationLabel: this.getClassificationLabel(diffResult.classification),
      isVariantOfExisting: isVariant,
      isNewTemplate: isNew,
      isIdentical,
      suggestedAction,
      geometricDifferences: diffResult.geometricDifferences,
      structuralDifferences: {
        totalAddedBoxes: diffResult.totalAddedBoxes,
        totalRemovedBoxes: diffResult.totalRemovedBoxes,
        totalShiftedBoxes: diffResult.totalShiftedBoxes,
        pageCountDelta: diffResult.geometricDifferences.pageCountDelta,
        pageDifferences: diffResult.pageDifferences,
      },
      clusterId: options?.clusterId,
      diagnosticNotes,
      summary: diffResult.summary,
    };

    return report;
  }

  /**
   * Evaluates a candidate against an entire pool of templates (e.g. from CanonicalTemplateRegistry),
   * finds the best structural ancestor / counterpart, and clusters the candidate appropriately.
   */
  public clusterCandidate(
    candidate: TemplateVersion,
    templatePool: TemplateVersion[] | CanonicalTemplateRegistry,
    options?: CandidateEvaluationOptions
  ): {
    bestReport: TemplateEvolutionReport;
    assignedClusterId?: string;
    actionTaken: 'ATTACHED_TO_CLUSTER' | 'CREATED_NEW_CLUSTER' | 'BOUND_EXACT';
  } {
    const pool: TemplateVersion[] =
      templatePool instanceof CanonicalTemplateRegistry
        ? templatePool.getAll()
        : templatePool;

    // Filter out candidate itself if present in pool
    const candidatesToCompare = pool.filter(t => t.id !== candidate.id);

    if (candidatesToCompare.length === 0) {
      // First template: create new cluster
      const cluster = this.clusterRegistry.createCluster({
        nome: `Cluster ${candidate.nome || candidate.id}`,
        descrizione: `Cluster evolutivo per ${candidate.nome}`,
        ordineScolastico: candidate.ordineScolastico,
        baseTemplateId: candidate.id,
        tags: [candidate.ordineScolastico, 'evolution_family'],
      });

      const selfReport = this.evaluateEvolution(candidate, candidate, {
        clusterId: cluster.id,
        sourceTemplateId: candidate.id,
      });

      return {
        bestReport: selfReport,
        assignedClusterId: cluster.id,
        actionTaken: 'CREATED_NEW_CLUSTER',
      };
    }

    // Compare with all candidates in pool
    let bestScore = -1;
    let bestSource: TemplateVersion = candidatesToCompare[0];
    let bestReport: TemplateEvolutionReport | null = null;

    for (const source of candidatesToCompare) {
      const report = this.evaluateEvolution(source, candidate);
      if (report.similarityPercentage > bestScore) {
        bestScore = report.similarityPercentage;
        bestSource = source;
        bestReport = report;
      }
    }

    if (!bestReport) {
      bestReport = this.evaluateEvolution(candidatesToCompare[0], candidate);
      bestSource = candidatesToCompare[0];
    }

    // Decide clustering based on best classification
    let actionTaken: 'ATTACHED_TO_CLUSTER' | 'CREATED_NEW_CLUSTER' | 'BOUND_EXACT';
    let clusterId: string | undefined;

    if (bestReport.classification === StructuralSimilarityClassification.EXACT) {
      // Exact match
      actionTaken = 'BOUND_EXACT';
      let existingCluster = this.clusterRegistry.findClusterByTemplateId(bestSource.id);
      if (!existingCluster && (this.options.autoCreateCluster || options?.autoCreateCluster)) {
        existingCluster = this.clusterRegistry.createCluster({
          nome: `Cluster ${bestSource.ordineScolastico || bestSource.nome}`,
          descrizione: `Famiglia evolutiva ${bestSource.nome}`,
          ordineScolastico: bestSource.ordineScolastico,
          baseTemplateId: bestSource.id,
          initialTemplateIds: [bestSource.id, candidate.id],
        });
      } else if (existingCluster) {
        this.clusterRegistry.addTemplateToCluster(existingCluster.id, candidate.id);
      }
      clusterId = existingCluster?.id;
    } else if (
      bestReport.classification === StructuralSimilarityClassification.SIMILAR ||
      bestReport.classification === StructuralSimilarityClassification.DERIVED
    ) {
      // Evolutionary variant -> attach to ancestor's cluster or create new cluster containing both
      actionTaken = 'ATTACHED_TO_CLUSTER';
      let existingCluster = this.clusterRegistry.findClusterByTemplateId(bestSource.id);

      if (!existingCluster && (this.options.autoCreateCluster || options?.autoCreateCluster)) {
        existingCluster = this.clusterRegistry.createCluster({
          nome: `Cluster ${bestSource.ordineScolastico || bestSource.nome}`,
          descrizione: `Famiglia evolutiva PEI ${bestSource.ordineScolastico}`,
          ordineScolastico: bestSource.ordineScolastico,
          baseTemplateId: bestSource.id,
          initialTemplateIds: [bestSource.id, candidate.id],
        });
      } else if (existingCluster) {
        this.clusterRegistry.addTemplateToCluster(existingCluster.id, candidate.id);
      }

      clusterId = existingCluster?.id;
    } else {
      // UNKNOWN -> brand new cluster
      actionTaken = 'CREATED_NEW_CLUSTER';
      if (this.options.autoCreateCluster || options?.autoCreateCluster) {
        const newCluster = this.clusterRegistry.createCluster({
          nome: `Cluster ${candidate.nome || candidate.id}`,
          descrizione: `Nuovo ceppo template per ${candidate.nome}`,
          ordineScolastico: candidate.ordineScolastico,
          baseTemplateId: candidate.id,
        });
        clusterId = newCluster.id;
      }
    }

    bestReport.clusterId = clusterId;

    return {
      bestReport,
      assignedClusterId: clusterId,
      actionTaken,
    };
  }

  /**
   * Automatically clusters an array of templates into coherent evolutionary families.
   */
  public autoClusterAll(templates: TemplateVersion[]): ClusterRegistry {
    this.clusterRegistry.clear();
    const processed: TemplateVersion[] = [];

    for (const t of templates) {
      if (processed.length === 0) {
        this.clusterRegistry.createCluster({
          nome: `Cluster ${t.ordineScolastico ? t.ordineScolastico.toUpperCase() : t.nome}`,
          descrizione: `Famiglia evolutiva ${t.nome}`,
          ordineScolastico: t.ordineScolastico,
          baseTemplateId: t.id,
          initialTemplateIds: [t.id],
        });
      } else {
        this.clusterCandidate(t, processed);
      }
      processed.push(t);
    }

    return this.clusterRegistry;
  }

  private getClassificationLabel(classification: StructuralSimilarityClassification): string {
    switch (classification) {
      case StructuralSimilarityClassification.EXACT:
        return 'Modello Identico (100% Corrispondenza Strutturale)';
      case StructuralSimilarityClassification.SIMILAR:
        return 'Variante Minore (Alta Similarità Strutturale)';
      case StructuralSimilarityClassification.DERIVED:
        return 'Variante Evolutiva (Modello Derivato / Riforma)';
      case StructuralSimilarityClassification.UNKNOWN:
      default:
        return 'Nuovo Modello Strutturale Non Correlato';
    }
  }
}
