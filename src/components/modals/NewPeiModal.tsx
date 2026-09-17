import React, { useState, useEffect, useMemo } from 'react';
import type { SchoolOrder, AppSettings, PeiModelDefinition } from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import {
  getAllRegistryModels,
  getGroupedActiveModels,
  resolveDefaultModel,
  getModelOriginDisplayLabel,
} from '../../data/peiModelRegistry';
import { X, Check, ShieldCheck, FileText, Building, Star, AlertCircle } from 'lucide-react';

interface NewPeiModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  customModels?: PeiModelDefinition[];
  onConfirmCreate: (
    order: SchoolOrder,
    studentCode: string,
    schoolName: string,
    classSec: string,
    modelDef?: PeiModelDefinition
  ) => void;
}

export const NewPeiModal: React.FC<NewPeiModalProps> = ({
  isOpen,
  onClose,
  settings,
  customModels = [],
  onConfirmCreate,
}) => {
  // Catalogo unificato dei modelli attivi
  const allModels = useMemo(() => getAllRegistryModels(customModels), [customModels]);
  const { ministerial: ministerialModels, other: otherModels } = useMemo(
    () => getGroupedActiveModels(customModels),
    [customModels]
  );

  // Modello iniziale risolto con logica deterministica di default
  const defaultResolved = useMemo(
    () => resolveDefaultModel(allModels, settings.defaultSchoolOrder || 'A2', settings.defaultModelId),
    [allModels, settings.defaultSchoolOrder, settings.defaultModelId]
  );

  const [selectedModelId, setSelectedModelId] = useState<string>(defaultResolved.id);
  const [studentCode, setStudentCode] = useState('');
  const [schoolName, setSchoolName] = useState(settings.schoolName || '');
  const [classSec, setClassSec] = useState(settings.building || '');

  // Sincronizzazione con apertura del modale e impostazioni
  useEffect(() => {
    if (isOpen) {
      const initial = resolveDefaultModel(
        allModels,
        settings.defaultSchoolOrder || 'A2',
        settings.defaultModelId
      );
      setSelectedModelId(initial.id);
      setSchoolName(settings.schoolName || '');
      setClassSec(settings.building || '');
      setStudentCode('');
    }
  }, [isOpen, settings, allModels]);

  if (!isOpen) return null;

  const selectedModel = allModels.find((m) => m.id === selectedModelId) || defaultResolved;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmCreate(
      selectedModel.schoolOrder,
      studentCode || 'ALUNNO_NON_SPECIFICATO',
      schoolName,
      classSec,
      selectedModel
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] shadow-2xl max-w-2xl w-full overflow-hidden text-xs max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-800 dark:text-[var(--accent-paglierino)]" />
            <h2 className="text-base font-bold font-serif text-[var(--text-title)]">
              Crea Nuovo Piano Educativo Individualizzato
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Selettore Modello di Riferimento con Raggruppamento Semantico */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-[var(--text-title)] text-xs block">
                1. Seleziona il Modello di Riferimento:
              </label>
              <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                Ministeriale o Territoriale / Istituto
              </span>
            </div>

            {/* GRUPPO A: Modelli Ministeriali Ufficiali */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                <span>Modelli Ministeriali Ufficiali (D.I. 182/2020 e D.I. 153/2023)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ministerialModels.map((m) => {
                  const meta = SCHOOL_ORDERS_METADATA[m.schoolOrder];
                  const isSelected = selectedModelId === m.id;
                  const isPrefDefault =
                    m.id === settings.defaultModelId ||
                    (!settings.defaultModelId && m.schoolOrder === settings.defaultSchoolOrder);

                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedModelId(m.id)}
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-amber-800 bg-[var(--active-bg)] shadow-xs'
                          : 'border-[var(--border)] hover:border-amber-800/60 bg-[var(--card-sub-bg)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-xs bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded border border-[var(--border)]">
                          {m.schoolOrder}
                        </span>
                        <div className="flex items-center gap-1">
                          {isPrefDefault && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 font-bold">
                              <Star className="w-2.5 h-2.5 fill-current" /> Predefinito
                            </span>
                          )}
                          <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                            {meta?.pageCount || 12} pag.
                          </span>
                        </div>
                      </div>
                      <div className="font-bold text-[var(--text)] text-xs">{m.name}</div>
                      <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">
                        {meta?.name || m.originName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GRUPPO B: Modelli Aggiuntivi, Territoriali e di Istituto (se presenti e attivi) */}
            {otherModels.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 dark:text-[var(--accent-paglierino)] uppercase tracking-wider">
                  <Building className="w-3.5 h-3.5 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                  <span>Modelli Territoriali, di Istituto e Personalizzati</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {otherModels.map((m) => {
                    const isSelected = selectedModelId === m.id;
                    const isPrefDefault = m.id === settings.defaultModelId;

                    return (
                      <div
                        key={m.id}
                        onClick={() => setSelectedModelId(m.id)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-amber-800 bg-[var(--active-bg)] shadow-xs'
                            : 'border-[var(--border)] hover:border-amber-800/60 bg-[var(--card-sub-bg)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono font-bold text-xs bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded border border-[var(--border)]">
                            {m.schoolOrder}
                          </span>
                          <div className="flex items-center gap-1">
                            {isPrefDefault && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 font-bold">
                                <Star className="w-2.5 h-2.5 fill-current" /> Predefinito
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] px-1.5 py-0.2 bg-[var(--badge-bg)] rounded border border-[var(--border)]">
                              {getModelOriginDisplayLabel(m)}
                            </span>
                          </div>
                        </div>
                        <div className="font-bold text-[var(--text)] text-xs">{m.name}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-medium">
                          {m.originName ? `${m.originName} • v${m.version}` : `v${m.version}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Dati Generali Intestazione */}
          <div className="space-y-3 pt-3 border-t border-[var(--border)]">
            <label className="font-bold text-[var(--text-title)] text-xs block">
              2. Intestazione Documento (Dati istituzionali):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 text-[11px] font-medium">
                  Identificativo Alunno/a (Pseudonimo):
                </label>
                <input
                  type="text"
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="Es. ALU-2026-01"
                  className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 text-[11px] font-medium">
                  Istituzione Scolastica:
                </label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Es. I.C. Statale..."
                  className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                />
              </div>
              <div>
                <label className="block text-[var(--text-secondary)] mb-1 text-[11px] font-medium">
                  Classe / Sezione / Plesso:
                </label>
                <input
                  type="text"
                  required
                  value={classSec}
                  onChange={(e) => setClassSec(e.target.value)}
                  placeholder="Es. 3^ B - Plesso Centrale"
                  className="w-full px-2.5 py-1.5 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Badge informativo sul modello selezionato */}
          <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--card-sub-bg)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedModel.isMinisterial ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-[var(--text)] text-[11px]">
                      Modello ministeriale ufficiale ({selectedModel.schoolOrder})
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-medium">
                      Decreti Interministeriali n. 182/2020 e n. 153/2023
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Building className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0" />
                  <div>
                    <div className="font-bold text-[var(--text)] text-[11px]">
                      {getModelOriginDisplayLabel(selectedModel)}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-medium">
                      {selectedModel.description || 'Modello adottato presso l’istituzione o ente competente'}
                    </div>
                  </div>
                </>
              )}
            </div>
            <span className="font-mono text-[10px] text-[var(--text-secondary)] bg-[var(--badge-bg)] px-2 py-0.5 rounded border border-[var(--border)]">
              ID: {selectedModel.id}
            </span>
          </div>

          {/* Footer form */}
          <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded border border-[var(--border)] font-semibold cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Crea PEI con questo Modello</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


