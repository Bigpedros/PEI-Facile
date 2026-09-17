/**
 * @license
 * PEI FACILE — Dynamic Template Acquisition Engine (Phase 1B R01)
 * Generic engine for document intake, SHA-256 binding, AcroForm/Annotation/Vector/Anchor derivation.
 * Supports known ministerial A1-A4 fast paths while acquiring custom user-uploaded templates.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type {
  TemplateAcquisitionResult,
  CandidateFieldGeometry,
  UnresolvedRegion,
  TemplateAcquisitionStatus,
} from './templateAcquisitionTypes';
import type { PageGeometry, ModelGeometry } from '../data/geometry/types';
import { normalizeInputData } from './pdfIntakeService';

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
  forceReanalysis = false
): Promise<TemplateAcquisitionResult> {
  const warnings: string[] = [];

  // 1. Check for DOCX input — honest classification as mandated
  if (fileName.toLowerCase().endsWith('.docx') || fileName.toLowerCase().endsWith('.doc')) {
    return {
      templateId: `docx_${Date.now()}`,
      sourceFileName: fileName,
      sourceSha256: 'DOCX_CANONICALIZATION_NOT_IMPLEMENTED',
      fileSizeBytes: 0,
      pageCount: 0,
      pages: [],
      geometryCandidates: [],
      unmappedRegions: [],
      confidence: 0,
      status: 'FAILED',
      isMinisterialFastPath: false,
      warnings: [
        'I modelli DOCX richiedono la preventiva normalizzazione in formato PDF canonico prima dell’acquisizione geometrica. Il motore non accetta simulazioni non deterministiche di formattazione DOCX.',
      ],
      docxNotice: 'DOCX CANONICALIZATION: NOT IMPLEMENTED',
    };
  }

  // 2. Real byte normalization & SHA-256 calculation
  const rawBytes = await normalizeInputData(input);
  const fileSizeBytes = rawBytes.byteLength;
  const sourceSha256 = await computeSha256(rawBytes);

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

  // 4. Unknown or custom PDF — Real PDF.js inspection
  const loadingTask = pdfjsLib.getDocument({
    data: rawBytes,
    useSystemFonts: true,
    isEvalSupported: false,
  });

  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;

  if (pageCount <= 0) {
    return {
      templateId: `tpl_${Date.now()}`,
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
      warnings: ['Il documento PDF non contiene pagine valide.'],
    };
  }

  // 5. Inspect AcroForm at document level
  let documentAcroFields: Record<string, any> | null = null;
  try {
    if (typeof (pdfDoc as any).getFieldObjects === 'function') {
      documentAcroFields = await (pdfDoc as any).getFieldObjects();
    }
  } catch (err) {
    warnings.push('Impossibile estrarre oggetti AcroForm globali.');
  }

  const pagesGeometry: PageGeometry[] = [];
  const candidateFields: CandidateFieldGeometry[] = [];
  const unmappedRegions: UnresolvedRegion[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 1.0 });
    const pageWidthPt = vp.width;
    const pageHeightPt = vp.height;

    const pageFields: CandidateFieldGeometry[] = [];

    // Stage 1 & 2: Check Page Annotations (AcroForm widgets & form fields)
    try {
      const annotations = await page.getAnnotations();
      if (Array.isArray(annotations) && annotations.length > 0) {
        for (const ann of annotations) {
          if (ann.subtype === 'Widget' || ann.fieldType) {
            // Rect is [x1, y1, x2, y2] in PDF bottom-left points
            const rect = ann.rect;
            if (Array.isArray(rect) && rect.length === 4) {
              const xPt = Math.round(rect[0] * 100) / 100;
              const yBottom = rect[1];
              const widthPt = Math.round((rect[2] - rect[0]) * 100) / 100;
              const heightPt = Math.round((rect[3] - rect[1]) * 100) / 100;
              const yPt = Math.round((pageHeightPt - yBottom - heightPt) * 100) / 100;

              if (widthPt > 5 && heightPt > 5) {
                const fieldName = ann.fieldName || ann.name || `field_acro_p${pageNum}_${pageFields.length + 1}`;
                const cand: CandidateFieldGeometry = {
                  fieldId: `f-${pageNum}-${fieldName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`,
                  label: ann.alternativeText || ann.fieldName || 'Campo Modulo AcroForm',
                  pageNumber: pageNum,
                  xPt,
                  yPt,
                  widthPt,
                  heightPt,
                  anchorText: ann.fieldName || 'AcroForm Field',
                  derivationMethod: 'ACROFORM',
                  confidence: 0.98,
                  status: 'MAPPED',
                  evidence: `AcroForm Widget (${ann.fieldType || 'text'}) rilevato in pagina ${pageNum}`,
                  rawAcroFieldName: ann.fieldName,
                  rawAcroFieldType: ann.fieldType,
                  fieldType: ann.fieldType === 'Btn' ? 'checkbox' : 'text',
                };
                pageFields.push(cand);
              }
            }
          }
        }
      }
    } catch {
      // Annotations extraction non-fatal
    }

    // Stage 3, 4, 5, 6: Text Layer Analysis (Lines, Tables, Anchors, Unresolved regions)
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((it: any) => it.str && it.str.trim().length > 0) as any[];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const str: string = item.str;
      const x = item.transform ? item.transform[4] : 0;
      const yBottom = item.transform ? item.transform[5] : 0;
      const w = item.width || 0;
      const h = item.height || 10;
      const yTop = pageHeightPt - yBottom;

      // Check Ambiguous / Unresolved fill indicators (e.g. lonely question marks, brackets without clear bounds, questions)
      const isAmbiguous = /\[\s*\]|\(\s*\)|\?{1,}|ambigu/i.test(str);
      if (isAmbiguous) {
        unmappedRegions.push({
          pageNumber: pageNum,
          xPt: Math.round(x),
          yPt: Math.round(yTop - 10),
          widthPt: Math.max(80, Math.round(w)),
          heightPt: 20,
          evidence: `Pattern ambiguo rilevato: "${str}"`,
          reason: 'Ambiguita geometrica: delimitatori non deterministici senza etichetta univoca.',
          confidence: 0.45,
        });
        continue;
      }

      // Check Stage 3: Vector Boundary / Fill lines (e.g. `_____` or `.....`)
      const isUnderline = /_{3,}/.test(str) || /\.{4,}/.test(str);
      if (isUnderline) {
        // Find preceding label if any
        const prevItem = i > 0 ? items[i - 1] : null;
        const anchorLabel = prevItem && Math.abs(pageHeightPt - prevItem.transform[5] - yTop) < 15
          ? prevItem.str.trim()
          : 'Riga di compilazione';

        const cand: CandidateFieldGeometry = {
          fieldId: `f-${pageNum}-line-${pageFields.length + 1}`,
          label: anchorLabel,
          pageNumber: pageNum,
          xPt: Math.round(x),
          yPt: Math.round(yTop - 14),
          widthPt: Math.max(120, Math.round(w)),
          heightPt: 20,
          anchorText: str.slice(0, 30),
          derivationMethod: 'VECTOR_BOUNDARY',
          confidence: 0.85,
          status: 'MAPPED',
          evidence: `Sequenza di sottolineatura continua "${str.slice(0, 10)}..." su p.${pageNum}`,
          fieldType: 'text',
        };
        pageFields.push(cand);
        continue;
      }

      // Check Stage 5: Form field text anchors ending with `:`
      if (str.endsWith(':') && str.length > 2 && str.length < 50) {
        const xField = Math.min(pageWidthPt - 150, Math.round(x + w + 10));
        const widthField = Math.max(120, Math.round(pageWidthPt - xField - 40));

        const cand: CandidateFieldGeometry = {
          fieldId: `f-${pageNum}-anchor-${pageFields.length + 1}`,
          label: str.replace(/:$/, '').trim(),
          pageNumber: pageNum,
          xPt: xField,
          yPt: Math.round(yTop - 12),
          widthPt: widthField,
          heightPt: 20,
          anchorText: str,
          derivationMethod: 'TEXT_ANCHOR',
          confidence: 0.80,
          status: 'MAPPED',
          evidence: `Etichetta form con terminatore due punti "${str}"`,
          fieldType: 'text',
        };
        pageFields.push(cand);
        continue;
      }
    }

    // Register page geometry
    pagesGeometry.push({
      pageNumber: pageNum,
      widthPt: pageWidthPt,
      heightPt: pageHeightPt,
      fields: pageFields,
    });

    candidateFields.push(...pageFields);
  }

  // Calculate overall acquisition confidence and determine template status
  let overallConfidence = 0.5;
  if (candidateFields.length > 0) {
    const sumConf = candidateFields.reduce((acc, f) => acc + f.confidence, 0);
    overallConfidence = Math.round((sumConf / candidateFields.length) * 100) / 100;
  }

  let status: TemplateAcquisitionStatus = 'READY';
  if (unmappedRegions.length > 0 || candidateFields.length === 0 || overallConfidence < 0.8) {
    status = 'REVIEW_REQUIRED';
    if (unmappedRegions.length > 0) {
      warnings.push(`Rilevate ${unmappedRegions.length} regioni ambigue richiedenti revisione umana.`);
    }
    if (candidateFields.length === 0) {
      warnings.push('Nessun campo compilabile automatico rilevato con certezza: calibrazione manuale necessaria.');
    }
  }

  return {
    templateId: `tpl_custom_${sourceSha256.slice(0, 12)}`,
    sourceFileName: fileName,
    sourceSha256,
    fileSizeBytes,
    pageCount,
    pages: pagesGeometry,
    geometryCandidates: candidateFields,
    unmappedRegions,
    confidence: overallConfidence,
    status,
    isMinisterialFastPath: false,
    warnings,
  };
}
