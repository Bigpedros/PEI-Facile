import React, { useState } from 'react';
import type { ScreenId, SchoolOrder, ThemeType } from '../../types/pei';
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
    <header className="bg-[var(--chrome-bg)] border-b border-[var(--border)] text-[var(--text)] select-none shadow-xs sticky top-0 z-30">
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
              PEI <span className="text-amber-800">FACILE</span>
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
                  className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded shadow-lg py-1 z-50 text-stone-800 text-xs"
                  onMouseLeave={closeMenus}
                >
                  <button
                    onClick={() => {
                      onNewPei();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2"
                  >
                    <FilePlus className="w-3.5 h-3.5 text-stone-500" />
                    <span>Nuovo PEI...</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenSamplePei();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-stone-500" />
                    <span>Carica PEI Demo</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenPdfIntake();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2"
                  >
                    <Upload className="w-3.5 h-3.5 text-stone-500" />
                    <span>Importa PDF (Intake R3)...</span>
                  </button>
                  <div className="border-t border-stone-200 my-1" />
                  <button
                    disabled={!hasOpenDocument}
                    onClick={() => {
                      onSaveDemo();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2 disabled:opacity-40"
                  >
                    <Save className="w-3.5 h-3.5 text-stone-500" />
                    <span>Salva modifiche (Demo)</span>
                  </button>
                  <div className="border-t border-stone-200 my-1" />
                  <button
                    disabled={!hasOpenDocument}
                    onClick={() => {
                      onClosePei();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 flex items-center gap-2 disabled:opacity-40"
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
                className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Inserisci
              </button>
              {openMenu === 'inserisci' && (
                <div
                  className="absolute left-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded shadow-lg py-1 z-50 text-stone-800 text-xs"
                  onMouseLeave={closeMenus}
                >
                  <div className="px-3 py-1 text-[10px] text-stone-400 uppercase font-semibold">
                    Strumenti di testo
                  </div>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50"
                  >
                    Testo dalla libreria
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50"
                  >
                    Traccia guidata
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50"
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
                className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Revisione
              </button>
              {openMenu === 'revisione' && (
                <div
                  className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded shadow-lg py-1 z-50 text-stone-800 text-xs"
                  onMouseLeave={closeMenus}
                >
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Controlla sezione attiva</span>
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50"
                  >
                    Riepilogo completezza campi
                  </button>
                  <button
                    onClick={closeMenus}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50"
                  >
                    Verifica finale per GLO
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
                className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Stampa
              </button>
              {openMenu === 'stampa' && (
                <div
                  className="absolute left-0 top-full mt-1 w-52 bg-white border border-stone-200 rounded shadow-lg py-1 z-50 text-stone-800 text-xs"
                  onMouseLeave={closeMenus}
                >
                  <button
                    onClick={() => {
                      onNavigate('SCR-003');
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2 font-medium"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-800" />
                    <span>Anteprima di stampa (SCR-003)</span>
                  </button>
                  <button
                    onClick={() => {
                      window.print();
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2"
                  >
                    <Printer className="w-3.5 h-3.5 text-stone-500" />
                    <span>Stampa documento</span>
                  </button>
                  <button
                    onClick={() => {
                      alert('Esportazione PDF con layout ministeriale certificato.');
                      closeMenus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-amber-50 flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-stone-500" />
                    <span>Salva come PDF</span>
                  </button>
                </div>
              )}
            </div>

            {/* IMPOSTAZIONI */}
            <button
              type="button"
              onClick={onOpenSettingsModal}
              className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium transition-colors"
            >
              Impostazioni
            </button>

            {/* AIUTO */}
            <button
              type="button"
              onClick={onOpenHelpModal}
              className="px-2.5 py-1 rounded hover:bg-[var(--hover-bg)] font-medium transition-colors"
            >
              Aiuto
            </button>
          </nav>
        </div>

        {/* Destra: Switcher Temi e Modalità Demo */}
        <div className="flex items-center gap-3">
          {/* Selettore Tema */}
          <div className="flex items-center gap-1 border border-[var(--border)] rounded p-0.5 bg-[var(--input-bg)]">
            <Palette className="w-3 h-3 text-stone-400 ml-1" />
            <button
              type="button"
              onClick={() => onChangeTheme('sabbia')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                currentTheme === 'sabbia' ? 'bg-[#F3EBD9] text-stone-900 shadow-2xs font-bold border border-amber-300' : 'text-stone-600 hover:text-stone-900'
              }`}
              title="Tema Chiaro - Sabbia (#F3EBD9)"
            >
              Sabbia
            </button>
            <button
              type="button"
              onClick={() => onChangeTheme('navy')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                currentTheme === 'navy' ? 'bg-[#C3CEDD] text-slate-900 shadow-2xs font-bold border border-slate-400' : 'text-stone-600 hover:text-stone-900'
              }`}
              title="Tema Default - Blu Navy 35% (#C3CEDD)"
            >
              Blu Navy
            </button>
            <button
              type="button"
              onClick={() => onChangeTheme('antracite')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                currentTheme === 'antracite' ? 'bg-[#222528] text-white shadow-2xs font-bold border border-stone-600' : 'text-stone-600 hover:text-stone-900'
              }`}
              title="Tema Scuro - Antracite (#222528)"
            >
              Antracite
            </button>
          </div>

          {/* Badge Indicatore Modalità Demo */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100/80 text-amber-950 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            <span>MODALITÀ DEMO</span>
          </div>
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
              className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
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
              className={`px-3 py-1 rounded text-xs font-semibold transition-all disabled:opacity-40 disabled:pointer-events-none ${
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
              className={`px-3 py-1 rounded text-xs font-semibold transition-all disabled:opacity-40 disabled:pointer-events-none ${
                isAnteprima
                  ? 'bg-amber-900 text-white shadow-xs'
                  : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
              }`}
            >
              Anteprima di Stampa
            </button>
          </div>

          {/* Selettore Modello A1 - A4 */}
          {hasOpenDocument && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--border)]">
              <span className="text-stone-500 text-[11px]">Modello:</span>
              <select
                value={schoolOrder}
                onChange={(e) => onChangeSchoolOrder(e.target.value as SchoolOrder)}
                className="px-2 py-1 text-xs font-semibold bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800"
              >
                <option value="A1">A1 — Infanzia</option>
                <option value="A2">A2 — Primaria</option>
                <option value="A3">A3 — Secondaria I Grado</option>
                <option value="A4">A4 — Secondaria II Grado</option>
              </select>
            </div>
          )}

          {/* Indicatore Sezione Attiva (in compilazione) */}
          {isCompilazione && activeSectionTitle && (
            <div className="text-stone-600 pl-2 border-l border-[var(--border)] flex items-center gap-1.5 font-medium">
              <span className="text-stone-400">Sezione:</span>
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
                className="p-1 hover:bg-stone-200/50 rounded text-stone-600"
                title="Riduci zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-medium px-1 min-w-[40px] text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => onChangeZoom(Math.min(1.5, zoomScale + 0.1))}
                className="p-1 hover:bg-stone-200/50 rounded text-stone-600"
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
              className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
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
