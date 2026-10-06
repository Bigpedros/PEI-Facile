import { describe, it, expect } from 'vitest';
import {
  GeometricRectificationEngine,
  createWorkingCanvas,
  type RectificationMetrics,
} from '../core/geometry/geometricRectificationEngine';

describe('PEI FACILE — Punto 3: Rettifica Effettiva dello Sfondo', () => {
  it('1. Misurazione e correzione dell’inclinazione (Deskew): riduzione reale dell’inclinazione residua', async () => {
    // Crea un canvas sintetico con linee inclinate note di +2.5 gradi
    const width = 1200;
    const height = 1600;
    const canvas = await createWorkingCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Disegna 4 linee strutturali continue inclinate a +2.5°
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    const angleRad = (2.5 * Math.PI) / 180;
    const yBands = [300, 600, 900, 1200];

    for (const yBase of yBands) {
      ctx.beginPath();
      ctx.moveTo(100, yBase + (100 - 600) * Math.sin(angleRad));
      ctx.lineTo(1100, yBase + (1100 - 600) * Math.sin(angleRad));
      ctx.stroke();
    }

    const res = await GeometricRectificationEngine.rectifyCanvas(canvas, 1, 200);

    expect(res).toBeDefined();
    expect(res.rectifiedCanvas).toBeDefined();

    const m = res.metrics;
    // Verifica che l'inclinazione iniziale sia stata stimata coerentemente attorno a 2.5°
    expect(Math.abs(m.globalSkewDegrees - 2.5)).toBeLessThanOrEqual(0.6);
    expect(m.appliedDeskewDegrees).toBeDefined();

    // L'inclinazione residua misurata sull'output deve essere inferiore a 0.5°
    expect(m.residualSkewDegrees).toBeDefined();
    expect(Math.abs(m.residualSkewDegrees!)).toBeLessThanOrEqual(0.5);
  });

  it('2. Pagine rettilinee senza curvatura: preserva la pagina senza rettifiche locali arbitrarie', async () => {
    // Canvas con linee perfettamente orizzontali senza curvatura
    const width = 1200;
    const height = 1600;
    const canvas = await createWorkingCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    for (const y of [200, 400, 700, 1000, 1300]) {
      ctx.beginPath();
      ctx.moveTo(100, y);
      ctx.lineTo(1100, y);
      ctx.stroke();
    }

    const res = await GeometricRectificationEngine.rectifyCanvas(canvas, 1, 200);
    const m = res.metrics;

    expect(m.globalSkewDegrees).toBe(0);
    // In assenza di evidenze di curvatura, non deve applicare distorsioni locali arbitrarie
    expect(m.dewarpingMapApplied).toBe(false);
    expect(m.gridDisplacementMaxPx).toBe(0);
  });

  it('3. Distinzione tra trasformazione applicata, spostamento della griglia e metriche residue', async () => {
    const width = 1200;
    const height = 1600;
    const canvas = await createWorkingCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Disegna linee continue con leggera flessione
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    for (const yBase of [400, 800, 1200]) {
      ctx.beginPath();
      for (let x = 100; x <= 1100; x += 10) {
        const curvatureOffset = 4.0 * Math.sin(((x - 100) / 1000) * Math.PI);
        const y = yBase + curvatureOffset;
        if (x === 100) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const res = await GeometricRectificationEngine.rectifyCanvas(canvas, 1, 200);
    const m = res.metrics;

    // Distinzione formale dei campi
    expect(typeof m.globalSkewDegrees).toBe('number');
    expect(typeof m.localCurvatureMaxDeviationPx).toBe('number');
    expect(typeof m.localCurvatureMeanDeviationPx).toBe('number');
    expect(typeof m.residualCurvatureMaxDeviationPx).toBe('number');
    expect(typeof m.gridDisplacementMaxPx).toBe('number');

    // La deviazione residua non deve superare la deviazione iniziale
    expect(m.residualCurvatureMaxDeviationPx!).toBeLessThanOrEqual(m.localCurvatureMaxDeviationPx + 1.0);
  });
});
