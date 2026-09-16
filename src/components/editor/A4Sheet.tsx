import React from 'react';
import type {
  PeiSectionDefinition,
  PeiDocument,
  PeiFieldDefinition,
} from '../../types/pei';
import { SCHOOL_ORDERS_METADATA } from '../../data/masterPeiStructure';
import { FieldRenderer } from './FieldRenderer';

interface A4SheetProps {
  section: PeiSectionDefinition;
  document: PeiDocument;
  onFieldValueChange: (fieldId: string, value: any) => void;
  activeFieldId?: string;
  onFieldFocus?: (field: PeiFieldDefinition) => void;
  readOnly?: boolean;
  scale?: number;
  currentPage?: number;
}

export const A4Sheet: React.FC<A4SheetProps> = ({
  section,
  document,
  onFieldValueChange,
  activeFieldId,
  onFieldFocus,
  readOnly = false,
  scale = 1,
  currentPage = 1,
}) => {
  const modelMeta = SCHOOL_ORDERS_METADATA[document.schoolOrder];

  return (
    <div
      className="flex justify-center my-6 transition-transform origin-top"
      style={{ transform: `scale(${scale})` }}
    >
      <div
        className="sheet-a4 bg-white text-stone-900 border border-stone-300 shadow-xl rounded-xs p-10 flex flex-col justify-between relative"
        style={{
          width: '210mm',
          minHeight: '297mm',
        }}
      >
        {/* ============================================================ */}
        {/* L1: MODELLO VETTORIALE MINISTERIALE (Linee, Intestazioni, Decreto) */}
        {/* ============================================================ */}
        <div className="border-b-2 border-stone-800 pb-4 mb-6">
          {/* Header Reputazionale Ufficiale */}
          <div className="flex justify-between items-start text-xs text-stone-600 font-serif uppercase tracking-wider mb-2">
            <div>MINISTERO DELL’ISTRUZIONE E DEL MERITO</div>
            <div className="font-semibold text-stone-800">{modelMeta.officialAllegato}</div>
          </div>

          <div className="text-center my-3">
            <h1 className="text-xl font-bold font-serif uppercase tracking-wide text-stone-950">
              Piano Educativo Individualizzato
            </h1>
            <p className="text-xs text-stone-600 font-serif italic mt-0.5">
              (Art. 7, D.Lgs. 13 aprile 2017, n. 66 e s.m.i. — {modelMeta.decree})
            </p>
            <div className="inline-block px-3 py-0.5 bg-stone-100 border border-stone-300 text-stone-800 text-xs font-semibold rounded-full mt-2">
              {modelMeta.name.toUpperCase()} — A.S. {document.schoolYear}
            </div>
          </div>

          {/* Dati testata istituzione */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-stone-200 text-xs font-serif">
            <div>
              <span className="text-stone-500 font-sans">Scuola:</span>{' '}
              <strong className="text-stone-800">{document.schoolName}</strong>
            </div>
            <div>
              <span className="text-stone-500 font-sans">Alunno/a:</span>{' '}
              <strong className="text-stone-800">{document.studentCode}</strong>
            </div>
            <div className="text-right">
              <span className="text-stone-500 font-sans">Classe/Sez:</span>{' '}
              <strong className="text-stone-800">{document.classOrSection}</strong>
            </div>
          </div>
        </div>

        {/* Intestazione Sezione Corrente */}
        <div className="bg-stone-100/80 border border-stone-300 p-2.5 mb-6 rounded-xs">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold font-serif uppercase tracking-wide text-stone-900">
              SEZIONE {section.number} — {section.title.toUpperCase()}
            </div>
            <div className="text-xs text-stone-500 font-sans">
              Modello {document.schoolOrder}
            </div>
          </div>
          <p className="text-xs text-stone-600 font-serif italic mt-0.5">
            {section.description}
          </p>
        </div>

        {/* ============================================================ */}
        {/* L2 + L3: OVERLAY CAMPI E STATO UI */}
        {/* ============================================================ */}
        <div className="flex-1 space-y-5">
          {section.fields.map((field) => {
            const isActive = activeFieldId === field.id;
            return (
              <div key={field.id} className="relative">
                <FieldRenderer
                  field={field}
                  document={document}
                  onFieldValueChange={onFieldValueChange}
                  onFieldFocus={onFieldFocus}
                  isActive={isActive && !readOnly}
                />
              </div>
            );
          })}
        </div>

        {/* ============================================================ */}
        {/* L1: FOOTER MINISTERIALE E NUMERO PAGINA */}
        {/* ============================================================ */}
        <div className="border-t border-stone-300 pt-3 mt-8 flex items-center justify-between text-[11px] text-stone-500 font-serif">
          <div>
            <span>PEI — {modelMeta.name}</span> • <span>D.I. 182/2020 e D.I. 153/2023</span>
          </div>
          <div className="font-mono font-medium text-stone-700">
            Pagina {currentPage} di {modelMeta.pageCount}
          </div>
        </div>
      </div>
    </div>
  );
};
