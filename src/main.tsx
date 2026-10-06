import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadOpenCV } from './core/geometry/opencvLoader';

// Controllo tecnico temporaneo per verifica OpenCV anche in produzione
if (typeof window !== 'undefined') {
  (window as any).__PEI_CHECK_OPENCV__ = async (options?: { timeoutMs?: number }) => {
    console.log('[PEI_CHECK_OPENCV] Avvio verifica tecnica runtime OpenCV...');
    try {
      const res = await loadOpenCV({ timeoutMs: options?.timeoutMs ?? 15000, forceReload: true });
      const report = {
        status: 'SUCCESS',
        engine: res.engine,
        selfTestPassed: res.selfTestPassed,
        outputGrayscale: res.selfTestDetails.outputGrayscale,
        expectedGrayscale: res.selfTestDetails.expectedGrayscale,
        initializationTimeMs: res.initializationTimeMs,
      };
      console.log('✅ [PEI_CHECK_OPENCV] Risultato verifica:', report);
      return report;
    } catch (err: any) {
      const errorReport = {
        status: 'ERROR',
        engine: null,
        selfTestPassed: false,
        outputGrayscale: null,
        error: err?.message || String(err),
      };
      console.error('❌ [PEI_CHECK_OPENCV] Verifica fallita:', errorReport);
      return errorReport;
    }
  };

  // Se è presente ?check_opencv=1 nella barra degli indirizzi, esegue il test automaticamente in console
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('check_opencv') === '1') {
      (window as any).__PEI_CHECK_OPENCV__();
    }
  } catch {
    // Ignorato in ambienti non-browser
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

