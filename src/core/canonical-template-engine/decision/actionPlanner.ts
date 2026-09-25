/**
 * Canonical Template Engine (CTE) - Release R09
 * ActionPlanner
 *
 * Core Responsibilities:
 * 1. Takes a determined CteDecision and context, and generates a structured operational action plan (CteActionPlan).
 * 2. Emits explicit, sequential execution steps for handoff to Release R10 without executing them.
 */

import {
  CteDecision,
  CteActionPlan,
  CteActionStep,
  CteDecisionContext,
} from '../types';

export class ActionPlanner {
  /**
   * Generates an actionable step-by-step plan for a given decision and context.
   */
  public plan(
    decision: CteDecision,
    context: CteDecisionContext,
    options?: { targetTemplateId?: string; clusterId?: string }
  ): CteActionPlan {
    const planId = `PLAN_${decision}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const steps: CteActionStep[] = [];
    const notes: string[] = [];

    const targetTemplateId =
      options?.targetTemplateId ||
      context.targetTemplate?.id ||
      context.evolutionReport?.sourceTemplateId;

    const clusterId =
      options?.clusterId ||
      context.cluster?.id ||
      context.evolutionReport?.clusterId;

    switch (decision) {
      case CteDecision.BIND_CANONICAL:
        steps.push({
          stepNumber: 1,
          code: 'OPEN_CANONICAL_TEMPLATE',
          name: 'Apertura Template Canonico',
          description: `Carica la definizione e lo schema del template canonico ${targetTemplateId || 'di riferimento'}.`,
          targetModule: 'CATALOG',
          payload: { targetTemplateId },
        });
        steps.push({
          stepNumber: 2,
          code: 'BIND_DIRECT_LAYOUT',
          name: 'Associazione Diretta Coordinate e Griglia',
          description: 'Collega direttamente le coordinate del documento acquisito con i campi semantici del template canonico senza modifiche geometriche.',
          targetModule: 'EXECUTION_R10',
          payload: { targetTemplateId, mode: 'DIRECT_BINDING' },
        });
        steps.push({
          stepNumber: 3,
          code: 'HANDOVER_TO_R10',
          name: 'Consegna al Modulo Esecutivo R10',
          description: 'Documento pronto per estrazione e compilazione PEI strutturata.',
          targetModule: 'EXECUTION_R10',
          payload: { readyForExtraction: true },
        });
        notes.push('Nessuna trasformazione geometrica o normalizzazione richiesta.');
        break;

      case CteDecision.NORMALIZE_TO_TEMPLATE:
        steps.push({
          stepNumber: 1,
          code: 'LOAD_TARGET_TEMPLATE',
          name: 'Caricamento Template Canonico Target',
          description: `Recupera la geometria e il fingerprint del template di riferimento ${targetTemplateId}.`,
          targetModule: 'CATALOG',
          payload: { targetTemplateId },
        });
        steps.push({
          stepNumber: 2,
          code: 'BUILD_NORMALIZATION_PLAN',
          name: 'Generazione Piano di Normalizzazione Geometrica',
          description: 'Calcola la matrice di trasformazione, correzione skew e riallineamento box rispetto al template canonico target.',
          targetModule: 'PLANNER',
          payload: {
            targetTemplateId,
            targetVersion: context.targetTemplate?.versioneMinisteriale,
          },
        });
        steps.push({
          stepNumber: 3,
          code: 'PREPARE_NORMALIZATION_EXECUTION',
          name: 'Predisposizione Pipeline di Esecuzione Normalizzazione',
          description: 'Configura la pipeline di trasformazione coordinate per la consegna a R10.',
          targetModule: 'NORMALIZER',
          payload: { targetTemplateId, executeOnR10: true },
        });
        steps.push({
          stepNumber: 4,
          code: 'HANDOVER_TO_R10',
          name: 'Consegna al Modulo Esecutivo R10',
          description: 'Pronto per esecuzione della normalizzazione e binding dei campi.',
          targetModule: 'EXECUTION_R10',
          payload: { requiresNormalization: true, targetTemplateId },
        });
        notes.push('Richiesta esecuzione del piano di normalizzazione per compensare scostamenti geometrici.');
        break;

      case CteDecision.REGISTER_VARIANT:
        steps.push({
          stepNumber: 1,
          code: 'LOCATE_ANCESTOR_CLUSTER',
          name: 'Localizzazione Famiglia / Cluster Evolutivo',
          description: `Identifica il cluster evolutivo ${clusterId || 'di appartenenza'} associato al modello antenato ${targetTemplateId}.`,
          targetModule: 'CLUSTER_REGISTRY',
          payload: { clusterId, ancestorTemplateId: targetTemplateId },
        });
        steps.push({
          stepNumber: 2,
          code: 'CREATE_STRUCTURAL_VARIANT_SPEC',
          name: 'Creazione Specifiche Nuova Variante Strutturale',
          description: 'Genera la definizione della nuova variante con tracciamento dei delta geometrici e dei box aggiunti/rimossi.',
          targetModule: 'CLUSTER_REGISTRY',
          payload: {
            clusterId,
            candidateTemplateId: context.candidateTemplate?.id,
            ancestorTemplateId: targetTemplateId,
          },
        });
        steps.push({
          stepNumber: 3,
          code: 'REGISTER_VARIANT_IN_CATALOG',
          name: 'Registrazione Variante nel Catalogo Locale',
          description: 'Registra la nuova versione nel registro canonico e collega la variante al cluster.',
          targetModule: 'CATALOG',
          payload: { clusterId, registerStatus: 'active' },
        });
        steps.push({
          stepNumber: 4,
          code: 'HANDOVER_TO_R10',
          name: 'Consegna al Modulo Esecutivo R10',
          description: 'Inoltra la nuova variante a R10 per il binding dedicato dei campi.',
          targetModule: 'EXECUTION_R10',
          payload: { variantRegistered: true },
        });
        notes.push('La variante è stata collegata all\'albero evolutivo del template originale.');
        break;

      case CteDecision.CREATE_NEW_CLUSTER:
        steps.push({
          stepNumber: 1,
          code: 'INITIALIZE_NEW_CLUSTER',
          name: 'Inizializzazione Nuovo Cluster Evolutivo',
          description: 'Crea una nuova famiglia strutturale autonoma nel ClusterRegistry locale.',
          targetModule: 'CLUSTER_REGISTRY',
          payload: {
            baseTemplateId: context.candidateTemplate?.id || 'CANDIDATE_ROOT',
            ordineScolastico: context.candidateTemplate?.ordineScolastico,
          },
        });
        steps.push({
          stepNumber: 2,
          code: 'REGISTER_CANONICAL_ROOT_TEMPLATE',
          name: 'Registrazione Template Capostipite',
          description: 'Salva il nuovo template nel registro canonico come versione 1.0 / radice della famiglia.',
          targetModule: 'CATALOG',
          payload: { isRootOfCluster: true },
        });
        steps.push({
          stepNumber: 3,
          code: 'HANDOVER_TO_R10',
          name: 'Consegna al Modulo Esecutivo R10',
          description: 'Consegna il nuovo capostipite a R10 per configurazione schema e binding.',
          targetModule: 'EXECUTION_R10',
          payload: { isNewCluster: true },
        });
        notes.push('Il documento inaugura una nuova famiglia evolutiva non riconducibile a template esistenti.');
        break;

      case CteDecision.REJECT:
      default:
        steps.push({
          stepNumber: 1,
          code: 'HALT_PROCESSING_PIPELINE',
          name: 'Interruzione Pipeline di Elaborazione',
          description: 'Blocca l\'acquisizione e impedisce binding o normalizzazioni non sicure.',
          targetModule: 'EXECUTION_R10',
          payload: { reason: 'INSUFFICIENT_QUALITY_OR_UNCLASSIFIABLE' },
        });
        steps.push({
          stepNumber: 2,
          code: 'GENERATE_DIAGNOSTIC_REJECTION_REPORT',
          name: 'Emissione Report di Rifiuto e Diagnostica',
          description: 'Compila le anomalie geometriche o di confidenza rilevate per l\'operatore.',
          targetModule: 'CATALOG',
          payload: { status: 'REJECTED' },
        });
        notes.push('Documento insufficiente o corrotto: non processabile.');
        break;
    }

    return {
      id: planId,
      createdAt: now,
      decision,
      totalSteps: steps.length,
      steps,
      readyForR10: decision !== CteDecision.REJECT,
      notes,
    };
  }
}
