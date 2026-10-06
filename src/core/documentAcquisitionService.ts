import { runDocumental, canonicalRasterPdf, pageTransform } from './documental/bridge';
/**
 * @license
 * PEI FACILE — Document Acquisition Service (DOCUMENT ACQUISITION R01)
 * Servizio di orchestrazione multiformato e analisi semantica.
 */

import type {
  DocumentAcquisitionOptions,
  DocumentAcquisitionResult,
  ExtractedRawPage,
} from '../types/documentAcquisitionTypes';
import { detectDocumentFormat } from './documentAdapters/baseAdapter';
import { DocxFormatAdapter } from './documentAdapters/docxAdapter';
import {
  classifyDocumentModel,
  extractSemanticFieldEvidences,
} from './semanticAcquisitionEngine';
import { normalizeInputData } from './pdfIntakeService';
import { PdfDocumentAnalyzer } from './canonical-template-engine/analyzer/pdfDocumentAnalyzer';
import { CanonicalTemplateMatcher } from './canonical-template-engine/matcher/canonicalTemplateMatcher';
import { MATCH_THRESHOLDS } from './canonical-template-engine/matcher/thresholds';
import { getTemplatePdfBinary } from './templateStorage';
import { CteDecision, type NormalizationReport } from './canonical-template-engine/types';

import { computeSha256 } from './templateAcquisitionService';

const docxAdapter = new DocxFormatAdapter();

