import React, { useState } from 'react';
import type {
  PeiDocument,
  PeiSectionDefinition,
  PeiFieldDefinition,
  SchoolOrder,
} from '../../types/pei';
import { MasterTree } from '../navigation/MasterTree';
import { A4Sheet } from '../editor/A4Sheet';
import { ContextualPanel } from '../sidebars/ContextualPanel';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface CompilazioneScreenProps {
  document: PeiDocument;
  sections: PeiSectionDefinition[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  onFieldValueChange: (fieldId: string, value: any) => void;
  zoomScale: number;
  onSave: () => void;
  onGoToPreview: () => void;
}

export const CompilazioneScreen: React.FC<CompilazioneScreenProps> = ({
  document,
  sections,
  activeSectionId,
  onSelectSection,
  onFieldValueChange,
  zoomScale,
  onSave,
  onGoToPreview,
}) => {
  const [activeField, setActiveField] = useState<PeiFieldDefinition | undefined>(undefined);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);

  // Find active section
  const currentSectionIndex = sections.findIndex((s) => s.id === activeSectionId);
  const currentSection =
    currentSectionIndex !== -1 ? sections[currentSectionIndex] : sections[0];

  const handlePrevSection = () => {
    if (currentSectionIndex > 0) {
      onSelectSection(sections[currentSectionIndex - 1].id);
      setActiveField(undefined);
    }
  };

  const handleNextSection = () => {
    if (currentSectionIndex < sections.length - 1) {
      onSelectSection(sections[currentSectionIndex + 1].id);
      setActiveField(undefined);
    }
  };

  const handleInsertTextFromLibrary = (text: string) => {
    if (activeField) {
      const currentVal = document.values[activeField.id] || '';
      const newVal = currentVal ? `${currentVal}\n${text}` : text;
      onFieldValueChange(activeField.id, newVal);
    }
  };

  // Calcolo avanzamento compilazione
  const totalFields = sections.flatMap((s) => s.fields).length;
  const completedFields = Object.values(document.fieldStatuses).filter(
    (st) => st === 'compilato'
  ).length;
  const percentComplete = Math.round((completedFields / Math.max(totalFields, 1)) * 100);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 1. Navigazione Laterale Albero Master (Sinistra) */}
      <aside className="w-72 shrink-0 h-full">
        <MasterTree
          sections={sections}
          activeSectionId={currentSection.id}
          onSelectSection={onSelectSection}
          fieldStatuses={document.fieldStatuses}
          schoolOrder={document.schoolOrder}
        />
      </aside>

      {/* 2. Area Centrale: Foglio A4 Ministeriale */}
      <main className="flex-1 flex flex-col h-full bg-[var(--app-bg)] overflow-hidden">
        {/* Barra di Navigazione Sezioni (Superiore) */}
        <div className="bg-[var(--chrome-bg)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevSection}
              disabled={currentSectionIndex === 0}
              className="p-1.5 rounded hover:bg-[var(--hover-bg)] disabled:text-[var(--text-disabled)] disabled:pointer-events-none text-[var(--text)] inline-flex items-center gap-1 font-semibold cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sez. precedente</span>
            </button>
            <span className="text-[var(--border)]">|</span>
            <span className="font-bold text-[var(--text-title)]">
              Sezione {currentSection.number} di {sections.length}: {currentSection.title}
            </span>
            <button
              type="button"
              onClick={handleNextSection}
              disabled={currentSectionIndex === sections.length - 1}
              className="p-1.5 rounded hover:bg-[var(--hover-bg)] disabled:text-[var(--text-disabled)] disabled:pointer-events-none text-[var(--text)] inline-flex items-center gap-1 font-semibold cursor-pointer transition-colors"
            >
              <span>Sez. successiva</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Indicatore avanzamento complessivo */}
            <div className="flex items-center gap-2 bg-[var(--input-bg)] px-2 py-1 rounded border border-[var(--border)]">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Completamento:</span>
              <div className="w-20 bg-[var(--badge-bg)] border border-[var(--border)] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${percentComplete}%` }}
                />
              </div>
              <span className="text-[11px] font-mono font-bold text-[var(--text)]">
                {percentComplete}%
              </span>
            </div>

            <button
              type="button"
              onClick={onGoToPreview}
              className="px-2.5 py-1 text-xs font-bold bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded border border-[var(--border)] inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              title="Passa all'anteprima di stampa completa"
            >
              <Eye className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Anteprima</span>
            </button>
          </div>
        </div>

        {/* Scrollable A4 Sheet Container */}
        <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
          <A4Sheet
            section={currentSection}
            document={document}
            onFieldValueChange={onFieldValueChange}
            activeFieldId={activeField?.id}
            onFieldFocus={(field) => setActiveField(field)}
            scale={zoomScale}
            currentPage={currentSectionIndex + 1}
          />
        </div>
      </main>

      {/* 3. Pannello Contestuale Laterale (Destra) */}
      <aside className="shrink-0 h-full">
        <ContextualPanel
          activeSection={currentSection}
          activeField={activeField}
          schoolOrder={document.schoolOrder}
          onInsertTextIntoField={handleInsertTextFromLibrary}
          isOpen={isContextPanelOpen}
          onToggle={() => setIsContextPanelOpen(!isContextPanelOpen)}
        />
      </aside>
    </div>
  );
};
