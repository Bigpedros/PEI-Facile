import { analyzeRasterPage } from './headlessPageAnalyzer';
import type { AnalyzePageInput, AnalyzePageOutput, EngineCapabilities, EngineSemanticConfiguration } from '../contracts/publicApi';
import { createDiagnosticEnvelopeBase } from '../contracts/diagnostics';
import { OcrCteEngineError, normalizeEngineError } from '../contracts/errors';
import { configureSemanticResolver } from './semanticCatalog';
import { configurePromptKeywordMatcher } from './promptHeuristics';

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateAnalyzePageInput(input: AnalyzePageInput): void {
  if (!input || !Number.isInteger(input.pageNumber) || input.pageNumber < 1) {
    throw new OcrCteEngineError('INVALID_INPUT', 'pageNumber must be an integer >= 1', { stage: 'INPUT' });
  }
  if (!finitePositive(input.pageWidthPt) || !finitePositive(input.pageHeightPt)) {
    throw new OcrCteEngineError('INVALID_INPUT', 'pageWidthPt and pageHeightPt must be finite positive numbers', {
      stage: 'INPUT',
      pageNumber: input.pageNumber,
    });
  }
  if (!input.image || !Number.isInteger(input.image.width) || !Number.isInteger(input.image.height)
      || input.image.width <= 0 || input.image.height <= 0 || !input.image.data) {
    throw new OcrCteEngineError('INVALID_INPUT', 'image must contain positive width/height and RGBA data', {
      stage: 'INPUT',
      pageNumber: input.pageNumber,
    });
  }
  const expectedLength = input.image.width * input.image.height * 4;
  if (input.image.data.length !== expectedLength) {
    throw new OcrCteEngineError('INVALID_INPUT', `RGBA buffer length ${input.image.data.length} does not match ${expectedLength}`, {
      stage: 'INPUT',
      pageNumber: input.pageNumber,
    });
  }
}

export function analyzePage(input: AnalyzePageInput): AnalyzePageOutput {
  validateAnalyzePageInput(input);
  try {
    const analysis = analyzeRasterPage({
      pageNumber: input.pageNumber,
      pageWidthPt: input.pageWidthPt,
      pageHeightPt: input.pageHeightPt,
      image: input.image,
      geometryMaskTextItems: input.geometryMaskTextItems,
      semanticTextItems: input.semanticTextItems,
    });

    const primitiveCounts = {
      horizontalLines: analysis.primitives.lines.length,
      verticalLines: analysis.primitives.verticalLines?.length ?? 0,
      boxes: analysis.primitives.boxes.length,
      checkboxes: analysis.primitives.boxes.filter((box) => box.isCheckbox).length,
    };

    const detailedResults = input.includeDetailedResults === false ? undefined : analysis.hybrid.results;
    const diagnostics = {
      ...createDiagnosticEnvelopeBase(),
      source: input.source,
      pageNumber: input.pageNumber,
      pageWidthPt: input.pageWidthPt,
      pageHeightPt: input.pageHeightPt,
      textItemsCount: input.semanticTextItems?.length ?? input.geometryMaskTextItems?.length ?? 0,
      primitiveCounts,
      hybridDiagnostics: analysis.hybrid.diagnostics,
      authoritativeFields: analysis.hybrid.authoritativeFields,
      unresolvedPotentialLabels: analysis.hybrid.unresolvedPotentialLabels,
      results: detailedResults,
    };

    return {
      fields: analysis.hybrid.authoritativeFields,
      unresolvedPotentialLabels: analysis.hybrid.unresolvedPotentialLabels,
      diagnostics,
      results: detailedResults,
    };
  } catch (error) {
    const normalized = normalizeEngineError(error, 'GEOMETRY_FAILED');
    if (!normalized.details.pageNumber) normalized.details.pageNumber = input.pageNumber;
    if (!normalized.details.stage) normalized.details.stage = 'GEOMETRY';
    throw normalized;
  }
}

export function getEngineCapabilities(): EngineCapabilities {
  return {
    rasterInput: true,
    pdfSystemAdapter: 'OPTIONAL_SYSTEM_TOOLS',
    domainNeutralCore: true,
    optionalSemanticAdapter: true,
    physicalGeometryFirst: true,
    supportedPhysicalRegions: ['CLOSED_CELL', 'UNDERLINE', 'CHECKBOX', 'OPEN_STRUCTURE', 'NON_FILLABLE_SHAPE'],
  };
}

/** Configure optional domain semantics without giving adapters control over geometry. */
export function configureEngineSemantics(config: EngineSemanticConfiguration = {}): void {
  const resolver = config.semanticResolver ?? null;
  configureSemanticResolver(resolver ? ((label, context) => {
    try {
      return resolver(label, context);
    } catch (error) {
      const normalized = normalizeEngineError(error, 'SEMANTIC_ADAPTER_FAILED');
      normalized.details.stage = 'SEMANTIC';
      throw normalized;
    }
  }) : null);
  configurePromptKeywordMatcher(config.promptKeywordMatcher ?? null);
}
