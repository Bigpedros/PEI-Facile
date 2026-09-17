import React, { useState } from 'react';
import type {
  PeiSectionDefinition,
  PeiFieldDefinition,
  SchoolOrder,
} from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import {
  HelpCircle,
  BookOpen,
  Info,
  ChevronRight,
  ChevronLeft,
  Copy,
  Check,
  FileText,
} from 'lucide-react';

interface ContextualPanelProps {
  activeSection: PeiSectionDefinition;
  activeField?: PeiFieldDefinition;
  schoolOrder: SchoolOrder;
  onInsertTextIntoField?: (text: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const ContextualPanel: React.FC<ContextualPanelProps> = ({
  activeSection,
  activeField,
  schoolOrder,
  onInsertTextIntoField,
  isOpen,
  onToggle,
}) => {
  const [activeTab, setActiveTab] = useState<'help' | 'library' | 'model'>('help');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const modelMeta = SCHOOL_ORDERS_METADATA[schoolOrder];

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleInsert = (text: string) => {
    if (onInsertTextIntoField) {
      onInsertTextIntoField(text);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-[var(--surface)] text-[var(--text)] border-l border-t border-b border-[var(--border)] p-2 rounded-l shadow-md hover:bg-[var(--hover-bg)] transition-colors z-20 flex flex-col items-center gap-1 cursor-pointer"
        title="Apri pannello aiuto e libreria contestuale"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-[10px] [writing-mode:vertical-rl] tracking-wider uppercase font-semibold py-1">
          Aiuto & Libreria
        </span>
      </button>
    );
  }

  return (
    <div className="w-80 h-full bg-[var(--surface)] border-l border-[var(--border)] flex flex-col shadow-sm transition-all z-20 select-none">
      {/* Header pannello con tab */}
      <div className="p-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--chrome-bg)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`px-2 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
              activeTab === 'help'
                ? 'bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Guida
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-2 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
              activeTab === 'library'
                ? 'bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Libreria
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('model')}
            className={`px-2 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
              activeTab === 'model'
                ? 'bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)] shadow-2xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Modello
          </button>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
          title="Chiudi pannello laterale"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Contenuto del Tab */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {activeTab === 'help' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded">
              <div className="flex items-center gap-1.5 font-bold text-[var(--text-title)] mb-1">
                <HelpCircle className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                <span>Sezione {activeSection.number} — Guida</span>
              </div>
              <p className="text-[var(--text)] leading-relaxed font-medium">
                {activeSection.description}
              </p>
            </div>

            {activeField ? (
              <div className="p-2.5 bg-[var(--card-bg)] border border-[var(--border)] rounded space-y-2 shadow-2xs">
                <div className="font-bold text-[var(--text-secondary)] flex items-center justify-between">
                  <span>Campo attivo:</span>
                  <span className="font-mono text-[10px] bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)] px-1 py-0.5 rounded font-bold">
                    {activeField.componentType}
                  </span>
                </div>
                <div className="font-bold text-[var(--text)]">{activeField.label}</div>
                {activeField.helpText && (
                  <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed font-medium">
                    {activeField.helpText}
                  </p>
                )}
                {activeField.legalReference && (
                  <div className="text-[10px] text-[var(--text-secondary)] font-mono bg-[var(--input-bg)] p-1.5 rounded border border-[var(--border)] font-semibold">
                    Rif. Normativo: {activeField.legalReference}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 text-center text-[var(--text-secondary)] italic bg-[var(--card-sub-bg)] border border-[var(--border)] rounded font-medium">
                Seleziona un campo nel foglio A4 per visualizzare i chiarimenti contestuali e i criteri ministeriali.
              </div>
            )}

            <div className="p-2.5 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded space-y-1 text-[var(--text-secondary)]">
              <div className="font-bold text-[var(--text-title)] flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                <span>Principi D.I. 182/2020</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] font-medium">
                <li>Prospettiva bio-psico-sociale (ICF)</li>
                <li>Coinvolgimento effettivo della famiglia e dello studente</li>
                <li>Separazione netta tra dati e layout di stampa</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text-title)]">
              <BookOpen className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
              <span>Libreria Frasi Tipo Demo</span>
            </div>

            {activeField && activeField.suggestedPhrases && activeField.suggestedPhrases.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--text-secondary)] font-medium">
                  Frasi pertinenti a <strong className="text-[var(--text)]">{activeField.label}</strong>:
                </p>
                {activeField.suggestedPhrases.map((phrase, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-[var(--card-bg)] border border-[var(--border)] rounded hover:border-amber-800 transition-colors space-y-1.5 shadow-2xs"
                  >
                    <p className="text-[var(--text)] leading-relaxed text-[11px] font-medium">{phrase}</p>
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => handleCopy(phrase, idx)}
                        className="px-2 py-0.5 text-[10px] text-[var(--badge-text)] hover:text-[var(--text)] bg-[var(--badge-bg)] border border-[var(--border)] rounded inline-flex items-center gap-1 cursor-pointer font-semibold"
                      >
                        {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>Copia</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsert(phrase)}
                        className="px-2 py-0.5 text-[10px] font-bold text-white bg-amber-800 hover:bg-amber-900 rounded inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Inserisci</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-[var(--text-secondary)] font-medium">
                  Tracce generali di compilazione per la sezione {activeSection.number}:
                </p>
                {[
                  'Partecipa con interesse alle attività laboratoriali condivise con il supporto di mediatori didattici.',
                  'La risposta agli stimoli verbali è favorita da consegne brevi, sequenziali e scandite visivamente.',
                  'Gli obiettivi didattici concordati mirano al consolidamento dell’autonomia nei contesti quotidiani.',
                ].map((sample, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-[var(--card-bg)] border border-[var(--border)] rounded space-y-1 shadow-2xs"
                  >
                    <p className="text-[var(--text)] text-[11px] font-medium">{sample}</p>
                    <button
                      type="button"
                      onClick={() => handleInsert(sample)}
                      className="text-[10px] text-amber-800 dark:text-[var(--accent-paglierino)] hover:underline font-bold cursor-pointer"
                    >
                      + Inserisci nel campo attivo
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'model' && (
          <div className="space-y-3">
            <div className="p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded space-y-2 shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold text-[var(--text-title)]">
                <FileText className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                <span>{modelMeta.officialAllegato} — {modelMeta.schoolLevel}</span>
              </div>
              <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed font-medium">
                {modelMeta.description}
              </p>
              <div className="text-[11px] space-y-1.5 pt-1.5 border-t border-[var(--border)]">
                <div>
                  <span className="text-[var(--text-secondary)] font-medium">Pagine ufficiali:</span>{' '}
                  <strong className="text-[var(--text)] font-bold">{modelMeta.pageCount}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)] font-medium">Quadro normativo:</span>{' '}
                  <strong className="text-[var(--text)] font-bold">{modelMeta.decree}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)] font-medium">PDF sorgente:</span>{' '}
                  <span className="font-mono text-[10px] text-[var(--text)] bg-[var(--input-bg)] border border-[var(--border)] px-1 py-0.5 rounded font-semibold">{modelMeta.pdfFileName}</span>
                </div>
                {modelMeta.specialRules && (
                  <div className="p-2 bg-[var(--card-sub-bg)] text-[var(--text)] border border-[var(--border)] rounded mt-1.5 font-medium text-[11px]">
                    {modelMeta.specialRules}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
