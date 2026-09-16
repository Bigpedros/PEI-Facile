import React from 'react';
import type { PeiFieldDefinition } from '../../types/pei';

interface Cmp05SingleChoiceProps {
  field: PeiFieldDefinition;
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp05SingleChoice: React.FC<Cmp05SingleChoiceProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  const options = field.options || [];

  return (
    <div className="w-full space-y-2" onFocus={onFocus}>
      {options.length <= 4 ? (
        <div className="space-y-1.5">
          {options.map((opt) => {
            const isSelected = value === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-2 rounded border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-amber-50/70 border-amber-800 text-stone-900 font-medium'
                    : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
                } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name={field.id}
                  value={opt.value}
                  checked={isSelected}
                  onChange={() => onChange(opt.value)}
                  disabled={disabled}
                  className="mt-0.5 text-amber-800 focus:ring-amber-800"
                />
                <div className="text-xs">
                  <div>{opt.label}</div>
                  {opt.description && (
                    <div className="text-[11px] text-stone-500 font-normal">{opt.description}</div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      ) : (
        <select
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400"
        >
          <option value="">-- Seleziona un’opzione --</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};
