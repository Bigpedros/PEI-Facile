import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveCustomTemplate,
  getTemplatePdfBinary,
  getCustomTemplateMetadata,
  listAllCustomTemplates,
} from '../core/templateStorage';
import { resolveTemplateSource } from '../core/templateSourceResolver';
import { computeSha256 } from '../core/templateAcquisitionService';
import type { PersistedTemplateRecord, TemplateAcquisitionResult } from '../core/templateAcquisitionTypes';
import type { PeiModelDefinition } from '../types/pei';
import type { RectificationMetrics } from '../core/geometry/geometricRectificationEngine';

// Minimal valid PDF binary helper for contract testing
function createMockPdfBytes(contentTag: string): Uint8Array {
  const header = `%PDF-1.4\n%mock_${contentTag}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.32 841.92] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000018 00000 n \n0000000077 00000 n \n0000000133 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n220\n%%EOF`;
  return new TextEncoder().encode(header);
}

describe('PEI FACILE — Roadmap Punto 2: Continuità dello Sfondo e delle Metriche', () => {
  beforeEach(() => {
    // Clear in-memory / storage references before each test
  });

  it('1. Propagazione contrattuale delle metriche per pagina (metriche distinte su P1 e P2)', async () => {
    const p1Metrics: RectificationMetrics = {
      engineUsed: 'OPENCV_NODE',
      originalWidthPx: 1240,
      originalHeightPx: 1754,
      globalSkewDegrees: 1.45,
      perspectiveApplied: true,
      localCurvatureMaxDeviationPx: 4.8,
      localCurvatureMeanDeviationPx: 1.9,
      gridResolution: { cols: 16, rows: 24 },
      dewarpingMapApplied: true,
      confidence: 0.92,
      status: 'OPTIMAL',
      processingTimeMs: 120,
    };

    const p2Metrics: RectificationMetrics = {
      engineUsed: 'OPENCV_NODE',
      originalWidthPx: 1240,
      originalHeightPx: 1754,
      globalSkewDegrees: -0.62,
      perspectiveApplied: false,
      localCurvatureMaxDeviationPx: 1.2,
      localCurvatureMeanDeviationPx: 0.4,
      gridResolution: { cols: 16, rows: 24 },
      dewarpingMapApplied: false,
      confidence: 0.96,
      status: 'OPTIMAL',
      processingTimeMs: 95,
    };

    const rawBytes = createMockPdfBytes('raw_doc_p1_p2');
    const normBytes = createMockPdfBytes('norm_doc_p1_p2');
    const sourceSha = await computeSha256(rawBytes);
    const normSha = await computeSha256(normBytes);

    const record: PersistedTemplateRecord = {
      templateId: `tpl_multi_page_${Date.now()}`,
      name: 'Modello Test Multipagina',
      schoolOrder: 'A3',
      sourceFileName: 'test_multipagina.pdf',
      sourceSha256: sourceSha,
      normalizedSha256: normSha,
      normalizationSucceeded: true,
      fileSizeBytes: rawBytes.byteLength,
      pageCount: 2,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'REVIEW_REQUIRED',
      pages: [
        { pageNumber: 1, widthPt: 595.32, heightPt: 841.92, fields: [] },
        { pageNumber: 2, widthPt: 595.32, heightPt: 841.92, fields: [] },
      ],
      engineUsed: 'OPENCV_NODE',
      globalSkewDegrees: p1Metrics.globalSkewDegrees,
      perspectiveApplied: p1Metrics.perspectiveApplied,
      dewarpingMapApplied: p1Metrics.dewarpingMapApplied,
      localCurvatureMaxDeviationPx: p1Metrics.localCurvatureMaxDeviationPx,
      pageMetrics: [p1Metrics, p2Metrics],
    };

    await saveCustomTemplate(record, normBytes, rawBytes);

    const loadedMeta = await getCustomTemplateMetadata(record.templateId);
    expect(loadedMeta).toBeDefined();
    expect(loadedMeta?.pageMetrics).toBeDefined();
    expect(loadedMeta?.pageMetrics?.length).toBe(2);

    // Verifica che P1 e P2 conservino le rispettive metriche distinte
    expect(loadedMeta?.pageMetrics?.[0].globalSkewDegrees).toBe(1.45);
    expect(loadedMeta?.pageMetrics?.[0].perspectiveApplied).toBe(true);
    expect(loadedMeta?.pageMetrics?.[0].dewarpingMapApplied).toBe(true);

    expect(loadedMeta?.pageMetrics?.[1].globalSkewDegrees).toBe(-0.62);
    expect(loadedMeta?.pageMetrics?.[1].perspectiveApplied).toBe(false);
    expect(loadedMeta?.pageMetrics?.[1].dewarpingMapApplied).toBe(false);
  });

  it('2. Dati mancanti: i campi assenti rimangono undefined (nessun fallback ingannevole 0 o false)', async () => {
    const rawBytes = createMockPdfBytes('unprocessed_doc');
    const sourceSha = await computeSha256(rawBytes);

    const recordWithoutMetrics: PersistedTemplateRecord = {
      templateId: `tpl_no_metrics_${Date.now()}`,
      name: 'Modello Senza Metriche',
      schoolOrder: 'A2',
      sourceFileName: 'grezzo.pdf',
      sourceSha256: sourceSha,
      fileSizeBytes: rawBytes.byteLength,
      pageCount: 1,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'REVIEW_REQUIRED',
      pages: [{ pageNumber: 1, widthPt: 595.32, heightPt: 841.92, fields: [] }],
      // Engine e metriche volutamente non fornite
    };

    await saveCustomTemplate(recordWithoutMetrics, rawBytes, rawBytes);

    const loadedMeta = await getCustomTemplateMetadata(recordWithoutMetrics.templateId);
    expect(loadedMeta).toBeDefined();
    expect(loadedMeta?.engineUsed).toBeUndefined();
    expect(loadedMeta?.globalSkewDegrees).toBeUndefined();
    expect(loadedMeta?.perspectiveApplied).toBeUndefined();
    expect(loadedMeta?.dewarpingMapApplied).toBeUndefined();
    expect(loadedMeta?.localCurvatureMaxDeviationPx).toBeUndefined();
    expect(loadedMeta?.normalizedSha256).toBeUndefined();
  });

  it('3. Errore di normalizzazione con originale conservato: non dichiara successo né assegna normalizedSha256', async () => {
    const rawBytes = createMockPdfBytes('corrupted_for_norm');
    const sourceSha = await computeSha256(rawBytes);

    const failedNormRecord: PersistedTemplateRecord = {
      templateId: `tpl_failed_norm_${Date.now()}`,
      name: 'Modello Fallito Normalizzazione',
      schoolOrder: 'A1',
      sourceFileName: 'errore_norm.pdf',
      sourceSha256: sourceSha,
      normalizedSha256: undefined,
      normalizationSucceeded: false,
      fileSizeBytes: rawBytes.byteLength,
      pageCount: 1,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'REVIEW_REQUIRED',
      pages: [{ pageNumber: 1, widthPt: 595.32, heightPt: 841.92, fields: [] }],
    };

    await saveCustomTemplate(failedNormRecord, rawBytes, rawBytes);

    const meta = await getCustomTemplateMetadata(failedNormRecord.templateId);
    expect(meta?.normalizationSucceeded).toBe(false);
    expect(meta?.normalizedSha256).toBeUndefined();
    expect(meta?.sourceSha256).toBe(sourceSha);

    const retrievedBinary = await getTemplatePdfBinary(meta!.sourceSha256);
    expect(retrievedBinary).toBeDefined();
    const retrievedSha = await computeSha256(retrievedBinary!);
    expect(retrievedSha).toBe(sourceSha);
  });

  it('4. Riapertura e corrispondenza binario-hash senza rielaborazione', async () => {
    const rawBytes = createMockPdfBytes('original_source_v1');
    const normBytes = createMockPdfBytes('normalized_a4_v1');
    const sourceSha = await computeSha256(rawBytes);
    const normSha = await computeSha256(normBytes);

    const modelDef: PeiModelDefinition = {
      id: `model_persist_${Date.now()}`,
      name: 'Modello Verifica Chiusura Riapertura',
      schoolOrder: 'A4',
      originType: 'TERRITORIAL',
      originName: 'Istituto Comprensivo Roma Est',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: sourceSha,
      sourceSha256: sourceSha,
      normalizedSha256: normSha,
      sourcePdfSha256: sourceSha,
      normalizedPdfSha256: normSha,
      templateId: `tpl_persist_${Date.now()}`,
      calibrationStatus: 'CALIBRATED',
      engineUsed: 'OPENCV_NODE',
      globalSkewDegrees: 0.85,
      perspectiveApplied: true,
      dewarpingMapApplied: true,
      localCurvatureMaxDeviationPx: 3.4,
    };

    await saveCustomTemplate(
      {
        templateId: modelDef.templateId!,
        name: modelDef.name,
        schoolOrder: modelDef.schoolOrder,
        sourceFileName: 'doc_roma.pdf',
        sourceSha256: sourceSha,
        normalizedSha256: normSha,
        fileSizeBytes: rawBytes.byteLength,
        pageCount: 1,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationStatus: 'CALIBRATED',
        pages: [{ pageNumber: 1, widthPt: 595.32, heightPt: 841.92, fields: [] }],
        engineUsed: modelDef.engineUsed,
        globalSkewDegrees: modelDef.globalSkewDegrees,
        perspectiveApplied: modelDef.perspectiveApplied,
        dewarpingMapApplied: modelDef.dewarpingMapApplied,
        localCurvatureMaxDeviationPx: modelDef.localCurvatureMaxDeviationPx,
      },
      normBytes,
      rawBytes
    );

    // Risoluzione / riapertura tramite templateSourceResolver
    const resolved = await resolveTemplateSource({
      modelDef,
      modelId: modelDef.id,
      schoolOrder: 'A4',
    });

    expect(resolved).toBeDefined();
    expect(resolved.sourceKind).toBe('USER_IMPORTED');
    expect(resolved.sourceBinary).toBeDefined();

    // Il binario recuperato corrisponde esattamente all'hash normalizzato registrato
    const resolvedSha = await computeSha256(resolved.sourceBinary);
    expect(resolvedSha).toBe(normSha);
    expect(resolved.geometryMapping.normalizedPdfSha256).toBe(normSha);
    expect(resolved.geometryMapping.sourcePdfSha256).toBe(sourceSha);
  });

  it('5. Conservazione delle proprietà e delle modifiche manuali dei campi', async () => {
    const rawBytes = createMockPdfBytes('fields_preserve_test');
    const sourceSha = await computeSha256(rawBytes);

    const recordWithFields: PersistedTemplateRecord = {
      templateId: `tpl_fields_${Date.now()}`,
      name: 'Modello con Campi Personalizzati',
      schoolOrder: 'A3',
      sourceFileName: 'campi_test.pdf',
      sourceSha256: sourceSha,
      fileSizeBytes: rawBytes.byteLength,
      pageCount: 1,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'CALIBRATED',
      pages: [
        {
          pageNumber: 1,
          widthPt: 595.32,
          heightPt: 841.92,
          fields: [
            {
              fieldId: 'FIELD_01_CONFIRMED',
              pageNumber: 1,
              label: 'Diagnosi Funzionale',
              xPt: 50,
              yPt: 120,
              widthPt: 495,
              heightPt: 80,
              anchorText: 'Diagnosi Funzionale',
              derivationMethod: 'MANUAL_VERIFIED',
              status: 'MAPPED',
              backgroundMode: 'OPAQUE_WHITE',
              calibrationStatus: 'CONFIRMED',
              confidence: 1.0,
            },
            {
              fieldId: 'FIELD_02_MODIFIED',
              pageNumber: 1,
              label: 'Interventi Educativi',
              xPt: 50,
              yPt: 220,
              widthPt: 495,
              heightPt: 150,
              anchorText: 'Interventi Educativi',
              derivationMethod: 'MANUAL',
              status: 'MAPPED',
              backgroundMode: 'TRANSPARENT',
              calibrationStatus: 'MODIFIED',
              confidence: 0.95,
              isModifiedAfterProposal: true,
            },
            {
              fieldId: 'FIELD_03_REJECTED',
              pageNumber: 1,
              label: 'Firma Docente Scartata',
              xPt: 50,
              yPt: 400,
              widthPt: 200,
              heightPt: 40,
              anchorText: 'Firma',
              derivationMethod: 'USER_CREATED',
              status: 'UNMAPPED',
              calibrationStatus: 'REJECTED',
            },
          ],
        },
      ],
    };

    await saveCustomTemplate(recordWithFields, rawBytes, rawBytes);

    const loaded = await getCustomTemplateMetadata(recordWithFields.templateId);
    expect(loaded).toBeDefined();
    const fields = loaded?.pages[0].fields;
    expect(fields?.length).toBe(3);

    // Campo 1: Confermato con sfondo opaco bianco
    expect(fields?.[0].fieldId).toBe('FIELD_01_CONFIRMED');
    expect(fields?.[0].calibrationStatus).toBe('CONFIRMED');
    expect(fields?.[0].backgroundMode).toBe('OPAQUE_WHITE');

    // Campo 2: Modificato con sfondo trasparente
    expect(fields?.[1].fieldId).toBe('FIELD_02_MODIFIED');
    expect(fields?.[1].calibrationStatus).toBe('MODIFIED');
    expect(fields?.[1].backgroundMode).toBe('TRANSPARENT');
    expect(fields?.[1].isModifiedAfterProposal).toBe(true);

    // Campo 3: Scartato
    expect(fields?.[2].fieldId).toBe('FIELD_03_REJECTED');
    expect(fields?.[2].calibrationStatus).toBe('REJECTED');
  });

  it('6. Modello non-normalizzato recupera il binario originale senza incorrere in TEMPLATE_INTEGRITY_MISMATCH', async () => {
    const rawBytes = createMockPdfBytes('unnormalized_doc_source');
    const sourceSha = await computeSha256(rawBytes);

    const unnormModelDef: PeiModelDefinition = {
      id: `tpl_custom_unnorm_${sourceSha.slice(0, 12)}`,
      name: 'Modello Solo Originale',
      schoolOrder: 'A2',
      originType: 'INSTITUTION',
      originName: 'Istituto Comprensivo Test',
      version: '1.0',
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceKind: 'USER_IMPORTED',
      sourceHash: sourceSha,
      sourceSha256: sourceSha,
      normalizedSha256: undefined,
      sourcePdfSha256: sourceSha,
      normalizedPdfSha256: undefined,
      normalizationSucceeded: false,
      templateId: `tpl_custom_unnorm_${sourceSha.slice(0, 12)}`,
      calibrationStatus: 'CALIBRATED',
    };

    // Salva solo il binario originale
    await saveCustomTemplate(
      {
        templateId: unnormModelDef.templateId!,
        name: unnormModelDef.name,
        schoolOrder: unnormModelDef.schoolOrder,
        sourceFileName: 'originale_puro.pdf',
        sourceSha256: sourceSha,
        normalizedSha256: undefined,
        normalizationSucceeded: false,
        fileSizeBytes: rawBytes.byteLength,
        pageCount: 1,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationStatus: 'CALIBRATED',
        pages: [{ pageNumber: 1, widthPt: 595.32, heightPt: 841.92, fields: [] }],
      },
      rawBytes,
      rawBytes
    );

    // Risoluzione modello tramite templateSourceResolver
    const resolved = await resolveTemplateSource({
      modelDef: unnormModelDef,
      modelId: unnormModelDef.id,
      schoolOrder: 'A2',
    });

    expect(resolved).toBeDefined();
    expect(resolved.sourceKind).toBe('USER_IMPORTED');
    const retrievedSha = await computeSha256(resolved.sourceBinary);
    expect(retrievedSha).toBe(sourceSha);
    expect(resolved.geometryMapping.sourcePdfSha256).toBe(sourceSha);
    expect(resolved.geometryMapping.normalizedPdfSha256).toBeUndefined();
  });

  it('7. Riconciliazione modello: preserva lo stato persistito REVIEW_REQUIRED senza promuoverlo falsamente a CALIBRATED', async () => {
    const rawBytes = createMockPdfBytes('review_required_doc');
    const sourceSha = await computeSha256(rawBytes);
    const templateId = `tpl_custom_${sourceSha.slice(0, 12)}`;

    const persistedRecord: PersistedTemplateRecord = {
      templateId,
      name: 'Modello da Revisionare',
      schoolOrder: 'A1',
      sourceFileName: 'da_revisionare.pdf',
      sourceSha256: sourceSha,
      normalizedSha256: undefined,
      normalizationSucceeded: false,
      fileSizeBytes: rawBytes.byteLength,
      pageCount: 1,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      calibrationStatus: 'REVIEW_REQUIRED',
      pages: [{ pageNumber: 1, widthPt: 595.32, heightPt: 841.92, fields: [] }],
    };

    await saveCustomTemplate(persistedRecord, rawBytes, rawBytes);

    const loadedMeta = await getCustomTemplateMetadata(templateId);
    expect(loadedMeta).toBeDefined();
    expect(loadedMeta?.calibrationStatus).toBe('REVIEW_REQUIRED');
  });
});
