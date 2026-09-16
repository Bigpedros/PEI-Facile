export type DocumentVariantName = 'original' | 'gentle_contrast' | 'sharpened_light';

export interface ProcessDocumentOptions {
  maxDimension?: number;
  rotationDegrees?: number; // 0, 90, 180, 270
  enhanceContrast?: boolean;
  sharpen?: boolean;
  variant?: DocumentVariantName;
}

export interface DocumentImageVariant {
  name: DocumentVariantName;
  dataUrl: string;
  label: string;
  description: string;
}

export interface ProcessDocumentResult {
  originalDataUrl: string;
  processedDataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sizeBytes: number;
  variant?: DocumentVariantName;
}

export const validateDocumentFile = (file: File): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: 'Nessun file selezionato' };
  }

  const isImageOrPdf =
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    /\.(jpe?g|png|webp|heic|bmp|tiff|pdf)$/i.test(file.name);

  if (!isImageOrPdf) {
    return {
      valid: false,
      error: 'Formato file non valido. Seleziona un file immagine (JPG, PNG, WEBP, BMP) o un documento PDF.',
    };
  }

  // Max 25MB
  const maxBytes = 25 * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: 'La dimensione del file supera il limite consentito di 25MB.',
    };
  }

  return { valid: true };
};

/**
  Calcola l'hash univoco del file (SHA-256 o fallback) per rilevare duplicati
 */
export const computeFileHash = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let hash = 0;
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < view.length; i += Math.max(1, Math.floor(view.length / 1000))) {
      hash = (hash << 5) - hash + view[i];
      hash |= 0;
    }
    return `hash-${file.name}-${file.size}-${Math.abs(hash)}`;
  } catch {
    return `hash-${file.name}-${file.size}-${file.lastModified}`;
  }
};

/**
 * Legge un File o DataURL e restituisce sia l'immagine originale che quella pre-elaborata
 * (ridimensionata, ruotata, con correzione dell'illuminazione locale, contrasto ottimizzato e nitidezza per Tesseract OCR).
 */
