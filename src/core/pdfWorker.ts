import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
/** One bundled URL for intake, calibration and compiler preview. */
if(import.meta.env.MODE !== 'test') pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
