import React, { useState, useEffect, useMemo } from 'react';
import type { ThemeType, SchoolOrder, AppSettings, PeiModelDefinition } from '../../types/pei';
import {
  X,
  Palette,
  Shield,
  Building2,
  User,
  UserCheck,
  Check,
  School,
  FileText,
  Scale,
  ChevronRight,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { CustomModelManager } from './CustomModelManager';
import {
  getAllRegistryModels,
  getGroupedActiveModels,
  resolveDefaultModel,
  getModelOriginDisplayLabel,
} from '../../data/peiModelRegistry';

export type SettingsView = 'home' | 'teacher' | 'school' | 'models' | 'appearance' | 'privacy';

/**
 * Future Frozen Readiness helper.
 * Verifica se il profilo docente contiene Nome e Cognome minimi.
 * NON attiva alcun blocco in R2 (l'app rimane al 100% sbloccata e utilizzabile).
 */
export function isTeacherProfileComplete(settings: Partial<AppSettings>): boolean {
  return Boolean(settings.teacherName?.trim() && settings.teacherSurname?.trim());
}

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
  initialView?: SettingsView;
}

interface ThemeDefinition {
  id: ThemeType;
  name: string;
  category: string;
  tagline: string;
  description: string;
  palette: {
    appBg: string;
    chromeBg: string;
    surface: string;
    cardBg: string;
    cardSubBg: string;
    border: string;
    titleText: string;
    primaryText: string;
    secondaryText: string;
    btnBg: string;
    btnText: string;
    badgeBg: string;
    badgeText: string;
    accent: string;
  };
}

