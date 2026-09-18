import React, { useState } from 'react';
import type {
  PeiDocument,
  PeiSectionDefinition,
  PeiFieldDefinition,
  SchoolOrder,
} from '../../types/pei';
import { MasterTree } from '../navigation/MasterTree';
import { DocumentSurface } from '../document/DocumentSurface';
import { ContextualPanel } from '../sidebars/ContextualPanel';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
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
  onOpenCalibration?: () => void;
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
  onOpenCalibration,
}) => {
  const [activeField, setActiveField] = useState<PeiFieldDefinition | undefined>(undefined);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);

  // Find active section
  const currentSectionIndex = sections.findIndex((s) => s.id === activeSectionId);
  const currentSection =
    currentSectionIndex !== -1 ? sections[currentSectionIndex] : sections[0];

  // Calculate page number corresponding to current section
  const [selectedSubPage, setSelectedSubPage] = useState<number>(1);
  const startPage = currentSection?.pageRange ? currentSection.pageRange[0] : currentSectionIndex + 1;
  const endPage = currentSection?.pageRange ? currentSection.pageRange[1] : startPage;
  const activePageNumber = Math.min(Math.max(startPage, selectedSubPage), endPage);

  const handlePrevSection = () => {
    if (currentSectionIndex > 0) {
      const prevSec = sections[currentSectionIndex - 1];
      onSelectSection(prevSec.id);
      setSelectedSubPage(prevSec.pageRange ? prevSec.pageRange[0] : currentSectionIndex);
      setActiveField(undefined);
    }
  };

  const handleNextSection = () => {
    if (currentSectionIndex < sections.length - 1) {
      const nextSec = sections[currentSectionIndex + 1];
      onSelectSection(nextSec.id);
      setSelectedSubPage(nextSec.pageRange ? nextSec.pageRange[0] : currentSectionIndex + 2);
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

  const handleFieldFocusFromSurface = (fieldId: string) => {
    const found =
      currentSection?.fields.find((f) => f.id === fieldId) ||
      sections.flatMap((s) => s.fields).find((f) => f.id === fieldId);
    if (found) {
      setActiveField(found);
    } else {
      setActiveField({
        id: fieldId,
        code: fieldId,
        label: fieldId,
        componentType: 'CMP-01',
        required: false,
      });
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
          onSelectSection={(secId) => {
            onSelectSection(secId);
            const sec = sections.find((s) => s.id === secId);
            if (sec?.pageRange) {
              setSelectedSubPage(sec.pageRange[0]);
            }
          }}
          fieldStatuses={document.fieldStatuses}
          schoolOrder={document.schoolOrder}
        />
      </aside>

      {/* 2. Area Centrale: Superficie Documentale di Produzione (L1 + L2 + L3) */}
      <main className="flex-1 flex flex-col h-full bg-[var(--app-bg)] overflow-hidden">
        {/* Barra di Navigazione Sezioni e Pagine (Superiore) */}
        <div className="bg-[var(--chrome-bg)] border-b border-[var(--border)] px-4 py-2 flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="btn-prev-section"
              onClick={handlePrevSection}
              disabled={currentSectionIndex === 0}
              className="p-1.5 rounded hover:bg-[var(--hover-bg)] disabled:text-[var(--text-disabled)] disabled:pointer-events-none text-[var(--text)] inline-flex items-center gap-1 font-semibold cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Sez. prec.</span>
            </button>
            <span className="text-[var(--border)]">|</span>
            <span className="font-bold text-[var(--text-title)]">
              Sezione {currentSection.number} di {sections.length}: {currentSection.title}
            </span>
            <button
              type="button"
              id="btn-next-section"
              onClick={handleNextSection}
              disabled={currentSectionIndex === sections.length - 1}
              className="p-1.5 rounded hover:bg-[var(--hover-bg)] disabled:text-[var(--text-disabled)] disabled:pointer-events-none text-[var(--text)] inline-flex items-center gap-1 font-semibold cursor-pointer transition-colors"
            >
              <span>Sez. succ.</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Stepper multi-pagina per sezioni che coprono più fogli reali */}
            {endPage > startPage && (
              <div className="flex items-center gap-1 ml-3 bg-[var(--input-bg)] px-2 py-0.5 rounded border border-[var(--border)]">
                <Layers className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                <span className="text-[11px] font-mono font-medium text-[var(--text-secondary)]">
                  Pagina reale:
                </span>
                {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSelectedSubPage(p)}
                    className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded cursor-pointer ${
                      activePageNumber === p
                        ? 'bg-amber-800 text-white'
                        : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
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
              id="btn-go-to-preview"
              onClick={onGoToPreview}
              className="px-2.5 py-1 text-xs font-bold bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded border border-[var(--border)] inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              title="Passa all'anteprima di stampa completa"
            >
              <Eye className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Anteprima</span>
            </button>
          </div>
        </div>

        {/* Superficie Documentale Reale (PDF.js L1 + Campi L2 + Editing L3) */}
        <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
          <DocumentSurface
            document={document}
            schoolOrder={document.schoolOrder}
            mode="EDIT"
            zoomScale={zoomScale}
            pageNumber={activePageNumber}
            showAllPages={false}
            activeFieldId={activeField?.id}
            onFieldFocus={handleFieldFocusFromSurface}
            onFieldValueChange={onFieldValueChange}
            onOpenCalibration={onOpenCalibration || (() => {
              window.location.search = '?dev=geometry';
            })}
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
