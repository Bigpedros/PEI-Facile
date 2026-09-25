/**
 * Canonical Template Engine (CTE) - Release R09
 * DecisionPolicy
 *
 * Core Responsibilities:
 * 1. Encapsulates deterministic rules and configurable thresholds for decision classification.
 * 2. Strictly separates policy configuration from decision engine algorithm.
 * 3. Evaluates decisions without AI, machine learning, or neural networks.
 */

import {
  CteDecision,
  CteDecisionPolicyConfig,
  CteDecisionContext,
} from '../types';

export const DEFAULT_DECISION_POLICY_CONFIG: Required<CteDecisionPolicyConfig> = {
  bindCanonicalThreshold: 99.0,
  normalizeThreshold: 90.0,
  registerVariantThreshold: 75.0,
  minConfidenceThreshold: 0.40,
  minGeometryScoreThreshold: 30.0,
  minPagesRequired: 1,
  requireCoherentGeometry: true,
};

export class DecisionPolicy {
  private config: Required<CteDecisionPolicyConfig>;

  constructor(customConfig?: CteDecisionPolicyConfig) {
    this.config = {
      ...DEFAULT_DECISION_POLICY_CONFIG,
      ...customConfig,
    };
  }

  /**
   * Returns a copy of the current policy configuration.
   */
  public getConfig(): Required<CteDecisionPolicyConfig> {
    return { ...this.config };
  }

  /**
   * Updates policy configuration thresholds.
   */
  public updateConfig(newConfig: Partial<CteDecisionPolicyConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  /**
   * Evaluates the decision classification based deterministically on the provided context.
   */
  public evaluate(context: CteDecisionContext): {
    decision: CteDecision;
    reasons: string[];
    similarityPercentage: number;
    effectiveConfidence: number;
  } {
    const reasons: string[] = [];
    const fp = context.candidateFingerprint;

    // 1. REJECT checks: Document validity & minimal thresholds
    if (!fp || !fp.pages || fp.pageCount < this.config.minPagesRequired) {
      reasons.push(
        `Documento rifiutato: numero di pagine (${fp?.pageCount ?? 0}) inferiore al minimo richiesto (${this.config.minPagesRequired}).`
      );
      return {
        decision: CteDecision.REJECT,
        reasons,
        similarityPercentage: 0,
        effectiveConfidence: 0,
      };
    }

    const geoScore = fp.geometricAnalysis?.overallGeometryScore ?? 100;
    if (geoScore < this.config.minGeometryScoreThreshold) {
      reasons.push(
        `Documento rifiutato: punteggio geometrico insufficiente (${geoScore} < soglia ${this.config.minGeometryScoreThreshold}).`
      );
      return {
        decision: CteDecision.REJECT,
        reasons,
        similarityPercentage: 0,
        effectiveConfidence: 0.1,
      };
    }

    const confidence =
      context.confidence ??
      fp.geometricAnalysis?.overallConfidence ??
      context.bestMatchResult?.confidence ??
      0.95;

    if (confidence < this.config.minConfidenceThreshold) {
      reasons.push(
        `Documento rifiutato: livello di confidenza globale insufficiente (${(confidence * 100).toFixed(1)}% < soglia ${(this.config.minConfidenceThreshold * 100).toFixed(1)}%).`
      );
      return {
        decision: CteDecision.REJECT,
        reasons,
        similarityPercentage: 0,
        effectiveConfidence: confidence,
      };
    }

    // 2. Similarity resolution
    let similarity = context.similarityPercentage;
    if (similarity === undefined || similarity === null) {
      if (context.evolutionReport) {
        similarity = context.evolutionReport.similarityPercentage;
      } else if (context.bestMatchResult) {
        similarity = context.bestMatchResult.similarityScore;
      } else {
        similarity = 0;
      }
    }

    // 3. Deterministic decision branching based on thresholds
    if (similarity >= this.config.bindCanonicalThreshold) {
      reasons.push(
        `Corrispondenza strutturale eccellente (${similarity.toFixed(1)}% >= soglia ${this.config.bindCanonicalThreshold}%). Associazione diretta al template canonico.`
      );
      return {
        decision: CteDecision.BIND_CANONICAL,
        reasons,
        similarityPercentage: similarity,
        effectiveConfidence: confidence,
      };
    }

    if (similarity >= this.config.normalizeThreshold) {
      reasons.push(
        `Corrispondenza strutturale elevata con lievi disallineamenti (${similarity.toFixed(1)}% in intervallo ${this.config.normalizeThreshold}% - ${this.config.bindCanonicalThreshold}%). Richiesta normalizzazione verso il template di riferimento.`
      );
      return {
        decision: CteDecision.NORMALIZE_TO_TEMPLATE,
        reasons,
        similarityPercentage: similarity,
        effectiveConfidence: confidence,
      };
    }

    if (similarity >= this.config.registerVariantThreshold) {
      reasons.push(
        `Variazioni strutturali significative compatibili con una nuova variante (${similarity.toFixed(1)}% in intervallo ${this.config.registerVariantThreshold}% - ${this.config.normalizeThreshold}%). Registrazione nuova variante nel cluster di appartenenza.`
      );
      return {
        decision: CteDecision.REGISTER_VARIANT,
        reasons,
        similarityPercentage: similarity,
        effectiveConfidence: confidence,
      };
    }

    // Similarity < registerVariantThreshold
    reasons.push(
      `Similarità strutturale inferiore alla soglia di derivazione (${similarity.toFixed(1)}% < ${this.config.registerVariantThreshold}%). Nessun template antenato compatibile: creazione nuovo cluster evolutivo.`
    );
    return {
      decision: CteDecision.CREATE_NEW_CLUSTER,
      reasons,
      similarityPercentage: similarity,
      effectiveConfidence: confidence,
    };
  }
}
