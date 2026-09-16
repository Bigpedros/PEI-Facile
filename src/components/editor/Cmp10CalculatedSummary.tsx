import React from 'react';
import type { PeiFieldDefinition, PeiDocument } from '../../types/pei';
import { Calculator, Info, CheckCircle } from 'lucide-react';

interface Cmp10CalculatedSummaryProps {
  field: PeiFieldDefinition;
  document: PeiDocument;
}

export const Cmp10CalculatedSummary: React.FC<Cmp10CalculatedSummaryProps> = ({
  field,
  document,
}) => {
  let calculatedValue: string | number = '';
  let detailMessage = '';

  if (field.calculationType === 'sum' && field.sourceFieldIds) {
    const sum = field.sourceFieldIds.reduce((acc, srcId) => {
      const val = Number(document.values[srcId]) || 0;
      return acc + val;
    }, 0);
    calculatedValue = `${sum} ${field.unit || 'ore/settimana'}`;
    detailMessage = `Somma calcolata dai campi: ${field.sourceFieldIds.join(', ')}`;
  } else if (field.calculationType === 'progress_percentage') {
    const totalFields = Object.keys(document.fieldStatuses).length || 1;
    const completedFields = Object.values(document.fieldStatuses).filter(
      (s) => s === 'compilato'
    ).length;
    const pct = Math.round((completedFields / Math.max(totalFields, 12)) * 100);
    calculatedValue = `${Math.min(pct, 100)}%`;
    detailMessage = `${completedFields} campi compilati su ${Math.max(totalFields, 12)} monitorati`;
  } else {
    calculatedValue = 'Calcolato automaticamente';
    detailMessage = 'Aggiornato in tempo reale dall’applicazione';
  }

  return (
    <div className="w-full p-3 bg-stone-50 border border-stone-300 rounded shadow-2xs space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
          <Calculator className="w-4 h-4 text-amber-800" />
          <span>Valore calcolato di sistema (Sola lettura)</span>
        </div>
        <span className="text-[11px] bg-stone-200 text-stone-700 font-medium px-2 py-0.5 rounded">
          CMP-10
        </span>
      </div>

      <div className="text-xl font-bold font-mono text-amber-950 bg-white px-3 py-1.5 rounded border border-stone-200 inline-block shadow-2xs">
        {calculatedValue}
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-stone-500 pt-1 border-t border-stone-200">
        <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        <span>{detailMessage}</span>
      </div>
    </div>
  );
};
