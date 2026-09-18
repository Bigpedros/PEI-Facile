/**
 * @license
 * PEI FACILE — Production Document Surface (Phase 1C-R1)
 * Single unified document surface for EDIT, PREVIEW, and PRINT modes.
 *
 * Enforces:
 * L1 = Authentic model PDF surface (PDF.js)
 * L2 = Mapped compilable fields overlay (PDF point transforms)
 * L3 = Non-printable editing adornments (focus ring, badges, errors)
 * DATA = Independent structured values
 *
 * Adheres strictly to:
 * - Deterministic source resolution via resolveTemplateSource()
 * - BUILT_IN ministerial models (A1-A4) load from public assets without requiring IndexedDB
 * - Custom models (USER_IMPORTED) require calibrated schema & valid IndexedDB binary
 * - Strict separation of error gating and semantic messaging
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SchoolOrder, PeiDocument, PeiModelDefinition } from '../../types/pei';
import type { ModelGeometry } from '../../data/geometry/types';
import type {
  TemplateSchema,
  DocumentSurfaceMode,
} from '../../core/templateSchemaTypes';
import {
  resolveTemplateSource,
  TemplateSourceError,
  type ResolvedTemplateSource,
  type TemplateSourceErrorCode,
} from '../../core/templateSourceResolver';
import { resolveMinisterialOrder } from '../../data/peiModelRegistry';
import { PageSurface } from './PageSurface';
import { AlertTriangle, ShieldAlert, Sliders } from 'lucide-react';

export interface DocumentSurfaceProps {
  document: PeiDocument;
  templateId?: string;
  modelDef?: PeiModelDefinition | null;
  schoolOrder: SchoolOrder;
  sourcePdfUrl?: string;
  sourcePdfBinary?: Uint8Array | null;
  geometryMapping?: ModelGeometry | null;
  templateSchema?: TemplateSchema | null;
  mode: DocumentSurfaceMode;
  zoomScale: number;
  pageNumber?: number;
  showAllPages?: boolean;
  activeFieldId?: string;
  onFieldFocus?: (fieldId: string) => void;
  onFieldValueChange?: (fieldId: string, value: any) => void;
  onOpenCalibration?: () => void;
  className?: string;
}

export const DocumentSurface: React.FC<DocumentSurfaceProps> = ({
  document,
  templateId: propTemplateId,
  modelDef,
  schoolOrder,
  sourcePdfUrl,
  sourcePdfBinary: propBinary,
  geometryMapping,
  templateSchema: propSchema,
  mode,
  zoomScale,
  pageNumber = 1,
  showAllPages = false,
  activeFieldId,
  onFieldFocus,
  onFieldValueChange,
  onOpenCalibration,
  className = '',
}) => {
  // Determine candidate templateId
  const effectiveTemplateId =
    propTemplateId ||
    document.modelId ||
    document.templateId ||
    modelDef?.templateId ||
    schoolOrder;

  const ministerialOrder =
    resolveMinisterialOrder(effectiveTemplateId) ||
    resolveMinisterialOrder(document.modelId) ||
    resolveMinisterialOrder(schoolOrder) ||
    resolveMinisterialOrder(modelDef?.schoolOrder);

  const isMinisterial =
    Boolean(ministerialOrder) ||
    Boolean(modelDef?.isMinisterial) ||
    modelDef?.sourceKind === 'BUILT_IN' ||
    modelDef?.originType === 'MINISTERIAL';

  const [resolvedSource, setResolvedSource] = useState<ResolvedTemplateSource | null>(null);
  const [schema, setSchema] = useState<TemplateSchema | null>(propSchema || null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadingPdf, setLoadingPdf] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<{
    code: TemplateSourceErrorCode | 'RENDER_ERROR';
    message: string;
    details?: any;
  } | null>(null);

  // Load and resolve source, geometry, schema, and PDF
  useEffect(() => {
    let isCancelled = false;
    let currentTask: any = null;

    async function loadDocument() {
      setLoadingPdf(true);
      setLoadError(null);

      try {
        const source = await resolveTemplateSource({
          modelDef,
          modelId: document.modelId,
          templateId: propTemplateId || document.templateId,
          schoolOrder: document.schoolOrder || schoolOrder,
          providedBinary: propBinary,
        });

        if (isCancelled) return;
        setResolvedSource(source);
        if (!propSchema) {
          setSchema(source.templateSchema);
        }

        // Initialize PDF.js
        const pdfjs = await import('pdfjs-dist');
        if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        }

        const pdfJsBytes = new Uint8Array(source.sourceBinary).slice();
        const loadingTask = pdfjs.getDocument({
          data: pdfJsBytes,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
        });

        currentTask = loadingTask;
        const loadedDoc = await loadingTask.promise;

        if (!isCancelled) {
          setPdfDoc(loadedDoc);
          setLoadingPdf(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('DocumentSurface source resolution / PDF load failed:', err);
          setLoadingPdf(false);
          const errorCode: TemplateSourceErrorCode =
            err instanceof TemplateSourceError ? err.code : 'TEMPLATE_SOURCE_MISSING';
          setLoadError({
            code: errorCode,
            message: err?.message || 'Impossibile caricare il documento PDF sorgente.',
            details: err?.details,
          });
        }
      }
    }

    loadDocument();

    return () => {
      isCancelled = true;
      if (currentTask && typeof currentTask.destroy === 'function') {
        try {
          currentTask.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [
    document.modelId,
    document.schoolOrder,
    document.templateId,
    effectiveTemplateId,
    geometryMapping,
    modelDef,
    propBinary,
    propSchema,
    propTemplateId,
    schoolOrder,
  ]);

  // ============================================================
  // BLOCKING ERROR GATES (Phase 1C-R1)
  // ============================================================
  if (loadError) {
    const isCustomModel =
      resolvedSource?.sourceKind === 'USER_IMPORTED' ||
      (!isMinisterial && modelDef?.originType !== 'MINISTERIAL' && modelDef?.sourceKind !== 'BUILT_IN');

    const modelDisplayName =
      modelDef?.name ||
      resolvedSource?.modelDef?.name ||
      (isMinisterial ? `Modello Ministeriale Ufficiale ${effectiveTemplateId}` : effectiveTemplateId);

    const calibrationStatusDisplay = isMinisterial
      ? 'CALIBRATO (Baseline ufficiale)'
      : modelDef?.calibrationStatus || schema?.calibrationStatus || 'NON CALIBRATO';

    return (
      <div
        id="document-surface-blocked"
        className="w-full h-full flex flex-col items-center justify-center p-8 bg-[var(--app-bg)] text-[var(--text)]"
      >
        <div className="max-w-xl w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-800 rounded-xl p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mx-auto text-amber-800 dark:text-amber-400">
            {loadError.code === 'MODEL_CALIBRATION_REQUIRED' ? (
              <ShieldAlert className="w-8 h-8" />
            ) : (
              <AlertTriangle className="w-8 h-8" />
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold font-serif text-stone-900 dark:text-stone-100 uppercase tracking-wide">
              {loadError.code === 'MODEL_CALIBRATION_REQUIRED'
                ? 'Calibrazione Geometrica Richiesta'
                : loadError.code === 'TEMPLATE_INTEGRITY_MISMATCH'
                ? 'Mancata Corrispondenza Integrità SHA-256'
                : 'Sorgente Template Non Disponibile'}
            </h2>
            <p className="text-xs font-mono font-bold text-amber-800 dark:text-amber-400 mt-1">
              GATE: {loadError.code}
            </p>
          </div>

          <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed whitespace-pre-line">
            {loadError.message}
          </p>

          <div className="p-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg border border-stone-200 dark:border-stone-700 text-left text-xs space-y-1.5 font-mono">
            <div>
              <strong>Modello:</strong> {modelDisplayName}
            </div>
            <div>
              <strong>Origine Sorgente:</strong>{' '}
              {isCustomModel ? 'Modello Personalizzato / Utente' : 'Modello Ministeriale Ufficiale (Built-in)'}
            </div>
            <div>
              <strong>Ordine Scuola:</strong> {schoolOrder}
            </div>
            <div>
              <strong>Stato Calibrazione:</strong> {calibrationStatusDisplay}
            </div>
            {isCustomModel ? (
              <div>
                <strong>Regola Vincolante:</strong> Vietato il fallback ministeriale silente per modelli custom (Phase 1C R01).
              </div>
            ) : (
              <div>
                <strong>Verifica Baseline:</strong> Riferimento ufficiale D.I. 153/2023 - D.I. 182/2020.
              </div>
            )}
          </div>

          <div className="flex justify-center gap-3 pt-2">
            {isCustomModel && onOpenCalibration && (
              <button
                type="button"
                id="btn-open-calibration-gate"
                onClick={onOpenCalibration}
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold text-sm inline-flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Sliders className="w-4 h-4" />
                <span>Apri Strumento di Calibrazione</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loadingPdf) {
    return (
      <div
        id="document-surface-loading"
        className="w-full h-full flex flex-col items-center justify-center p-12 text-stone-600"
      >
        <div className="w-10 h-10 border-3 border-stone-300 border-t-amber-800 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold font-serif text-stone-800 dark:text-stone-200">
          Caricamento superficie documentale originale (L1)...
        </p>
        <span className="text-xs font-mono text-stone-500 mt-1">
          Inizializzazione motore PDF.js per {effectiveTemplateId}
        </span>
      </div>
    );
  }

  const activeSchema = schema || resolvedSource?.templateSchema;
  const totalPages = pdfDoc ? pdfDoc.numPages : activeSchema?.totalPages || 1;
  const pagesToRender: number[] = showAllPages
    ? Array.from({ length: totalPages }, (_, i) => i + 1)
    : [Math.min(Math.max(1, pageNumber), totalPages)];

  return (
    <div
      id="document-surface-root"
      className={`document-surface flex flex-col items-center select-none ${className}`}
    >
      {pagesToRender.map((pNum) => {
        const pageGeometry = activeSchema?.pages.find((p) => p.pageNumber === pNum);
        const pageFields = activeSchema?.fields.filter((f) => f.pageNumber === pNum) || [];

        return (
          <div key={`page-${pNum}`} className="flex flex-col items-center w-full">
            {/* Page Header (Preview / Debug indicator) */}
            {showAllPages && mode !== 'PRINT' && (
              <div className="no-print text-xs text-stone-500 font-mono font-semibold mb-1 mt-4">
                Pagina {pNum} di {totalPages} — {activeSchema?.schoolOrder || schoolOrder} ({resolvedSource?.modelDef?.name || modelDef?.name || 'Modello Ufficiale'})
              </div>
            )}

            <PageSurface
              pageNumber={pNum}
              pdfDoc={pdfDoc}
              widthPt={pageGeometry?.widthPt}
              heightPt={pageGeometry?.heightPt}
              fields={pageFields}
              values={document.values}
              onFieldValueChange={onFieldValueChange}
              activeFieldId={activeFieldId}
              onFieldFocus={onFieldFocus}
              mode={mode}
              zoomScale={zoomScale}
            />
          </div>
        );
      })}
    </div>
  );
};
