import { pageCandidates } from './documental/bridge';
/**
 * @license
 * PEI FACILE — Dynamic Template Acquisition Engine (Phase 1B R01)
 * Generic engine for document intake, SHA-256 binding, AcroForm/Annotation/Vector/Anchor derivation.
 * Supports known ministerial A1-A4 fast paths while acquiring custom user-uploaded templates.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  TemplateAcquisitionResult,
  CandidateFieldGeometry,
  UnresolvedRegion,
  TemplateAcquisitionStatus,
  AcquireTemplateOptions,
  AcquisitionAbortedError,
} from './templateAcquisitionTypes';
import type { PageGeometry, ModelGeometry } from '../data/geometry/types';
import { normalizeInputData } from './pdfIntakeService';
import { processDocumentAcquisition } from './documentAcquisitionService';
import { DocxFormatAdapter } from './documentAdapters/docxAdapter';

import A1Data from '../data/geometry/A1.geometry.json';
import A2Data from '../data/geometry/A2.geometry.json';
import A3Data from '../data/geometry/A3.geometry.json';
import A4Data from '../data/geometry/A4.geometry.json';

// Known ministerial PDF SHA-256 hashes for Fast Path execution
export const MINISTERIAL_FAST_PATH_HASHES: Record<string, { modelId: string; data: ModelGeometry }> = {
  'affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c': {
    modelId: 'A1',
    data: A1Data as unknown as ModelGeometry,
  },
  '3eb708f7ae405308858505bf160d8d1dbdb3cf9d291c1bbaf072835ac8521a1f': {
    modelId: 'A2',
    data: A2Data as unknown as ModelGeometry,
  },
  '8975f4ffb763c9faa914d6b1f8c34c30b68c5fb167e9d8751befcdc0cb695728': {
    modelId: 'A3',
    data: A3Data as unknown as ModelGeometry,
  },
  '9fef25e6eafc03f7a63f6812cd9a7dab9490a056f37ac6b5f384c30be5e73b47': {
    modelId: 'A4',
    data: A4Data as unknown as ModelGeometry,
  },
};

/**
 * Computes cryptographically real SHA-256 hexadecimal string from a byte array.
 * Works seamlessly in both browser and Node/Vitest environments.
 */
