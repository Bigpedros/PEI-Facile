import React, { useState } from 'react';
import { X, BookOpen, Layers, CheckCircle2, ShieldCheck, HelpCircle } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<'intro' | 'components' | 'decree'>('intro');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 z-50 text-xs">
      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--border)] shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-bold text-[var(--text-title)] text-sm">
            <BookOpen className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
            <span>Guida Ufficiale e Normativa — PEI FACILE</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[var(--border)] bg-[var(--chrome-bg)] px-4 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTab('intro')}
            className={`pb-2 px-3 font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'intro'
                ? 'border-amber-800 text-[var(--text-title)] font-bold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Architettura & Navigazione
          </button>
          <button
            type="button"
            onClick={() => setTab('components')}
            className={`pb-2 px-3 font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'components'
                ? 'border-amber-800 text-[var(--text-title)] font-bold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            I 10 Componenti Editor (CMP-01..10)
          </button>
          <button
            type="button"
            onClick={() => setTab('decree')}
            className={`pb-2 px-3 font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === 'decree'
                ? 'border-amber-800 text-[var(--text-title)] font-bold'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            Quadro Normativo D.I. 182 / 153
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === 'intro' && (
            <div className="space-y-3">
              <h3 className="font-bold text-[var(--text-title)] text-sm">
                Architettura a 3 Livelli (L1, L2, L3)
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed font-medium">
                PEI FACILE adotta una rigorosa separazione visiva e logica:
              </p>
              <div className="space-y-2">
                <div className="p-2.5 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded">
                  <span className="font-bold text-[var(--text)]">L1 — Geometria Vettoriale Ministeriale:</span>{' '}
                  <span className="text-[var(--text-secondary)] font-medium">
                    Garantisce la conformità tipografica assoluta con gli Allegati ministeriali ufficiali (A1, A2, A3, A4), linee guida, testate e decreti.
                  </span>
                </div>
                <div className="p-2.5 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded">
                  <span className="font-bold text-[var(--text)]">L2 — Overlay Campi:</span>{' '}
                  <span className="text-[var(--text-secondary)] font-medium">
                    Campi interattivi specializzati con validazione e salvataggio locale dei dati.
                  </span>
                </div>
                <div className="p-2.5 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded">
                  <span className="font-bold text-[var(--text)]">L3 — Stato UI:</span>{' '}
                  <span className="text-[var(--text-secondary)] font-medium">
                    Indicatori visivi per lo stato del campo (compilato, incompleto, da verificare), esclusi automaticamente dalla stampa e dall&apos;anteprima.
                  </span>
                </div>
              </div>
            </div>
          )}

          {tab === 'components' && (
            <div className="space-y-2">
              <h3 className="font-bold text-[var(--text-title)] text-sm mb-2">
                Catalogo dei 10 Componenti Specializzati
              </h3>
              {[
                { code: 'CMP-01', name: 'Testo breve', desc: 'Campi sintetici a riga singola con contatore caratteri' },
                { code: 'CMP-02', name: 'Testo esteso', desc: 'Area descrittiva con supporto paragrafi e interlinea' },
                { code: 'CMP-03', name: 'Testo assistito', desc: 'Integrazione con libreria contestuale e frasi suggerite' },
                { code: 'CMP-04', name: 'Traccia guidata', desc: 'Percorso di domande strutturate con anteprima di composizione' },
                { code: 'CMP-05', name: 'Scelta singola', desc: 'Radio o tendina con opzioni ministeriali ufficiali' },
                { code: 'CMP-06', name: 'Scelta multipla', desc: 'Checkbox con limite selezioni e opzione altro' },
                { code: 'CMP-07', name: 'Campo numerico', desc: 'Ore/settimana, range minimo/massimo e unità di misura' },
                { code: 'CMP-08', name: 'Data o periodo', desc: 'Formato italiano GG/MM/AAAA con datepicker' },
                { code: 'CMP-09', name: 'Tabella ripetibile', desc: 'Righe dinamiche, ordinamento e conferma eliminazione' },
                { code: 'CMP-10', name: 'Campo calcolato', desc: 'Somma ore o calcolo percentuali in tempo reale di sola lettura' },
              ].map((c) => (
                <div key={c.code} className="p-2 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded flex items-start gap-2">
                  <span className="font-mono font-bold text-amber-900 dark:text-amber-200 bg-[var(--badge-bg)] border border-[var(--border)] px-1.5 py-0.5 rounded shrink-0">
                    {c.code}
                  </span>
                  <div>
                    <strong className="text-[var(--text)] font-bold">{c.name}:</strong>{' '}
                    <span className="text-[var(--text-secondary)] font-medium">{c.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'decree' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-bold">
                <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <span>Decreto Interministeriale 182/2020 & 153/2023</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed font-medium">
                Le 12 sezioni dell’applicazione corrispondono fedelmente alla struttura ministeriale:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[var(--text)] font-medium">
                <li>Sez. 1: Quadro informativo (famiglia e studente)</li>
                <li>Sez. 2: Elementi desunti dal Profilo di Funzionamento (ICF)</li>
                <li>Sez. 3: Raccordo con il Progetto Individuale</li>
                <li>Sez. 4: Osservazioni sull’alunno per dimensione ICF</li>
                <li>Sez. 5: Interventi per l’alunno: obiettivi e percorsi</li>
                <li>Sez. 6: Osservazioni sul contesto: barriere e facilitatori</li>
                <li>Sez. 7: Interventi sul contesto di apprendimento</li>
                <li>Sez. 8: Interventi sul percorso curricolare e verifiche</li>
                <li>Sez. 9: Organizzazione generale del progetto di inclusione</li>
                <li>Sez. 10: Certificazione delle competenze</li>
                <li>Sez. 11: Verifica finale e proposte per l’anno successivo</li>
                <li>Sez. 12: PEI Provvisorio per la prima iscrizione</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[var(--chrome-bg)] p-3 border-t border-[var(--border)] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer shadow-xs"
          >
            Chiudi Guida
          </button>
        </div>
      </div>
    </div>
  );
};
