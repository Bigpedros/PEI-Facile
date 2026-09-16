import React from 'react';
import type { ThemeType, SchoolOrder } from '../../types/pei';
import { X, Palette, Shield, Info, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  defaultSchoolOrder: SchoolOrder;
  onChangeDefaultSchoolOrder: (order: SchoolOrder) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onChangeTheme,
  defaultSchoolOrder,
  onChangeDefaultSchoolOrder,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50 text-xs">
      <div className="bg-white rounded-lg border border-stone-300 shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
            <Palette className="w-4 h-4 text-amber-800" />
            <span>Impostazioni Applicazione</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-stone-200/50 rounded text-stone-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Sezione Aspetto & Temi */}
          <div className="space-y-2">
            <label className="font-bold text-stone-800 block">
              1. Aspetto e Tema Visivo
            </label>
            <p className="text-stone-500 text-[11px]">
              Il foglio di compilazione A4 rimane sempre con fondo bianco per garantire fedeltà di stampa assoluta.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { id: 'sabbia', label: 'Sabbia', desc: 'Chiaro Caldo (#F3EBD9)', bg: '#F3EBD9', text: '#2A2521' },
                { id: 'navy', label: 'Blu Navy 35%', desc: 'Default (#C3CEDD)', bg: '#C3CEDD', text: '#152238' },
                { id: 'antracite', label: 'Antracite', desc: 'Scuro Caldo (#222528)', bg: '#222528', text: '#F0EFEA' },
              ].map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => onChangeTheme(th.id as ThemeType)}
                  className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                    currentTheme === th.id
                      ? 'border-amber-800 ring-1 ring-amber-800 shadow-xs'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                  style={{ backgroundColor: th.bg, color: th.text }}
                >
                  <div className="font-bold text-xs flex items-center justify-between">
                    <span>{th.label}</span>
                    {currentTheme === th.id && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <div className="text-[10px] opacity-80 mt-1">{th.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sezione Ordine di Scuola Predefinito */}
          <div className="space-y-2 pt-3 border-t border-stone-200">
            <label className="font-bold text-stone-800 block">
              2. Modello Ministeriale Predefinito
            </label>
            <select
              value={defaultSchoolOrder}
              onChange={(e) => onChangeDefaultSchoolOrder(e.target.value as SchoolOrder)}
              className="w-full p-2 border border-stone-300 rounded bg-white"
            >
              <option value="A1">A1 — Scuola dell’Infanzia (Allegato A1)</option>
              <option value="A2">A2 — Scuola Primaria (Allegato A2)</option>
              <option value="A3">A3 — Scuola Secondaria di I Grado (Allegato A3)</option>
              <option value="A4">A4 — Scuola Secondaria di II Grado (Allegato A4)</option>
            </select>
          </div>

          {/* Privacy e Garanzia Dati */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded space-y-1">
            <div className="font-bold text-stone-800 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-700" />
              <span>Protezione Dati & Privacy (GDPR)</span>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              PEI FACILE opera in modalità locale local-first: i testi, i dati fittizi degli alunni e i file elaborati non vengono mai trasmessi a server esterni non autorizzati.
            </p>
          </div>
        </div>

        <div className="bg-[var(--chrome-bg)] p-3 border-t border-[var(--border)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer"
          >
            Salva e Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
