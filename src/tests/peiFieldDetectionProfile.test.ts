import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../core/documental/detection', () => ({
  detectCanonicalPageFields: vi.fn(),
}));

import { detectCanonicalPageFields } from '../core/documental/detection';
import { runPeiFieldDetectionProfile } from '../core/pei-specialization/PeiFieldDetectionProfile';

const mockedDetect = vi.mocked(detectCanonicalPageFields);

function result(fields: any[] = [], tokens: any[] = []) {
  return {
    fields,
    textItems: tokens.length,
    tokens: tokens.length,
    source: 'pdf',
    regions: 0,
    page: {
      width: 1000,
      height: 1400,
      tokens,
    },
  } as any;
}

const secondary = async () => ({ text: '', words: [] });

describe('PEI field detection specialization', () => {
  beforeEach(() => {
    mockedDetect.mockReset();
  });

  it('keeps the generalist first pass unchanged when no independent second reader is supplied', async () => {
    mockedDetect.mockResolvedValueOnce(result([], [{
      id: 't1', text: 'Sezione', source: 'pdf', confidence: null, lineId: 'l1',
      box: { x: 20, y: 20, width: 60, height: 15 },
    }]));

    const out = await runPeiFieldDetectionProfile({} as any, 1);

    expect(mockedDetect).toHaveBeenCalledTimes(1);
    expect(out.fields).toHaveLength(0);
    expect(out.diagnostics.underDetectionSuspected).toBe(true);
    expect(out.diagnostics.secondPassTriggered).toBe(false);
  });

  it('runs the independent PEI second pass only on under-detection and adds non-overlapping proposals', async () => {
    mockedDetect
      .mockResolvedValueOnce(result([], [{
        id: 't1', text: 'Sezione', source: 'pdf', confidence: null, lineId: 'l1',
        box: { x: 20, y: 20, width: 60, height: 15 },
      }]))
      .mockResolvedValueOnce(result([{
        fieldId: 'second-1',
        label: 'Sezione',
        pageNumber: 1,
        xPt: 100,
        yPt: 100,
        widthPt: 120,
        heightPt: 20,
        xNorm: .17,
        yNorm: .12,
        wNorm: .20,
        hNorm: .02,
        anchorText: 'Sezione',
        derivationMethod: 'TEXT_ANCHOR',
        status: 'REVIEW_REQUIRED',
        calibrationStatus: 'PROPOSED',
      }], []));

    const out = await runPeiFieldDetectionProfile({} as any, 1, {
      secondaryOcrRunner: secondary,
    });

    expect(mockedDetect).toHaveBeenCalledTimes(2);
    expect(mockedDetect.mock.calls[1][4]).toEqual({
      forceOcr: true,
      segmentation: 'sparse',
      contrast: true,
    });
    expect(out.diagnostics.secondPassTriggered).toBe(true);
    expect(out.diagnostics.secondPassAdded).toBe(1);
    expect(out.fields).toHaveLength(1);
    expect(out.fields[0].detectionSource).toBe('PEI_SECOND_PASS');
  });

  it('never lets the second pass replace an overlapping first-pass candidate', async () => {
    const first = {
      fieldId: 'first-1',
      label: 'Sezione',
      pageNumber: 1,
      xPt: 100,
      yPt: 100,
      widthPt: 120,
      heightPt: 20,
      xNorm: .17,
      yNorm: .12,
      wNorm: .20,
      hNorm: .02,
      anchorText: 'Sezione',
      derivationMethod: 'TEXT_ANCHOR',
      status: 'REVIEW_REQUIRED',
      calibrationStatus: 'PROPOSED',
    };
    mockedDetect
      .mockResolvedValueOnce(result([first], [{
        id: 't1', text: 'Firma', source: 'pdf', confidence: null, lineId: 'l1',
        box: { x: 20, y: 20, width: 40, height: 15 },
      }]))
      .mockResolvedValueOnce(result([{ ...first, fieldId: 'second-overlap' }], []));

    const out = await runPeiFieldDetectionProfile({} as any, 1, {
      secondaryOcrRunner: secondary,
    });

    expect(out.fields).toHaveLength(1);
    expect(out.fields[0].fieldId).toBe('first-1');
    expect(out.diagnostics.secondPassAdded).toBe(0);
  });
});
