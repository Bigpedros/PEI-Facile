import React, { useState } from 'react';
import type { PeiSectionDefinition, SchoolOrder, FieldStatus } from '../../types/pei';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Circle,
  Search,
  BookOpen,
} from 'lucide-react';

interface MasterTreeProps {
  sections: PeiSectionDefinition[];
  activeSectionId: string;
  onSelectSection?: (sectionId: string) => void;
  fieldStatuses?: Record<string, FieldStatus>;
  disabled?: boolean;
  schoolOrder: SchoolOrder;
}

export const MasterTree: React.FC<MasterTreeProps> = ({
  sections,
  activeSectionId,
  onSelectSection,
  fieldStatuses = {},
  disabled = false,
  schoolOrder,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    [activeSectionId]: true,
  });

  const toggleExpand = (secId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSections((prev) => ({ ...prev, [secId]: !prev[secId] }));
  };

  const getSectionStatusSummary = (sec: PeiSectionDefinition) => {
    const fieldIds = sec.fields.map((f) => f.id);
    if (fieldIds.length === 0) return 'empty';
    const completedCount = fieldIds.filter((id) => fieldStatuses[id] === 'compilato').length;
    if (completedCount === fieldIds.length) return 'complete';
    if (completedCount > 0) return 'partial';
    return 'empty';
  };

  const filteredSections = sections.filter(
    (sec) =>
      sec.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sec.fields.some((f) => f.label.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div
      className={`flex flex-col h-full bg-[var(--chrome-bg)] border-r border-[var(--border)] transition-opacity select-none ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      {/* Intestazione Albero Master */}
      <div className="p-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text)] uppercase tracking-wider">
            <BookOpen className="w-4 h-4 text-amber-800" />
            <span>Albero Master PEI</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-[var(--text)]">
            Modello {schoolOrder}
          </span>
        </div>

        {/* Ricerca sezioni/campi */}
        {!disabled && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca sezione o campo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 placeholder:text-stone-400"
            />
          </div>
        )}
      </div>

      {/* Elenco Sezioni */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSections.map((sec) => {
          const isActive = sec.id === activeSectionId;
          const isExpanded = expandedSections[sec.id] || isActive;
          const statusSummary = getSectionStatusSummary(sec);

          return (
            <div key={sec.id} className="rounded transition-all">
              <div
                onClick={() => onSelectSection && onSelectSection(sec.id)}
                className={`flex items-center justify-between p-2 rounded cursor-pointer transition-all border ${
                  isActive
                    ? 'bg-[var(--active-bg)] border-amber-800/40 text-[var(--active-fg)] font-semibold shadow-2xs'
                    : 'border-transparent hover:bg-[var(--hover-bg)] text-[var(--text)]'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                  {/* Espansione ramo */}
                  <button
                    type="button"
                    onClick={(e) => toggleExpand(sec.id, e)}
                    className="p-0.5 hover:bg-stone-200/50 rounded text-stone-500 shrink-0"
                    title={isExpanded ? 'Comprimi campi' : 'Espandi campi'}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Icona stato sezione */}
                  <div className="shrink-0">
                    {statusSummary === 'complete' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" title="Sezione interamente compilata" />
                    )}
                    {statusSummary === 'partial' && (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" title="Sezione parzialmente compilata" />
                    )}
                    {statusSummary === 'empty' && (
                      <Circle className="w-3.5 h-3.5 text-stone-400" title="Sezione da compilare" />
                    )}
                  </div>

                  {/* Titolo Sezione */}
                  <span className="text-xs truncate" title={sec.title}>
                    {sec.shortTitle}
                  </span>
                </div>

                {/* Badge numero campi */}
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-200/50 text-stone-600 shrink-0">
                  {sec.fields.length}
                </span>
              </div>

              {/* Sotto-albero campi (se espanso) */}
              {isExpanded && sec.fields.length > 0 && (
                <div className="ml-6 pl-2 border-l border-stone-300/80 my-1 space-y-0.5">
                  {sec.fields.map((fld) => {
                    const fldStatus = fieldStatuses[fld.id];
                    const isFldCompleted = fldStatus === 'compilato';

                    return (
                      <div
                        key={fld.id}
                        className="flex items-center justify-between py-1 px-1.5 text-[11px] text-stone-600 hover:text-stone-900 rounded hover:bg-stone-200/40 cursor-pointer"
                        onClick={() => onSelectSection && onSelectSection(sec.id)}
                      >
                        <span className="truncate pr-1" title={fld.label}>
                          {fld.label}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isFldCompleted ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : fld.required ? (
                            <span className="text-rose-600 font-bold">*</span>
                          ) : null}
                          <span className="text-[9px] font-mono text-stone-400 bg-stone-100 px-1 rounded">
                            {fld.componentType}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
