/**
 * @license
 * PEI FACILE — OpenCV Robust Loader & Verification Engine
 * 
 * Provides:
 * 1. Reproducible and safe loading in Node.js (CJS/require) and Browser (Vite ESM bundling).
 * 2. Complete handling of Emscripten module states (ready object, Promise/thenable, factory).
 * 3. Concurrent call deduplication (single shared initialization promise).
 * 4. Overall timeout protection with explicit descriptive errors.
 * 5. Complete OpenCV API validation and concrete operational self-test (RGBA -> GRAY conversion).
 * 6. Accurate engine tagging: OPENCV_NODE vs OPENCV_WASM vs HIGH_PRECISION_CANVAS_FALLBACK.
 */

export type OpenCvEngineType = 'OPENCV_NODE' | 'OPENCV_WASM';
export type RectificationEngineType = OpenCvEngineType | 'HIGH_PRECISION_CANVAS_FALLBACK';

export interface OpenCvSelfTestDetails {
  inputDimensions: string;
  outputGrayscale: number[];
  expectedGrayscale: number[];
}

export interface OpenCvInitResult {
  cv: any;
  engine: OpenCvEngineType;
  initializationTimeMs: number;
  selfTestPassed: boolean;
  selfTestDetails: OpenCvSelfTestDetails;
}

/**
 * Accurately detects whether code is executing in Node.js runtime,
 * regardless of whether jsdom or window polyfills are present.
 */
export function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);
}

/**
 * Loads OpenCV in Node.js environment via CommonJS require.
 */
async function loadNodeOpenCV(): Promise<any> {
  const { createRequire } = await import('module');
  const nodeRequire = createRequire(import.meta.url || process.cwd() + '/package.json');
  return nodeRequire('@techstark/opencv-js');
}

/**
 * Loads OpenCV in Browser environment via standard Vite-bundled dynamic import.
 */
async function loadBrowserOpenCV(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
    return (window as any).cv;
  }
  const mod = await import('@techstark/opencv-js');
  return mod?.default ?? mod;
}

/**
 * Resolves whatever shape the OpenCV package provides:
 * - Ready object with cv.Mat
 * - Thenable / Promise (standard @techstark/opencv-js export)
 * - Module factory function with onRuntimeInitialized
 * - Object with onRuntimeInitialized callback
 */
