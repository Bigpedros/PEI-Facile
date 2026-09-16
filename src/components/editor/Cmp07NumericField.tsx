import React from 'react';
import type { PeiFieldDefinition } from '../../types/pei';

interface Cmp07NumericFieldProps {
  field: PeiFieldDefinition;
  value: number | string;
  onChange: (val: number) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp07NumericField: React.FC<Cmp07NumericFieldProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  const numValue = value === '' ? '' : Number(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onChange(0);
      return;
    }
    const parsed = Number(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <input
          type="number"
          id={field.id}
          value={numValue}
          onChange={handleChange}
          onFocus={onFocus}
          disabled={disabled}
          min={field.min}
          max={field.max}
          step={field.step || 1}
          placeholder="0"
          className="w-32 px-3 py-2 text-sm text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400 placeholder:text-stone-400 font-mono text-right"
        />
        {field.unit && (
          <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2.5 py-2 rounded border border-stone-200">
            {field.unit}
          </span>
        )}
      </div>
      {(field.min !== undefined || field.max !== undefined) && (
        <div className="text-[11px] text-stone-500 mt-1">
          Valore consentito: tra {field.min ?? 0} e {field.max ?? 'illimitato'} {field.unit || ''}
        </div>
      )}
    </div>
  );
};
