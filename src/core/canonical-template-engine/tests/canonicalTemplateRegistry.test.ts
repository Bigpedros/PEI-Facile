/**
 * Canonical Template Engine (CTE) - Release R07 Test Suite
 * CanonicalTemplateRegistry & TemplateImportService
 *
 * Verifies:
 * TEST 1: Registrazione nuovo modello.
 * TEST 2: Rifiuto modello duplicato.
 * TEST 3: Caricamento di più versioni dello stesso PEI.
 * TEST 4: Selezione automatica della versione corretta.
 * TEST 5: Disattivazione modello.
 * TEST 6: Archivio storico.
 * TEST 7: Importazione modello ministeriale.
 * TEST 8: Compatibilità con R03 (CanonicalTemplateMatcher).
 * TEST 9: Compatibilità con R04 (GeometricAnalysisEngine).
 * TEST 10: Compatibilità con R05 (NormalizationPlanningEngine).
 * TEST 11: Compatibilità con R06 (NormalizationExecutionEngine).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  CanonicalTemplateRegistry,
  TemplateImportService,
  CanonicalTemplateCatalog,
} from '../catalog';
import {
  TemplateVersion,
  CanonicalDocumentFingerprint,
  CanonicalPageFingerprint,
} from '../types';
import { PdfDocumentAnalyzer } from '../analyzer/pdfDocumentAnalyzer';
import { CanonicalTemplateMatcher } from '../matcher/canonicalTemplateMatcher';
import { GeometricAnalysisEngine } from '../geometry/geometricAnalysisEngine';
import { NormalizationPlanningEngine } from '../normalization/normalizationPlanningEngine';
import { NormalizationExecutionEngine } from '../execution/normalizationExecutionEngine';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../../data/geometry/geometryTransform';

/**
 * Helper to construct a synthetic canonical page fingerprint.
 */
function createSyntheticPageFingerprint(
  pageIndex: number,
  options?: {
    textCount?: number;
    vectorCount?: number;
    geometryHash?: string;
    structureHash?: string;
  }
): CanonicalPageFingerprint {
  const textCount = options?.textCount ?? 150;
  const vectorCount = options?.vectorCount ?? 12;
  return {
    pageIndex,
    pageWidth: A4_WIDTH_PT,
    pageHeight: A4_HEIGHT_PT,
    rotation: 0,
    mediaBox: [0, 0, A4_WIDTH_PT, A4_HEIGHT_PT],
    cropBox: [0, 0, A4_WIDTH_PT, A4_HEIGHT_PT],
    vectorObjectCount: vectorCount,
    rasterImageCount: 0,
    textObjectCount: textCount,
    fontFamilies: ['Helvetica', 'Arial'],
    geometryHash: options?.geometryHash ?? `gh_${pageIndex}_${A4_WIDTH_PT}x${A4_HEIGHT_PT}`,
    structureHash: options?.structureHash ?? `sh_${pageIndex}_t${textCount}_v${vectorCount}`,
    confidence: 0.98,
  };
}

/**
 * Helper to construct a synthetic canonical document fingerprint.
 */
function createSyntheticFingerprint(
  pageCount: number,
  salt = 'v1'
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
    documentGeometryHash: `dgh_${pageCount}_${salt}`,
    documentStructureHash: `dsh_${pageCount}_${salt}`,
    fingerprint: `FP_SYNTHETIC_${pageCount}P_${salt}`,
  };
}

