import { describe, expect, it } from 'vitest';
import { evaluateGenericOcrQuality } from './imagePreprocessing';

describe('evaluateGenericOcrQuality', () => {
  it('prefers structured readable text over noisy text at the same confidence', () => {
    const good = evaluateGenericOcrQuality('SEZIONE 4\nComunicazione e linguaggio\nTesto compilato dal docente', 80);
    const noisy = evaluateGenericOcrQuality('x | ~ ^ a b c { } < >', 80);
    expect(good.overallScore).toBeGreaterThan(noisy.overallScore);
  });
});
