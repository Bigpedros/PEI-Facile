/**
 * Canonical Template Engine (CTE) - Release R07
 * CanonicalTemplateRegistry
 *
 * Responsibilities:
 * 1. Model Registration (conforme al principio "Il Catalogo è un archivio dati, non codice")
 * 2. Model Loading & Querying
 * 3. Strict Scientific Validation (PDF leggibile, fingerprint valida, geometria coerente, schema coerente, assenza duplicati)
 * 4. Model Versioning (coesistenza di versioni multiple dello stesso PEI es. 2024, 2027, 2030 con selezione automatica)
 * 5. Lifecycle Management (activate / deactivate [deprecated] / archive)
 * 6. Historical Archive
 */

import {
  CanonicalDocumentFingerprint,
  TemplateVersion,
  TemplateStatus,
  RegistryValidationReport,
  ValidationIssue,
  TemplateMatchResult,
} from '../types';
import { CanonicalTemplateMatcher } from '../matcher/canonicalTemplateMatcher';

export interface TemplateFilter {
  status?: TemplateStatus | TemplateStatus[] | 'all';
  ordineScolastico?: string;
  annoValidita?: number | string;
}

export interface SelectVersionOptions {
  preferredYear?: number | string;
  ordineScolastico?: string;
  includeDeprecated?: boolean;
  includeArchived?: boolean;
}

export interface RegisterOptions {
  skipValidation?: boolean;
  skipDuplicateCheck?: boolean;
  throwOnError?: boolean;
}

/**
 * Dynamic, versioned registry for Canonical PEI Templates.
 */
export class CanonicalTemplateRegistry {
  private templates: Map<string, TemplateVersion> = new Map();
  private matcher: CanonicalTemplateMatcher;

  constructor(
    initialTemplates?: TemplateVersion[],
    matcher?: CanonicalTemplateMatcher
  ) {
    this.matcher = matcher || new CanonicalTemplateMatcher();
    if (initialTemplates && initialTemplates.length > 0) {
      for (const t of initialTemplates) {
        this.register(t, { throwOnError: false });
      }
    }
  }

