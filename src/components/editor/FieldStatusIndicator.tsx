import React from 'react';
import type { FieldStatus } from '../../types/pei';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  Eye,
  Slash,
  Circle,
  Lock,
} from 'lucide-react';

interface FieldStatusIndicatorProps {
  status?: FieldStatus;
  required?: boolean;
  className?: string;
}

export const FieldStatusIndicator: React.FC<FieldStatusIndicatorProps> = ({
  status = 'vuoto',
  required = false,
  className = '',
}) => {
  switch (status) {
    case 'compilato':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 bg-emerald-50 ${className}`}
          title="Campo compilato e salvato"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Compilato</span>
        </span>
      );

    case 'incompleto':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 text-amber-800 bg-amber-50 ${className}`}
          title="Contenuto presente ma incompleto"
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Incompleto</span>
        </span>
      );

    case 'da_verificare':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-blue-300 text-blue-800 bg-blue-50 ${className}`}
          title="Da verificare dal GLO"
        >
          <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
          <span>Da verificare</span>
        </span>
      );

    case 'obbligatorio_mancante':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-rose-300 text-rose-800 bg-rose-50 font-semibold ${className}`}
          title="Dato obbligatorio non ancora inserito"
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          <span>Obbligatorio mancante</span>
        </span>
      );

    case 'disabilitato':
    case 'non_applicabile':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-slate-300 text-slate-500 bg-slate-100 ${className}`}
          title="Non applicabile a questo modello ministeriale"
        >
          <Slash className="w-3.5 h-3.5 text-slate-400" />
          <span>Non applicabile</span>
        </span>
      );

    case 'sola_lettura':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-slate-100 ${className}`}
          title="Informazione di sola visualizzazione"
        >
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>Sola lettura</span>
        </span>
      );

    case 'attivo':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-blue-400 text-blue-900 bg-blue-100 font-semibold ${className}`}
          title="Campo attivo in modifica"
        >
          <Eye className="w-3.5 h-3.5 text-blue-700" />
          <span>In modifica</span>
        </span>
      );

    case 'vuoto':
    default:
      if (required) {
        return (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-amber-200 text-amber-900 bg-amber-50/70 ${className}`}
            title="Campo obbligatorio da compilare"
          >
            <Circle className="w-3.5 h-3.5 text-amber-500 fill-amber-200" />
            <span>Da compilare *</span>
          </span>
        );
      }
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded border border-stone-200 text-stone-500 bg-stone-50 ${className}`}
        >
          <Circle className="w-3 h-3 text-stone-400" />
          <span>Vuoto</span>
        </span>
      );
  }
};
