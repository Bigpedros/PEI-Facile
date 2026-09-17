import React, { useState, useEffect, useMemo } from 'react';
import type { ThemeType, SchoolOrder, AppSettings, PeiModelDefinition } from '../../types/pei';
import { X, Palette, Shield, Building2, UserCheck, Check, School, FileText, Scale } from 'lucide-react';
import { CustomModelManager } from './CustomModelManager';
import {
  getAllRegistryModels,
  getGroupedActiveModels,
  resolveDefaultModel,
  getModelOriginDisplayLabel,
} from '../../data/peiModelRegistry';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  currentTheme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  defaultSchoolOrder: SchoolOrder;
  onChangeDefaultSchoolOrder: (order: SchoolOrder) => void;
  customModels: PeiModelDefinition[];
  onAddCustomModel: (model: PeiModelDefinition) => void;
  onUpdateModelStatus: (id: string, status: 'attivo' | 'archiviato') => void;
  showToast: (msg: string) => void;
  onOpenCalibration?: (model: PeiModelDefinition) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  currentTheme,
  onChangeTheme,
  defaultSchoolOrder,
  onChangeDefaultSchoolOrder,
  customModels,
  onAddCustomModel,
  onUpdateModelStatus,
  showToast,
  onOpenCalibration,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings, isOpen]);

  // Catalogo unificato dei modelli attivi
  const allModels = useMemo(() => getAllRegistryModels(customModels), [customModels]);
  const { ministerial: ministerialModels, other: otherModels } = useMemo(
    () => getGroupedActiveModels(customModels),
    [customModels]
  );

  // Modello predefinito correntemente risolto
  const currentResolvedDefault = useMemo(
    () => resolveDefaultModel(allModels, form.defaultSchoolOrder, form.defaultModelId),
    [allModels, form.defaultSchoolOrder, form.defaultModelId]
  );

  if (!isOpen) return null;

  const handleChange = (field: keyof AppSettings, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'theme') {
      onChangeTheme(value);
    }
    if (field === 'defaultSchoolOrder') {
      onChangeDefaultSchoolOrder(value);
    }
  };

  const handleSelectDefaultModel = (modelId: string) => {
    const selected = allModels.find((m) => m.id === modelId);
    if (selected) {
      setForm((prev) => ({
        ...prev,
        defaultModelId: selected.id,
        defaultSchoolOrder: selected.schoolOrder,
      }));
      onChangeDefaultSchoolOrder(selected.schoolOrder);
      showToast(`Modello predefinito impostato a: ${selected.name}`);
    }
  };

  const handleSaveAndClose = () => {
    onSaveSettings(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 z-50 text-xs">
      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] shadow-2xl max-w-3xl w-full overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-bold text-[var(--text-title)] text-sm">
            <School className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
            <span>Impostazioni Istituzionali e Modelli PEI (PEI Facile)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* DATI SCUOLA */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
              <Building2 className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
              <h3 className="font-bold text-[var(--text-title)] text-sm">1. Istituto e Docente</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Denominazione istituzione scolastica *</label>
                <input
                  type="text"
                  value={form.schoolName}
                  onChange={(e) => handleChange('schoolName', e.target.value)}
                  placeholder="Es. I.C. Statale Alessandro Manzoni"
                  className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Codice meccanografico</label>
                <input
                  type="text"
                  value={form.schoolCode}
                  onChange={(e) => handleChange('schoolCode', e.target.value)}
                  placeholder="Es. MIIC8XX00Q"
                  className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] mb-1 font-semibold">Plesso / Sede</label>
                <input
                  type="text"
                  value={form.building}
                  onChange={(e) => handleChange('building', e.target.value)}
                  placeholder="Es. Plesso Centrale / Via Roma"
                  className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                />
              </div>
            </div>
          </div>

          {/* SEZIONE 2: MODELLI PEI (Catalogo Unico: Ministeriali A1-A4 + Territoriali/Istituto) */}
          <div className="space-y-4 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
              <FileText className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
              <h3 className="font-bold text-[var(--text-title)] text-sm">2. Modelli PEI e Ordine Scolastico Predefinito</h3>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-[var(--text-title)] block">
                Modello PEI predefinito per nuovi documenti
              </label>
              <select
                value={form.defaultModelId || `MINISTERIAL_${form.defaultSchoolOrder}`}
                onChange={(e) => handleSelectDefaultModel(e.target.value)}
                className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-bold"
              >
                <optgroup label="Modelli Ministeriali Ufficiali (D.I. 182/2020 e D.I. 153/2023)">
                  {ministerialModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.schoolOrder} — {m.name} ({getModelOriginDisplayLabel(m)})
                    </option>
                  ))}
                </optgroup>
                {otherModels.length > 0 && (
                  <optgroup label="Altri Modelli Disponibili (Territoriali / Istituto / Utente)">
                    {otherModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.schoolOrder} — {m.name} ({getModelOriginDisplayLabel(m)})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-medium">
                <span>
                  Modello attualmente attivo per default:{' '}
                  <strong className="text-[var(--text)]">{currentResolvedDefault.name}</strong> ({currentResolvedDefault.schoolOrder})
                </span>
                <span className="italic">Non altera retroattivamente i PEI già compilati</span>
              </div>
            </div>

            {/* Gestore Modelli Personalizzati (Territoriali / Istituto) */}
            <div className="pt-2">
              <CustomModelManager
                customModels={customModels}
                onAddCustomModel={onAddCustomModel}
                onUpdateModelStatus={onUpdateModelStatus}
                onSetDefaultModel={handleSelectDefaultModel}
                defaultModelId={form.defaultModelId || currentResolvedDefault.id}
                showToast={showToast}
                onOpenCalibration={(model) => {
                  onClose();
                  onOpenCalibration?.(model);
                }}
              />
            </div>
          </div>

          {/* PREFERENZE DI ASPETTO */}
          <div className="space-y-3 pt-3 border-t border-[var(--border)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
              <Palette className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
              <h3 className="font-bold text-[var(--text-title)] text-sm">3. Aspetto e Temi Visivi</h3>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-[var(--text-title)] block">
                Tema Visivo Interfaccia
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'sabbia', label: 'Sabbia', desc: 'Chiaro Caldo (#F3EBD9)', bg: '#F3EBD9', text: '#2A2521' },
                  { id: 'navy', label: 'Blu Navy 35%', desc: 'Default (#C3CEDD)', bg: '#C3CEDD', text: '#152238' },
                  { id: 'antracite', label: 'Antracite', desc: 'Scuro Caldo (#222528)', bg: '#222528', text: '#F0EFEA' },
                ].map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleChange('theme', th.id as ThemeType)}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all cursor-pointer ${
                      form.theme === th.id
                        ? 'border-amber-800 ring-2 ring-amber-800/50 shadow-xs'
                        : 'border-[var(--border)] hover:border-amber-800/50'
                    }`}
                    style={{ backgroundColor: th.bg, color: th.text }}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{th.label}</span>
                      {form.theme === th.id && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="text-[10px] opacity-80 mt-1 font-medium">{th.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Privacy e Responsabilità */}
          <div className="space-y-2.5">
            <div className="p-3 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded space-y-1">
              <div className="font-bold text-[var(--text-title)] flex items-center gap-1.5 text-xs">
                <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <span>Separazione Dati e Privacy (Local-First)</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">
                I modelli vuoti acquisiti e le impostazioni istituzionali sono rigorosamente separati dai dati dei PEI compilati. Nessun dato identificativo di alunni viene memorizzato nelle impostazioni generali.
              </p>
            </div>

            {/* Responsabilità nella scelta del modello */}
            <div className="p-3 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded space-y-1.5">
              <div className="font-bold text-[var(--text-title)] flex items-center gap-1.5 text-xs">
                <Scale className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                <span>Responsabilità nella scelta del modello</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">
                PEI FACILE non determina quale modello PEI debba essere utilizzato.
                La scelta e la verifica dell&apos;idoneità del modello rispetto alle disposizioni
                dell&apos;istituzione o dell&apos;ente competente restano responsabilità
                dell&apos;utilizzatore e degli organi scolastici competenti.
                PEI FACILE garantisce il trattamento tecnico del modello importato,
                ma non ne certifica la validità normativa o amministrativa.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-[var(--chrome-bg)] p-3 border-t border-[var(--border)] flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded border border-[var(--border)] font-semibold cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer shadow-xs"
          >
            Salva e Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
