import React from 'react';
import type { PeiModelDefinition } from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import {
  getAllRegistryModels,
  getModelOriginDisplayLabel,
} from '../../data/peiModelRegistry';
import {
  X,
  Building,
  Check,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Plus,
  ShieldCheck,
  Clock,
  Compass,
} from 'lucide-react';

interface OtherModelCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  customModels: PeiModelDefinition[];
  currentModelId?: string;
  onSelectModel: (model: PeiModelDefinition) => void;
  onOpenImportModal?: () => void;
  onOpenCalibration?: (model: PeiModelDefinition) => void;
}

export const OtherModelCatalogModal: React.FC<OtherModelCatalogModalProps> = ({
  isOpen,
  onClose,
  customModels,
  currentModelId,
  onSelectModel,
  onOpenImportModal,
  onOpenCalibration,
}) => {
  if (!isOpen) return null;

  // Modelli non ministeriali registrati nel registry unico
  const allRegistry = getAllRegistryModels(customModels);
  const otherModels = allRegistry.filter(
    (m) => !m.isMinisterial && m.originType !== 'MINISTERIAL' && m.status === 'attivo'
  );

  const handleSelect = (model: PeiModelDefinition) => {
    onSelectModel(model);
    onClose();
  };

  return (
    <div
      id="other-model-catalog-modal"
      className="fixed inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
    >
      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] shadow-2xl max-w-2xl w-full overflow-hidden text-xs max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-amber-800 dark:text-[var(--accent-paglierino)]" />
            <div>
              <h2 className="text-base font-bold font-serif text-[var(--text-title)]">
                Catalogo Modelli Non Ministeriali
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Modelli Territoriali, di Istituto e Personalizzati Registrati
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-other-model-catalog"
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer transition-colors"
            title="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Seleziona un modello territoriale, d&apos;istituto o personalizzato attivo nel registro.
            La selezione aggiornerà la struttura e il binding template del documento.
          </div>

          {otherModels.length === 0 ? (
            <div className="p-8 text-center bg-[var(--card-sub-bg)] rounded-lg border border-dashed border-[var(--border)] space-y-3">
              <FileText className="w-8 h-8 text-[var(--text-secondary)] mx-auto opacity-50" />
              <div className="font-semibold text-sm text-[var(--text)]">
                Nessun modello personalizzato registrato
              </div>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Non sono presenti modelli territoriali o d&apos;istituto attivi. Puoi importare un nuovo modello PDF con la procedura guidata.
              </p>
              {onOpenImportModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenImportModal();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Importa Nuovo Modello PDF
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {otherModels.map((model) => {
                const isSelected = model.id === currentModelId;
                const isCalibrated = model.calibrationStatus === 'CALIBRATED';
                const meta = SCHOOL_ORDERS_METADATA[model.schoolOrder];

                return (
                  <div
                    key={model.id}
                    id={`model-card-${model.id}`}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-amber-800 bg-[var(--active-bg)] shadow-xs'
                        : 'border-[var(--border)] hover:border-amber-800/60 bg-[var(--card-sub-bg)]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-0.5 rounded border border-[var(--border)]">
                            {model.schoolOrder} — {meta?.name || 'Grado Scolastico'}
                          </span>
                          <span className="text-[10px] font-bold text-[var(--text-secondary)] px-2 py-0.5 bg-[var(--badge-bg)] rounded border border-[var(--border)]">
                            {getModelOriginDisplayLabel(model)}
                          </span>
                          {isCalibrated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Calibrato
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              In Revisione / Da Calibrare
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-[var(--text-title)]">
                          {model.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isCalibrated && onOpenCalibration && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenCalibration(model);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] rounded transition-colors cursor-pointer"
                            title="Apri calibrazione geometrica"
                          >
                            <Compass className="w-3.5 h-3.5 text-amber-700" />
                            Calibra
                          </button>
                        )}
                        <button
                          type="button"
                          id={`btn-select-model-${model.id}`}
                          onClick={() => handleSelect(model)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors cursor-pointer shadow-xs ${
                            isSelected
                              ? 'bg-emerald-700 text-white'
                              : 'bg-amber-800 hover:bg-amber-900 text-white'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              In Uso
                            </>
                          ) : (
                            'Seleziona Modello'
                          )}
                        </button>
                      </div>
                    </div>

                    {model.description && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1.5 font-medium leading-relaxed">
                        {model.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-[11px] text-[var(--text-secondary)] mt-2 pt-2 border-t border-[var(--border)] font-mono">
                      <span>Versione: {model.version}</span>
                      <span>Formato: {model.format}</span>
                      {model.acquisitionDate && <span>Acquisito: {model.acquisitionDate}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[var(--chrome-bg)] p-3.5 border-t border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            {onOpenImportModal && (
              <button
                type="button"
                id="btn-catalog-import-new"
                onClick={() => {
                  onClose();
                  onOpenImportModal();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-[var(--accent-paglierino)] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Gestisci o importa altri modelli PDF…
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] rounded cursor-pointer transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
