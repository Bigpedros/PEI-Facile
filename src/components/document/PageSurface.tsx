/**
 * @license
 * PEI FACILE — Page Surface Component (Phase 1C R01)
 * Renders an authentic PDF page (L1) via PDF.js on a high-fidelity canvas,
 * overlaid with mapped fields (L2) and non-printable editing adornments (L3).
 */

import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TemplateSchemaField, DocumentSurfaceMode } from '../../core/templateSchemaTypes';
import { FieldOverlay } from './FieldOverlay';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from '../../data/geometry/geometryTransform';

interface PageSurfaceProps {
  pageNumber: number;
  pdfDoc: PDFDocumentProxy | null;
  widthPt?: number;
  heightPt?: number;
  fields: TemplateSchemaField[];
  values: Record<string, any>;
  onFieldValueChange?: (fieldId: string, value: any) => void;
  activeFieldId?: string;
  onFieldFocus?: (fieldId: string) => void;
  mode: DocumentSurfaceMode;
  zoomScale: number;
  className?: string;
}

export const PageSurface: React.FC<PageSurfaceProps> = ({
  pageNumber,
  pdfDoc,
  widthPt = A4_WIDTH_PT,
  heightPt = A4_HEIGHT_PT,
  fields,
  values,
  onFieldValueChange,
  activeFieldId,
  onFieldFocus,
  mode,
  zoomScale,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderStatus, setRenderStatus] = useState<'IDLE' | 'RENDERING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [renderError, setRenderError] = useState<string | null>(null);

  // Exact target dimensions in viewport pixels
  const viewportWidthPx = Math.round(widthPt * zoomScale);
  const viewportHeightPx = Math.round(heightPt * zoomScale);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: any = null;

    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      setRenderStatus('RENDERING');
      setRenderError(null);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: zoomScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Set display dimensions & backing store
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        // Render PDF page to canvas
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        await renderTask.promise;
        if (!isCancelled) {
          setRenderStatus('SUCCESS');
        }
      } catch (err: any) {
        if (!isCancelled && err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNumber} rendering error:`, err);
          setRenderStatus('ERROR');
          setRenderError(err?.message || 'Errore nel rendering della pagina');
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask && typeof renderTask.cancel === 'function') {
        try {
          renderTask.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDoc, pageNumber, zoomScale]);

  return (
    <div
      id={`document-page-${pageNumber}`}
      className={`relative bg-white shadow-xl border border-stone-300 overflow-hidden mx-auto my-4 transition-transform select-none ${className}`}
      style={{
        width: `${viewportWidthPx}px`,
        height: `${viewportHeightPx}px`,
      }}
    >
      {/* ============================================================ */}
      {/* L1: SUPERFICIE REALE DEL MODELLO (PDF.js Canvas)             */}
      {/* ============================================================ */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block pointer-events-none"
        style={{
          width: `${viewportWidthPx}px`,
          height: `${viewportHeightPx}px`,
        }}
      />

      {/* Loading Placeholder */}
      {renderStatus === 'RENDERING' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-50/70 backdrop-blur-xs z-10 pointer-events-none">
          <div className="w-8 h-8 border-3 border-stone-400 border-t-amber-800 rounded-full animate-spin mb-2" />
          <span className="text-xs font-mono text-stone-600 font-semibold">
            Caricamento pagina reale #{pageNumber}...
          </span>
        </div>
      )}

      {/* Render Error Placeholder */}
      {renderStatus === 'ERROR' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50/90 text-rose-800 p-6 text-center z-10">
          <p className="text-sm font-bold">Impossibile renderizzare la pagina #{pageNumber}</p>
          <p className="text-xs font-mono mt-1 text-rose-600">{renderError}</p>
        </div>
      )}

      {/* ============================================================ */}
      {/* L2: CAMPI COMPILABILI MAPPATI & L3: ADORNMENTS               */}
      {/* ============================================================ */}
      <div className="absolute inset-0 pointer-events-auto">
        {fields.map((f) => (
          <FieldOverlay
            key={f.templateFieldId}
            field={f}
            value={values[f.templateFieldId]}
            onChange={(val) => onFieldValueChange?.(f.templateFieldId, val)}
            mode={mode}
            zoomScale={zoomScale}
            isActive={activeFieldId === f.templateFieldId}
            onFocus={() => onFieldFocus?.(f.templateFieldId)}
          />
        ))}
      </div>
    </div>
  );
};
