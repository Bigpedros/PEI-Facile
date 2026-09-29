/**
 * Canonical Template Engine (CTE) - Release R08
 * ClusterRegistry
 *
 * Core Responsibilities:
 * 1. Storage and retrieval of evolutionary template clusters (TemplateCluster).
 * 2. Multi-template clustering across evolution timelines (e.g. Primaria 2024 -> 2027 -> 2030).
 * 3. Querying by template ID, school order (ordineScolastico), or custom tags.
 */

import { TemplateCluster } from '../types';

export class ClusterRegistry {
  private clusters: Map<string, TemplateCluster> = new Map();
  private templateToClusterMap: Map<string, string> = new Map();

  constructor(initialClusters?: TemplateCluster[]) {
    if (initialClusters && initialClusters.length > 0) {
      for (const cluster of initialClusters) {
        this.registerCluster(cluster);
      }
    }
  }

  /**
   * Registers or updates an evolutionary cluster.
   */
  public registerCluster(cluster: TemplateCluster): TemplateCluster {
    const updated: TemplateCluster = {
      ...cluster,
      updatedAt: new Date().toISOString(),
    };

    this.clusters.set(cluster.id, updated);

    // Index all member templates
    for (const templateId of cluster.templateIds) {
      this.templateToClusterMap.set(templateId, cluster.id);
    }
    if (cluster.baseTemplateId) {
      this.templateToClusterMap.set(cluster.baseTemplateId, cluster.id);
    }

    return updated;
  }

  /**
   * Creates a new cluster for a given base template.
   */
  public createCluster(params: {
    id?: string;
    nome: string;
    descrizione?: string;
    ordineScolastico?: string;
    baseTemplateId: string;
    initialTemplateIds?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): TemplateCluster {
    const id = params.id || `CLUSTER_${params.baseTemplateId}_${Date.now()}`;
    const initialList = Array.from(
      new Set([params.baseTemplateId, ...(params.initialTemplateIds || [])])
    );

    const now = new Date().toISOString();
    const cluster: TemplateCluster = {
      id,
      nome: params.nome,
      descrizione: params.descrizione,
      ordineScolastico: params.ordineScolastico,
      baseTemplateId: params.baseTemplateId,
      templateIds: initialList,
      createdAt: now,
      updatedAt: now,
      tags: params.tags || [],
      metadata: params.metadata || {},
    };

    return this.registerCluster(cluster);
  }

  /**
   * Adds a template to an existing cluster.
   */
  public addTemplateToCluster(clusterId: string, templateId: string): boolean {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      return false;
    }

    if (!cluster.templateIds.includes(templateId)) {
      cluster.templateIds.push(templateId);
      cluster.updatedAt = new Date().toISOString();
      this.templateToClusterMap.set(templateId, clusterId);
    }

    return true;
  }

  /**
   * Gets a cluster by its unique cluster ID.
   */
  public getCluster(clusterId: string): TemplateCluster | undefined {
    return this.clusters.get(clusterId);
  }

  /**
   * Finds the cluster to which a given template ID belongs.
   */
  public findClusterByTemplateId(templateId: string): TemplateCluster | undefined {
    const clusterId = this.templateToClusterMap.get(templateId);
    if (!clusterId) {
      return undefined;
    }
    return this.clusters.get(clusterId);
  }

  /**
   * Returns all clusters in the registry.
   */
  public getAllClusters(): TemplateCluster[] {
    return Array.from(this.clusters.values());
  }

  /**
   * Finds clusters matching a specific school order.
   */
  public getClustersByOrdineScolastico(ordineScolastico: string): TemplateCluster[] {
    return this.getAllClusters().filter(
      c => c.ordineScolastico?.toLowerCase() === ordineScolastico.toLowerCase()
    );
  }

  /**
   * Checks if a cluster exists.
   */
  public hasCluster(clusterId: string): boolean {
    return this.clusters.has(clusterId);
  }

  /**
   * Counts the number of registered clusters.
   */
  public count(): number {
    return this.clusters.size;
  }

  /**
   * Removes a cluster and unlinks its member templates.
   */
  public deleteCluster(clusterId: string): boolean {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return false;

    for (const tid of cluster.templateIds) {
      if (this.templateToClusterMap.get(tid) === clusterId) {
        this.templateToClusterMap.delete(tid);
      }
    }

    return this.clusters.delete(clusterId);
  }

  /**
   * Clears all clusters from the registry.
   */
  public clear(): void {
    this.clusters.clear();
    this.templateToClusterMap.clear();
  }
}
