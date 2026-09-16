import React, { useState } from 'react';
import type { SchoolOrder } from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import { X, Check, ShieldCheck, FileText } from 'lucide-react';

interface NewPeiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCreate: (order: SchoolOrder, studentCode: string, schoolName: string, classSec: string) => void;
}

export const NewPeiModal: React.FC<NewPeiModalProps> = ({
  isOpen,
  onClose,
  onConfirmCreate,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<SchoolOrder>('A2');
  const [studentCode, setStudentCode] = useState('STUDENTE_PROVA_01');
  const [schoolName, setSchoolName] = useState('I.C. Statale Alessandro Manzoni');
  const [classSec, setClassSec] = useState('3^ B');

  if (!isOpen) return null;

  const orders: SchoolOrder[] = ['A1', 'A2', 'A3', 'A4'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmCreate(selectedOrder, studentCode, schoolName, classSec);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg border border-stone-300 shadow-2xl max-w-2xl w-full overflow-hidden text-xs">
        {/* Header */}
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-800" />
            <h2 className="text-base font-bold font-serif text-stone-900">
              Crea Nuovo Piano Educativo Individualizzato
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-stone-200/50 rounded text-stone-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Selettore Ordine di Scuola */}
          <div className="space-y-2">
            <label className="font-bold text-stone-800 text-xs block">
              1. Seleziona il Modello Ministeriale Ufficiale:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {orders.map((ord) => {
                const meta = SCHOOL_ORDERS_METADATA[ord];
                const isSelected = selectedOrder === ord;
                return (
                  <div
                    key={ord}
                    onClick={() => setSelectedOrder(ord)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-amber-800 bg-amber-50/60 shadow-xs'
                        : 'border-stone-200 hover:border-stone-300 bg-stone-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-xs bg-amber-100 text-amber-950 px-2 py-0.5 rounded border border-amber-300">
                        {ord}
                      </span>
                      <span className="text-[11px] text-stone-500">{meta.pageCount} pagine</span>
                    </div>
                    <div className="font-bold text-stone-900 text-xs">{meta.officialAllegato}</div>
                    <div className="text-[11px] text-stone-600 mt-0.5">{meta.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dati Generali Intestazione */}
          <div className="space-y-3 pt-3 border-t border-stone-200">
            <label className="font-bold text-stone-800 text-xs block">
              2. Dati fittizi per l’intestazione della testata:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-stone-600 mb-1 text-[11px]">Identificativo Alunno/a:</label>
                <input
                  type="text"
                  required
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="Es. ALUNNO_A1_01"
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-stone-600 mb-1 text-[11px]">Istituzione Scolastica:</label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Es. I.C. Statale..."
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded bg-white"
                />
              </div>
              <div>
                <label className="block text-stone-600 mb-1 text-[11px]">Classe o Sezione:</label>
                <input
                  type="text"
                  required
                  value={classSec}
                  onChange={(e) => setClassSec(e.target.value)}
                  placeholder="Es. 2^ A"
                  className="w-full px-2.5 py-1.5 border border-stone-300 rounded bg-white"
                />
              </div>
            </div>
          </div>

          {/* Footer form */}
          <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-emerald-800 text-[11px]">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Conforme alle specifiche D.I. 182/2020 e D.I. 153/2023</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-300"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Crea PEI</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