describe('Canonical Template Engine (CTE) - Release R07 Registry & Import Service', () => {
  let registry: CanonicalTemplateRegistry;
  let importService: TemplateImportService;
  let analyzer: PdfDocumentAnalyzer;

  beforeEach(() => {
    registry = new CanonicalTemplateRegistry();
    analyzer = new PdfDocumentAnalyzer();
    importService = new TemplateImportService({ registry, analyzer });
  });

  // =========================================================================
  // TEST 1: Registrazione nuovo modello
  // =========================================================================
  it('TEST 1: Registrazione nuovo modello', () => {
    const fp = createSyntheticFingerprint(12, 'primaria_2024');
    const newModel: TemplateVersion = {
      id: 'MOD_PEI_PRIMARIA_2024',
      nome: 'Modello Nazionale PEI - Scuola Primaria',
      descrizione: 'Modello ufficiale ministeriale per la scuola primaria D.I. 153/2023',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'D.I. 153/2023',
      versione: 'D.I. 153/2023',
      annoValidita: 2024,
      hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fingerprint: fp,
      geometry: {
        overallGeometryScore: 98.5,
        overallSkewAngle: 0,
        pages: [],
      },
      templateSchema: {
        sections: [
          { code: 'SEZ_1', title: 'Quadro informativo' },
          { code: 'SEZ_2', title: 'Elementi generali' },
        ],
      },
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const report = registry.register(newModel);

    expect(report.isValid).toBe(true);
    expect(report.isDuplicate).toBe(false);
    expect(report.modelId).toBe('MOD_PEI_PRIMARIA_2024');
    expect(registry.has('MOD_PEI_PRIMARIA_2024')).toBe(true);
    expect(registry.count('active')).toBe(1);

    const saved = registry.get('MOD_PEI_PRIMARIA_2024');
    expect(saved).toBeDefined();
    expect(saved?.nome).toBe('Modello Nazionale PEI - Scuola Primaria');
    expect(saved?.stato).toBe('active');
  });

  // =========================================================================
  // TEST 2: Rifiuto modello duplicato
  // =========================================================================
  it('TEST 2: Rifiuto modello duplicato (blocco importazione con fingerprint identica)', () => {
    const fp = createSyntheticFingerprint(10, 'identica');

    const originalModel: TemplateVersion = {
      id: 'MOD_ORIGINAL',
      nome: 'Modello Originale A1',
      descrizione: 'Descrizione originale',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'v1.0',
      versione: 'v1.0',
      annoValidita: 2024,
      hash: 'hash_original_123',
      fingerprint: fp,
      geometry: { overallGeometryScore: 95 },
      templateSchema: { version: '1.0' },
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    registry.register(originalModel);
    expect(registry.count()).toBe(1);

    // Attempt to register a duplicate model with a different ID but IDENTICAL fingerprint
    const duplicateModel: TemplateVersion = {
      id: 'MOD_DUPLICATE_ATTEMPT',
      nome: 'Tentativo Modello Duplicato',
      descrizione: 'Stessa impronta strutturale',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'v1.0',
      versione: 'v1.0',
      annoValidita: 2024,
      hash: 'hash_duplicate_456',
      fingerprint: fp, // IDENTICAL FINGERPRINT
      geometry: { overallGeometryScore: 95 },
      templateSchema: { version: '1.0' },
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    // System must reject duplicate registration
    expect(() => {
      registry.register(duplicateModel, { throwOnError: true });
    }).toThrow(/duplicat/i);

    // Verification that the duplicate was NOT registered
    expect(registry.has('MOD_DUPLICATE_ATTEMPT')).toBe(false);
    expect(registry.count()).toBe(1);

    // Validation report verification
    const validationReport = registry.validate(duplicateModel);
    expect(validationReport.isValid).toBe(false);
    expect(validationReport.isDuplicate).toBe(true);
    expect(validationReport.issues.some(i => i.code === 'DUPLICATE_FINGERPRINT')).toBe(true);
  });

  // =========================================================================
  // TEST 3: Caricamento di più versioni dello stesso PEI
  // =========================================================================
  it('TEST 3: Caricamento di più versioni dello stesso PEI', () => {
    const v2024: TemplateVersion = {
      id: 'PEI_PRIMARIA_2024',
      nome: 'PEI Primaria 2024',
      descrizione: 'PEI Primaria Edizione 2024',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'DI 182/2020',
      versione: 'DI 182/2020',
      annoValidita: 2024,
      hash: 'hash_2024',
      fingerprint: createSyntheticFingerprint(12, 'primaria_2024'),
      geometry: { overallGeometryScore: 95 },
      templateSchema: { sections: 12 },
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const v2027: TemplateVersion = {
      id: 'PEI_PRIMARIA_2027',
      nome: 'PEI Primaria 2027',
      descrizione: 'PEI Primaria Riforma 2027',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'DI 2027',
      versione: 'DI 2027',
      annoValidita: 2027,
      hash: 'hash_2027',
      fingerprint: createSyntheticFingerprint(13, 'primaria_2027'),
      geometry: { overallGeometryScore: 96 },
      templateSchema: { sections: 13 },
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    const v2030: TemplateVersion = {
      id: 'PEI_PRIMARIA_2030',
      nome: 'PEI Primaria 2030',
      descrizione: 'PEI Primaria Riforma 2030',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'DI 2030',
      versione: 'DI 2030',
      annoValidita: 2030,
      hash: 'hash_2030',
      fingerprint: createSyntheticFingerprint(14, 'primaria_2030'),
      geometry: { overallGeometryScore: 97 },
      templateSchema: { sections: 14 },
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    registry.register(v2024);
    registry.register(v2027);
    registry.register(v2030);

    const versions = registry.getVersions('primaria');
    expect(versions).toHaveLength(3);

    // Sorted descending by annoValidita
    expect(versions[0].id).toBe('PEI_PRIMARIA_2030');
    expect(versions[1].id).toBe('PEI_PRIMARIA_2027');
    expect(versions[2].id).toBe('PEI_PRIMARIA_2024');
  });

  // =========================================================================
  // TEST 4: Selezione automatica della versione corretta
  // =========================================================================
  it('TEST 4: Selezione automatica della versione corretta', () => {
    const fp2024 = createSyntheticFingerprint(12, 'primaria_2024');
    const fp2027 = createSyntheticFingerprint(13, 'primaria_2027');
    const fp2030 = createSyntheticFingerprint(14, 'primaria_2030');

    registry.register({
      id: 'PEI_PRIMARIA_2024',
      nome: 'PEI Primaria 2024',
      descrizione: 'Edizione 2024',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'DI 182/2020',
      versione: 'DI 182/2020',
      annoValidita: 2024,
      hash: 'h2024',
      fingerprint: fp2024,
      geometry: { overallGeometryScore: 95 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    });

    registry.register({
      id: 'PEI_PRIMARIA_2027',
      nome: 'PEI Primaria 2027',
      descrizione: 'Edizione 2027',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'DI 2027',
      versione: 'DI 2027',
      annoValidita: 2027,
      hash: 'h2027',
      fingerprint: fp2027,
      geometry: { overallGeometryScore: 96 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    });

    registry.register({
      id: 'PEI_PRIMARIA_2030',
      nome: 'PEI Primaria 2030',
      descrizione: 'Edizione 2030',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'DI 2030',
      versione: 'DI 2030',
      annoValidita: 2030,
      hash: 'h2030',
      fingerprint: fp2030,
      geometry: { overallGeometryScore: 97 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    });

    // An incoming document with the 2027 structure
    const incomingDocument = createSyntheticFingerprint(13, 'primaria_2027');

    const selection = registry.selectCorrectVersion(incomingDocument, {
      ordineScolastico: 'primaria',
    });

    expect(selection).not.toBeNull();
    expect(selection?.template.id).toBe('PEI_PRIMARIA_2027');
    expect(selection?.matchResult.similarityScore).toBe(100);

    // Another incoming document matching 2030
    const incoming2030 = createSyntheticFingerprint(14, 'primaria_2030');
    const selection2030 = registry.selectCorrectVersion(incoming2030, {
      ordineScolastico: 'primaria',
      preferredYear: 2030,
    });

    expect(selection2030).not.toBeNull();
    expect(selection2030?.template.id).toBe('PEI_PRIMARIA_2030');
  });

  // =========================================================================
  // TEST 5: Disattivazione modello
  // =========================================================================
  it('TEST 5: Disattivazione modello (transizione ad active -> deprecated)', () => {
    const fp = createSyntheticFingerprint(8, 'disattivazione');
    const model: TemplateVersion = {
      id: 'MOD_TRANSITORIO',
      nome: 'Modello Sperimentale Transitorio',
      descrizione: 'Modello provvisorio',
      ordineScolastico: 'secondaria_primo_grado',
      versioneMinisteriale: 'v0.9',
      versione: 'v0.9',
      annoValidita: 2023,
      hash: 'hash_trans',
      fingerprint: fp,
      geometry: { overallGeometryScore: 90 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    registry.register(model);
    expect(registry.getActive()).toHaveLength(1);

    const deactSuccess = registry.deactivate(
      'MOD_TRANSITORIO',
      'Superato da versione definitiva'
    );
    expect(deactSuccess).toBe(true);

    const updated = registry.get('MOD_TRANSITORIO');
    expect(updated?.stato).toBe('deprecated');

    // Excluded from active models
    expect(registry.getActive()).toHaveLength(0);
    // Included in deprecated models
    expect(registry.getDeprecated()).toHaveLength(1);
  });

  // =========================================================================
  // TEST 6: Archivio storico
  // =========================================================================
  it('TEST 6: Archivio storico (archiviazione e recupero modelli storici)', () => {
    const fpOld = createSyntheticFingerprint(10, 'storico_2019');
    const modelOld: TemplateVersion = {
      id: 'PEI_STORICO_2019',
      nome: 'PEI Primaria 2019 (Ante D.I. 182)',
      descrizione: 'Modello precedente la riforma',
      ordineScolastico: 'primaria',
      versioneMinisteriale: 'Storica 2019',
      versione: 'Storica 2019',
      annoValidita: 2019,
      hash: 'hash_hist',
      fingerprint: fpOld,
      geometry: { overallGeometryScore: 85 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    registry.register(modelOld);
    const archSuccess = registry.archive(
      'PEI_STORICO_2019',
      'Archiviazione storica a.s. 2019/2020'
    );
    expect(archSuccess).toBe(true);

    const histList = registry.getHistoricArchive();
    expect(histList).toHaveLength(1);
    expect(histList[0].id).toBe('PEI_STORICO_2019');
    expect(histList[0].stato).toBe('archived');

    // By default, match against active pool does NOT match archived templates
    const matchesActive = registry.matchAgainstAll(fpOld, { status: 'active' });
    expect(matchesActive).toHaveLength(0);

    // If searching across all or archived, it is found
    const matchesArchived = registry.matchAgainstAll(fpOld, { status: 'archived' });
    expect(matchesArchived).toHaveLength(1);
  });

  // =========================================================================
  // TEST 7: Importazione modello ministeriale
  // =========================================================================
  it('TEST 7: Importazione modello ministeriale (acquisizione dinamica senza modifica codice)', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const { template, report } = await importService.importFromPdf(buffer, {
      id: 'MINISTERIAL_A1_INFANZIA',
      nome: "Modello Nazionale PEI - Scuola dell'Infanzia",
      ordineScolastico: 'infanzia',
      versioneMinisteriale: 'D.I. 153/2023',
      annoValidita: 2024,
    });

    expect(report.isValid).toBe(true);
    expect(report.isReadable).toBe(true);
    expect(report.hasValidFingerprint).toBe(true);
    expect(report.hasCoherentGeometry).toBe(true);
    expect(report.isDuplicate).toBe(false);

    expect(template.id).toBe('MINISTERIAL_A1_INFANZIA');
    expect(template.stato).toBe('active');
    expect(template.fingerprint.pageCount).toBe(12);
    expect(template.hash).toHaveLength(64); // Valid SHA-256

    expect(registry.has('MINISTERIAL_A1_INFANZIA')).toBe(true);
    expect(registry.count('active')).toBe(1);
  });

  // =========================================================================
  // TEST 8: Compatibilità con R03 (CanonicalTemplateMatcher)
  // =========================================================================
  it('TEST 8: Compatibilità con R03 (CanonicalTemplateMatcher integrato con Catalog)', () => {
    const fpA1 = createSyntheticFingerprint(12, 'compat_a1');
    const fpA2 = createSyntheticFingerprint(15, 'compat_a2');

    const catalog = new CanonicalTemplateCatalog([
      {
        id: 'MINISTERIAL_A1',
        nome: 'PEI Infanzia',
        versione: '1.0',
        fingerprint: fpA1,
      },
      {
        id: 'MINISTERIAL_A2',
        nome: 'PEI Primaria',
        versione: '1.0',
        fingerprint: fpA2,
      },
    ]);

    expect(catalog.count()).toBe(2);
    expect(catalog.has('MINISTERIAL_A1')).toBe(true);

    const bestA1 = catalog.findBestMatch(fpA1);
    expect(bestA1).not.toBeNull();
    expect(bestA1?.template.id).toBe('MINISTERIAL_A1');
    expect(bestA1?.match.similarityScore).toBe(100);
    expect(bestA1?.match.classification).toBe('IDENTICAL');
  });

  // =========================================================================
  // TEST 9: Compatibilità con R04 (GeometricAnalysisEngine)
  // =========================================================================
  it('TEST 9: Compatibilità con R04 (Geometria rigorosa integrata in TemplateVersion)', () => {
    const geoEngine = new GeometricAnalysisEngine();
    const mockPage: any = {
      pageNumber: 1,
      getViewport: () => ({ width: 595.28, height: 841.89, rotation: 0 }),
      getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      getTextContent: async () => ({ items: [] }),
    };

    return geoEngine.analyzePage(mockPage, 0).then(pageGeo => {
      expect(pageGeo.overallGeometryScore).toBeGreaterThan(0);
      expect(pageGeo.width).toBeCloseTo(595.28, 1);

      const fp = createSyntheticFingerprint(1, 'geo_r04');
      const model: TemplateVersion = {
        id: 'MOD_R04_COMPAT',
        nome: 'Modello con Geometria R04',
        descrizione: 'Compatibilità R04',
        ordineScolastico: 'primaria',
        versioneMinisteriale: '1.0',
        versione: '1.0',
        annoValidita: 2024,
        hash: 'hash_r04',
        fingerprint: fp,
        geometry: {
          overallGeometryScore: pageGeo.overallGeometryScore,
          pages: [pageGeo],
        },
        templateSchema: { geometryScore: pageGeo.overallGeometryScore },
        dataRegistrazione: new Date().toISOString(),
        stato: 'active',
      };

      const rep = registry.register(model);
      expect(rep.isValid).toBe(true);
      expect(rep.hasCoherentGeometry).toBe(true);
    });
  });

  // =========================================================================
  // TEST 10: Compatibilità con R05 (NormalizationPlanningEngine)
  // =========================================================================
  it('TEST 10: Compatibilità con R05 (Creazione piano di normalizzazione da template a registro)', () => {
    const fpTarget = createSyntheticFingerprint(10, 'target_r05');
    const targetModel: TemplateVersion = {
      id: 'PEI_TARGET_R05',
      nome: 'Template Target R05',
      descrizione: 'Target di normalizzazione',
      ordineScolastico: 'primaria',
      versioneMinisteriale: '2024',
      versione: '2024',
      annoValidita: 2024,
      hash: 'hash_target',
      fingerprint: fpTarget,
      geometry: { overallGeometryScore: 98.0 },
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    registry.register(targetModel);

    const planner = new NormalizationPlanningEngine();
    const candidateFp = createSyntheticFingerprint(10, 'candidate_skewed');

    const plan = planner.createPlan({
      fingerprint: candidateFp,
      targetTemplateId: targetModel.id,
      targetVersion: targetModel.versioneMinisteriale,
    });

    expect(plan).toBeDefined();
    expect(plan.targetTemplateId).toBe('PEI_TARGET_R05');
    expect(plan.targetVersion).toBe('2024');
    expect(plan.pagePlans).toHaveLength(10);
  });

  // =========================================================================
  // TEST 11: Compatibilità con R06 (NormalizationExecutionEngine)
  // =========================================================================
  it('TEST 11: Compatibilità con R06 (Esecuzione normalizzazione con Catalog dinamico R07)', async () => {
    const filePath = path.resolve(process.cwd(), 'public/models/ALLEGATO_A1_PEI_INFANZIA.pdf');
    const fileBytes = fs.readFileSync(filePath);
    const buffer = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    );

    const analysis = await analyzer.analyze(buffer);

    const targetTemplate: TemplateVersion = {
      id: 'CANONICAL_A1_R07',
      nome: "Modello A1 Infanzia R07",
      descrizione: 'Modello canonico a catalogo R07',
      ordineScolastico: 'infanzia',
      versioneMinisteriale: '1.0',
      versione: '1.0',
      annoValidita: 2024,
      hash: 'hash_a1_r07',
      fingerprint: analysis.structuralFingerprint,
      geometry: analysis.geometricAnalysis!,
      templateSchema: {},
      dataRegistrazione: new Date().toISOString(),
      stato: 'active',
    };

    registry.register(targetTemplate);

    const catalog = new CanonicalTemplateCatalog(undefined, undefined, registry);
    const planner = new NormalizationPlanningEngine();
    const executor = new NormalizationExecutionEngine({
      analyzer,
      catalog,
    });

    const plan = planner.createPlan({
      fingerprint: analysis.structuralFingerprint,
      geometricAnalysis: analysis.geometricAnalysis,
      targetTemplateId: targetTemplate.id,
      targetVersion: targetTemplate.versioneMinisteriale,
    });

    const result = await executor.execute({
      document: buffer,
      plan,
      precomputedAnalysisBefore: analysis,
      catalog,
    });

    expect(result.normalizationReport.contentPreserved).toBe(true);
    expect(result.geometryScoreAfter).toBeGreaterThanOrEqual(result.geometryScoreBefore);
    expect(result.newMatchResult).toBeDefined();
  });
});
