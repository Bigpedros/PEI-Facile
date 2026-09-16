import React from 'react';
import type { PeiFieldDefinition } from '../../types/pei';
import { Calendar } from 'lucide-react';

interface Cmp08DateOrPeriodProps {
  field: PeiFieldDefinition;
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp08DateOrPeriod: React.FC<Cmp08DateOrPeriodProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  // Convert standard date string (either DD/MM/YYYY or YYYY-MM-DD) for HTML date input
  const getIsoDate = (val: string) => {
    if (!val) return '';
    if (val.includes('/')) {
      const [d, m, y] = val.split('/');
      if (d && m && y) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return val;
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    if (!iso) {
      onChange('');
      return;
    }
    const [y, m, d] = iso.split('-');
    if (y && m && d) {
      onChange(`${d}/${m}/${y}`);
    } else {
      onChange(iso);
    }
  };

  return (
    <div className="w-full space-y-1">
      <div className="flex items-center gap-2 max-w-xs">
        <div className="relative flex-1">
          <input
            type="text"
            id={field.id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            disabled={disabled}
            placeholder="GG/MM/AAAA"
            className="w-full pl-9 pr-3 py-2 text-sm font-mono text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400 placeholder:text-stone-400"
          />
          <Calendar className="w-4 h-4 text-stone-400 absolute left-2.5 top-2.5 pointer-events-none" />
        </div>

        <input
          type="date"
          value={getIsoDate(value)}
          onChange={handleDateChange}
          disabled={disabled}
          title="Scegli da calendario"
          className="p-1.5 border border-stone-300 rounded bg-white text-stone-900 hover:bg-stone-50 cursor-pointer disabled:opacity-50"
        />
      </div>
      <div className="text-[11px] text-stone-500">
        Formato italiano GG/MM/AAAA
      </div>
    </div>
  );
};