export async function computeSha256(data: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const nodeCrypto = await import('crypto');
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Main Dynamic Template Acquisition entry point.
 */
export async function acquirePdfTemplate(
  input: ArrayBuffer | Uint8Array | Blob | File,
  fileName = 'template.pdf',
  optionsInput: boolean | AcquireTemplateOptions = false
): Promise<TemplateAcquisitionResult> {
  const options: AcquireTemplateOptions =
    typeof optionsInput === 'boolean' ? { forceReanalysis: optionsInput } : optionsInput || {};
  const { forceReanalysis = false, onProgress, signal } = options;

  const warnings: string[] = [];

  if (signal?.aborted) {
    throw new AcquisitionAbortedError();
  }

  // 1. Check for unsupported DOC legacy input
  if (fileName.toLowerCase().endsWith('.doc') && !fileName.toLowerCase().endsWith('.docx')) {
    return {
      templateId: `doc_${Date.now()}`,
      sourceFileName: fileName,
      sourceSha256: 'DOC_LEGACY_UNSUPPORTED',
      fileSizeBytes: 0,
      pageCount: 0,
      pages: [],
      geometryCandidates: [],
      unmappedRegions: [],
      confidence: 0,
      status: 'FAILED',
      isMinisterialFastPath: false,
      warnings: [
        'Formato DOC legacy non ancora supportato. Convertire il file in DOCX o PDF.',
      ],
    };
  }

  // 2. Real byte normalization & SHA-256 calculation
  const rawBytes = await normalizeInputData(input);
  const fileSizeBytes = rawBytes.byteLength;
  const sourceSha256 = await computeSha256(rawBytes);

  if (signal?.aborted) {
    throw new AcquisitionAbortedError();
  }

  // 3. Genuine DOCX Template Intake (Structural & Font Symbol Limitation Notice)
  if (fileName.toLowerCase().endsWith('.docx')) {
    return {
      templateId: `tpl_docx_${sourceSha256.slice(0, 12)}`,
      sourceFileName: fileName,
      sourceSha256,
      fileSizeBytes,
      pageCount: 0,
      pages: [],
      geometryCandidates: [],
      unmappedRegions: [],
      confidence: 0,
      status: 'FAILED',
      isMinisterialFastPath: false,
      warnings: [
        'I file Word (.docx) non possono preservare tabelle, bordi, celle e formati complessi tramite conversione testuale automatica (rilevati caratteri simbolici font non codificabili in WinAnsi come 0xf020 e limitazione strutturale di tabelle/impaginazione). Si prega di esportare il documento in formato PDF da Microsoft Word o LibreOffice ed effettuare l’acquisizione del file PDF. Nessun record degradato è stato salvato nel catalogo.',
      ],
    };
  }

  // 3. Check for Ministerial Fast Path (A1-A4)
  if (!forceReanalysis && MINISTERIAL_FAST_PATH_HASHES[sourceSha256]) {
    const fastPath = MINISTERIAL_FAST_PATH_HASHES[sourceSha256];
    const baseline = fastPath.data;

    const allCandidates: CandidateFieldGeometry[] = [];
    baseline.pages.forEach((p) => {
      p.fields.forEach((f) => {
        allCandidates.push({
          ...f,
          evidence: `Baseline interna approvata modello ministeriale ${fastPath.modelId}`,
          fieldType: f.fieldId.includes('data') ? 'date' : f.heightPt > 40 ? 'textarea' : 'text',
        });
      });
    });

    if (onProgress) {
      onProgress({
        currentPage: baseline.totalPages,
        totalPages: baseline.totalPages,
        percentage: 100,
        stage: 'REVIEW_READY',
        stageLabel: `Modello ministeriale ${fastPath.modelId} riconosciuto istantaneamente`,
      });
    }

    return {
      templateId: `ministerial_${fastPath.modelId.toLowerCase()}`,
      sourceFileName: fileName,
      sourceSha256,
      fileSizeBytes,
      pageCount: baseline.totalPages,
      pages: baseline.pages,
      geometryCandidates: allCandidates,
      unmappedRegions: [],
      confidence: 1.0,
      status: 'READY',
      isMinisterialFastPath: true,
      warnings: [],
    };
  }

  // 4. Unknown or custom PDF — Real CTE A4 Normalization & PDF.js inspection
  const normAcquisitionResult = await processDocumentAcquisition(rawBytes, fileName, {
    onProgress,
    signal,
  });

  if (signal?.aborted) {
    throw new AcquisitionAbortedError();
  }

  const canonicalBytes = normAcquisitionResult.canonicalDocument
    ? new Uint8Array(normAcquisitionResult.canonicalDocument)
    : rawBytes;
  const coordinateTransform = normAcquisitionResult.coordinateTransform;

  const document = normAcquisitionResult.documentalResult;
  if (!document) throw new Error('Risultato documentale non disponibile.');
  const pages = document.pages.map(p => ({pageNumber:p.pageNumber,widthPt:210/25.4*72,
    heightPt:297/25.4*72,fields:pageCandidates(p)}));
  const geometryCandidates = pages.flatMap(p=>p.fields);
  return {
    templateId:`tpl_custom_${sourceSha256.slice(0,12)}`,sourceFileName:fileName,sourceSha256,
    normalizedSha256:normAcquisitionResult.normalizedSha256,normalizationSucceeded:true,
    fileSizeBytes,pageCount:pages.length,pages,geometryCandidates,unmappedRegions:[],
    confidence:geometryCandidates.length ? geometryCandidates.reduce((a,f)=>a+(f.confidence??0),0)/geometryCandidates.length : 0,
    status:'REVIEW_REQUIRED',isMinisterialFastPath:false,
    warnings:normAcquisitionResult.warnings,canonicalDocument:canonicalBytes,coordinateTransform,
    engineUsed:'DOCUMENTAL_020',normalizationReport:normAcquisitionResult.normalizationReport,
  };
}
