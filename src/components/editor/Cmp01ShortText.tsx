import React from 'react';
import type { PeiFieldDefinition } from '../../types/pei';

interface Cmp01ShortTextProps {
  field: PeiFieldDefinition;
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp01ShortText: React.FC<Cmp01ShortTextProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  return (
    <div className="w-full">
      <input
        type="text"
        id={field.id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        disabled={disabled}
        maxLength={field.maxLength}
        placeholder={field.placeholder || 'Inserisci testo sintetico...'}
        className="w-full px-3 py-2 text-sm text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400 transition-colors"
      />
      {field.maxLength && (
        <div className="text-right text-[11px] text-stone-500 mt-1">
          {value.length} / {field.maxLength} caratteri
        </div>
      )}
    </div>
  );
};
