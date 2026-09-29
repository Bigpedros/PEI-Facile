/**
 * Canonical Template Engine (CTE) - Release R03 & R07
 * CanonicalTemplateCatalog
 *
 * Manages registered canonical templates and provides structural matching search.
 * Backed by the dynamic, versioned CanonicalTemplateRegistry (R07) while preserving
 * 100% backwards compatibility for R03, R04, R05, and R06.
 */

import {
  CanonicalDocumentFingerprint,
  CanonicalTemplate,
  TemplateMatchResult,
  TemplateVersion,
} from '../types';
import { CanonicalTemplateMatcher } from '../matcher/canonicalTemplateMatcher';
import { CanonicalTemplateRegistry } from './canonicalRegistry';

export interface CatalogMatchResult {
  template: CanonicalTemplate;
  match: TemplateMatchResult;
}

/**
 * Registry and matching repository for Canonical Templates.
 */
export class CanonicalTemplateCatalog {
  private registry: CanonicalTemplateRegistry;
  private matcher: CanonicalTemplateMatcher;

  constructor(
    initialTemplates?: CanonicalTemplate[],
    matcher?: CanonicalTemplateMatcher,
    registry?: CanonicalTemplateRegistry
  ) {
    this.matcher = matcher || new CanonicalTemplateMatcher();
    this.registry = registry || new CanonicalTemplateRegistry(undefined, this.matcher);

    if (initialTemplates) {
      for (const t of initialTemplates) {
        this.register(t);
      }
    }
  }

  /**
   * Returns the underlying dynamic versioned registry.
   */
  getRegistry(): CanonicalTemplateRegistry {
    return this.registry;
  }

  /**
   * Registers a canonical template in the catalog.
   */
  register(template: CanonicalTemplate | TemplateVersion): void {
    if (!template || !template.id) {
      throw new Error('Template and valid template.id are required.');
    }

    const versioned: TemplateVersion = {
      id: template.id,
      nome: template.nome || template.name || template.id,
      name: template.name || template.nome,
      descrizione:
        (template as any).descrizione ||
        template.description ||
        `Template ${template.nome || template.id}`,
      description: template.description || (template as any).descrizione,
      ordineScolastico: (template as any).ordineScolastico || 'generale',
      versioneMinisteriale:
        (template as any).versioneMinisteriale ||
        template.versione ||
        template.version ||
        '1.0',
      version: template.version || template.versione,
      versione: template.versione || template.version,
      annoValidita: (template as any).annoValidita || 2024,
      hash:
        (template as any).hash ||
        template.fingerprint?.documentStructureHash ||
        `hash_${template.id}`,
      fingerprint: template.fingerprint,
      geometry:
        (template as any).geometry ||
        template.fingerprint?.geometricAnalysis || {
          overallGeometryScore: 95.0,
          pages: [],
        },
      templateSchema: (template as any).templateSchema || { sections: [] },
      dataRegistrazione:
        (template as any).dataRegistrazione || new Date().toISOString(),
      stato: (template as any).stato || 'active',
      status: (template as any).status || 'active',
    };

    this.registry.register(versioned, { throwOnError: true });
  }

  /**
   * Retrieves a template by its unique ID.
   */
  get(id: string): CanonicalTemplate | undefined {
    return this.registry.get(id);
  }

  /**
   * Checks if a template ID is present in the catalog.
   */
  has(id: string): boolean {
    return this.registry.has(id);
  }

  /**
   * Returns all registered templates.
   */
  getAll(): CanonicalTemplate[] {
    return this.registry.getAll();
  }

  /**
   * Returns the total count of registered templates.
   */
  count(): number {
    return this.registry.count();
  }

  /**
   * Removes a template from the catalog by ID.
   */
  remove(id: string): boolean {
    return this.registry.remove(id);
  }

  /**
   * Clears all templates from the catalog.
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Matches a document fingerprint against all registered templates in the catalog.
   * Returns all results sorted by similarityScore in descending order.
   */
  matchAgainstAll(
    fingerprint: CanonicalDocumentFingerprint
  ): CatalogMatchResult[] {
    const res = this.registry.matchAgainstAll(fingerprint, { status: 'all' });
    return res.map(r => ({
      template: r.template,
      match: r.match,
    }));
  }

  /**
   * Finds the best matching canonical template in the catalog for the given document fingerprint.
   */
  findBestMatch(
    fingerprint: CanonicalDocumentFingerprint
  ): CatalogMatchResult | null {
    const best = this.registry.findBestMatch(fingerprint, { status: 'all' });
    if (!best) {
      return null;
    }
    return {
      template: best.template,
      match: best.match,
    };
  }
}
