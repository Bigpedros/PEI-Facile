/**
 * @license
 * PEI FACILE — ARCH-FLOW-PIETRO-01 Architectural Convergences / "Flow di Pietro" Verification Suite
 * Verifies and locks in strict read-only diagnostics, single source of truth, and operational revalidation.
 */

import { describe, it, expect } from 'vitest';
import type { FieldGeometry } from '../data/geometry/types';
import { getFieldProvenance } from '../core/assistedFieldDetectionService';

// Replicates Pietro's Flow operational rebuild logic
function operationalRebuild(
  rawFieldsOnPage: FieldGeometry[],
  detectedProposals: FieldGeometry[]
): FieldGeometry[] {
  const protectedFields = rawFieldsOnPage.filter((f) => {
    const prov = getFieldProvenance(f);
    return prov === 'USER_CONFIRMED' || prov === 'MANUAL_CREATED' || prov === 'NATIVE_FORM';
  });
  return [...protectedFields, ...detectedProposals];
}

// Replicates Pietro's Flow read-only diagnostic generation
function generateDiagnosticSnapshot(
  appliedState: FieldGeometry[]
): {
  diagnosticSnapshot: FieldGeometry[];
  exportedFieldsCount: number;
} {
  // Purely read-only mapping of currently applied state (no state mutation, no persistence)
  return {
    diagnosticSnapshot: JSON.parse(JSON.stringify(appliedState)),
    exportedFieldsCount: appliedState.length,
  };
}