  /**
   * Validates a candidate template version against the R07 validation specification.
   */
  validate(
    candidate: TemplateVersion,
    existingIdToIgnore?: string
  ): RegistryValidationReport {
    const issues: ValidationIssue[] = [];
    const timestamp = new Date().toISOString();
    const modelId = candidate?.id || 'UNKNOWN';

    if (!candidate || typeof candidate !== 'object') {
      return {
        isValid: false,
        modelId,
        isReadable: false,
        hasValidFingerprint: false,
        hasCoherentGeometry: false,
        hasCoherentSchema: false,
        isDuplicate: false,
        issues: [
          {
            severity: 'error',
            code: 'INVALID_OBJECT',
            message: 'Il template specificato non è un oggetto valido.',
          },
        ],
        summary: 'Validazione fallita: oggetto template non valido.',
        timestamp,
      };
    }

    // 1. Leggibilità / Validità strutturale di base
    const isReadable = Boolean(
      candidate.id &&
      candidate.nome &&
      candidate.ordineScolastico &&
      candidate.versioneMinisteriale
    );

    if (!isReadable) {
      issues.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_FIELDS',
        message:
          'Campi obbligatori mancanti: id, nome, ordineScolastico o versioneMinisteriale.',
      });
    }

    // 2. Fingerprint valida
    let hasValidFingerprint = false;
    const fp = candidate.fingerprint;
    if (
      fp &&
      typeof fp === 'object' &&
      typeof fp.pageCount === 'number' &&
      fp.pageCount > 0 &&
      Array.isArray(fp.pages) &&
      fp.pages.length === fp.pageCount &&
      Boolean(fp.fingerprint || (fp.documentStructureHash && fp.documentGeometryHash))
    ) {
      hasValidFingerprint = true;
    } else {
      issues.push({
        severity: 'error',
        code: 'INVALID_FINGERPRINT',
        message:
          'Fingerprint non valida o incompleta: richiesta presenza di pagine > 0 e hash strutturali.',
      });
    }

    // 3. Geometria coerente
    let hasCoherentGeometry = false;
    const geo = candidate.geometry;
    if (geo && typeof geo === 'object') {
      // DocumentGeometricAnalysis, ModelGeometry, or PageGeometry[]
      if ('overallGeometryScore' in geo && typeof (geo as any).overallGeometryScore === 'number') {
        hasCoherentGeometry = (geo as any).overallGeometryScore >= 0;
      } else if ('pages' in geo && Array.isArray((geo as any).pages)) {
        hasCoherentGeometry = (geo as any).pages.length > 0;
      } else if (Array.isArray(geo)) {
        hasCoherentGeometry = geo.length > 0;
      } else {
        // Fallback for minimal coherent geometry object
        hasCoherentGeometry = Object.keys(geo).length > 0;
      }
    }

    if (!hasCoherentGeometry) {
      issues.push({
        severity: 'error',
        code: 'INCOHERENT_GEOMETRY',
        message: 'Geometria non coerente o assente per il modello specificato.',
      });
    }

    // 4. Schema coerente
    let hasCoherentSchema = false;
    const schema = candidate.templateSchema;
    if (schema && typeof schema === 'object') {
      hasCoherentSchema = true;
    } else {
      issues.push({
        severity: 'error',
        code: 'INCOHERENT_SCHEMA',
        message: 'Template schema non coerente o non definito.',
      });
    }

    // 5. Assenza duplicati (R07: due modelli con fingerprint identica NON possono essere registrati)
    let isDuplicate = false;
    if (hasValidFingerprint) {
      for (const [id, existing] of this.templates.entries()) {
        if (id === existingIdToIgnore || id === candidate.id) {
          continue;
        }

        const exactFpMatch =
          existing.fingerprint.fingerprint &&
          candidate.fingerprint.fingerprint &&
          existing.fingerprint.fingerprint === candidate.fingerprint.fingerprint;

        const hashMatch =
          existing.fingerprint.documentStructureHash ===
            candidate.fingerprint.documentStructureHash &&
          existing.fingerprint.documentGeometryHash ===
            candidate.fingerprint.documentGeometryHash &&
          existing.fingerprint.pageCount === candidate.fingerprint.pageCount;

        if (exactFpMatch || hashMatch) {
          isDuplicate = true;
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_FINGERPRINT',
            message: `Rifiuto registrazione: modello duplicato con fingerprint identica al modello già registrato '${existing.id}' (${existing.nome}).`,
            field: 'fingerprint',
          });
          break;
        }
      }
    }

    const isValid =
      isReadable &&
      hasValidFingerprint &&
      hasCoherentGeometry &&
      hasCoherentSchema &&
      !isDuplicate;

    const summary = isValid
      ? `Modello '${candidate.id}' valido e conforme allo standard canonico.`
      : `Validazione fallita per il modello '${candidate.id}': ${issues.map(i => i.message).join(' | ')}`;

    return {
      isValid,
      modelId,
      isReadable,
      hasValidFingerprint,
      hasCoherentGeometry,
      hasCoherentSchema,
      isDuplicate,
      issues,
      summary,
      timestamp,
    };
  }

  /**
   * Registers a new template version in the registry.
   * Throws an error by default if validation fails or a duplicate is detected.
   */
  register(
    template: TemplateVersion,
    options?: RegisterOptions
  ): RegistryValidationReport {
    const throwOnError = options?.throwOnError ?? true;

    // Validate
    let report: RegistryValidationReport;
    if (options?.skipValidation) {
      report = {
        isValid: true,
        modelId: template.id,
        isReadable: true,
        hasValidFingerprint: true,
        hasCoherentGeometry: true,
        hasCoherentSchema: true,
        isDuplicate: false,
        issues: [],
        summary: 'Validazione saltata.',
        timestamp: new Date().toISOString(),
      };
    } else {
      report = this.validate(template);
    }

    if (!report.isValid) {
      if (throwOnError) {
        throw new Error(report.summary);
      }
      return report;
    }

    // Normalize and assign compatibility properties
    const normalized: TemplateVersion = {
      ...template,
      name: template.name || template.nome,
      description: template.description || template.descrizione,
      version: template.version || template.versioneMinisteriale,
      versione: template.versione || template.versioneMinisteriale,
      status: template.status || template.stato || 'active',
      stato: template.stato || template.status || 'active',
      dataRegistrazione: template.dataRegistrazione || new Date().toISOString(),
    };

    this.templates.set(normalized.id, normalized);
    return report;
  }

  /**
   * Retrieves a template version by its ID.
   */
  get(id: string): TemplateVersion | undefined {
    return this.templates.get(id);
  }

  /**
   * Checks if a template ID is present in the registry.
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Returns all templates matching optional filters.
   */
  getAll(filter?: TemplateFilter): TemplateVersion[] {
    let list = Array.from(this.templates.values());

    if (!filter) {
      return list;
    }

    if (filter.status && filter.status !== 'all') {
      const allowed = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      list = list.filter(t => allowed.includes(t.stato));
    }

    if (filter.ordineScolastico) {
      list = list.filter(
        t =>
          t.ordineScolastico.toLowerCase() ===
          filter.ordineScolastico!.toLowerCase()
      );
    }

    if (filter.annoValidita !== undefined) {
      list = list.filter(
        t => String(t.annoValidita) === String(filter.annoValidita)
      );
    }

    return list;
  }

  /**
   * Returns all active models.
   */
  getActive(): TemplateVersion[] {
    return this.getAll({ status: 'active' });
  }

  /**
   * Returns all archived models (Archivio Storico).
   */
  getArchived(): TemplateVersion[] {
    return this.getAll({ status: 'archived' });
  }

  /**
   * Returns all historical archived models (alias for getArchived).
   */
  getHistoricArchive(): TemplateVersion[] {
    return this.getArchived();
  }

  /**
   * Returns all deprecated models.
   */
  getDeprecated(): TemplateVersion[] {
    return this.getAll({ status: 'deprecated' });
  }

  /**
   * Returns the count of registered templates, optionally filtered by status.
   */
  count(status?: TemplateStatus | 'all'): number {
    if (!status || status === 'all') {
      return this.templates.size;
    }
    return this.getAll({ status }).length;
  }

  /**
   * Removes a template from the registry.
   */
  remove(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * Clears all registered templates.
   */
  clear(): void {
    this.templates.clear();
  }

  /**
   * Activates a template by setting its status to 'active'.
   */
  activate(id: string): boolean {
    return this.setStatus(id, 'active');
  }

  /**
   * Deactivates a template by setting its status to 'deprecated'.
   */
  deactivate(id: string, reason?: string): boolean {
    const success = this.setStatus(id, 'deprecated');
    if (success && reason) {
      const t = this.get(id);
      if (t) {
        t.metadata = { ...t.metadata, deactivationReason: reason };
      }
    }
    return success;
  }

  /**
   * Moves a template to the historical archive by setting its status to 'archived'.
   */
  archive(id: string, reason?: string): boolean {
    const success = this.setStatus(id, 'archived');
    if (success && reason) {
      const t = this.get(id);
      if (t) {
        t.metadata = { ...t.metadata, archivalReason: reason };
      }
    }
    return success;
  }

  /**
   * Sets the lifecycle status of a registered template.
   */
  setStatus(id: string, status: TemplateStatus): boolean {
    const template = this.templates.get(id);
    if (!template) {
      return false;
    }
    template.stato = status;
    template.status = status;
    return true;
  }

  /**
   * Returns all available versions for a given school order (e.g. 'primaria'),
   * sorted chronologically by annoValidita descending.
   */
  getVersions(ordineScolastico: string): TemplateVersion[] {
    return this.getAll({ ordineScolastico }).sort((a, b) => {
      const yearA = parseInt(String(a.annoValidita).replace(/\D/g, ''), 10) || 0;
      const yearB = parseInt(String(b.annoValidita).replace(/\D/g, ''), 10) || 0;
      return yearB - yearA;
    });
  }

  /**
   * Returns all versions belonging to a model family name or order.
   */
  getVersionsForModel(baseNameOrOrder: string): TemplateVersion[] {
    const lower = baseNameOrOrder.toLowerCase();
    return Array.from(this.templates.values())
      .filter(
        t =>
          t.ordineScolastico.toLowerCase().includes(lower) ||
          t.nome.toLowerCase().includes(lower) ||
          t.id.toLowerCase().includes(lower)
      )
      .sort((a, b) => {
        const yearA = parseInt(String(a.annoValidita).replace(/\D/g, ''), 10) || 0;
        const yearB = parseInt(String(b.annoValidita).replace(/\D/g, ''), 10) || 0;
        return yearB - yearA;
      });
  }

  /**
   * Automatically selects the correct version of a model for a given document fingerprint.
   * Compares the fingerprint against candidates and picks the highest matching version,
   * taking into account school order and preferred/detected validity year.
   */
  selectCorrectVersion(
    fingerprint: CanonicalDocumentFingerprint,
    options?: SelectVersionOptions
  ): { template: TemplateVersion; matchResult: TemplateMatchResult } | null {
    const statusFilter: TemplateStatus[] = ['active'];
    if (options?.includeDeprecated) {
      statusFilter.push('deprecated');
    }
    if (options?.includeArchived) {
      statusFilter.push('archived');
    }

    let candidates = this.getAll({ status: statusFilter });

    if (options?.ordineScolastico) {
      candidates = candidates.filter(
        c =>
          c.ordineScolastico.toLowerCase() ===
          options.ordineScolastico!.toLowerCase()
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    const scoredCandidates: Array<{
      template: TemplateVersion;
      matchResult: TemplateMatchResult;
      rankingScore: number;
    }> = [];

    for (const candidate of candidates) {
      const matchResult = this.matcher.match(fingerprint, candidate.fingerprint);

      let rankingScore = matchResult.similarityScore;

      // Year alignment bonus (if user or document metadata points to a preferred validity year)
      if (options?.preferredYear !== undefined) {
        const candidateYear = String(candidate.annoValidita);
        const prefYear = String(options.preferredYear);
        if (candidateYear.includes(prefYear) || prefYear.includes(candidateYear)) {
          rankingScore += 5.0;
        }
      }

      scoredCandidates.push({
        template: candidate,
        matchResult,
        rankingScore,
      });
    }

    scoredCandidates.sort((a, b) => b.rankingScore - a.rankingScore);

    return scoredCandidates.length > 0
      ? {
          template: scoredCandidates[0].template,
          matchResult: scoredCandidates[0].matchResult,
        }
      : null;
  }

  /**
   * Matches a document fingerprint against all templates in the registry.
   */
  matchAgainstAll(
    fingerprint: CanonicalDocumentFingerprint,
    options?: { status?: TemplateStatus | 'all'; ordineScolastico?: string }
  ): Array<{ template: TemplateVersion; match: TemplateMatchResult }> {
    const status = options?.status || 'active';
    let candidates =
      status === 'all'
        ? Array.from(this.templates.values())
        : this.getAll({ status });

    if (options?.ordineScolastico) {
      candidates = candidates.filter(
        c =>
          c.ordineScolastico.toLowerCase() ===
          options.ordineScolastico!.toLowerCase()
      );
    }

    const results = candidates.map(template => {
      const match = this.matcher.match(fingerprint, template.fingerprint);
      return { template, match };
    });

    return results.sort((a, b) => b.match.similarityScore - a.match.similarityScore);
  }

  /**
   * Finds the best matching template in the registry for a given document fingerprint.
   */
  findBestMatch(
    fingerprint: CanonicalDocumentFingerprint,
    options?: { status?: TemplateStatus | 'all'; ordineScolastico?: string }
  ): { template: TemplateVersion; match: TemplateMatchResult } | null {
    const matches = this.matchAgainstAll(fingerprint, options);
    return matches.length > 0 ? matches[0] : null;
  }
}