export async function processDocumentAcquisition(
  input: File | File[] | ArrayBuffer,
  fileName = 'documento',
  options: DocumentAcquisitionOptions = {}
): Promise<DocumentAcquisitionResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const warnings: string[] = [];

  const mainFile = Array.isArray(input) ? input[0] : input instanceof File ? input : null;
  const effectiveFileName = mainFile ? mainFile.name : fileName;
  const mimeType = mainFile ? mainFile.type : undefined;

  const detectedFormat = detectDocumentFormat(effectiveFileName, mimeType);

  let rawBytes: Uint8Array | undefined;
  const rawInput = Array.isArray(input) ? input[0] : input;
  if (rawInput) {
    try {
      const tempBytes = await normalizeInputData(rawInput);
      rawBytes = new Uint8Array(tempBytes.buffer, tempBytes.byteOffset, tempBytes.byteLength);
    } catch (e) {
      console.warn('[DocumentAcquisition] rawBytes extraction error:', e);
    }
  }

  let sourceSha256: string | undefined;
  if (rawBytes && rawBytes.byteLength > 0) {
    sourceSha256 = await computeSha256(rawBytes);
  }

  // Gestione esplicita e veritiera di DOC legacy
  if (detectedFormat === 'UNSUPPORTED_LEGACY_DOC') {
    throw new Error(
      'Formato DOC legacy non ancora supportato. Convertire il file in DOCX o PDF.'
    );
  }

  if (detectedFormat === 'UNKNOWN') {
    throw new Error(
      `Formato file "${effectiveFileName}" non riconosciuto. Supportati: PDF, JPG, PNG, TIFF, DOCX.`
    );
  }

  // Selezione adapter
  let rawPages: ExtractedRawPage[] = [];

  // DOCX retains its established adapter; all raster/PDF formats use the unified core.
  const documentalResult = detectedFormat === 'DOCX' ? undefined : await runDocumental(input, effectiveFileName, options);
  if (documentalResult) {
    rawPages = documentalResult.pages.map(p => ({pageNumber:p.pageNumber,text:p.text,
      pageType:p.warnings.some(w=>w.startsWith('Pagina mista')) ? 'MIXED' : p.source === 'pdf' ? 'TEXT_NATIVE' : 'IMAGE_ONLY',
      confidence:p.source === 'ocr' && p.tokens.length ? p.tokens.reduce((sum,t)=>sum+(t.confidence??0),0)/p.tokens.length : undefined,
      warnings:p.warnings}));
    warnings.push(...documentalResult.pages.flatMap(p=>p.warnings.map(w=>`Pagina ${p.pageNumber}: ${w}`)));
  } else rawPages = await docxAdapter.extractPages(input, effectiveFileName, options);

  if (rawPages.length === 0) {
    throw new Error('Nessun contenuto o pagina estraibile dal documento fornito.');
  }

  // Notifica stadio analisi semantica
  if (options.onProgress) {
    options.onProgress({
      currentPage: rawPages.length,
      totalPages: rawPages.length,
      percentage: 90,
      stage: 'SEMANTIC_ANALYSIS',
      stageLabel: 'Analisi campi',
      detail: 'Classificazione modello e riconoscimento semantico dei campi...',
    });
  }

  const fullText = rawPages.map((p) => p.text).join('\n\n');

  // 1. Model classification
  let classification = classifyDocumentModel(fullText, options.customModels || []);

  // 1B. Fallback matching structurally using CanonicalTemplateMatcher
  if (
    !classification.isModelRecognized &&
    detectedFormat === 'PDF' &&
    rawBytes &&
    rawBytes.byteLength > 0 &&
    options.customModels &&
    options.customModels.length > 0
  ) {
    try {
      const analyzer = new PdfDocumentAnalyzer();
      const docAnalysis = await analyzer.analyze(rawBytes.buffer);
      const candidateFp = docAnalysis.structuralFingerprint;

      const matcher = new CanonicalTemplateMatcher();
      let bestMatch: { model: any; score: number } | null = null;

      for (const cm of options.customModels) {
        const hash = cm.sourceSha256 || cm.sourceHash;
        if (hash) {
          const tplBytes = await getTemplatePdfBinary(hash);
          if (tplBytes && tplBytes.byteLength > 0) {
            const tplAnalysis = await analyzer.analyze(tplBytes.buffer);
            const tplFp = tplAnalysis.structuralFingerprint;
            const matchResult = matcher.match(tplFp, candidateFp);

            if (matchResult.similarityScore >= MATCH_THRESHOLDS.COMPATIBLE) {
              if (!bestMatch || matchResult.similarityScore > bestMatch.score) {
                bestMatch = { model: cm, score: matchResult.similarityScore };
              }
            }
          }
        }
      }

      if (bestMatch) {
        const matchedModel = bestMatch.model;
        classification = {
          detectedOrder: matchedModel.schoolOrder,
          detectedModelId: matchedModel.id,
          detectedModelName: matchedModel.name,
          isModelRecognized: true,
          recognitionReason: `Corrispondenza di layout strutturale con modello personalizzato (similarità: ${bestMatch.score}%).`,
          confidence: Math.round(bestMatch.score),
        };
      }
    } catch (err) {
      console.warn('Errore durante il fallback del matching strutturale:', err);
    }
  }

  const effectiveSchoolOrder = options.forcedSchoolOrder || classification.detectedOrder || 'A2';

  // 2. Field extraction based on real TemplateSchema field IDs
  const evidenceList = extractSemanticFieldEvidences(rawPages, effectiveSchoolOrder);

  // Estrazione metadata di base per inizializzazione pulita
  const studentNameEv = evidenceList.find((e) => e.fieldId === 'f-01-studente');
  const studentCodeEv = evidenceList.find((e) => e.fieldId === 'f-01-codice-sostitutivo');
  const schoolEv = evidenceList.find((e) => e.fieldId === 'f-01-scuola');
  const classEv = evidenceList.find((e) => e.fieldId === 'f-01-classe');
  const sezioneEv = evidenceList.find((e) => e.fieldId === 'f-01-sezione');
  const plessoEv = evidenceList.find((e) => e.fieldId === 'f-01-plesso');
  const dateEv = evidenceList.find((e) => e.fieldId === 'f-01-data-redazione');

  // Distingui identificativo interno del documento, nome dell’alunno e codice sostitutivo personale.
  // Non usare il valore sostitutivo come nome estratto.
  const rawStudentCode = studentCodeEv?.extractedValue;
  const isStudentNameActuallyCode = studentNameEv?.extractedValue && /^ALU-[A-Z0-9_-]+$/i.test(studentNameEv.extractedValue);
  const studentName = studentNameEv && !isStudentNameActuallyCode ? studentNameEv.extractedValue : undefined;
  const studentCode = rawStudentCode || (isStudentNameActuallyCode ? studentNameEv!.extractedValue : undefined);

  // Sezione e Plesso distinti
  const sectionVal = sezioneEv?.extractedValue;
  const plessoVal = plessoEv?.extractedValue;
  let finalClassOrSection = classEv ? classEv.extractedValue : undefined;
  if (!finalClassOrSection && (sectionVal || plessoVal)) {
    if (sectionVal && plessoVal) {
      finalClassOrSection = `Sez. ${sectionVal} - ${plessoVal}`;
    } else {
      finalClassOrSection = sectionVal ? `Sez. ${sectionVal}` : plessoVal;
    }
  }

  // 3. Normalizzazione del modello in formato pagina A4 con Rettifica Geometrica OpenCV
  let canonicalBytes: Uint8Array | undefined = rawBytes;
  let normalizationReport: NormalizationReport | undefined;
  let coordinateTransform: DocumentAcquisitionResult['coordinateTransform'];
  let normalizationSucceeded = false;
  let normalizedSha256: string | undefined;
  let pageMetricsList: any[] | undefined;

  if (documentalResult) {
    canonicalBytes = await canonicalRasterPdf(documentalResult);
    normalizedSha256 = await computeSha256(canonicalBytes);
    normalizationSucceeded = true; // A4 aspect-fit only, not a geometric rectification claim.
    const pageTransforms = documentalResult.pages.map(pageTransform);
    coordinateTransform = {...pageTransforms[0],pageTransforms};
    normalizationReport = {engineUsed:'DOCUMENTAL_020',operation:'A4_ASPECT_FIT',
      coordinateSpace:'FINAL_RASTER_PX_TO_TOP_LEFT_PDF_PT',sourceCoordinateUnit:'px',
      geometricVerification:'NOT_RUN',perspectiveApplied:false,dewarpingApplied:false} as any;
  }

  const processingTimeMs = Date.now() - startTime;

  if (options.onProgress) {
    options.onProgress({
      currentPage: rawPages.length,
      totalPages: rawPages.length,
      percentage: 100,
      stage: 'REVIEW_READY',
      stageLabel: 'Preparazione revisione',
      detail: `Completato in ${(processingTimeMs / 1000).toFixed(1)}s. ${evidenceList.length} campi pronti per la revisione.`,
    });
  }

  return {
    documentalResult,
    fileName: effectiveFileName,
    detectedFormat,
    totalPages: rawPages.length,
    classification,
    rawPages,
    fullText,
    evidenceList,
    studentCode,
    studentName,
    section: sectionVal,
    site: plessoVal,
    schoolName: schoolEv ? schoolEv.extractedValue : undefined,
    classOrSection: finalClassOrSection,
    compilationDate: dateEv ? dateEv.extractedValue : undefined,
    sourceBinary: rawBytes,
    canonicalDocument: canonicalBytes || rawBytes,
    sourceSha256,
    normalizedSha256,
    normalizationSucceeded,
    normalizationReport,
    coordinateTransform,
    processingTimeMs,
    engineUsed: (normalizationReport as any)?.engineUsed,
    globalSkewDegrees: (normalizationReport as any)?.globalSkewDegrees,
    perspectiveApplied: (normalizationReport as any)?.perspectiveApplied,
    dewarpingMapApplied: (normalizationReport as any)?.dewarpingMapApplied,
    localCurvatureMaxDeviationPx: (normalizationReport as any)?.localCurvatureMaxDeviationPx,
    pageMetrics: pageMetricsList,
    warnings,
    logs,
  };
}
