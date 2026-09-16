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
            className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
              activeTab === 'help'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Guida
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
              activeTab === 'library'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Libreria
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('model')}
            className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
              activeTab === 'model'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Modello
          </button>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="p-1 hover:bg-stone-200/60 rounded text-stone-500 cursor-pointer"
          title="Chiudi pannello laterale"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Contenuto del Tab */}
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        {activeTab === 'help' && (
          <div className="space-y-3">
            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded">
              <div className="flex items-center gap-1.5 font-bold text-amber-950 mb-1">
                <HelpCircle className="w-4 h-4 text-amber-800" />
                <span>Sezione {activeSection.number} — Guida</span>
              </div>
              <p className="text-stone-700 leading-relaxed">
                {activeSection.description}
              </p>
            </div>

            {activeField ? (
              <div className="p-2.5 bg-white border border-stone-200 rounded space-y-2 shadow-2xs">
                <div className="font-semibold text-stone-900 flex items-center justify-between">
                  <span>Campo attivo:</span>
                  <span className="font-mono text-[10px] bg-stone-100 px-1 py-0.5 rounded text-stone-500">
                    {activeField.componentType}
                  </span>
                </div>
                <div className="font-medium text-stone-800">{activeField.label}</div>
                {activeField.helpText && (
                  <p className="text-stone-600 text-[11px] leading-relaxed">
                    {activeField.helpText}
                  </p>
                )}
                {activeField.legalReference && (
                  <div className="text-[10px] text-stone-500 font-mono bg-stone-50 p-1.5 rounded border border-stone-200">
                    Rif. Normativo: {activeField.legalReference}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 text-center text-stone-500 italic bg-stone-50 border border-stone-200 rounded">
                Seleziona un campo nel foglio A4 per visualizzare i chiarimenti contestuali e i criteri ministeriali.
              </div>
            )}

            <div className="p-2.5 bg-stone-50 border border-stone-200 rounded space-y-1 text-stone-600">
              <div className="font-semibold text-stone-800 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-stone-500" />
                <span>Principi D.I. 182/2020</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px]">
                <li>Prospettiva bio-psico-sociale (ICF)</li>
                <li>Coinvolgimento effettivo della famiglia e dello studente</li>
                <li>Separazione netta tra dati e layout di stampa</li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-stone-800">
              <BookOpen className="w-4 h-4 text-amber-800" />
              <span>Libreria Frasi Tipo Demo</span>
            </div>

            {activeField && activeField.suggestedPhrases && activeField.suggestedPhrases.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] text-stone-500">
                  Frasi pertinenti a <strong>{activeField.label}</strong>:
                </p>
                {activeField.suggestedPhrases.map((phrase, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-white border border-stone-200 rounded hover:border-amber-300 transition-colors space-y-1.5 shadow-2xs"
                  >
                    <p className="text-stone-800 leading-relaxed text-[11px]">{phrase}</p>
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-stone-100">
                      <button
                        type="button"
                        onClick={() => handleCopy(phrase, idx)}
                        className="px-2 py-0.5 text-[10px] text-stone-600 hover:text-stone-900 bg-stone-100 rounded inline-flex items-center gap-1"
                      >
                        {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>Copia</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsert(phrase)}
                        className="px-2 py-0.5 text-[10px] font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 rounded inline-flex items-center gap-1"
                      >
                        <span>Inserisci</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-stone-500">
                  Tracce generali di compilazione per la sezione {activeSection.number}:
                </p>
                {[
                  'Partecipa con interesse alle attività laboratoriali condivise con il supporto di mediatori didattici.',
                  'La risposta agli stimoli verbali è favorita da consegne brevi, sequenziali e scandite visivamente.',
                  'Gli obiettivi didattici concordati mirano al consolidamento dell’autonomia nei contesti quotidiani.',
                ].map((sample, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-white border border-stone-200 rounded space-y-1"
                  >
                    <p className="text-stone-700 text-[11px]">{sample}</p>
                    <button
                      type="button"
                      onClick={() => handleInsert(sample)}
                      className="text-[10px] text-amber-800 hover:text-amber-950 font-medium"
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
            <div className="p-3 bg-stone-50 border border-stone-200 rounded space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-stone-900">
                <FileText className="w-4 h-4 text-amber-800" />
                <span>{modelMeta.officialAllegato} — {modelMeta.schoolLevel}</span>
              </div>
              <p className="text-stone-600 text-[11px] leading-relaxed">
                {modelMeta.description}
              </p>
              <div className="text-[11px] space-y-1 pt-1 border-t border-stone-200">
                <div>
                  <span className="text-stone-500">Pagine ufficiali:</span>{' '}
                  <strong className="text-stone-800">{modelMeta.pageCount}</strong>
                </div>
                <div>
                  <span className="text-stone-500">Quadro normativo:</span>{' '}
                  <strong className="text-stone-800">{modelMeta.decree}</strong>
                </div>
                <div>
                  <span className="text-stone-500">PDF sorgente:</span>{' '}
                  <span className="font-mono text-[10px] text-stone-700">{modelMeta.pdfFileName}</span>
                </div>
                {modelMeta.specialRules && (
                  <div className="p-1.5 bg-amber-50 text-amber-900 border border-amber-200 rounded mt-1.5">
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
