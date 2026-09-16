import React, { useState } from 'react';
import type { PeiFieldDefinition } from '../../types/pei';
import { BookOpen, PlusCircle, Replace, Sparkles } from 'lucide-react';

interface Cmp03AssistedTextProps {
  field: PeiFieldDefinition;
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp03AssistedText: React.FC<Cmp03AssistedTextProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  const [showLibrary, setShowLibrary] = useState(false);
  const phrases = field.suggestedPhrases || [];

  const handleAppendPhrase = (phrase: string) => {
    if (!value.trim()) {
      onChange(phrase);
    } else {
      onChange(value.trim() + '\n' + phrase);
    }
  };

  const handleReplacePhrase = (phrase: string) => {
    onChange(phrase);
  };

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <textarea
          id={field.id}
          rows={field.minLines || 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          disabled={disabled}
          placeholder={field.placeholder || 'Inserisci osservazioni o attingi dalla libreria contestuale...'}
          className="w-full px-3 py-2 text-sm text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400 placeholder:text-stone-400 transition-colors leading-relaxed"
        />
        {phrases.length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => setShowLibrary(!showLibrary)}
            className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded shadow-xs transition-colors"
            title="Mostra suggerimenti da libreria contestuale"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Libreria tracce ({phrases.length})</span>
          </button>
        )}
      </div>

      {showLibrary && phrases.length > 0 && (
        <div className="p-3 bg-amber-50/50 border border-amber-200 rounded text-xs space-y-2">
          <div className="flex items-center justify-between font-semibold text-amber-900">
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              Frasi tipo dalla Libreria Contestuale PEI FACILE:
            </span>
            <button
              type="button"
              onClick={() => setShowLibrary(false)}
              className="text-stone-500 hover:text-stone-800 cursor-pointer"
            >
              Chiudi
            </button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {phrases.map((phrase, idx) => (
              <div
                key={idx}
                className="p-2 bg-white border border-amber-100 rounded hover:border-amber-300 transition-colors flex items-start justify-between gap-2"
              >
                <p className="text-stone-800 flex-1 text-xs leading-relaxed">{phrase}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAppendPhrase(phrase)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-medium transition-colors"
                    title="Aggiungi in coda al testo esistente"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>Aggiungi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReplacePhrase(phrase)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded transition-colors"
                    title="Sostituisci l'intero campo con questa frase"
                  >
                    <Replace className="w-3 h-3" />
                    <span>Sostituisci</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-stone-500 italic">
            I testi inseriti dalla libreria rimangono liberamente modificabili dal docente prima del salvataggio.
          </div>
        </div>
      )}
    </div>
  );
};
