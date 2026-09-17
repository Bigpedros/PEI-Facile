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
      className={`flex flex-col h-full bg-[var(--chrome-bg)] border-r border-[var(--border)] select-none ${
        disabled ? 'pointer-events-none cursor-default' : ''
      }`}
    >
      {/* Intestazione Albero Master */}
      <div className="p-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <BookOpen
              className={`w-4 h-4 ${
                disabled
                  ? 'text-[var(--text-secondary)]'
                  : 'text-amber-800 dark:text-[var(--accent-paglierino)]'
              }`}
            />
            <span className={disabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text-title)]'}>
              Albero Master PEI
            </span>
          </div>
          <span
            className={`text-[11px] font-mono px-2 py-0.5 rounded border border-[var(--border)] font-bold shadow-2xs ${
              disabled
                ? 'bg-[var(--card-sub-bg)] text-[var(--text-secondary)]'
                : 'bg-[var(--badge-bg)] text-[var(--badge-text)]'
            }`}
          >
            Modello {schoolOrder}
          </span>
        </div>

        {/* Indicatore modalità quando in Home (disabled) o barra di ricerca quando attivo */}
        {disabled ? (
          <div className="mt-2 py-1.5 px-2.5 rounded bg-[var(--card-sub-bg)] border border-[var(--border)] text-[11px] flex items-center justify-between font-semibold">
            <span className="text-[var(--text-secondary)]">Guida sezioni D.I. 182</span>
            <span className="text-[9px] uppercase tracking-wide font-bold text-[var(--text-secondary)] bg-[var(--input-bg)] px-1.5 py-0.5 rounded border border-[var(--border)]">
              Inattivo
            </span>
          </div>
        ) : (
          <div className="relative mt-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca sezione o campo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 placeholder:text-[var(--text-tertiary)] font-medium"
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
                className={`flex items-center justify-between p-2 rounded transition-all border ${
                  disabled
                    ? 'border-transparent text-[var(--text-secondary)] font-medium cursor-default'
                    : isActive
                    ? 'bg-[var(--active-bg)] border-[var(--border)] text-[var(--active-fg)] font-bold shadow-2xs cursor-pointer'
                    : 'border-transparent hover:bg-[var(--hover-bg)] text-[var(--text)] font-medium cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                  {/* Espansione ramo */}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={(e) => toggleExpand(sec.id, e)}
                    className={`p-0.5 rounded shrink-0 ${
                      disabled
                        ? 'text-[var(--text-tertiary)] cursor-default'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] cursor-pointer'
                    }`}
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
                      <CheckCircle2
                        className={`w-3.5 h-3.5 ${
                          disabled ? 'text-emerald-700/60 dark:text-emerald-500/60' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                        title="Sezione interamente compilata"
                      />
                    )}
                    {statusSummary === 'partial' && (
                      <AlertCircle
                        className={`w-3.5 h-3.5 ${
                          disabled ? 'text-amber-700/60 dark:text-amber-500/60' : 'text-amber-600 dark:text-amber-400'
                        }`}
                        title="Sezione parzialmente compilata"
                      />
                    )}
                    {statusSummary === 'empty' && (
                      <Circle className="w-3.5 h-3.5 text-[var(--text-secondary)] opacity-80" title="Sezione da compilare" />
                    )}
                  </div>

                  {/* Titolo Sezione */}
                  <span
                    className={`text-xs truncate font-medium ${
                      disabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text)]'
                    }`}
                    title={sec.title}
                  >
                    {sec.shortTitle}
                  </span>
                </div>

                {/* Badge numero campi */}
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] font-semibold shrink-0 shadow-2xs ${
                    disabled
                      ? 'bg-[var(--card-sub-bg)] text-[var(--text-secondary)]'
                      : 'bg-[var(--badge-bg)] text-[var(--badge-text)] font-bold'
                  }`}
                >
                  {sec.fields.length}
                </span>
              </div>

              {/* Sotto-albero campi (se espanso) */}
              {isExpanded && sec.fields.length > 0 && (
                <div className="ml-6 pl-2 border-l border-[var(--border)] my-1 space-y-0.5">
                  {sec.fields.map((fld) => {
                    const fldStatus = fieldStatuses[fld.id];
                    const isFldCompleted = fldStatus === 'compilato';

                    return (
                      <div
                        key={fld.id}
                        className={`flex items-center justify-between py-1 px-1.5 text-[11px] rounded ${
                          disabled
                            ? 'text-[var(--text-secondary)] cursor-default'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] cursor-pointer'
                        }`}
                        onClick={() => onSelectSection && onSelectSection(sec.id)}
                      >
                        <span className="truncate pr-1 font-normal" title={fld.label}>
                          {fld.label}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isFldCompleted ? (
                            <CheckCircle2
                              className={`w-3 h-3 ${
                                disabled ? 'text-emerald-700/60 dark:text-emerald-500/60' : 'text-emerald-600'
                              }`}
                            />
                          ) : fld.required ? (
                            <span className="text-rose-600 font-bold">*</span>
                          ) : null}
                          <span
                            className={`text-[9px] font-mono border border-[var(--border)] px-1 rounded font-semibold ${
                              disabled
                                ? 'bg-[var(--card-sub-bg)] text-[var(--text-secondary)]'
                                : 'bg-[var(--badge-bg)] text-[var(--badge-text)]'
                            }`}
                          >
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