export const processDocumentImage = async (
  fileOrDataUrl: File | string,
  options: ProcessDocumentOptions = {}
): Promise<ProcessDocumentResult> => {
  const {
    maxDimension = 2400,
    rotationDegrees = 0,
    enhanceContrast = true,
    sharpen = false,
    variant = 'gentle_contrast',
  } = options;

  let originalDataUrl: string;
  let fileSizeBytes = 0;

  if (typeof fileOrDataUrl === 'string') {
    originalDataUrl = fileOrDataUrl;
    fileSizeBytes = Math.round((fileOrDataUrl.length * 3) / 4);
  } else {
    fileSizeBytes = fileOrDataUrl.size;
    originalDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Errore nella lettura del file immagine'));
      reader.readAsDataURL(fileOrDataUrl);
    });
  }

  // Se eseguito fuori dal browser (es. test Node/Vitest senza Canvas completo)
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.HTMLCanvasElement) {
    return {
      originalDataUrl,
      processedDataUrl: originalDataUrl,
      width: 800,
      height: 1200,
      originalWidth: 800,
      originalHeight: 1200,
      sizeBytes: fileSizeBytes,
      variant,
    };
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  let loadedSuccessfully = false;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (!loadedSuccessfully) {
        resolve(); // Fallback in case jsdom doesn't trigger onload
      }
    }, 800);

    img.onload = () => {
      loadedSuccessfully = true;
      clearTimeout(timer);
      resolve();
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve();
    };

    img.src = originalDataUrl;
  });

  const origWidth = img.naturalWidth || img.width || 800;
  const origHeight = img.naturalHeight || img.height || 1200;

  if (origWidth === 0 || origHeight === 0) {
    throw new Error('Immagine con dimensioni non valide o corrotto');
  }

  // Calcola ridimensionamento proporzionale
  let targetWidth = origWidth;
  let targetHeight = origHeight;

  if (origWidth > maxDimension || origHeight > maxDimension) {
    if (origWidth >= origHeight) {
      targetWidth = maxDimension;
      targetHeight = Math.round((origHeight * maxDimension) / origWidth);
    } else {
      targetHeight = maxDimension;
      targetWidth = Math.round((origWidth * maxDimension) / origHeight);
    }
  } else if (origWidth < 1000 && origHeight < 1400 && origWidth > 0 && origHeight > 0) {
    // Upscaling moderato per scontrini a bassa risoluzione
    const scale = Math.min(1.75, maxDimension / Math.max(origWidth, origHeight));
    targetWidth = Math.round(origWidth * scale);
    targetHeight = Math.round(origHeight * scale);
  }

  // Gestione dimensioni canvas considerando rotazione
  const isRotated90or270 = (rotationDegrees / 90) % 2 !== 0;
  const canvasWidth = isRotated90or270 ? targetHeight : targetWidth;
  const canvasHeight = isRotated90or270 ? targetWidth : targetHeight;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      originalDataUrl,
      processedDataUrl: originalDataUrl,
      width: targetWidth,
      height: targetHeight,
      originalWidth: origWidth,
      originalHeight: origHeight,
      sizeBytes: fileSizeBytes,
      variant,
    };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Applica rotazione e disegno al centro
  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((rotationDegrees * Math.PI) / 180);
  ctx.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
  ctx.restore();

  // Se la variante richiesta è 'original', restituisci l'immagine disegnata senza filtri distruttivi
  if (variant === 'original') {
    const originalProcessedDataUrl = canvas.toDataURL('image/png');
    return {
      originalDataUrl,
      processedDataUrl: originalProcessedDataUrl,
      width: canvasWidth,
      height: canvasHeight,
      originalWidth: origWidth,
      originalHeight: origHeight,
      sizeBytes: fileSizeBytes,
      variant: 'original',
    };
  }

  // Pre-elaborazione per le varianti 'gentle_contrast' e 'sharpened_light'
  try {
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    const len = data.length;
    const w = canvasWidth;
    const h = canvasHeight;

    // Buffer scala di grigi con formula ITU-R BT.709
    const grayBuffer = new Float32Array(w * h);

    for (let i = 0, p = 0; i < len; i += 4, p++) {
      grayBuffer[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }

    if (variant === 'gentle_contrast' || enhanceContrast) {
      // Calcolo robusto dei percentili 1% e 99% per histogram stretching gentile
      // Evita che punti specularmente bianchi o angoli scuri schiaccino la dinamica dei caratteri termici
      const hist = new Uint32Array(256);
      const totalPixels = w * h;
      for (let p = 0; p < totalPixels; p++) {
        const v = Math.min(255, Math.max(0, Math.round(grayBuffer[p])));
        hist[v]++;
      }

      const p1Cutoff = Math.floor(totalPixels * 0.01);
      const p99Cutoff = Math.floor(totalPixels * 0.99);

      let cum = 0;
      let minLum = 0;
      let maxLum = 255;

      for (let i = 0; i < 256; i++) {
        cum += hist[i];
        if (cum >= p1Cutoff && minLum === 0) {
          minLum = i;
        }
        if (cum >= p99Cutoff) {
          maxLum = i;
          break;
        }
      }

      if (maxLum <= minLum) {
        minLum = 0;
        maxLum = 255;
      }

      const lumRange = Math.max(30, maxLum - minLum);
      const gamma = 0.92; // Leggero contrasto sui caratteri scuri

      for (let p = 0; p < w * h; p++) {
        // Normalizzazione lineare e curva gamma per preservare virgole, punti e decimali
        const normalized = (grayBuffer[p] - minLum) / lumRange;
        const clampedNorm = Math.min(1, Math.max(0, normalized));
        const transformed = Math.pow(clampedNorm, gamma) * 255;
        const finalVal = Math.min(255, Math.max(0, transformed));

        const idx = p * 4;
        data[idx] = finalVal;
        data[idx + 1] = finalVal;
        data[idx + 2] = finalVal;
      }
    } else {
      for (let p = 0; p < w * h; p++) {
        const val = Math.min(255, Math.max(0, grayBuffer[p]));
        const idx = p * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Filtro di nitidezza leggero (Sharpening / Unsharp Masking conservativo)
    if (variant === 'sharpened_light' || sharpen) {
      const srcData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const outputData = ctx.createImageData(canvasWidth, canvasHeight);
      const src = srcData.data;
      const dst = outputData.data;

      // Kernel conservativo per evitare artefatti o rottura dei caratteri termici
      const kernel = [
        0, -0.35, 0,
        -0.35, 2.4, -0.35,
        0, -0.35, 0,
      ];

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          let sumVal = 0;
          const dstOff = (y * w + x) * 4;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const srcOff = ((y + ky) * w + (x + kx)) * 4;
              const weight = kernel[(ky + 1) * 3 + (kx + 1)];
              sumVal += src[srcOff] * weight;
            }
          }

          const clamped = Math.min(255, Math.max(0, sumVal));
          dst[dstOff] = clamped;
          dst[dstOff + 1] = clamped;
          dst[dstOff + 2] = clamped;
          dst[dstOff + 3] = 255;
        }
      }

      ctx.putImageData(outputData, 0, 0);
    }
  } catch (err) {
    console.warn('[documentImagePreprocessing] Errore filtri Canvas, fallback su immagine originale:', err);
  }

  const processedDataUrl = canvas.toDataURL('image/png');

  return {
    originalDataUrl,
    processedDataUrl,
    width: canvasWidth,
    height: canvasHeight,
    originalWidth: origWidth,
    originalHeight: origHeight,
    sizeBytes: fileSizeBytes,
    variant,
  };
};