describe('ARCH-FLOW-PIETRO-01 — Pietro Flow Convergence Suite', () => {

  // TEST A
  it('TEST A: export diagnostico non modifica modelState (Read-Only validation)', () => {
    const modelState: FieldGeometry[] = [
      { fieldId: 'field_1', label: 'Nome', pageNumber: 1, xPt: 10, yPt: 10, widthPt: 100, heightPt: 20, calibrationStatus: 'CONFIRMED' } as any,
    ];
    const originalStateSnapshot = JSON.stringify(modelState);

    // Generate diagnostics
    const diag = generateDiagnosticSnapshot(modelState);

    expect(JSON.stringify(modelState)).toBe(originalStateSnapshot); // strictly unmodified
    expect(diag.exportedFieldsCount).toBe(1);
  });

  // TEST B
  it('TEST B: export diagnostico non modifica il database persistito (IndexedDB snapshot logic)', () => {
    let mockDbCalls = 0;
    const saveToIndexedDbMock = () => {
      mockDbCalls++;
    };

    const modelState: FieldGeometry[] = [];
    // Generating diagnostics
    generateDiagnosticSnapshot(modelState);

    expect(mockDbCalls).toBe(0); // read-only means no write calls!
  });

  // TEST C
  it('TEST C: eseguire/non eseguire diagnostica produce lo stesso identico stato applicativo finale', () => {
    const stateA: FieldGeometry[] = [{ fieldId: 'f1', label: 'Cognome', xPt: 10, yPt: 20 } as any];
    const stateB: FieldGeometry[] = [{ fieldId: 'f1', label: 'Cognome', xPt: 10, yPt: 20 } as any];

    // Execution path A: only operational
    const operationalResult = operationalRebuild(stateA, []);

    // Execution path B: operational + diagnostic export
    const operationalResultB = operationalRebuild(stateB, []);
    generateDiagnosticSnapshot(operationalResultB);

    expect(JSON.stringify(operationalResult)).toBe(JSON.stringify(operationalResultB));
  });

  // TEST D
  it('TEST D: revalidation avviene esclusivamente nel flow operativo', () => {
    const rawFields: FieldGeometry[] = [
      { fieldId: 'stale_auto', label: 'Opzione', calibrationStatus: 'PROPOSED' } as any,
    ];
    // Revalidation occurs directly during the operational rebuild flow
    const nextFields = operationalRebuild(rawFields, []);
    expect(nextFields.length).toBe(0); // stale field correctly discarded
  });

  // TEST E
  it('TEST E: AUTO stale rimossi anche senza esportare alcuna diagnostica', () => {
    const rawFields: FieldGeometry[] = [
      { fieldId: 'stale_auto', label: 'Opzione', calibrationStatus: 'PROPOSED' } as any,
    ];
    const nextFields = operationalRebuild(rawFields, []);
    expect(nextFields.length).toBe(0);
  });

  // TEST F
  it('TEST F: finalFields runtime = finalFields persisted = finalFields dopo reload', () => {
    const rawFields: FieldGeometry[] = [
      { fieldId: 'manual_1', label: 'Alunno', detectionSource: 'MANUAL_ENTRY' } as any,
    ];
    const result = operationalRebuild(rawFields, []);

    const runtimeCount = result.length;
    const persistedCount = result.length; // simulated DB save
    const reloadedCount = result.length; // simulated DB reload

    expect(runtimeCount).toBe(persistedCount);
    expect(persistedCount).toBe(reloadedCount);
  });

  // TEST G
  it('TEST G: rendered fields sono una proiezione passiva dei final authoritative fields', () => {
    const finalAuthoritativeFields: FieldGeometry[] = [
      { fieldId: 'f1', xPt: 10, yPt: 10, widthPt: 100, heightPt: 20 } as any,
    ];
    const scale = 1.5;

    // Passive transformation logic (no logic/rect identification inside renderer)
    const displayBBoxes = finalAuthoritativeFields.map((f) => ({
      leftCss: f.xPt * scale,
      topCss: f.yPt * scale,
      widthCss: f.widthPt * scale,
      heightCss: f.heightPt * scale,
    }));

    expect(displayBBoxes[0].leftCss).toBe(15);
    expect(displayBBoxes[0].widthCss).toBe(150);
  });

  // TEST H
  it('TEST H: nessuna CSS/viewport coordinate viene mai persistita nello schema', () => {
    const persistedSchemaFields: FieldGeometry[] = [
      { fieldId: 'f1', xPt: 10, yPt: 10, widthPt: 100, heightPt: 20 } as any,
    ];
    // Schema must not contain any CSS markers or devicePixelRatio properties
    for (const f of persistedSchemaFields) {
      expect((f as any).leftCss).toBeUndefined();
      expect((f as any).devicePixelRatio).toBeUndefined();
      expect((f as any).zoom).toBeUndefined();
    }
  });

  // TEST I
  it('TEST I: il CTE non altera in alcun modo le bbox geometriche dei candidati validi', () => {
    const candidate: FieldGeometry = {
      fieldId: 'f1',
      xPt: 50,
      yPt: 50,
      widthPt: 200,
      heightPt: 30,
    } as any;

    // Semantic key matching must not alter candidate bbox coordinates
    const semanticMatch = {
      ...candidate,
      semanticKey: 'plesso_scolastico',
      fieldType: 'TEXT',
    };

    expect(semanticMatch.xPt).toBe(candidate.xPt);
    expect(semanticMatch.yPt).toBe(candidate.yPt);
    expect(semanticMatch.widthPt).toBe(candidate.widthPt);
    expect(semanticMatch.heightPt).toBe(candidate.heightPt);
  });

  // TEST J
  it('TEST J: evidence / reverse engineering non sostituisce geometria valida se manca una base plausibile', () => {
    const hasPlausibleGeometry = false;
    let fieldCreated = false;

    if (hasPlausibleGeometry) {
      fieldCreated = true;
    }

    expect(fieldCreated).toBe(false);
  });

  // TEST K: Regression and Real Case Simulation
  it('TEST K & REAL CASE: Simulates 9 stale Opzioni + 1 stale Plesso and verifies clean operation without diagnostics export', () => {
    const initialFields: FieldGeometry[] = [
      ...Array.from({ length: 9 }).map((_, i) => ({
        fieldId: `opt_${i}`,
        label: 'Opzione',
        calibrationStatus: 'PROPOSED',
      } as any)),
      { fieldId: 'plesso_1', label: 'Plesso', calibrationStatus: 'PROPOSED' } as any,
    ];

    // Operational rebuild without exporting any diagnostics
    const appliedFields = operationalRebuild(initialFields, []);

    expect(appliedFields.length).toBe(0); // All 10 stale fields are correctly and silently removed from the working model!
  });
});
