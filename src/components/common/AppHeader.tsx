import React, { useState } from 'react';
import type { ScreenId, SchoolOrder, ThemeType, PeiModelDefinition } from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import {
  FileText,
  Save,
  Printer,
  Settings,
  HelpCircle,
  Eye,
  FilePlus,
  FolderOpen,
  Upload,
  ChevronDown,
  Palette,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Compass,
} from 'lucide-react';

interface AppHeaderProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  schoolOrder: SchoolOrder;
  onChangeSchoolOrder: (order: SchoolOrder) => void;
  currentTheme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  zoomScale: number;
  onChangeZoom: (scale: number) => void;
  activeSectionTitle?: string;
  hasOpenDocument: boolean;
  onNewPei: () => void;
  onOpenSamplePei: () => void;
  onOpenPdfIntake: () => void;
  onSaveDemo: () => void;
  onClosePei: () => void;
  onOpenSettingsModal: () => void;
  onOpenHelpModal: () => void;
  onOpenShareModal: () => void;
  onOpenCalibration?: () => void;
  currentModelDef?: PeiModelDefinition | null;
  customModels?: PeiModelDefinition[];
  onOpenOtherModelCatalog?: () => void;
  onSelectCustomModel?: (model: PeiModelDefinition) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentScreen,
  onNavigate,
  schoolOrder,
  onChangeSchoolOrder,
  currentTheme,
  onChangeTheme,
  zoomScale,
  onChangeZoom,
  activeSectionTitle,
  hasOpenDocument,
  onNewPei,
  onOpenSamplePei,
  onOpenPdfIntake,
  onSaveDemo,
  onClosePei,
  onOpenSettingsModal,
  onOpenHelpModal,
  onOpenCalibration,
  currentModelDef,
  customModels = [],
  onOpenOtherModelCatalog,
  onSelectCustomModel,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const toggleMenu = (menuName: string) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  const closeMenus = () => {
    setOpenMenu(null);
  };

  const isHome = currentScreen === 'SCR-001';
  const isCompilazione = currentScreen === 'SCR-002';
  const isAnteprima = currentScreen === 'SCR-003';

  return (
    <header className="shrink-0 relative z-30 bg-[var(--chrome-bg)] border-b border-[var(--border)] text-[var(--text)] select-none shadow-xs">
      {/* 1. Barra Menu Primaria */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] text-xs">
        <div className="flex items-center gap-4">
          {/* Logo e Nome Progetto */}
          <div
            onClick={() => onNavigate('SCR-001')}
            className="flex items-center gap-2 cursor-pointer font-bold tracking-tight text-amber-900 pr-2 border-r border-[var(--border)]"
          >
            <img
              src="/icons/payfacile-icon-32x32.png"
              alt="PEI FACILE"
              className="w-5 h-5 rounded-xs"
              onError={(e) => {
                // Fallback to text icon if not loaded yet
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <span className="text-sm font-black tracking-wider text-[var(--text)]">
              PEI <span className="text-[var(--accent)]">FACILE</span>
            </span>
          </div>

          {/* Menù V1 standard */}
          <nav className="flex items-center gap-1">
            {/* FILE */}
            <div className="relative">
              <button
                type="button"
                onClick={() => toggleMenu('file')}
                className={`px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium cursor-pointer transition-colors ${
                  openMenu === 'file' ? 'bg-[var(--hover-bg)] font-semibold' : ''
                }`}
              >
                File
              </button>
              {openMenu === 'file' && (
                <div
                  className="absolute left-0 top-full mt-1 w-52 bg-[var(--chrome-bg)] border border-[var(--border)] rounded shadow-lg py-1 z-50 text-[var(--text)] text-xs"
                  onMouseLeave={closeMenus}
                >
                  <button
                    onClick={() => {
                      onNewPei();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Nuovo PEI...</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenSamplePei();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Carica PEI Demo</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenPdfIntake();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Acquisisci PEI…</span>
                  </button>
                  <div className="border-t border-[var(--border)] my-1" />
                  <button
                    disabled={!hasOpenDocument}
                    onClick={() => {
                      onSaveDemo();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2 disabled:text-[var(--text-disabled)] disabled:pointer-events-none"
                  >
                    <Save className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Salva modifiche</span>
                  </button>
                  <div className="border-t border-[var(--border)] my-1" />
                  <button
                    disabled={!hasOpenDocument}
                    onClick={() => {
                      onClosePei();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-700 dark:text-rose-400 flex items-center gap-2 disabled:text-[var(--text-disabled)] disabled:pointer-events-none"
                  >
                    <span>Chiudi PEI</span>
                  </button>
                </div>
              )}
            </div>

            {/* INSERISCI (disabilitato se nessun PEI aperto) */}
            <div className="relative">
              <button
                type="button"
                disabled={!hasOpenDocument || isHome}
                onClick={() => toggleMenu('inserisci')}
                className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium disabled:text-[var(--text-disabled)] disabled:pointer-events-none transition-colors"
              >
                Inserisci
              </button>
              {openMenu === 'inserisci' && (
                <div
                  className="absolute left-0 top-full mt-1 w-48 bg-[var(--chrome-bg)] border border-[var(--border)] rounded shadow-lg py-1 z-50 text-[var(--text)] text-xs"
                  onMouseLeave={closeMenus}
                >
                  <div className="px-3 py-1 text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">
                    Strumenti di testo
                  </div>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)]"
                  >
                    Testo dalla libreria
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)]"
                  >
                    Traccia guidata
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)]"
                  >
                    Data corrente
                  </button>
                </div>
              )}
            </div>

            {/* REVISIONE (disabilitato in Home) */}
            <div className="relative">
              <button
                type="button"
                disabled={!hasOpenDocument || isHome}
                onClick={() => toggleMenu('revisione')}
                className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium disabled:text-[var(--text-disabled)] disabled:pointer-events-none transition-colors"
              >
                Revisione
              </button>
              {openMenu === 'revisione' && (
                <div
                  className="absolute left-0 top-full mt-1 w-52 bg-[var(--chrome-bg)] border border-[var(--border)] rounded shadow-lg py-1 z-50 text-[var(--text)] text-xs"
                  onMouseLeave={closeMenus}
                >
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Controlla sezione attiva</span>
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)]"
                  >
                    Riepilogo completezza campi
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)]"
                  >
                    Verifica finale per GLO
                  </button>
                  <div className="border-t border-[var(--border)] my-1" />
                  <button
                    onClick={() => {
                      onOpenCalibration?.();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300"
                  >
                    <Compass className="w-3.5 h-3.5 text-amber-600" />
                    <span>Calibrazione Template (L1/L2)...</span>
                  </button>
                </div>
              )}
            </div>

            {/* STAMPA */}
            <div className="relative">
              <button
                type="button"
                disabled={!hasOpenDocument}
                onClick={() => toggleMenu('stampa')}
                className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium disabled:text-[var(--text-disabled)] disabled:pointer-events-none transition-colors"
              >
                Stampa
              </button>
              {openMenu === 'stampa' && (
                <div
                  className="absolute left-0 top-full mt-1 w-52 bg-[var(--chrome-bg)] border border-[var(--border)] rounded shadow-lg py-1 z-50 text-[var(--text)] text-xs"
                  onMouseLeave={closeMenus}
                >
                  <button
                    onClick={() => {
                      onNavigate('SCR-003');
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2 font-medium"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-800" />
                    <span>Anteprima di stampa (SCR-003)</span>
                  </button>
                  <button
                    onClick={() => {
                      window.print();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2"
                  >
                    <Printer className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Stampa documento</span>
                  </button>
                  <button
                    onClick={() => {
                      alert('Esportazione PDF con layout ministeriale ufficiale.');
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--hover-bg)] flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    <span>Salva come PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* IMPOSTAZIONI */}
            <button
              type="button"
              onClick={onOpenSettingsModal}
              className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium transition-colors cursor-pointer"
            >
              Impostazioni
            </button>

            {/* AIUTO */}
            <button
              type="button"
              onClick={onOpenHelpModal}
              className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium transition-colors cursor-pointer"
            >
              Aiuto
            </button>
          </nav>
        </div>

        {/* Destra: Spazio libero pulito */}
        <div className="flex items-center gap-3">
        </div>
      </div>

      {/* 2. Barra di Stato & Controlli Rapidi */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface)] text-xs">
        <div className="flex items-center gap-3">
          {/* Pulsanti Navigazione Schermate Principali */}
          <div className="flex items-center bg-[var(--input-bg)] border border-[var(--border)] rounded p-0.5">
            <button
              type="button"
              onClick={() => onNavigate('SCR-001')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                isHome
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              Home
            </button>
            <button
              type="button"
              disabled={!hasOpenDocument}
              onClick={() => onNavigate('SCR-002')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer disabled:text-[var(--text-disabled)] disabled:pointer-events-none ${
                isCompilazione
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              Compilazione
            </button>
            <button
              type="button"
              disabled={!hasOpenDocument}
              onClick={() => onNavigate('SCR-003')}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer disabled:text-[var(--text-disabled)] disabled:pointer-events-none ${
                isAnteprima
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              Anteprima di Stampa
            </button>
          </div>

          {/* Selettore Modello Globale: A1 - A4, Modello Custom se attivo, Altro modello… */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border)]">
            <span className="text-[var(--text-secondary)] text-[11px] font-semibold">Modello:</span>
            <select
              id="global-model-selector"
              value={
                currentModelDef && !currentModelDef.isMinisterial && currentModelDef.originType !== 'MINISTERIAL'
                  ? currentModelDef.id
                  : schoolOrder
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__ALTRO_MODELLO__') {
                  if (onOpenOtherModelCatalog) {
                    onOpenOtherModelCatalog();
                  }
                  return;
                }
                if (val === 'A1' || val === 'A2' || val === 'A3' || val === 'A4') {
                  onChangeSchoolOrder(val as SchoolOrder);
                  return;
                }
                const foundCustom = customModels.find((m) => m.id === val);
                if (foundCustom && onSelectCustomModel) {
                  onSelectCustomModel(foundCustom);
                }
              }}
              className="px-2 py-1 text-xs font-semibold bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 cursor-pointer max-w-[280px] truncate"
              title="Seleziona modello PEI"
            >
              <option value="A1">A1 — Infanzia</option>
              <option value="A2">A2 — Primaria</option>
              <option value="A3">A3 — Secondaria I Grado</option>
              <option value="A4">A4 — Secondaria II Grado</option>
              {currentModelDef && !currentModelDef.isMinisterial && currentModelDef.originType !== 'MINISTERIAL' && (
                <option value={currentModelDef.id}>
                  {currentModelDef.name}
                </option>
              )}
              <option value="__ALTRO_MODELLO__">Altro modello…</option>
            </select>
          </div>

          {/* Indicatore Sezione Attiva (in compilazione) */}
          {isCompilazione && activeSectionTitle && (
            <div className="pl-2 border-l border-[var(--border)] flex items-center gap-1.5 font-medium">
              <span className="text-[var(--text-tertiary)]">Sezione:</span>
              <span className="text-[var(--text)] font-semibold">{activeSectionTitle}</span>
            </div>
          )}
        </div>

        {/* Controlli Zoom e Azioni Rapide */}
        <div className="flex items-center gap-3">
          {/* Zoom Foglio A4 */}
          {(isCompilazione || isAnteprima) && (
            <div className="flex items-center gap-1 bg-[var(--input-bg)] border border-[var(--border)] rounded px-1.5 py-0.5">
              <button
                type="button"
                onClick={() => onChangeZoom(Math.max(0.75, zoomScale - 0.1))}
                className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)]"
                title="Riduci zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-bold px-1 min-w-[40px] text-center text-[var(--text)]">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => onChangeZoom(Math.min(1.5, zoomScale + 0.1))}
                className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)]"
                title="Aumenta zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Azione Salva Rapido */}
          {hasOpenDocument && (
            <button
              type="button"
              onClick={onSaveDemo}
              className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salva</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
