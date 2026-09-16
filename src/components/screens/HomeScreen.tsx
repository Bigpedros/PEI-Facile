import React from 'react';
import type { SchoolOrder } from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import {
  FilePlus,
  FolderOpen,
  Upload,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Clock,
  ArrowRight,
  HelpCircle,
  FileCheck,
} from 'lucide-react';

interface HomeScreenProps {
  onNewPei: () => void;
  onOpenSamplePei: () => void;
  onOpenPdfIntake: () => void;
  onSelectRecentDocument: (order: SchoolOrder) => void;
  onOpenHelpModal: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNewPei,
  onOpenSamplePei,
  onOpenPdfIntake,
  onSelectRecentDocument,
  onOpenHelpModal,
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

          {/* 4 Azioni Principali */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  Crea un nuovo documento vuoto selezionando l&apos;ordine di scuola (Infanzia A1, Primaria A2, Secondaria I Grado A3 o Secondaria II Grado A4).
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-amber-800 group-hover:translate-x-1 transition-transform">
                <span>Inizia nuovo modello</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 2. Carica PEI di Esempio */}
            <div
              onClick={onOpenSamplePei}
              className="p-4 rounded-lg border-2 border-stone-200 hover:border-amber-800 bg-stone-50/50 hover:bg-amber-50/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-900">
                  Carica PEI di Esempio (Demo)
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Esplora un documento precompilato con dati fittizi realistici nelle 12 sezioni, testando la navigazione e i 10 componenti dell&apos;editor.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-emerald-800 group-hover:translate-x-1 transition-transform">
                <span>Esplora subito la demo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 3. Importa PDF (OCR R3 Intake) */}
            <div
              onClick={onOpenPdfIntake}
              className="p-4 rounded-lg border-2 border-stone-200 hover:border-amber-800 bg-stone-50/50 hover:bg-amber-50/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-blue-100 text-blue-900 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-900">
                  Importa PDF con R3 Core
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Carica un file PDF scannerizzato o compilato: il motore integrato estrae testo ed elementi con Tesseract OCR in lingua italiana.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-blue-800 group-hover:translate-x-1 transition-transform">
                <span>Apri modulo di importazione</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 4. Apri Documento Esistente */}
            <div
              onClick={onOpenSamplePei}
              className="p-4 rounded-lg border-2 border-stone-200 hover:border-amber-800 bg-stone-50/50 hover:bg-amber-50/30 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-md bg-stone-200 text-stone-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm group-hover:text-amber-900">
                  Apri PEI Recente
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Riapri l&apos;ultimo piano educativo salvato in memoria locale o continua la bozza di lavoro dell&apos;anno scolastico corrente.
                </p>
              </div>
              <div className="pt-3 flex items-center gap-1 text-xs font-semibold text-stone-800 group-hover:translate-x-1 transition-transform">
                <span>Apri ultimo salvataggio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Elenco Documenti Recenti */}
        <div className="bg-white border border-stone-300/80 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-stone-200 pb-2">
            <span className="font-bold text-stone-800 flex items-center gap-1.5 uppercase tracking-wider">
              <Clock className="w-4 h-4 text-amber-800" />
              Documenti Recenti di Esempio
            </span>
            <span className="text-stone-400">Archivio dimostrativo locale</span>
          </div>

          <div className="divide-y divide-stone-100 text-xs">
            {(['A2', 'A3', 'A1', 'A4'] as SchoolOrder[]).map((order) => {
              const meta = SCHOOL_ORDERS_METADATA[order];
              return (
                <div
                  key={order}
                  onClick={() => onSelectRecentDocument(order)}
                  className="py-2.5 px-2 flex items-center justify-between hover:bg-amber-50/40 rounded cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-100 text-amber-950 border border-amber-200">
                      {order}
                    </span>
                    <div>
                      <div className="font-semibold text-stone-900">
                        {meta.officialAllegato} — {meta.name}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        Alunno fittizio: ALUNNO_{order}_DEMO • Modello {meta.pageCount} pagine
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-stone-500 hidden sm:inline">
                      Ultima modifica oggi
                    </span>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-xs font-medium bg-stone-100 hover:bg-amber-100 text-stone-800 hover:text-amber-900 rounded border border-stone-200 transition-colors"
                    >
                      Apri
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Avviso Privacy e Footer Informativo */}
        <div className="text-center text-xs text-stone-500 space-y-1">
          <p>
            PEI FACILE v0.2.1 • Riservatezza garantita: nessun dato reale inviato a server esterni.
          </p>
          <p className="text-[11px] text-stone-400">
            Tutti i modelli PDF ministeriali integrati sono tratti dal portale ufficiale istruzione.it.
          </p>
        </div>
      </div>
    </div>
  );
};
