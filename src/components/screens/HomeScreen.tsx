import React from 'react';
import type { SchoolOrder, PeiDocument } from '../../types/pei';
import {
  FilePlus,
  FolderOpen,
  Upload,
  ShieldCheck,
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
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNewPei,
  onOpenPdfIntake,
  onOpenSavedPei,
  savedDocument,
  onSelectSavedDocument,
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 overflow-y-auto">
      <div className="w-full max-w-4xl space-y-8">
        {/* Titolo e Reputazione Istituzionale */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100/70 border border-amber-300 rounded-full text-xs font-semibold text-amber-950 mb-2">
            <ShieldCheck className="w-4 h-4 text-amber-800" />
            <span>Conforme ai Modelli Ministeriali Ufficiali — D.I. 182/2020 e D.I. 153/2023</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black font-serif tracking-tight text-stone-900">
            PEI <span className="text-amber-800">FACILE</span>
          </h1>
          <p className="text-sm md:text-base text-stone-600 max-w-2xl mx-auto leading-relaxed">
            Redazione, verifica e stampa del Piano Educativo Individualizzato su griglia
            vettoriale ministeriale certificata (Modelli A1, A2, A3, A4).
          </p>
        </div>

        {/* Card Centrale: Cosa vuoi fare? */}
        <div className="bg-white border border-stone-300/80 rounded-lg p-6 md:p-8 shadow-sm space-y-6">
          <div className="border-b border-stone-200 pb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold font-serif text-stone-900">
              Cosa vuoi fare?
            </h2>
            <span className="text-xs text-stone-500">
              Seleziona un&apos;azione per iniziare la sessione
            </span>
          </div>

          {/* 3 Azioni Principali (NUOVO PEI, APRI PEI ESISTENTE, IMPORTA PDF) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Nuovo PEI */}
            <div
              onClick={onNewPei}
              className="p-4 rounded-lg border-2 border-stone-200 hover:border-amber-800 bg-stone-50/50 hover:bg-amber-50/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-amber-100 text-amber-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FilePlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-900">
                  Nuovo PEI
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Crea un nuovo documento pulito selezionando l&apos;ordine di scuola configurato (Infanzia A1, Primaria A2, Secondaria I Grado A3 o II Grado A4).
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-amber-800 group-hover:translate-x-1 transition-transform">
                <span>Inizia nuovo modello</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 2. Apri PEI Esistente */}
            <div
              onClick={onOpenSavedPei}
              className="p-4 rounded-lg border-2 border-stone-200 hover:border-amber-800 bg-stone-50/50 hover:bg-amber-50/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-stone-200 text-stone-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-900">
                  Apri PEI Esistente
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Riapri l&apos;ultimo piano educativo salvato in memoria locale o carica un documento di lavoro esistente.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-stone-800 group-hover:translate-x-1 transition-transform">
                <span>Apri file salvato</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 3. Importa PDF */}
            <div
              onClick={onOpenPdfIntake}
              className="p-4 rounded-lg border-2 border-stone-200 hover:border-amber-800 bg-stone-50/50 hover:bg-amber-50/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-blue-100 text-blue-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-900">
                  Importa PDF
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Carica un file PDF scannerizzato o compilato: il motore OCR integrato estrae testo ed elementi per popolare le sezioni.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-blue-800 group-hover:translate-x-1 transition-transform">
                <span>Apri modulo di importazione</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Elenco Documenti Recenti (Reale o Nessun PEI recente) */}
        <div className="bg-white border border-stone-300/80 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-800 flex items-center gap-1.5 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-amber-800" />
              Documenti Recenti
            </span>
            <span className="text-stone-400">Memoria locale protetta</span>
          </div>

          {savedDocument ? (
            <div className="divide-y divide-stone-100 text-xs">
              <div
                onClick={onSelectSavedDocument}
                className="py-2.5 px-2 flex items-center justify-between hover:bg-amber-50/40 rounded cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 text-amber-950 border border-amber-300">
                    {savedDocument.schoolOrder}
                  </span>
                  <div>
                    <div className="font-semibold text-stone-900">
                      {savedDocument.schoolName} — Alunno: {savedDocument.studentCode}
                    </div>
                    <div className="text-[11px] text-stone-500">
                      Classe {savedDocument.classOrSection} • Ultima modifica: {new Date(savedDocument.lastModifiedDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs font-medium bg-amber-800 hover:bg-amber-900 text-white rounded transition-colors"
                  >
                    Continua Modifica
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-stone-500 text-xs italic">
              Nessun PEI recente
            </div>
          )}
        </div>

        {/* Avviso Privacy e Footer Informativo */}
        <div className="text-center text-xs text-stone-500 space-y-1">
          <p>
            PEI FACILE • Riservatezza garantita: nessun dato reale inviato a server esterni.
          </p>
          <p className="text-[11px] text-stone-400">
            Modelli ministeriali conformi al D.I. 182/2020 e D.I. 153/2023.
          </p>
        </div>
      </div>
    </div>
  );
};

