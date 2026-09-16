import React from 'react';
import type { PeiFieldDefinition } from '../../types/pei';

interface Cmp02LongTextProps {
  field: PeiFieldDefinition;
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp02LongText: React.FC<Cmp02LongTextProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  const minLines = field.minLines || 3;
  return (
    <div className="w-full">
      <textarea
        id={field.id}
        rows={minLines}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        disabled={disabled}
        placeholder={field.placeholder || 'Inserisci osservazioni o descrizione articolata...'}
        className="w-full px-3 py-2 text-sm text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400 transition-colors resize-y leading-relaxed"
      />
      <div className="flex justify-between items-center text-[11px] text-stone-500 mt-0.5 px-0.5">
        <span>Gestione automatica capoversi e interlinea</span>
        <span>{value.length} caratteri</span>
      </div>
    </div>
  );
};
