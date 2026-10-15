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
    expect(out.diagnostics.secondReader).toMatchObject({configured:false,availability:'not-configured',execution:'blocked-no-reader',reason:'NO_SECONDARY_RUNNER'});
    expect(out.diagnostics.uncoveredEvidenceKind).toBe('structure-and-text');
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
      signal:undefined,
      independentReading:false,
    });
    expect(out.diagnostics.secondPassTriggered).toBe(true);
    expect(out.diagnostics.secondPassAdded).toBe(1);
    expect(out.fields).toHaveLength(1);
    expect(out.fields[0].detectionSource).toBe('PEI_SECOND_PASS');
    expect(out.diagnostics.secondReader).toMatchObject({configured:true,availability:'available',execution:'completed',returnedPositionedWords:0});
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

  it('separates a configured but unused reader from a missing reader without forcing OCR',async()=>{
    mockedDetect.mockResolvedValueOnce(result([],[]));
    const out=await runPeiFieldDetectionProfile({} as any,1,{secondaryOcrRunner:secondary});
    expect(out.diagnostics.secondReader).toMatchObject({configured:true,availability:'provided-unverified',execution:'not-needed',reason:'NO_UNCOVERED_TEXT_EVIDENCE',returnedPositionedWords:null});
    expect(mockedDetect).toHaveBeenCalledTimes(1);
  });
  function structure(covered=false,recovered=0){return {schema:'PEI_STRUCTURAL_COVERAGE_V1',unit:'px',evidence:[{id:'r1',regionId:'r1',kind:'cell',box:{x:400,y:300,width:400,height:100},responseBox:{x:405,y:305,width:390,height:90},plausible:true,reason:'UNPOSITIONED_OR_PRINTED_INK',context:['repeated-table-cells'],coveredBefore:false,coveredAfter:covered,coverageBefore:0,coverageAfter:covered?1:0,outcome:covered?'recovered':'unresolved'}],summary:{measured:1,plausible:1,uncoveredBefore:1,recovered,uncoveredAfter:covered?0:1,cells:1,checkboxes:0,lines:0}};}
  it('una tabella scoperta attiva il recupero custom anche senza etichette',async()=>{
    const first=result();first.page.structuralCoverage=structure();mockedDetect.mockResolvedValueOnce(first).mockResolvedValueOnce(result());
    const out=await runPeiFieldDetectionProfile({},1,{secondaryOcrRunner:secondary});expect(out.diagnostics.underDetectionSuspected).toBe(true);expect(out.diagnostics.uncoveredCellCount).toBe(1);expect(out.diagnostics.secondPassTriggered).toBe(true);expect(mockedDetect).toHaveBeenCalledTimes(2);
  });
  it('il recupero strutturale risolto non causa nuovo OCR',async()=>{
    const first=result();first.page.structuralCoverage=structure(true,1);mockedDetect.mockResolvedValueOnce(first);const out=await runPeiFieldDetectionProfile({},1,{secondaryOcrRunner:secondary});
    expect(out.diagnostics.underDetectionSuspected).toBe(true);expect(out.diagnostics.structuralRecoveryAdded).toBe(1);expect(out.diagnostics.uncoveredPlausibleRegionsCount).toBe(0);expect(out.diagnostics.secondPassTriggered).toBe(false);expect(mockedDetect).toHaveBeenCalledTimes(1);
  });
  it('non conta due volte un marcatore dentro la regione scoperta',async()=>{
    const first=result([],[{id:'m',text:'____',box:{x:450,y:330,width:100,height:16},source:'ocr',lineId:'1'}]);first.page.structuralCoverage=structure();mockedDetect.mockResolvedValueOnce(first);const out=await runPeiFieldDetectionProfile({},1);expect(out.diagnostics.uncoveredMarkerCount).toBe(1);expect(out.diagnostics.uncoveredPlausibleRegionsCount).toBe(1);
  });
  it('una proposta con etichetta diversa non copre il prompt vicino',async()=>{
    mockedDetect.mockResolvedValueOnce(result([{label:'Classe',anchorText:'Classe',xNorm:.15,yNorm:.02,wNorm:.1,hNorm:.02}],[{id:'s',text:'Sezione',box:{x:20,y:20,width:60,height:15},source:'pdf',lineId:'1'}]));expect((await runPeiFieldDetectionProfile({},1)).diagnostics.uncoveredPromptCount).toBe(1);
  });
  it('non ripete B già eseguito dal nucleo',async()=>{
    const first=result();first.page.structuralCoverage=structure();first.page.ocrReading={status:'used'};first.page.secondReader={configured:true,availability:'available',execution:'completed',reason:'DUAL_READING_COMPLETED',returnedPositionedWords:20,stage:'core'};mockedDetect.mockResolvedValueOnce(first);const out=await runPeiFieldDetectionProfile({},1,{secondaryOcrRunner:secondary});expect(out.diagnostics.uncoveredCellCount).toBe(1);expect(out.diagnostics.secondReader).toEqual(first.page.secondReader);expect(out.diagnostics.secondPassTriggered).toBe(false);expect(mockedDetect).toHaveBeenCalledTimes(1);
  });
});
