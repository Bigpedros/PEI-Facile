import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadOpenCV,
  getOpenCV,
  isNodeEnvironment,
  verifyOpenCvApi,
  runOpenCvSelfTest,
  resolveOpenCvModule,
  resetOpenCvCacheForTesting
} from '../core/geometry/opencvLoader';

describe('PEI FACILE — Roadmap Punto 1: OpenCV Robust Loader & Verification Engine', () => {
  beforeEach(() => {
    resetOpenCvCacheForTesting();
  });

  it('1. Inizializzazione corretta in ambiente Node con engine OPENCV_NODE ed esecuzione del self-test', async () => {
    expect(isNodeEnvironment()).toBe(true);

    const initResult = await loadOpenCV({ timeoutMs: 15000 });
    expect(initResult).toBeDefined();
    expect(initResult.cv).toBeDefined();
    expect(initResult.cv.Mat).toBeDefined();

    // In ambiente Node (anche se jsdom è caricato) deve registrare OPENCV_NODE
    expect(initResult.engine).toBe('OPENCV_NODE');
    expect(initResult.selfTestPassed).toBe(true);

    // Prova di conversione RGBA 2x2 in scala di grigi (ITU-R BT.601)
    expect(initResult.selfTestDetails.inputDimensions).toBe('2x2 RGBA (CV_8UC4)');
    expect(initResult.selfTestDetails.expectedGrayscale).toEqual([76, 150, 29, 255]);
    expect(initResult.selfTestDetails.outputGrayscale).toEqual([76, 150, 29, 255]);

    // Verifica API usate dal motore
    verifyOpenCvApi(initResult.cv);
  });

  it('2. Esecuzione manuale e rilascio memoria del test di conversione RGBA -> Grayscale', async () => {
    const cv = await getOpenCV();
    expect(cv).toBeDefined();
    expect(cv.Mat).toBeDefined();

    const selfTest = runOpenCvSelfTest(cv);
    expect(selfTest.outputGrayscale).toEqual([76, 150, 29, 255]);
  });

  it('3. Gestione idempotente e deduplicazione delle chiamate concorrenti', async () => {
    const [res1, res2, res3] = await Promise.all([
      loadOpenCV(),
      loadOpenCV(),
      loadOpenCV()
    ]);

    expect(res1.cv).toBe(res2.cv);
    expect(res2.cv).toBe(res3.cv);
    expect(res1.engine).toBe('OPENCV_NODE');
  });

  it('4. Risoluzione delle diverse forme del modulo Emscripten', async () => {
    const cv = await getOpenCV();

    // Caso A: Oggetto già pronto
    const readyResult = await resolveOpenCvModule(cv);
    expect(readyResult).toBe(cv);

    // Caso B: Thenable / Promise
    const thenableModule = {
      then: (fn: (v: any) => any) => Promise.resolve(cv).then(fn)
    };
    const thenableResult = await resolveOpenCvModule(thenableModule);
    expect(thenableResult).toBe(cv);

    // Caso C: Factory function con onRuntimeInitialized
    const factoryModule = (opts: any) => {
      setTimeout(() => {
        if (opts.onRuntimeInitialized) opts.onRuntimeInitialized(cv);
      }, 10);
      return Promise.resolve(cv);
    };
    const factoryResult = await resolveOpenCvModule(factoryModule, 5000);
    expect(factoryResult).toBe(cv);

    // Caso D: Oggetto con callback onRuntimeInitialized
    const callbackObj: any = {
      Mat: cv.Mat
    };
    const cbPromise = resolveOpenCvModule(callbackObj, 5000);
    setTimeout(() => {
      if (typeof callbackObj.onRuntimeInitialized === 'function') {
        callbackObj.onRuntimeInitialized();
      }
    }, 10);
    const cbResult = await cbPromise;
    expect(cbResult.Mat).toBe(cv.Mat);
  });

  it('5. Gestione degli errori e fallimento controllato con timeout esplicito', async () => {
    // Null module
    await expect(resolveOpenCvModule(null)).rejects.toThrow('OpenCV module is null or undefined');

    // Modulo non valido
    await expect(resolveOpenCvModule('string-non-valida' as any)).rejects.toThrow('Unrecognized OpenCV module export format');

    // Factory bloccata che va in timeout
    const stalledFactory = () => {
      // Non invoca mai onRuntimeInitialized
      return {};
    };
    await expect(resolveOpenCvModule(stalledFactory, 100)).rejects.toThrow(/timed out/i);
  });
});
