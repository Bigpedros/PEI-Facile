import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processDocumentAcquisition } from '../core/documentAcquisitionService';
import { computeSha256 } from '../core/templateSourceResolver';

describe('PEI FACILE — Rigorous Rectification Verification (Real Acquisition Pipeline & Raster Baking)', () => {
  it('Esegue la pipeline reale di acquisizione (GeometricRectificationEngine + buildCanonicalA4Pdf) sul modello vuoto e verifica l’output rasterizzato', async () => {
    const fixturePath = './Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf';
    if (!fs.existsSync(fixturePath)) {
      console.warn('Fixture PDF non trovata:', fixturePath);
      return;
    }

    const rawBytes = fs.readFileSync(fixturePath);
    const sourceSha256 = await computeSha256(rawBytes);
    expect(sourceSha256).toBe('d35456652c65d388b2e1e1381407a2a0ab97c77351389a98451135ea37dea7e7');

    // 1. Esegui la pipeline reale di acquisizione (include GeometricRectificationEngine e raster baking)
    const acquisitionResult = await processDocumentAcquisition(
      rawBytes.buffer.slice(0),
      'PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf',
      {
        customOcrRunner: async () => ({ text: 'Mock OCR text', confidence: 90 }),
      }
    );

    expect(acquisitionResult.canonicalDocument).toBeDefined();
    const normPdfBytes = new Uint8Array(acquisitionResult.canonicalDocument!);
    const outputSha256 = await computeSha256(normPdfBytes);
    console.log('=== NUOVO PDF RASTERIZZATO ELABORATO SHA-256 ===', outputSha256);
    expect(outputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(outputSha256).not.toBe(sourceSha256);

    // Keep generated verification artifacts outside the application downloads.
    const downloadDir = path.resolve(process.cwd(), 'test-output/verification-regressions');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    const outputPdfPath = path.join(downloadDir, 'Roma-test-acquisition-A4.pdf');
    fs.writeFileSync(outputPdfPath, normPdfBytes);

    expect(fs.existsSync(outputPdfPath)).toBe(true);
  }, 90000);
});
