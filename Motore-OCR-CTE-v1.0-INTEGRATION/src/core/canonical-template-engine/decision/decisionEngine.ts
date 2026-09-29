/**
 * Canonical Template Engine (CTE) - Release R09
 * DecisionEngine
 *
 * Core Responsibilities:
 * 1. Takes all contextual inputs (Best Match, Similarity, Cluster, Evolution Report, Confidence)
 *    and produces a deterministic CteDecision and comprehensive CteDecisionReport.
 * 2. Employs DecisionPolicy to isolate policy thresholds and rules from algorithm execution.
 * 3. Utilizes ActionPlanner to generate the operational Action Plan for Release R10.
 * 4. Strictly deterministic: NO AI, NO ML, NO OCR, NO document alterations.
 */

import {
  CteDecision,
  CteDecisionContext,
  CteDecisionReport,
  CteDecisionPolicyConfig,
  TemplateMatchResult,
  TemplateEvolutionReport,
  TemplateCluster,
  TemplateVersion,
  CanonicalDocumentFingerprint,
} from '../types';
import { DecisionPolicy, DEFAULT_DECISION_POLICY_CONFIG } from './decisionPolicy';
import { ActionPlanner } from './actionPlanner';

export class DecisionEngine {
  private policy: DecisionPolicy;
  private actionPlanner: ActionPlanner;

  constructor(policyConfig?: CteDecisionPolicyConfig, actionPlanner?: ActionPlanner) {
    this.policy = new DecisionPolicy(policyConfig);
    this.actionPlanner = actionPlanner || new ActionPlanner();
  }

  /**
   * Returns the underlying DecisionPolicy instance.
   */
  public getPolicy(): DecisionPolicy {
    return this.policy;
  }

  /**
   * Returns the underlying ActionPlanner instance.
   */
  public getActionPlanner(): ActionPlanner {
    return this.actionPlanner;
  }

  /**
   * Updates policy configuration thresholds.
   */
  public configurePolicy(newConfig: Partial<CteDecisionPolicyConfig>): void {
    this.policy.updateConfig(newConfig);
  }

