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
import { PdfFormatAdapter } from './documentAdapters/pdfAdapter';
import { ImageFormatAdapter } from './documentAdapters/imageAdapter';
import { TiffFormatAdapter } from './documentAdapters/tiffAdapter';
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

const pdfAdapter = new PdfFormatAdapter();
const imageAdapter = new ImageFormatAdapter();
const tiffAdapter = new TiffFormatAdapter();
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
  const isUint8Array = input instanceof Uint8Array || (input && (input as any).constructor && (input as any).constructor.name === 'Uint8Array');
  if (mainFile instanceof File || input instanceof ArrayBuffer || isUint8Array || ArrayBuffer.isView(input)) {
    try {
      const tempBytes = await normalizeInputData(mainFile || (input as any));
      rawBytes = new Uint8Array(tempBytes);
    } catch (e) {
      console.log('[DEBUG CTE] normalizeInputData error:', e);
    }
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

  if (detectedFormat === 'PDF') {
    rawPages = await pdfAdapter.extractPages(input, effectiveFileName, options);
  } else if (detectedFormat === 'IMAGE_JPEG' || detectedFormat === 'IMAGE_PNG') {
    rawPages = await imageAdapter.extractPages(input, effectiveFileName, options);
  } else if (detectedFormat === 'IMAGE_TIFF') {
    rawPages = await tiffAdapter.extractPages(input, effectiveFileName, options);
  } else if (detectedFormat === 'DOCX') {
    rawPages = await docxAdapter.extractPages(input, effectiveFileName, options);
  }

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
  const studentEv = evidenceList.find((e) => e.fieldId === 'f-01-studente');
  const schoolEv = evidenceList.find((e) => e.fieldId === 'f-01-scuola');
  const classEv = evidenceList.find((e) => e.fieldId === 'f-01-classe');
  const dateEv = evidenceList.find((e) => e.fieldId === 'f-01-data-redazione');

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
    fileName: effectiveFileName,
    detectedFormat,
    totalPages: rawPages.length,
    classification,
    rawPages,
    fullText,
    evidenceList,
    studentCode: studentEv ? studentEv.extractedValue : undefined,
    schoolName: schoolEv ? schoolEv.extractedValue : undefined,
    classOrSection: classEv ? classEv.extractedValue : undefined,
    compilationDate: dateEv ? dateEv.extractedValue : undefined,
    sourceBinary: rawBytes,
    canonicalDocument: rawBytes,
    processingTimeMs,
    warnings,
    logs,
  };
}
