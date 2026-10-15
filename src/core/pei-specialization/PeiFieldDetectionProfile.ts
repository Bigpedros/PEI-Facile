import type { FieldGeometry } from '../../data/geometry/types';
import { detectCanonicalPageFields } from '../documental/detection';
import type { EngineOptions, Token } from '../documental/engine/types';
import {fieldTokens} from '../documental/engine';
import {intersectionRatio} from '../documental/engine/geometry';
import type {StructuralCoverageDiagnostics} from '../documental/engine/structuralCoverage';

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
  signal?:AbortSignal;
  independentReading?:boolean;
}

export interface PeiFieldDetectionProfileDiagnostics {
  secondReader: import('../documental/engine/dualReading').IndependentReaderState;
  uncoveredEvidenceKind: 'structure-and-text';
  structuralCoverage?:StructuralCoverageDiagnostics;
  structuralRecoveryAdded:number;
  uncoveredCellCount:number;
  uncoveredCheckboxCount:number;
  uncoveredLineCount:number;
  uncoveredBeforeRecoveryCount:number;
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
    if(intersects&&intersectionRatio(token.box,{x,y,width:w,height:h})>=.5)return true;
    const normalize=(s:string)=>s.toLocaleLowerCase('it').replace(/[^a-zà-ù0-9]+/g,' ').trim();
    const prompt=normalize(token.text),label=normalize(field.anchorText||field.label||'');
    const matchedLabel=markerPattern.test(token.text)||!!prompt&&(label===prompt||label.startsWith(prompt+' '));
    if(!matchedLabel)return false;

    // Nei moduli PEI l'area compilabile è spesso a destra o subito sotto
    // l'etichetta, quindi non deve necessariamente sovrapporsi al token.
    const sameRow =
      x >= tokenRight - 4 &&
      x - tokenRight <= Math.max(40, token.box.height * 4) &&
      Math.abs((y + h / 2) - (token.box.y + token.box.height / 2)) <=
        Math.max(token.box.height,Math.min(h,token.box.height*2)) * .75;
    const horizontalOverlap = Math.min(fieldRight, tokenRight) - Math.max(x, token.box.x);
    const justBelow =
      y >= tokenBottom - 4 &&
      y - tokenBottom <= token.box.height * 2 &&
      horizontalOverlap >= Math.min(token.box.width,w) * .5;

    return sameRow || justBelow;
  });
}

function uncoveredEvidence(result: Awaited<ReturnType<typeof detectCanonicalPageFields>>) {
  const grouped=fieldTokens(result.page.tokens,result.page.regions??[]);
  const markers = grouped.filter(token => markerPattern.test(token.text.trim()));
  const prompts = grouped.filter(token => peiPromptPattern.test(token.text.trim()));
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
 * PASS 1: pipeline comune con Tesseract + OCRS/RTen sulle pagine raster.
 * PASS 2: hook custom su evidenze scoperte, solo se B non è già stato eseguito.
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
    options.canvasElement,
    {signal:options.signal,independentReading:options.independentReading}
  );

  const evidence = uncoveredEvidence(firstPass);
  const structural=firstPass.page.structuralCoverage;
  const uncoveredStructures=structural?.evidence.filter(e=>e.plausible&&!e.coveredAfter)??[];
  const additionalText=[...evidence.uncoveredMarkers,...evidence.uncoveredPrompts].filter(t=>!uncoveredStructures.some(e=>intersectionRatio(t.box,e.box)>.5));
  const uncoveredCount=uncoveredStructures.length+additionalText.length;
  const beforeRecovery=(structural?.summary.uncoveredBefore??0)+additionalText.length;
  const underDetectionSuspected=beforeRecovery>0;
  const coreReader=firstPass.page.secondReader;
  const shouldRunSecondPass = options.independentReading!==false && uncoveredCount>0 && typeof options.secondaryOcrRunner === 'function' && !firstPass.page.ocrReading;

  let secondPass: Awaited<ReturnType<typeof detectCanonicalPageFields>> | undefined;
  const merged = [...firstPass.fields];
  let secondPassAdded = 0;

  if (shouldRunSecondPass) {
    const overrides: Partial<Pick<EngineOptions, 'forceOcr' | 'segmentation' | 'contrast'|'signal'|'independentReading'>> = {
      forceOcr: true,
      segmentation: 'sparse',
      contrast: true,
      signal:options.signal,
      independentReading:false,
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

  let secondReader=coreReader;
  if(!coreReader||(!firstPass.page.ocrReading&&options.secondaryOcrRunner))secondReader={
    configured: typeof options.secondaryOcrRunner === 'function',
    availability: secondPass ? 'available' : typeof options.secondaryOcrRunner === 'function' ? 'provided-unverified' : 'not-configured',
    execution: shouldRunSecondPass ? 'completed' : uncoveredCount>0 ? 'blocked-no-reader' : 'not-needed',
    reason: shouldRunSecondPass ? 'SECOND_PASS_COMPLETED' : uncoveredCount>0 ? 'NO_SECONDARY_RUNNER' : 'NO_UNCOVERED_TEXT_EVIDENCE',
    returnedPositionedWords: secondPass?.page.tokens.length ?? null,stage:'pei-recovery',
  };
  if(options.independentReading===false)secondReader={configured:false,availability:'not-configured',execution:'disabled',reason:'INDEPENDENT_READING_DISABLED',returnedPositionedWords:null,stage:'core'};
  return {
    fields: merged,
    firstPass,
    secondPass,
    diagnostics: {
      secondReader,
      uncoveredEvidenceKind: 'structure-and-text',
      structuralCoverage:structural,
      structuralRecoveryAdded:structural?.summary.recovered??0,
      uncoveredBeforeRecoveryCount:beforeRecovery,
      uncoveredCellCount:uncoveredStructures.filter(e=>e.kind==='cell').length,
      uncoveredCheckboxCount:uncoveredStructures.filter(e=>e.kind==='checkbox').length,
      uncoveredLineCount:uncoveredStructures.filter(e=>e.kind==='line').length,
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
