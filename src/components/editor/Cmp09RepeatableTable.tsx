import React, { useState } from 'react';
import type { PeiFieldDefinition } from '../../types/pei';
import { Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

interface Cmp09RepeatableTableProps {
  field: PeiFieldDefinition;
  value: Array<Record<string, string>>;
  onChange: (val: Array<Record<string, string>>) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp09RepeatableTable: React.FC<Cmp09RepeatableTableProps> = ({
  field,
  value = [],
  onChange,
  onFocus,
  disabled = false,
}) => {
  const columns = field.columns || [];
  const rows = Array.isArray(value) ? value : [];
  const [rowToDelete, setRowToDelete] = useState<number | null>(null);

  const handleAddRow = () => {
    const newRow: Record<string, string> = {};
    columns.forEach((col) => {
      newRow[col.id] = col.options ? col.options[0] || '' : '';
    });
    onChange([...rows, newRow]);
  };

  const handleCellChange = (rowIndex: number, colId: string, val: string) => {
    const updated = [...rows];
    updated[rowIndex] = { ...updated[rowIndex], [colId]: val };
    onChange(updated);
  };

  const confirmDelete = (idx: number) => {
    const row = rows[idx];
    const hasContent = Object.values(row).some(
      (v) => typeof v === 'string' && v.trim() !== ''
    );
    if (hasContent) {
      setRowToDelete(idx);
    } else {
      executeDelete(idx);
    }
  };

  const executeDelete = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
    setRowToDelete(null);
  };

  const handleMove = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= rows.length) return;
    const copy = [...rows];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    onChange(copy);
  };

  return (
    <div className="w-full space-y-2" onFocus={onFocus}>
      <div className="overflow-x-auto border border-stone-300 rounded shadow-2xs">
        <table className="w-full border-collapse text-left text-xs bg-white">
          <thead className="bg-stone-100 border-b border-stone-300 text-stone-700 font-semibold">
            <tr>
              <th className="p-2 w-8 text-center text-stone-400">#</th>
              {columns.map((col) => (
                <th key={col.id} className="p-2 border-l border-stone-200" style={{ width: col.width }}>
                  {col.label}
                </th>
              ))}
              <th className="p-2 w-20 text-center border-l border-stone-200">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="p-4 text-center text-stone-500 italic bg-stone-50">
                  Nessuna riga inserita. Clicca su &quot;Aggiungi riga&quot; per iniziare.
                </td>
              </tr>
            ) : (
              rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-amber-50/20">
                  <td className="p-2 text-center text-stone-400 font-mono font-medium">
                    {rIdx + 1}
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="p-1.5 border-l border-stone-200 align-top">
                      {col.type === 'select' && col.options ? (
                        <select
                          value={row[col.id] || ''}
                          onChange={(e) => handleCellChange(rIdx, col.id, e.target.value)}
                          disabled={disabled}
                          className="w-full p-1.5 border border-stone-300 rounded bg-white text-xs focus:ring-1 focus:ring-amber-800"
                        >
                          {col.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <textarea
                          rows={2}
                          value={row[col.id] || ''}
                          onChange={(e) => handleCellChange(rIdx, col.id, e.target.value)}
                          disabled={disabled}
                          placeholder={`Inserisci ${col.label.toLowerCase()}...`}
                          className="w-full p-1.5 border border-stone-300 rounded bg-white text-xs focus:ring-1 focus:ring-amber-800 resize-y"
                        />
                      )}
                    </td>
                  ))}
                  <td className="p-1.5 border-l border-stone-200 text-center align-middle">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMove(rIdx, 'up')}
                        disabled={rIdx === 0 || disabled}
                        className="p-1 hover:bg-stone-100 rounded text-stone-500 disabled:opacity-30"
                        title="Sposta riga su"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(rIdx, 'down')}
                        disabled={rIdx === rows.length - 1 || disabled}
                        className="p-1 hover:bg-stone-100 rounded text-stone-500 disabled:opacity-30"
                        title="Sposta riga giù"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmDelete(rIdx)}
                        disabled={disabled}
                        className="p-1 hover:bg-rose-50 rounded text-rose-600 disabled:opacity-30"
                        title="Elimina riga"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded shadow-2xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-amber-700" />
          <span>Aggiungi riga tabella</span>
        </button>
      )}

      {rowToDelete !== null && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs flex items-center justify-between gap-2 text-rose-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              Confermi l’eliminazione della riga {rowToDelete + 1}? I dati inseriti andranno persi.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRowToDelete(null)}
              className="px-2 py-1 bg-white border border-stone-300 text-stone-700 rounded hover:bg-stone-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => executeDelete(rowToDelete)}
              className="px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded font-medium"
            >
              Elimina riga
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
