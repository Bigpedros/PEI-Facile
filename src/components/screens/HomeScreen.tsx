import React from 'react';
import type { SchoolOrder, PeiDocument } from '../../types/pei';
import type { CustomPeiModel } from '../modals/CustomModelManager';
import {
  FilePlus,
  FolderOpen,
  Upload,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface HomeScreenProps {
  onNewPei: () => void;
  onOpenPdfIntake: () => void;
  onOpenSavedPei: () => void;
  savedDocument: PeiDocument | null;
  onSelectSavedDocument: () => void;
  onOpenHelpModal: () => void;
  currentSchoolOrder?: SchoolOrder;
  currentDocument?: PeiDocument | null;
  customModels?: CustomPeiModel[];
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNewPei,
  onOpenPdfIntake,
  onOpenSavedPei,
  savedDocument,
  onSelectSavedDocument,
}) => {
  return (
    <div className="flex-1 overflow-y-auto w-full px-4 sm:px-6 md:px-10 lg:px-12 pt-4 pb-12 md:pt-6 md:pb-16">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Card Centrale: Cosa vuoi fare? */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-6 md:p-8 shadow-sm space-y-6">
          <div className="border-b border-[var(--border)] pb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold font-serif text-[var(--text-title)]">
              Cosa vuoi fare?
            </h2>
            <span className="text-xs text-[var(--text-secondary)] font-medium">
              Seleziona un&apos;azione per iniziare la sessione
            </span>
          </div>

          {/* 3 Azioni Principali (NUOVO PEI, APRI PEI ESISTENTE, IMPORTA PDF) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Nuovo PEI */}
            <div
              onClick={onNewPei}
              className="p-4 rounded-lg border-2 border-[var(--border)] hover:border-amber-800 bg-[var(--card-sub-bg)] hover:bg-[var(--hover-bg)] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/70 flex items-center justify-center group-hover:scale-105 transition-transform border border-amber-300">
                  <FilePlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[var(--text-title)] text-sm group-hover:text-amber-800 dark:group-hover:text-[var(--accent-paglierino)]">
                  Nuovo PEI
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
                  Crea un nuovo documento scegliendo dal catalogo dei modelli ministeriali ufficiali (A1-A4) o territoriali e di istituto adottati.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-[var(--accent-paglierino)] group-hover:translate-x-1 transition-transform">
                <span>Inizia nuovo modello</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 2. Apri PEI Esistente */}
            <div
              onClick={onOpenSavedPei}
              className="p-4 rounded-lg border-2 border-[var(--border)] hover:border-amber-800 bg-[var(--card-sub-bg)] hover:bg-[var(--hover-bg)] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-[var(--badge-bg)] text-[var(--badge-text)] flex items-center justify-center group-hover:scale-105 transition-transform border border-[var(--border)]">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[var(--text-title)] text-sm group-hover:text-amber-800 dark:group-hover:text-[var(--accent-paglierino)]">
                  Apri PEI Esistente
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
                  Riapri l&apos;ultimo piano educativo salvato in memoria locale o carica un documento di lavoro esistente.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-[var(--accent-paglierino)] group-hover:translate-x-1 transition-transform">
                <span>Apri file salvato</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 3. Importa PDF */}
            <div
              onClick={onOpenPdfIntake}
              className="p-4 rounded-lg border-2 border-[var(--border)] hover:border-amber-800 bg-[var(--card-sub-bg)] hover:bg-[var(--hover-bg)] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-700/70 flex items-center justify-center group-hover:scale-105 transition-transform border border-sky-300">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-[var(--text-title)] text-sm group-hover:text-amber-800 dark:group-hover:text-[var(--accent-paglierino)]">
                  Importa PDF
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-normal">
                  Carica un file PDF scannerizzato o compilato: il motore OCR integrato estrae testo ed elementi per popolare le sezioni.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-[var(--accent-paglierino)] group-hover:translate-x-1 transition-transform">
                <span>Apri modulo di importazione</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Elenco Documenti Recenti (Reale o Nessun PEI recente) */}
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-[var(--border)] pb-2">
            <span className="font-bold text-[var(--text-title)] flex items-center gap-1.5 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
              Documenti Recenti
            </span>
            <span className="text-[var(--text-secondary)] font-medium">Memoria locale protetta</span>
          </div>

          {savedDocument ? (
            <div className="divide-y divide-[var(--border)] text-xs">
              <div
                onClick={onSelectSavedDocument}
                className="py-2.5 px-2 flex items-center justify-between hover:bg-[var(--hover-bg)] rounded cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)]">
                    {savedDocument.schoolOrder}
                  </span>
                  <div>
                    <div className="font-semibold text-[var(--text)]">
                      {savedDocument.schoolName} — Alunno: {savedDocument.studentCode}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] font-medium">
                      Classe {savedDocument.classOrSection} • Ultima modifica: {new Date(savedDocument.lastModifiedDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white rounded transition-colors cursor-pointer shadow-xs"
                  >
                    Continua Modifica
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-[var(--text-secondary)] text-xs italic font-medium">
              Nessun PEI recente
            </div>
          )}
        </div>

        {/* Avviso Privacy e Footer Informativo */}
        <div className="text-center text-xs text-[var(--text-secondary)] space-y-1 pt-2">
          <p className="font-medium">
            PEI FACILE • Riservatezza garantita: nessun dato reale inviato a server esterni.
          </p>
          <p className="text-[11px] text-[var(--text-tertiary)] font-medium">
            Supporto integrato a modelli ministeriali (D.I. 182/2020 e D.I. 153/2023), accordi territoriali e modelli d&apos;istituto.
          </p>
        </div>
      </div>
    </div>
  );
};