/**
 * Genera il set di varianti per il confronto multivariato dell'OCR.
 * Non sostituisce mai in modo distruttivo l'immagine originale memorizzata nel database.
 */
export const createDocumentImageVariants = async (
  fileOrDataUrl: File | string,
  options: ProcessDocumentOptions = {}
): Promise<DocumentImageVariant[]> => {
  const variants: DocumentImageVariant[] = [];

  // Variante 1: Originale (nessun filtro distruttivo)
  try {
    const origResult = await processDocumentImage(fileOrDataUrl, {
      ...options,
      variant: 'original',
      enhanceContrast: false,
      sharpen: false,
    });
    variants.push({
      name: 'original',
      dataUrl: origResult.processedDataUrl,
      label: 'Originale (Senza filtri)',
      description: 'Immagine intatta con orientamento e risoluzione ottimali',
    });
  } catch (err) {
    console.warn('[createDocumentImageVariants] Errore variante originale:', err);
  }

  // Variante 2: Contrasto dolce (scala di grigi e dinamica preservata)
  try {
    const gentleResult = await processDocumentImage(fileOrDataUrl, {
      ...options,
      variant: 'gentle_contrast',
      enhanceContrast: true,
      sharpen: false,
    });
    variants.push({
      name: 'gentle_contrast',
      dataUrl: gentleResult.processedDataUrl,
      label: 'Contrasto Dolce',
      description: 'Miglioramento dinamica e conservazione matrice di punti termica',
    });
  } catch (err) {
    console.warn('[createDocumentImageVariants] Errore variante gentle_contrast:', err);
  }

  // Variante 3: Nitidezza calibrata
  try {
    const sharpResult = await processDocumentImage(fileOrDataUrl, {
      ...options,
      variant: 'sharpened_light',
      enhanceContrast: true,
      sharpen: true,
    });
    variants.push({
      name: 'sharpened_light',
      dataUrl: sharpResult.processedDataUrl,
      label: 'Nitidezza Calibrata',
      description: 'Filtro di contrasto e sharpening conservativo',
    });
  } catch (err) {
    console.warn('[createDocumentImageVariants] Errore variante sharpened_light:', err);
  }

  // Fallback se nessuna variante generata
  if (variants.length === 0) {
    const fallbackUrl = typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '';
    variants.push({
      name: 'original',
      dataUrl: fallbackUrl,
      label: 'Originale (Fallback)',
      description: 'Sorgente originale',
    });
  }

  return variants;
};


export interface GenericOcrQualityEvaluation {
  overallScore: number;
  confidenceScore: number;
  textDensityScore: number;
  structureScore: number;
  garbagePenalty: number;
  reasons: string[];
}

/**
 * Valutatore neutro: non contiene conoscenza di scontrini, prezzi, fornitori o pagamenti.
 * Serve solo a scegliere la variante immagine più leggibile per documenti testuali generici.
 */
export const evaluateGenericOcrQuality = (
  rawText: string,
  tesseractConfidence: number,
): GenericOcrQualityEvaluation => {
  const text = rawText || '';
  const reasons: string[] = [];
  const conf = Math.min(100, Math.max(0, tesseractConfidence));
  const confidenceScore = Math.round(conf * 0.55);
  reasons.push(`Confidenza Tesseract: ${conf}% (${confidenceScore}/55)`);

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const usefulLines = lines.filter((line) => (line.match(/[A-Za-zÀ-ÿ0-9]/g) || []).length >= 4).length;
  const textDensityScore = Math.min(25, usefulLines * 2);
  reasons.push(`Righe testuali utili: ${usefulLines} (${textDensityScore}/25)`);

  const words = text.match(/[A-Za-zÀ-ÿ]{3,}/g) || [];
  const structureScore = Math.min(20, Math.round(Math.sqrt(words.length) * 2));
  reasons.push(`Parole strutturate: ${words.length} (${structureScore}/20)`);

  const isolatedSingleChars = (text.match(/(?:^|\s)[A-Za-z0-9](?=\s|$)/g) || []).length;
  const weirdSymbols = (text.match(/[~|\\{}_^<>]/g) || []).length;
  const garbagePenalty = Math.min(25, Math.max(0, isolatedSingleChars - 10) + Math.max(0, weirdSymbols - 4));
  if (garbagePenalty > 0) reasons.push(`Penalità rumore: -${garbagePenalty}`);

  const overallScore = Math.max(0, Math.min(100,
    confidenceScore + textDensityScore + structureScore - garbagePenalty,
  ));

  return {
    overallScore,
    confidenceScore,
    textDensityScore,
    structureScore,
    garbagePenalty,
    reasons,
  };
};
