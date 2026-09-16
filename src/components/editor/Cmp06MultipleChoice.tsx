import React from 'react';
import type { PeiFieldDefinition } from '../../types/pei';

interface Cmp06MultipleChoiceProps {
  field: PeiFieldDefinition;
  value: string[];
  onChange: (val: string[]) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp06MultipleChoice: React.FC<Cmp06MultipleChoiceProps> = ({
  field,
  value = [],
  onChange,
  onFocus,
  disabled = false,
}) => {
  const options = field.options || [];
  const selectedValues = Array.isArray(value) ? value : [];

  const handleToggle = (optVal: string) => {
    if (selectedValues.includes(optVal)) {
      onChange(selectedValues.filter((v) => v !== optVal));
    } else {
      if (field.maxSelections && selectedValues.length >= field.maxSelections) {
        return; // Max reached
      }
      onChange([...selectedValues, optVal]);
    }
  };

  return (
    <div className="w-full space-y-2" onFocus={onFocus}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {options.map((opt) => {
          const isChecked = selectedValues.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                isChecked
                  ? 'bg-amber-50/70 border-amber-800 text-stone-900 font-medium'
                  : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
              } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggle(opt.value)}
                disabled={disabled}
                className="mt-0.5 rounded text-amber-800 focus:ring-amber-800"
              />
              <span className="text-xs">{opt.label}</span>
            </label>
          );
        })}
      </div>
      <div className="flex justify-between items-center text-[11px] text-stone-500 px-1">
        <span>Selezionati: {selectedValues.length} opzioni</span>
        {field.maxSelections && (
          <span>Massimo consentito: {field.maxSelections}</span>
        )}
      </div>
    </div>
  );
};
