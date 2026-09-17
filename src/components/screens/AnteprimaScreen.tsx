import React, { useState } from 'react';
import type { PeiDocument, PeiSectionDefinition } from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import { A4Sheet } from '../editor/A4Sheet';
import {
  Printer,
  FileText,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  ShieldCheck,
  CheckCircle2,
  Filter,
  Lock,
} from 'lucide-react';

interface AnteprimaScreenProps {
  document: PeiDocument;
  sections: PeiSectionDefinition[];
  onBackToCompilazione: () => void;
  zoomScale: number;
  onChangeZoom: (scale: number) => void;
  onOpenShareModal: () => void;
}

export const AnteprimaScreen: React.FC<AnteprimaScreenProps> = ({
  document,
  sections,
  onBackToCompilazione,
  zoomScale,
  onChangeZoom,
  onOpenShareModal,
}) => {
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const modelMeta = SCHOOL_ORDERS_METADATA[document.schoolOrder];

  const displayedSections =
    selectedSectionFilter === 'all'
      ? sections
      : sections.filter((s) => s.id === selectedSectionFilter);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--app-bg)] overflow-hidden">
      {/* Barra di Controllo Stampa (Nascosta in stampa con .no-print) */}
      <div className="no-print bg-[var(--chrome-bg)] border-b border-[var(--border)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 select-none shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToCompilazione}
            className="px-3 py-1.5 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded font-bold inline-flex items-center gap-1.5 border border-[var(--border)] transition-colors cursor-pointer shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
            <span>Torna alla compilazione</span>
          </button>

          <div className="h-4 w-px bg-[var(--border)]" />

          {/* Filtro Sezioni da Stampare */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            <span className="text-[var(--text-secondary)] font-bold">Visualizza:</span>
            <select
              value={selectedSectionFilter}
              onChange={(e) => setSelectedSectionFilter(e.target.value)}
              className="px-2 py-1 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] font-semibold focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              <option value="all">Tutte le sezioni ({sections.length})</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Sezione {s.number} — {s.shortTitle}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Reputazione e Convalida */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-full font-bold text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
          <span>Layout Vettoriale Ufficiale {modelMeta.officialAllegato}</span>
        </div>

        {/* Pulsanti Azione e Zoom */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--input-bg)] border border-[var(--border)] rounded px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => onChangeZoom(Math.max(0.6, zoomScale - 0.1))}
              className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
              title="Riduci zoom"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono font-bold px-1 min-w-[40px] text-center text-[var(--text)]">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => onChangeZoom(Math.min(1.4, zoomScale + 0.1))}
              className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
              title="Aumenta zoom"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenShareModal}
            className="px-3 py-1.5 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded font-bold inline-flex items-center gap-1.5 border border-[var(--border)] transition-colors cursor-pointer shadow-2xs"
            title="Condividi in sicurezza (DLG-001)"
          >
            <Lock className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
            <span>Condividi in sicurezza</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Stampa / Salva PDF</span>
          </button>
        </div>
      </div>

      {/* Area Pagine A4 Continue per Stampa/Anteprima */}
      <div className="flex-1 overflow-auto p-6 space-y-8 flex flex-col items-center">
        {displayedSections.map((sec, sIdx) => (
          <div key={sec.id} className="w-full flex flex-col items-center">
            {/* Indicatore pagina */}
            <div className="no-print text-xs text-[var(--text-secondary)] font-mono font-semibold mb-1">
              Foglio A4 Ministeriale #{sIdx + 1} — Sezione {sec.number}
            </div>

            <A4Sheet
              section={sec}
              document={document}
              onFieldValueChange={() => {}}
              readOnly={true}
              scale={zoomScale}
              currentPage={sIdx + 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
