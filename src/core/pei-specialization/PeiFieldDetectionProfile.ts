import type { FieldGeometry } from '../../data/geometry/types';
import { detectCanonicalPageFields } from '../documental/detection';
import type { EngineOptions, Token } from '../documental/engine/types';

export interface PeiSecondaryOcrResult {
  words?: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
  text?: string;
  rawText?: string;
  confidence?: number;
}

export type PeiOcrRunner = (canvas: HTMLCanvasElement) => Promise<PeiSecondaryOcrResult>;

export interface PeiFieldDetectionProfileOptions {
  primaryOcrRunner?: PeiOcrRunner;
  secondaryOcrRunner?: PeiOcrRunner;
  canvasElement?: HTMLCanvasElement;
}

export interface PeiFieldDetectionProfileDiagnostics {
  firstPassFields: number;
  secondPassTriggered: boolean;
  secondPassFields: number;
  secondPassAdded: number;
  uncoveredPlausibleRegionsCount: number;
  uncoveredMarkerCount: number;
  uncoveredPromptCount: number;
  underDetectionSuspected: boolean;
}

export interface PeiFieldDetectionProfileResult {
  fields: FieldGeometry[];
  firstPass: Awaited<ReturnType<typeof detectCanonicalPageFields>>;
  secondPass?: Awaited<ReturnType<typeof detectCanonicalPageFields>>;
  diagnostics: PeiFieldDetectionProfileDiagnostics;
}

const markerPattern = /_{3,}|^\[\s*[xX]?\s*\]$/;
const peiPromptPattern = /^(?:nome(?: e cognome)?|cognome(?: e nome)?|bambin[oa](?:\/a)?|alunn[oa](?:\/a)?|data(?: di nascita)?|luogo(?: di nascita)?|classe|sezione|plesso(?: o sede)?|anno scolastico|codice fiscale|firma|scuola|istituto)\s*[:?]?$/i;

function overlaps(a: FieldGeometry, b: FieldGeometry): boolean {
  const x1 = Math.max(a.xPt, b.xPt);
  const y1 = Math.max(a.yPt, b.yPt);
  const x2 = Math.min(a.xPt + a.widthPt, b.xPt + b.widthPt);
  const y2 = Math.min(a.yPt + a.heightPt, b.yPt + b.heightPt);
  if (x2 <= x1 || y2 <= y1) return false;
  const inter = (x2 - x1) * (y2 - y1);
  const minArea = Math.min(a.widthPt * a.heightPt, b.widthPt * b.heightPt);
  return minArea > 0 && inter / minArea >= 0.55;
}

function tokenCovered(token: Token, fields: FieldGeometry[], pageWidth: number, pageHeight: number): boolean {
  return fields.some(field => {
    if (
      field.xNorm === undefined || field.yNorm === undefined ||
      field.wNorm === undefined || field.hNorm === undefined
    ) return false;
    const x = field.xNorm * pageWidth;
    const y = field.yNorm * pageHeight;
    const w = field.wNorm * pageWidth;
    const h = field.hNorm * pageHeight;
    return Math.min(x + w, token.box.x + token.box.width) > Math.max(x, token.box.x) &&
      Math.min(y + h, token.box.y + token.box.height) > Math.max(y, token.box.y);
  });
}

function uncoveredEvidence(result: Awaited<ReturnType<typeof detectCanonicalPageFields>>) {
  const markers = result.page.tokens.filter(token => markerPattern.test(token.text.trim()));
  const prompts = result.page.tokens.filter(token => peiPromptPattern.test(token.text.trim()));
  const uncoveredMarkers = markers.filter(token => !tokenCovered(token, result.fields, result.page.width, result.page.height));
  const uncoveredPrompts = prompts.filter(token => !tokenCovered(token, result.fields, result.page.width, result.page.height));
  return { uncoveredMarkers, uncoveredPrompts };
}

function specializeSecondPassField(field: FieldGeometry): FieldGeometry {
  return {
    ...field,
    detectionSource: 'PEI_SECOND_PASS',
    reason: field.reason
      ? `Seconda lettura PEI indipendente: ${field.reason}`
      : 'Seconda lettura PEI indipendente: candidato da verificare.',
    calibrationStatus: field.calibrationStatus ?? 'PROPOSED',
    status: field.status ?? 'REVIEW_REQUIRED',
  };
}

/**
 * Profilo specialistico PEI sopra il core documentale.
 *
 * PASS 1: pipeline generalista, invariata.
 * PASS 2: parte solo quando la prima lettura lascia evidenze PEI plausibili
 *         non coperte e l'app fornisce un secondo OCR indipendente.
 * MERGE: il secondo passaggio non modifica il primo; aggiunge soltanto proposte
 *        non sovrapposte e sempre soggette a revisione umana.
 */
export async function runPeiFieldDetectionProfile(
  pdfPage: any,
  pageNumber: number,
  options: PeiFieldDetectionProfileOptions = {}
): Promise<PeiFieldDetectionProfileResult> {
  const firstPass = await detectCanonicalPageFields(
    pdfPage,
    pageNumber,
    options.primaryOcrRunner,
    options.canvasElement
  );

  const evidence = uncoveredEvidence(firstPass);
  const uncoveredCount = evidence.uncoveredMarkers.length + evidence.uncoveredPrompts.length;
  const underDetectionSuspected = uncoveredCount > 0;
  const shouldRunSecondPass = underDetectionSuspected && typeof options.secondaryOcrRunner === 'function';

  let secondPass: Awaited<ReturnType<typeof detectCanonicalPageFields>> | undefined;
  const merged = [...firstPass.fields];
  let secondPassAdded = 0;

  if (shouldRunSecondPass) {
    const overrides: Partial<Pick<EngineOptions, 'forceOcr' | 'segmentation' | 'contrast'>> = {
      forceOcr: true,
      segmentation: 'sparse',
      contrast: true,
    };
    secondPass = await detectCanonicalPageFields(
      pdfPage,
      pageNumber,
      options.secondaryOcrRunner,
      options.canvasElement,
      overrides
    );

    for (const candidate of secondPass.fields.map(specializeSecondPassField)) {
      if (merged.some(existing => overlaps(existing, candidate))) continue;
      merged.push(candidate);
      secondPassAdded++;
    }
  }

  return {
    fields: merged,
    firstPass,
    secondPass,
    diagnostics: {
      firstPassFields: firstPass.fields.length,
      secondPassTriggered: shouldRunSecondPass,
      secondPassFields: secondPass?.fields.length ?? 0,
      secondPassAdded,
      uncoveredPlausibleRegionsCount: uncoveredCount,
      uncoveredMarkerCount: evidence.uncoveredMarkers.length,
      uncoveredPromptCount: evidence.uncoveredPrompts.length,
      underDetectionSuspected,
    },
  };
}
