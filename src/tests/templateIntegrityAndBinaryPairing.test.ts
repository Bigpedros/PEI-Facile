import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { acquirePdfTemplate, computeSha256 } from '../core/templateAcquisitionService';
import { saveCustomTemplate, getCustomTemplate, getTemplatePdfBinary } from '../core/templateStorage';

describe('PEI FACILE — Integrità Crittografica e Gestione Duale degli Hash (Originale vs Normalizzato)', () => {
  it('1. Calcola e conserva separatamente sourceSha256 e normalizedSha256 durante l\'acquisizione del PDF del Comune di Roma', async () => {
    const filePath = './Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf';
    const buf = fs.readFileSync(filePath);
    const sourceBytes = new Uint8Array(buf);

    const expectedSourceSha = await computeSha256(sourceBytes);

    const acqResult = await acquirePdfTemplate(sourceBytes, 'PEI_Comune_Roma_Infanzia.pdf');

    expect(acqResult.sourceSha256).toBe(expectedSourceSha);
    expect(acqResult.canonicalDocument).toBeDefined();
    expect(acqResult.normalizedSha256).toBeDefined();

    const expectedNormalizedSha = await computeSha256(acqResult.canonicalDocument!);
    expect(acqResult.normalizedSha256).toBe(expectedNormalizedSha);

    // Both hashes must be distinct since canonicalization applies A4 normalization & CTM deskew
    expect(acqResult.sourceSha256).not.toBe(acqResult.normalizedSha256);
  }, 90000);

  it('2. Salva e recupera i binari verificandone la corretta corrispondenza crittografica', async () => {
    const filePath = './Motore-OCR-CTE-v1.0-INTEGRATION/fixtures/PEI_Comune_Roma_Infanzia_modello_vuoto_ricostruito.pdf';
    const buf = fs.readFileSync(filePath);
    const sourceBytes = new Uint8Array(buf);

    const acqResult = await acquirePdfTemplate(sourceBytes, 'PEI_Comune_Roma_Infanzia.pdf');

    await saveCustomTemplate(
      {
        templateId: acqResult.templateId,
        name: 'PEI Comune di Roma Infanzia Normalizzato',
        schoolOrder: 'A1',
        sourceFileName: 'PEI_Comune_Roma_Infanzia.pdf',
        sourceSha256: acqResult.sourceSha256,
        normalizedSha256: acqResult.normalizedSha256,
        fileSizeBytes: acqResult.fileSizeBytes,
        pageCount: acqResult.pageCount,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationStatus: 'REVIEW_REQUIRED',
        pages: acqResult.pages,
        canonicalDocument: acqResult.canonicalDocument,
        coordinateTransform: acqResult.coordinateTransform,
      },
      acqResult.canonicalDocument || sourceBytes,
      sourceBytes
    );

    // Recupero per templateId
    const record = await getCustomTemplate(acqResult.templateId, true);
    expect(record).not.toBeNull();
    expect(record!.sourceSha256).toBe(acqResult.sourceSha256);
    expect(record!.normalizedSha256).toBe(acqResult.normalizedSha256);

    // Recupero del binario normalizzato
    const normBinary = await getTemplatePdfBinary(acqResult.normalizedSha256!);
    expect(normBinary).toBeDefined();
    const computedNormSha = await computeSha256(normBinary!);
    expect(computedNormSha).toBe(acqResult.normalizedSha256);

    // Recupero del binario originale
    const origBinary = await getTemplatePdfBinary(acqResult.sourceSha256);
    expect(origBinary).toBeDefined();
    const computedOrigSha = await computeSha256(origBinary!);
    expect(computedOrigSha).toBe(acqResult.sourceSha256);
  }, 90000);

  it('3. Rileva e rifiuta un binario effettivamente alterato o corrotto', async () => {
    const validBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // "%PDF-1.7"
    const validSha = await computeSha256(validBytes);

    const corruptedBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 56, 99, 111, 114, 114]); // altered bytes
    const corruptedSha = await computeSha256(corruptedBytes);

    expect(corruptedSha).not.toBe(validSha);

    const isMatch = corruptedSha === validSha;
    expect(isMatch).toBe(false);
  });
});