export async function resolveOpenCvModule(rawModule: any, timeoutMs = 15000): Promise<any> {
  if (!rawModule) {
    throw new Error('OpenCV module is null or undefined');
  }

  // 1. Ready object with cv.Mat
  if (rawModule.Mat && typeof rawModule.cvtColor === 'function') {
    return rawModule;
  }

  // 2. Thenable / Promise
  if (typeof rawModule.then === 'function') {
    const resolved = await rawModule;
    if (resolved && resolved.Mat) {
      return resolved;
    }
  }

  // 3. Factory function
  if (typeof rawModule === 'function') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OpenCV factory runtime initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = rawModule({
          onRuntimeInitialized: () => {
            clearTimeout(timer);
            const inst = (typeof window !== 'undefined' && (window as any).cv) || result || rawModule;
            if (inst && inst.Mat) {
              resolve(inst);
            } else {
              reject(new Error('OpenCV onRuntimeInitialized fired but cv.Mat is missing'));
            }
          }
        });

        if (result && typeof result.then === 'function') {
          result.then((inst: any) => {
            clearTimeout(timer);
            if (inst && inst.Mat) resolve(inst);
            else if (rawModule.Mat) resolve(rawModule);
            else reject(new Error('OpenCV promise resolved but cv.Mat is missing'));
          }).catch((err: any) => {
            clearTimeout(timer);
            reject(err);
          });
        }
      } catch (callErr) {
        clearTimeout(timer);
        reject(callErr);
      }
    });
  }

  // 4. Object with onRuntimeInitialized
  if (typeof rawModule === 'object') {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`OpenCV runtime initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const prevCallback = rawModule.onRuntimeInitialized;
      rawModule.onRuntimeInitialized = () => {
        clearTimeout(timer);
        if (typeof prevCallback === 'function') {
          try { prevCallback(); } catch { /* ignore */ }
        }
        if (rawModule.Mat) {
          resolve(rawModule);
        } else {
          reject(new Error('OpenCV onRuntimeInitialized fired but cv.Mat is missing'));
        }
      };
    });
  }

  throw new Error('Unrecognized OpenCV module export format');
}

/**
 * Validates that all OpenCV APIs required by the geometric rectification engine exist.
 */
export function verifyOpenCvApi(cv: any): void {
  if (!cv) throw new Error('OpenCV instance is null');

  const requiredFunctions = [
    'Mat',
    'cvtColor',
    'warpPerspective',
    'getPerspectiveTransform',
    'remap',
    'Canny',
    'HoughLinesP',
    'warpAffine',
    'getRotationMatrix2D',
    'adaptiveThreshold',
    'matFromImageData'
  ];

  for (const fn of requiredFunctions) {
    if (typeof cv[fn] !== 'function') {
      throw new Error(`OpenCV API validation failure: required function cv.${fn} is missing or not a function`);
    }
  }

  const requiredConstants = [
    'COLOR_RGBA2GRAY',
    'CV_8UC1',
    'CV_8UC4',
    'CV_32FC1',
    'INTER_LINEAR',
    'BORDER_CONSTANT'
  ];

  for (const c of requiredConstants) {
    if (cv[c] === undefined) {
      throw new Error(`OpenCV API validation failure: required constant cv.${c} is missing`);
    }
  }
}

/**
 * Concrete Smoketest / Self-Test:
 * Creates a known 2x2 RGBA matrix, converts it to grayscale, verifies the exact pixel values,
 * and releases matrix memory.
 * 
 * RGBA input:
 * - (0,0): [255, 0, 0, 255] -> Pure Red
 * - (0,1): [0, 255, 0, 255] -> Pure Green
 * - (1,0): [0, 0, 255, 255] -> Pure Blue
 * - (1,1): [255, 255, 255, 255] -> Pure White
 * 
 * Standard ITU-R BT.601 formula used by OpenCV cvtColor(COLOR_RGBA2GRAY):
 * Y = round(0.299 * R + 0.587 * G + 0.114 * B)
 * Expected grayscale: [76, 150, 29, 255]
 */
export function runOpenCvSelfTest(cv: any): OpenCvSelfTestDetails {
  const src = new cv.Mat(2, 2, cv.CV_8UC4);
  src.data.set([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255
  ]);

  const dst = new cv.Mat();
  try {
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);

    if (dst.rows !== 2 || dst.cols !== 2 || dst.channels() !== 1) {
      throw new Error(
        `OpenCV self-test failed: output dimensions are ${dst.rows}x${dst.cols} (channels: ${dst.channels()}), expected 2x2 (channels: 1)`
      );
    }

    const actual = Array.from(dst.data) as number[];
    const expected = [76, 150, 29, 255];

    for (let i = 0; i < expected.length; i++) {
      if (actual[i] !== expected[i]) {
        throw new Error(
          `OpenCV self-test pixel mismatch at index ${i}: got ${actual[i]}, expected ${expected[i]}`
        );
      }
    }

    return {
      inputDimensions: '2x2 RGBA (CV_8UC4)',
      outputGrayscale: actual,
      expectedGrayscale: expected
    };
  } finally {
    src.delete();
    dst.delete();
  }
}

// Module-level singletons for shared initialization
let initPromise: Promise<OpenCvInitResult> | null = null;
let cachedResult: OpenCvInitResult | null = null;

/**
 * Loads and initializes OpenCV with concurrency deduplication, timeout protection,
 * API verification, and concrete self-test execution.
 */
export async function loadOpenCV(options: { timeoutMs?: number; forceReload?: boolean } = {}): Promise<OpenCvInitResult> {
  if (cachedResult && !options.forceReload) {
    return cachedResult;
  }

  if (initPromise && !options.forceReload) {
    return initPromise;
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  const startTime = performance.now();

  initPromise = (async () => {
    let timeoutHandle: any = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`OpenCV runtime initialization timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const executionPromise = (async (): Promise<OpenCvInitResult> => {
      const isNode = isNodeEnvironment();
      const raw = isNode ? await loadNodeOpenCV() : await loadBrowserOpenCV();
      const cv = await resolveOpenCvModule(raw, timeoutMs);

      if (!cv || !cv.Mat) {
        throw new Error('OpenCV initialized but cv.Mat is missing');
      }

      verifyOpenCvApi(cv);
      const selfTestDetails = runOpenCvSelfTest(cv);

      const result: OpenCvInitResult = {
        cv,
        engine: isNode ? 'OPENCV_NODE' : 'OPENCV_WASM',
        initializationTimeMs: Math.round(performance.now() - startTime),
        selfTestPassed: true,
        selfTestDetails
      };

      cachedResult = result;
      return result;
    })();

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } catch (err) {
      cachedResult = null;
      throw err;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (!cachedResult) {
        initPromise = null;
      }
    }
  })();

  return initPromise;
}

/**
 * Direct accessor returning the raw initialized cv instance or null on failure.
 */
export async function getOpenCV(): Promise<any> {
  try {
    const res = await loadOpenCV();
    return res.cv;
  } catch (err) {
    console.warn('[OpenCVLoader] OpenCV initialization failed:', err);
    return null;
  }
}

/**
 * Diagnostic helper for testing and reset.
 */
export function resetOpenCvCacheForTesting(): void {
  cachedResult = null;
  initPromise = null;
}