const THEMES_CATALOG: ThemeDefinition[] = [
  {
    id: 'verde_prato',
    name: 'Verde Prato',
    category: 'Scuro Riposante',
    tagline: 'Verde medio-scuro desaturato e confortevole',
    description: 'Palette a base vegetale sobria, rilassante per lunghe sessioni di compilazione con contrasti identici al Blu Navy.',
    palette: {
      appBg: '#1B2E24',
      chromeBg: '#13221B',
      surface: '#1E352A',
      cardBg: '#233C30',
      cardSubBg: '#2C4B3C',
      border: '#476E5B',
      titleText: '#FFFFFF',
      primaryText: '#F0F7F4',
      secondaryText: '#C0D8CC',
      btnBg: '#416B56',
      btnText: '#FFFFFF',
      badgeBg: '#315141',
      badgeText: '#F0F7F4',
      accent: '#D97706',
    },
  },
  {
    id: 'navy',
    name: 'Blu Navy',
    category: 'Scuro Istituzionale',
    tagline: 'Navy intenso profondo ad alta leggibilità',
    description: 'Blu istituzionale profondo al 50% di saturazione, con marcata gerarchia dei pannelli e testi chiari nitidi.',
    palette: {
      appBg: '#1A2A3C',
      chromeBg: '#132030',
      surface: '#1E3146',
      cardBg: '#22374E',
      cardSubBg: '#2C4563',
      border: '#46678E',
      titleText: '#FFFFFF',
      primaryText: '#F0F4F8',
      secondaryText: '#C0D3E5',
      btnBg: '#416590',
      btnText: '#FFFFFF',
      badgeBg: '#324D6E',
      badgeText: '#F0F4F8',
      accent: '#D97706',
    },
  },
  {
    id: 'sabbia',
    name: 'Sabbia',
    category: 'Chiaro Caldo',
    tagline: 'Toni pergamena e contrasto morbido anti-abbagliamento',
    description: 'Superficie chiara naturale priva di bianchi puri abbaglianti, con testo quasi-nero caldo per massima leggibilità.',
    palette: {
      appBg: '#EFE4CF',
      chromeBg: '#E8DCBE',
      surface: '#E4D7B9',
      cardBg: '#E2D3B8',
      cardSubBg: '#FAF6ED',
      border: '#A3916F',
      titleText: '#1E1914',
      primaryText: '#2B241C',
      secondaryText: '#4E4233',
      btnBg: '#8A4B1A',
      btnText: '#FFFFFF',
      badgeBg: '#D7C6A3',
      badgeText: '#231C14',
      accent: '#8A4B1A',
    },
  },
  {
    id: 'antracite',
    name: 'Antracite',
    category: 'Scuro Neutro',
    tagline: 'Grafite tecnica con accenti paglierino ad alto contrasto',
    description: 'Struttura scura neutra bilanciata, ideale in ambienti a bassa illuminazione con elementi attivi in contrasto caldo.',
    palette: {
      appBg: '#222528',
      chromeBg: '#1B1E21',
      surface: '#292D32',
      cardBg: '#292D32',
      cardSubBg: '#202427',
      border: '#525862',
      titleText: '#FFFDF7',
      primaryText: '#F7F3E8',
      secondaryText: '#E0DBD0',
      btnBg: '#E8D89A',
      btnText: '#222528',
      badgeBg: '#3A4048',
      badgeText: '#FFFDF7',
      accent: '#E8D89A',
    },
  },
];

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
  initialView = 'home',
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [currentView, setCurrentView] = useState<SettingsView>(initialView);

  useEffect(() => {
    setForm(settings);
    if (isOpen) {
      setCurrentView(initialView);
    }
  }, [settings, isOpen, initialView]);

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
      showToast(`Tema applicato: ${THEMES_CATALOG.find((t) => t.id === value)?.name || value}`);
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

  const isTeacherComplete = isTeacherProfileComplete(form);

  // Header Title in base alla vista corrente
  const getHeaderTitle = () => {
    switch (currentView) {
      case 'teacher':
        return 'Impostazioni — Informazioni docente';
      case 'school':
        return 'Impostazioni — Informazioni istituto';
      case 'models':
        return 'Impostazioni — Modelli PEI';
      case 'appearance':
        return 'Impostazioni — Aspetto e Temi';
      case 'privacy':
        return 'Impostazioni — Privacy e Note';
      case 'home':
      default:
        return 'Impostazioni';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4 z-50 text-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--border)] shadow-2xl max-w-4xl xl:max-w-5xl w-full overflow-hidden max-h-[92vh] flex flex-col transition-all">
        {/* HEADER MODALE */}
        <div className="bg-[var(--chrome-bg)] px-4 py-3.5 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-bold text-[var(--text-title)] text-sm">
            <School className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0" />
            <span id="settings-dialog-title">{getHeaderTitle()}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--hover-bg)] rounded-md text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber-800/60"
            title="Chiudi impostazioni"
            aria-label="Chiudi finestra impostazioni"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CONTENUTO PRINCIPALE */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          {/* ==================================================== */}
          {/* LIVELLO 1: HOME IMPOSTAZIONI (5 CARD MINIMALI)      */}
          {/* ==================================================== */}
          {currentView === 'home' && (
            <div className="space-y-4">
              <div className="mb-2">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-medium">
                  Seleziona una sezione per configurare il profilo, le informazioni della scuola, i modelli PEI e l&apos;aspetto visivo.
                </p>
              </div>

              {/* GRIGLIA ESATTAMENTE 5 CARD IN ORDINE TASSATIVO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. Informazioni docente */}
                <button
                  type="button"
                  id="settings-card-teacher"
                  onClick={() => setCurrentView('teacher')}
                  className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--card-sub-bg)] hover:bg-[var(--surface)] hover:border-amber-800/60 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-800/80 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 group-hover:scale-105 transition-transform">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-title)]">
                          1. Informazioni docente
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate font-normal">
                        Dati anagrafici, ruolo e firma del docente
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${
                        isTeacherComplete
                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/60'
                          : 'bg-[var(--badge-bg)] text-[var(--text-secondary)] border-[var(--border)]'
                      }`}
                    >
                      {isTeacherComplete ? 'Completo' : 'Da completare'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 2. Informazioni istituto */}
                <button
                  type="button"
                  id="settings-card-school"
                  onClick={() => setCurrentView('school')}
                  className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--card-sub-bg)] hover:bg-[var(--surface)] hover:border-amber-800/60 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-800/80 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 group-hover:scale-105 transition-transform">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-title)]">
                          2. Informazioni istituto
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate font-normal">
                        Denominazione scuola, codice meccanografico e plesso
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)] max-w-[120px] truncate">
                      {form.schoolName ? form.schoolName : 'Da configurare'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 3. Modelli PEI */}
                <button
                  type="button"
                  id="settings-card-models"
                  onClick={() => setCurrentView('models')}
                  className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--card-sub-bg)] hover:bg-[var(--surface)] hover:border-amber-800/60 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-800/80 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 group-hover:scale-105 transition-transform">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-title)]">
                          3. Modelli PEI
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate font-normal">
                        Catalogo ministeriale A1-A4, modelli territoriali e custom
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)]">
                      {currentResolvedDefault.schoolOrder} Predefinito
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 4. Aspetto e Temi */}
                <button
                  type="button"
                  id="settings-card-appearance"
                  onClick={() => setCurrentView('appearance')}
                  className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--card-sub-bg)] hover:bg-[var(--surface)] hover:border-amber-800/60 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-800/80 flex items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 group-hover:scale-105 transition-transform">
                      <Palette className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-title)]">
                          4. Aspetto e Temi
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate font-normal">
                        4 combinazioni cromatiche ad alto contrasto
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)]">
                      {THEMES_CATALOG.find((t) => t.id === form.theme)?.name || 'Verde Prato'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>

                {/* 5. Privacy e Note (5ª card a tutta larghezza) */}
                <button
                  type="button"
                  id="settings-card-privacy"
                  onClick={() => setCurrentView('privacy')}
                  className="w-full text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--card-sub-bg)] hover:bg-[var(--surface)] hover:border-amber-800/60 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-800/80 flex items-center justify-between gap-3 sm:col-span-2 shadow-2xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-lg bg-[var(--badge-bg)] border border-[var(--border)] text-emerald-700 dark:text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-title)]">
                          5. Privacy e Note
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate font-normal">
                        Trattamento local-first, separazione dati e responsabilità normativa
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)]">
                      Local-First & Sicurezza
                    </span>
                    <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--text)] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* LIVELLO 2 - PAGINA 1: INFORMAZIONI DOCENTE          */}
          {/* ==================================================== */}
          {currentView === 'teacher' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Pulsante Torna Indietro */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Torna alle Impostazioni</span>
                </button>

                <span
                  className={`text-[11px] px-2.5 py-0.5 rounded-md font-semibold border ${
                    isTeacherComplete
                      ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/60'
                      : 'bg-[var(--badge-bg)] text-[var(--text-secondary)] border-[var(--border)]'
                  }`}
                >
                  Stato: {isTeacherComplete ? 'Profilo Completo' : 'Da completare'}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-title)] flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                  <span>Dati Anagrafici e Ruolo del Docente</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Queste informazioni vengono utilizzate per personalizzare le intestazioni, i verbali GLO e le firme dei PEI compilati.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-[var(--card-sub-bg)] rounded-xl border border-[var(--border)]">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Nome docente
                  </label>
                  <input
                    type="text"
                    value={form.teacherName}
                    onChange={(e) => handleChange('teacherName', e.target.value)}
                    placeholder="Es. Maria"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Cognome docente
                  </label>
                  <input
                    type="text"
                    value={form.teacherSurname}
                    onChange={(e) => handleChange('teacherSurname', e.target.value)}
                    placeholder="Es. Rossi"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Ruolo / Funzione
                  </label>
                  <input
                    type="text"
                    value={form.teacherRole}
                    onChange={(e) => handleChange('teacherRole', e.target.value)}
                    placeholder="Es. Docente di Sostegno, Coordinatore di Classe, Docente Curricolare"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>
              </div>

              {/* Informazione Future Frozen Readiness */}
              <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 mt-0.5" />
                <div className="space-y-1 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  <span className="font-semibold text-[var(--text-title)] block">
                    Persistenza e Riservatezza Locale
                  </span>
                  <p>
                    I dati anagrafici del docente sono custoditi esclusivamente sul tuo dispositivo (Local Storage).
                    In futuro, Nome e Cognome costituiranno i parametri di intestazione obbligatori per garantire la tracciabilità delle revisioni.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* LIVELLO 2 - PAGINA 2: INFORMAZIONI ISTITUTO         */}
          {/* ==================================================== */}
          {currentView === 'school' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Pulsante Torna Indietro */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Torna alle Impostazioni</span>
                </button>

                <span className="text-[11px] px-2.5 py-0.5 rounded-md font-semibold bg-[var(--badge-bg)] text-[var(--text-secondary)] border border-[var(--border)]">
                  Istituto Principale
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-title)] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                  <span>Istituzione Scolastica e Sede</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Inserisci i riferimenti ufficiali dell&apos;Istituto da apporre sui frontespizi e nei riquadri istituzionali dei PEI.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 bg-[var(--card-sub-bg)] rounded-xl border border-[var(--border)]">
                <div className="sm:col-span-2">
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Denominazione istituzione scolastica *
                  </label>
                  <input
                    type="text"
                    value={form.schoolName}
                    onChange={(e) => handleChange('schoolName', e.target.value)}
                    placeholder="Es. I.C. Statale Alessandro Manzoni"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Codice meccanografico
                  </label>
                  <input
                    type="text"
                    value={form.schoolCode}
                    onChange={(e) => handleChange('schoolCode', e.target.value)}
                    placeholder="Es. MIIC8XX00Q"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Plesso / Sede
                  </label>
                  <input
                    type="text"
                    value={form.building}
                    onChange={(e) => handleChange('building', e.target.value)}
                    placeholder="Es. Plesso Centrale / Via Roma"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Indirizzo sede
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="Es. Via Roma, 12"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                    Città / Comune
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="Es. Milano"
                    className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                      CAP
                    </label>
                    <input
                      type="text"
                      value={form.cap}
                      onChange={(e) => handleChange('cap', e.target.value)}
                      placeholder="Es. 20100"
                      className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] mb-1 font-semibold text-xs">
                      Provincia
                    </label>
                    <input
                      type="text"
                      value={form.province}
                      onChange={(e) => handleChange('province', e.target.value)}
                      placeholder="Es. MI"
                      maxLength={4}
                      className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-amber-800 text-xs font-medium uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Predisposizione Multi-Istituto */}
              <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 mt-0.5" />
                <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  <span className="font-semibold text-[var(--text-title)] block">
                    Supporto Istituti e Plessi Multipli
                  </span>
                  <p>
                    I dati dell&apos;istituto sono memorizzati localmente e non costituiscono blocco operativo. La struttura è predisposta per supportare in futuro l&apos;associazione di più istituti o plessi al medesimo profilo docente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* LIVELLO 2 - PAGINA 3: MODELLI PEI                   */}
          {/* ==================================================== */}
          {currentView === 'models' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Pulsante Torna Indietro */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Torna alle Impostazioni</span>
                </button>

                <span className="text-[11px] px-2.5 py-0.5 rounded-md font-semibold bg-[var(--badge-bg)] text-[var(--text-secondary)] border border-[var(--border)]">
                  {allModels.length} Modelli nel Catalogo
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-title)] flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                  <span>Catalogo Modelli PEI e Modello Predefinito</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Seleziona il modello predefinito per la creazione dei nuovi PEI e gestisci i modelli territoriali, di istituto o importati.
                </p>
              </div>

              {/* Selettore Modello Predefinito */}
              <div className="p-4 bg-[var(--card-sub-bg)] rounded-xl border border-[var(--border)] space-y-2.5">
                <label className="font-bold text-[var(--text-title)] block text-xs">
                  Modello PEI predefinito per nuovi documenti
                </label>
                <select
                  value={form.defaultModelId || `MINISTERIAL_${form.defaultSchoolOrder}`}
                  onChange={(e) => handleSelectDefaultModel(e.target.value)}
                  className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-amber-800 font-bold text-xs"
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
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] font-medium pt-1">
                  <span>
                    Attivo per default:{' '}
                    <strong className="text-[var(--text)]">{currentResolvedDefault.name}</strong> ({currentResolvedDefault.schoolOrder})
                  </span>
                  <span className="italic">Non altera retroattivamente i PEI già compilati</span>
                </div>
              </div>

              {/* Gestore Modelli Personalizzati (Territoriali / Istituto) */}
              <div>
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
          )}

          {/* ==================================================== */}
          {/* LIVELLO 2 - PAGINA 4: ASPETTO E TEMI                */}
          {/* ==================================================== */}
          {currentView === 'appearance' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Pulsante Torna Indietro */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Torna alle Impostazioni</span>
                </button>

                <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                  Tema attivo applicato in tempo reale
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-title)] flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                  <span>Aspetto e Temi Visivi</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Seleziona la combinazione cromatica dell&apos;applicazione. Tutte le varianti rispettano la gerarchia visiva istituzionale, garantendo elevato contrasto, distinzione tonale dei pannelli e foglio A4 documentale sempre bianco.
                </p>
              </div>

              {/* GRIGLIA 4 CARD PREVIEW (2x2 Desktop / Tablet, 1x4 Mobile) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {THEMES_CATALOG.map((theme) => {
                  const isSelected = form.theme === theme.id;
                  const p = theme.palette;

                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleChange('theme', theme.id)}
                      className={`text-left rounded-xl p-3.5 border-2 transition-all cursor-pointer relative flex flex-col justify-between group focus:outline-none focus:ring-2 focus:ring-amber-800/80 ${
                        isSelected
                          ? 'border-amber-800 ring-2 ring-amber-800/50 shadow-md bg-[var(--surface)]'
                          : 'border-[var(--border)] hover:border-[var(--border-subtle)] hover:shadow-xs bg-[var(--card-sub-bg)]'
                      }`}
                    >
                      {/* Intestazione Card Tema */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[var(--text-title)]">
                              {theme.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)]">
                              {theme.category}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)] font-medium mt-0.5">
                            {theme.tagline}
                          </div>
                        </div>

                        {/* Indicatore Stato Tema Attivo */}
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-800 text-white shadow-2xs shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>TEMA ATTIVO</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-tertiary)] group-hover:text-[var(--text)] font-semibold shrink-0">
                            Clicca per applicare
                          </span>
                        )}
                      </div>

                      {/* MINI PREVIEW REALISTICA DELL'INTERFACCIA */}
                      <div
                        className="rounded-md border p-2 text-[10px] transition-transform select-none mb-2.5 pointer-events-none"
                        style={{
                          backgroundColor: p.appBg,
                          borderColor: p.border,
                          color: p.primaryText,
                        }}
                      >
                        {/* Mini Topbar */}
                        <div
                          className="rounded px-2 py-1 flex items-center justify-between mb-1.5 border"
                          style={{
                            backgroundColor: p.chromeBg,
                            borderColor: p.border,
                            color: p.titleText,
                          }}
                        >
                          <div className="flex items-center gap-1.5 font-bold">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: p.accent }}
                            />
                            <span style={{ color: p.titleText }}>PEI FACILE</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-80 text-[9px]">
                            <span>Home</span>
                            <span>•</span>
                            <span>Compilazione</span>
                          </div>
                        </div>

                        {/* Mini Sub-Nav Tab */}
                        <div
                          className="rounded px-2 py-0.5 flex items-center gap-1 mb-1.5 border"
                          style={{
                            backgroundColor: p.surface,
                            borderColor: p.border,
                          }}
                        >
                          <span
                            className="px-1.5 py-0.2 rounded font-bold text-[8px]"
                            style={{
                              backgroundColor: p.btnBg,
                              color: p.btnText,
                            }}
                          >
                            Home
                          </span>
                          <span
                            className="px-1.5 py-0.2 rounded text-[8px]"
                            style={{ color: p.secondaryText }}
                          >
                            Compilazione
                          </span>
                          <span
                            className="px-1.5 py-0.2 rounded text-[8px]"
                            style={{ color: p.secondaryText }}
                          >
                            Stampa
                          </span>
                        </div>

                        {/* Mini Contenitore Principale */}
                        <div
                          className="rounded p-2 border"
                          style={{
                            backgroundColor: p.cardBg,
                            borderColor: p.border,
                          }}
                        >
                          <div
                            className="font-bold text-[10px] mb-0.5"
                            style={{ color: p.titleText }}
                          >
                            Cosa vuoi fare?
                          </div>
                          <div
                            className="text-[8.5px] mb-1.5"
                            style={{ color: p.secondaryText }}
                          >
                            Strumenti di compilazione e acquisizione PEI
                          </div>

                          {/* Mini Card Interna */}
                          <div
                            className="rounded p-1.5 border flex items-center justify-between"
                            style={{
                              backgroundColor: p.cardSubBg,
                              borderColor: p.border,
                            }}
                          >
                            <div>
                              <div
                                className="font-bold text-[9px]"
                                style={{ color: p.titleText }}
                              >
                                Nuovo PEI
                              </div>
                              <div
                                className="text-[8px]"
                                style={{ color: p.secondaryText }}
                              >
                                Modello Ministeriale
                              </div>
                            </div>
                            <span
                              className="px-1.5 py-0.5 rounded text-[8px] font-bold"
                              style={{
                                backgroundColor: p.btnBg,
                                color: p.btnText,
                              }}
                            >
                              Apri
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Descrizione Tecnica */}
                      <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-normal">
                        {theme.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* LIVELLO 2 - PAGINA 5: PRIVACY E NOTE                */}
          {/* ==================================================== */}
          {currentView === 'privacy' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Pulsante Torna Indietro */}
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <button
                  type="button"
                  onClick={() => setCurrentView('home')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Torna alle Impostazioni</span>
                </button>

                <span className="text-[11px] px-2.5 py-0.5 rounded-md font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-700/60">
                  Sicurezza Local-First
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--text-title)] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <span>Privacy, Riservatezza e Note Normative</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Principi di trattamento dei dati e ripartizione delle responsabilità nell&apos;adozione dei modelli documentali.
                </p>
              </div>

              <div className="space-y-3.5">
                <div className="p-4 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded-xl space-y-1.5 shadow-2xs">
                  <div className="font-bold text-[var(--text-title)] flex items-center gap-2 text-xs">
                    <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Separazione Dati e Architettura Local-First</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
                    Tutti i dati inseriti (anagrafiche, istituti, PEI compilati e modelli personalizzati) vengono trattati e memorizzati esclusivamente all&apos;interno della memoria locale del browser dell&apos;utente (IndexedDB / LocalStorage). Nessun dato personale o identificativo di alunni e docenti viene trasmesso a server remoti o banche dati esterne.
                  </p>
                </div>

                <div className="p-4 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded-xl space-y-1.5 shadow-2xs">
                  <div className="font-bold text-[var(--text-title)] flex items-center gap-2 text-xs">
                    <Scale className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                    <span>Responsabilità nella scelta del modello</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
                    PEI FACILE non determina quale modello PEI debba essere utilizzato.
                    La scelta e la verifica dell&apos;idoneità del modello rispetto alle disposizioni
                    dell&apos;istituzione scolastica o dell&apos;ente competente restano responsabilità
                    esclusiva dell&apos;utilizzatore e degli organi collegiali preposti (GLO / Collegio Docenti).
                    PEI FACILE garantisce il trattamento tecnico del modello importato,
                    ma non ne certifica la validità normativa o amministrativa.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER MODALE */}
        <div className="bg-[var(--chrome-bg)] px-4 py-3 border-t border-[var(--border)] flex items-center justify-between shrink-0">
          <div>
            {currentView !== 'home' && (
              <button
                type="button"
                onClick={() => setCurrentView('home')}
                className="px-3.5 py-1.5 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded-lg border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-amber-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Torna alle Impostazioni</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded-lg border border-[var(--border)] font-semibold cursor-pointer transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
            >
              Chiudi
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold cursor-pointer shadow-xs transition-colors text-xs focus:outline-none focus:ring-2 focus:ring-amber-800"
            >
              Salva e Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