  /**
   * Main entry point: decides the action and generates a complete Decision Report.
   */
  public decide(context: CteDecisionContext): CteDecisionReport {
    // 1. Evaluate decision classification and reasons via DecisionPolicy
    const evaluation = this.policy.evaluate(context);

    // 2. Extract differences list from evolution report or match result
    const differences: string[] = [];
    if (context.evolutionReport) {
      const evo = context.evolutionReport;
      if (evo.structuralDifferences.totalAddedBoxes > 0) {
        differences.push(`Box strutturali aggiunti: ${evo.structuralDifferences.totalAddedBoxes}`);
      }
      if (evo.structuralDifferences.totalRemovedBoxes > 0) {
        differences.push(`Box strutturali rimossi: ${evo.structuralDifferences.totalRemovedBoxes}`);
      }
      if (evo.structuralDifferences.totalShiftedBoxes > 0) {
        differences.push(`Box strutturali traslati: ${evo.structuralDifferences.totalShiftedBoxes}`);
      }
      if (evo.geometricDifferences.pageCountDelta !== 0) {
        differences.push(`Delta numero pagine: ${evo.geometricDifferences.pageCountDelta}`);
      }
      if (Math.abs(evo.geometricDifferences.skewAngleDelta) > 0.05) {
        differences.push(`Disallineamento angolare (skew): ${evo.geometricDifferences.skewAngleDelta.toFixed(2)}°`);
      }
    } else if (context.bestMatchResult) {
      if (context.bestMatchResult.matchedPages < context.bestMatchResult.totalPages) {
        differences.push(`Discrepanza pagine: ${context.bestMatchResult.matchedPages}/${context.bestMatchResult.totalPages} pagine allineate.`);
      }
      if (context.bestMatchResult.similarityScore < 99) {
        differences.push(`Variazione strutturale complessiva: ${(100 - context.bestMatchResult.similarityScore).toFixed(1)}%`);
      }
    }

    if (context.diagnosticNotes) {
      for (const note of context.diagnosticNotes) {
        if (!differences.includes(note)) {
          differences.push(note);
        }
      }
    }

    // 3. Resolve template IDs and names
    const selectedTemplateId =
      context.targetTemplate?.id ||
      context.evolutionReport?.sourceTemplateId;

    const selectedTemplateName =
      context.targetTemplate?.nome ||
      context.evolutionReport?.sourceTemplateName;

    const sourceTemplateId =
      context.evolutionReport?.sourceTemplateId ||
      context.candidateTemplate?.id ||
      'ACQUIRED_DOCUMENT';

    const targetTemplateId = selectedTemplateId;

    const clusterId =
      context.cluster?.id ||
      context.evolutionReport?.clusterId;

    const clusterName =
      context.cluster?.nome;

    // 4. Generate Action Plan via ActionPlanner
    const actionPlan = this.actionPlanner.plan(evaluation.decision, context, {
      targetTemplateId,
      clusterId,
    });

    // 5. Determine user-friendly labels and operation descriptions
    const decisionLabel = this.getDecisionLabel(evaluation.decision);
    const suggestedOperation = this.getSuggestedOperation(
      evaluation.decision,
      selectedTemplateName || selectedTemplateId,
      clusterName || clusterId
    );

    const reportId = `DEC_REP_${evaluation.decision}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const summary = this.buildSummary(
      evaluation.decision,
      evaluation.similarityPercentage,
      evaluation.effectiveConfidence,
      selectedTemplateId,
      clusterId
    );

    return {
      id: reportId,
      createdAt: now,
      decision: evaluation.decision,
      decisionLabel,
      confidence: evaluation.effectiveConfidence,
      reasons: evaluation.reasons,
      clusterId,
      clusterName,
      selectedTemplateId,
      selectedTemplateName,
      sourceTemplateId,
      targetTemplateId,
      suggestedOperation,
      differences,
      similarityPercentage: evaluation.similarityPercentage,
      policyUsed: this.policy.getConfig(),
      actionPlan,
      summary,
    };
  }

  /**
   * Convenience overload taking separate components.
   */
  public evaluatePipeline(params: {
    candidateFingerprint: CanonicalDocumentFingerprint;
    bestMatch?: TemplateMatchResult | null;
    similarity?: number;
    cluster?: TemplateCluster | null;
    evolutionReport?: TemplateEvolutionReport | null;
    confidence?: number;
    candidateTemplate?: TemplateVersion | null;
    targetTemplate?: TemplateVersion | null;
  }): CteDecisionReport {
    return this.decide({
      candidateFingerprint: params.candidateFingerprint,
      bestMatchResult: params.bestMatch,
      similarityPercentage: params.similarity,
      cluster: params.cluster,
      evolutionReport: params.evolutionReport,
      confidence: params.confidence,
      candidateTemplate: params.candidateTemplate,
      targetTemplate: params.targetTemplate,
    });
  }

  private getDecisionLabel(decision: CteDecision): string {
    switch (decision) {
      case CteDecision.BIND_CANONICAL:
        return 'Associazione Canonica Diretta (Modello Identico)';
      case CteDecision.NORMALIZE_TO_TEMPLATE:
        return 'Normalizzazione Geometrica verso Template Esistente';
      case CteDecision.REGISTER_VARIANT:
        return 'Registrazione Nuova Variante nel Cluster';
      case CteDecision.CREATE_NEW_CLUSTER:
        return 'Creazione Nuovo Cluster per Famiglia Strutturale Autonoma';
      case CteDecision.REJECT:
      default:
        return 'Rifiuto Documento (Insufficiente o Non Classificabile)';
    }
  }

  private getSuggestedOperation(
    decision: CteDecision,
    templateName?: string,
    clusterName?: string
  ): string {
    switch (decision) {
      case CteDecision.BIND_CANONICAL:
        return `Eseguire associazione diretta dei campi semantici sul modello canonico ${templateName || ''}.`;
      case CteDecision.NORMALIZE_TO_TEMPLATE:
        return `Applicare piano di normalizzazione per allineare la geometria al modello ${templateName || ''} prima dell'estrazione.`;
      case CteDecision.REGISTER_VARIANT:
        return `Salvare il layout come nuova variante ministeriale nel cluster ${clusterName || templateName || 'di appartenenza'}.`;
      case CteDecision.CREATE_NEW_CLUSTER:
        return 'Istituire una nuova famiglia di template e registrare il documento come modello capostipite.';
      case CteDecision.REJECT:
      default:
        return 'Richiedere nuova scansione o acquisizione del documento PDF a causa di qualità geometrica/confidenza insufficiente.';
    }
  }

  private buildSummary(
    decision: CteDecision,
    similarity: number,
    confidence: number,
    templateId?: string,
    clusterId?: string
  ): string {
    return (
      `Decisione CTE: ${decision} (${similarity.toFixed(1)}% similarità, ${(confidence * 100).toFixed(1)}% confidenza). ` +
      `Template target: ${templateId || 'N/A'}, Cluster: ${clusterId || 'N/A'}.`
    );
  }
}
