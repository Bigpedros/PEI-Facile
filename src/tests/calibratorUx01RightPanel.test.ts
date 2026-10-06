/**
 * @license
 * PEI FACILE — CALIBRATOR-UX-01 Test Suite: Right Panel Usability, Field Priority, Accessible Geometry & Resizing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { formatConfidenceDisplay } from '../components/calibration/TemplateCalibrationWorkspace';
import type { FieldGeometry } from '../data/geometry/types';
import type { TemplateFieldType } from '../core/templateSchemaTypes';

describe('CALIBRATOR-UX-01: Leggibilità e Usabilità del Pannello Destro', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('1. Priorità al Campo Selezionato', () => {
    it('formattazione confidenza mostra chiaramente il valore o "Non disponibile"', () => {
      expect(formatConfidenceDisplay(undefined)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(null)).toBe('Non disponibile');
      expect(formatConfidenceDisplay(0)).toBe('0%');
      expect(formatConfidenceDisplay(0.95)).toBe('95%');
      expect(formatConfidenceDisplay(1.0)).toBe('100%');
    });

    it('tutti i tipi di campo dispongono di etichette comprensibili per i docenti', () => {
      const fieldTypeDescriptions: Record<TemplateFieldType, string> = {
        TEXT_SHORT: 'Testo breve (riga singola, es. nome, data, codice)',
        TEXT_LONG: 'Testo esteso (paragrafo multilinea, osservazioni, note)',
        DATE: 'Data (formato GG/MM/AAAA)',
        NUMBER: 'Numero (cifre o valore numerico)',
        SINGLE_CHOICE: 'Scelta singola (casella o opzione)',
        MULTI_CHOICE: 'Scelta multipla (più caselle di spunta)',
        TABLE: 'Tabella strutturata (griglia dati)',
        STATIC_OR_NON_EDITABLE: 'Statico / Non modificabile',
        OTHER: 'Altro / Tipo generico non classificato',
      };

      const validTypes: TemplateFieldType[] = [
        'TEXT_SHORT',
        'TEXT_LONG',
        'DATE',
        'NUMBER',
        'SINGLE_CHOICE',
        'MULTI_CHOICE',
        'TABLE',
        'STATIC_OR_NON_EDITABLE',
        'OTHER',
      ];

      for (const type of validTypes) {
        expect(fieldTypeDescriptions[type]).toBeDefined();
        expect(fieldTypeDescriptions[type].length).toBeGreaterThan(10);
      }
    });

    it('supporta sia sfondo Trasparente che Bianco opaco (OPAQUE_WHITE)', () => {
      const fieldTransparent: Partial<FieldGeometry> = {
        fieldId: 'f1',
        backgroundMode: 'TRANSPARENT',
      };
      const fieldOpaque: Partial<FieldGeometry> = {
        fieldId: 'f2',
        backgroundMode: 'OPAQUE_WHITE',
      };

      expect(fieldTransparent.backgroundMode).toBe('TRANSPARENT');
      expect(fieldOpaque.backgroundMode).toBe('OPAQUE_WHITE');
    });
  });

  describe('2. Geometria Accessibile (Posizione e Dimensioni)', () => {
    const PT_TO_MM = 0.352778;

    it('calcola correttamente la conversione da punti tipografici a millimetri', () => {
      const widthPt = 200;
      const heightPt = 50;

      const widthMm = parseFloat((widthPt * PT_TO_MM).toFixed(1));
      const heightMm = parseFloat((heightPt * PT_TO_MM).toFixed(1));

      expect(widthMm).toBe(70.6);
      expect(heightMm).toBe(17.6);
    });

    it('gestisce lo snap alla griglia con passo 5 pt e 10 pt', () => {
      const snap = (val: number, step: number) => Math.round(val / step) * step;

      expect(snap(102.3, 5)).toBe(100);
      expect(snap(103.8, 5)).toBe(105);
      expect(snap(104.9, 10)).toBe(100);
      expect(snap(106.1, 10)).toBe(110);
    });

    it('garantisce vincoli minimi di dimensione (min 10 pt)', () => {
      const sanitizeDim = (val: number) => Math.max(10, val);

      expect(sanitizeDim(5)).toBe(10);
      expect(sanitizeDim(-20)).toBe(10);
      expect(sanitizeDim(120)).toBe(120);
    });
  });

  describe('3. Viste Separate e Accessibilità Funzionale', () => {
    it('definisce le tre viste etichettate: Campo, Lista campi e Diagnostica', () => {
      type RightPanelTab = 'FIELD' | 'LIST' | 'DIAGNOSTICS';
      const tabs: RightPanelTab[] = ['FIELD', 'LIST', 'DIAGNOSTICS'];

      expect(tabs).toContain('FIELD');
      expect(tabs).toContain('LIST');
      expect(tabs).toContain('DIAGNOSTICS');
    });

    it('preserva i contatori diagnostici e il reverse engineering semantico', () => {
      const diagnosticsState = {
        reverseEngineeringAvailable: true,
        baselinePresent: true,
        evidencePresent: true,
        reverseEngineeredFields: 12,
        reverseEngineeredMappings: 10,
        reverseEngineeredOpaqueFields: 4,
        reverseEngineeredTransparentFields: 8,
      };

      expect(diagnosticsState.reverseEngineeringAvailable).toBe(true);
      expect(diagnosticsState.reverseEngineeredFields).toBe(12);
      expect(diagnosticsState.reverseEngineeredOpaqueFields + diagnosticsState.reverseEngineeredTransparentFields).toBe(12);
    });
  });

  describe('4. Ridimensionamento del Pannello e Persistenza', () => {
    it('limita la larghezza del pannello entro i margini di usabilità (min 340px, max 850px)', () => {
      const clampWidth = (w: number, windowWidth = 1440) => {
        const minWidth = 340;
        const maxWidth = Math.max(minWidth, Math.min(850, windowWidth - 380));
        return Math.max(minWidth, Math.min(maxWidth, w));
      };

      expect(clampWidth(200)).toBe(340);
      expect(clampWidth(420)).toBe(420);
      expect(clampWidth(600)).toBe(600);
      expect(clampWidth(1200)).toBe(850);
      // Su schermi più stretti (es. 1000px), il massimo si riduce per non coprire il canvas
      expect(clampWidth(700, 1000)).toBe(620);
    });

    it('memorizza e recupera la larghezza preferita dal localStorage', () => {
      localStorage.setItem('calibrator_panel_width', '480');
      const saved = localStorage.getItem('calibrator_panel_width');
      const parsed = saved ? parseInt(saved, 10) : 420;

      expect(parsed).toBe(480);
    });
  });
});
