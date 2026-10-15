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
  secondReader: {
    configured: boolean;
    availability: 'not-configured' | 'provided-unverified' | 'available';
    execution: 'blocked-no-reader' | 'not-needed' | 'completed';
    reason: 'NO_SECONDARY_RUNNER' | 'NO_UNCOVERED_TEXT_EVIDENCE' | 'SECOND_PASS_COMPLETED';
    returnedPositionedWords: number | null;
  };
  uncoveredEvidenceKind: 'text-markers-and-short-prompts';
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
    const tokenRight = token.box.x + token.box.width;
    const tokenBottom = token.box.y + token.box.height;
    const fieldRight = x + w;
    const fieldBottom = y + h;
    const intersects =
      Math.min(fieldRight, tokenRight) > Math.max(x, token.box.x) &&
      Math.min(fieldBottom, tokenBottom) > Math.max(y, token.box.y);
    if (intersects) return true;

    // Nei moduli PEI l'area compilabile è spesso a destra o subito sotto
    // l'etichetta, quindi non deve necessariamente sovrapporsi al token.
    const sameRow =
      x >= tokenRight - 4 &&
      x - tokenRight <= Math.max(260, token.box.height * 14) &&
      Math.abs((y + h / 2) - (token.box.y + token.box.height / 2)) <=
        Math.max(h, token.box.height) * 1.25;
    const horizontalOverlap = Math.min(fieldRight, tokenRight) - Math.max(x, token.box.x);
    const justBelow =
      y >= tokenBottom - 4 &&
      y - tokenBottom <= token.box.height * 3 &&
      horizontalOverlap > -Math.max(token.box.width, w) * .25;

    return sameRow || justBelow;
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
      secondReader: {
        configured: typeof options.secondaryOcrRunner === 'function',
        availability: secondPass ? 'available' : typeof options.secondaryOcrRunner === 'function' ? 'provided-unverified' : 'not-configured',
        execution: shouldRunSecondPass ? 'completed' : underDetectionSuspected ? 'blocked-no-reader' : 'not-needed',
        reason: shouldRunSecondPass ? 'SECOND_PASS_COMPLETED' : underDetectionSuspected ? 'NO_SECONDARY_RUNNER' : 'NO_UNCOVERED_TEXT_EVIDENCE',
        returnedPositionedWords: secondPass?.page.tokens.length ?? null,
      },
      uncoveredEvidenceKind: 'text-markers-and-short-prompts',
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
