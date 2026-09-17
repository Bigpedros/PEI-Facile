/**
 * @license
 * PEI FACILE — Field Overlay Component (Phase 1C R01)
 * Renders L2 (real mapped fields) and L3 (non-printable editing UI) on top of L1.
 * Supports EDIT, PREVIEW, and PRINT modes with viewport-scale invariant positioning.
 */

import React, { useState } from 'react';
import type { TemplateSchemaField, DocumentSurfaceMode } from '../../core/templateSchemaTypes';
import { pdfPointToViewport } from '../../data/geometry/geometryTransform';

interface FieldOverlayProps {
  field: TemplateSchemaField;
  value: any;
  onChange?: (val: any) => void;
  mode: DocumentSurfaceMode;
  zoomScale: number;
  isActive?: boolean;
  onFocus?: () => void;
}

export const FieldOverlay: React.FC<FieldOverlayProps> = ({
  field,
  value,
  onChange,
  mode,
  zoomScale,
  isActive = false,
  onFocus,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Convert canonical PDF points (72 pt/in) to current viewport pixels
  const vp = pdfPointToViewport(
    field.geometry.xPt,
    field.geometry.yPt,
    field.geometry.widthPt,
    field.geometry.heightPt,
    zoomScale
  );

  const displayValue = value !== undefined && value !== null ? String(value) : '';
  const isFilled = displayValue.trim().length > 0;

  // Compute responsive font size based on height and zoom
  const baseFontSizePt = field.fieldType === 'TEXT_LONG' ? 10 : Math.min(11, Math.max(8, field.geometry.heightPt * 0.55));
  const currentFontSizePx = Math.max(9, Math.round(baseFontSizePt * zoomScale));

  // In PRINT mode: strictly print typography, no L3 borders, no background
  if (mode === 'PRINT') {
    return (
      <div
        id={`overlay-print-${field.templateFieldId}`}
        className="absolute pointer-events-none select-none overflow-hidden font-sans text-stone-900 leading-tight"
        style={{
          left: `${vp.leftPx}px`,
          top: `${vp.topPx}px`,
          width: `${vp.widthPx}px`,
          height: `${vp.heightPx}px`,
          fontSize: `${currentFontSizePx}px`,
          padding: `${2 * zoomScale}px ${4 * zoomScale}px`,
        }}
      >
        <div className="w-full h-full whitespace-pre-wrap break-words">{displayValue}</div>
      </div>
    );
  }

  // In PREVIEW mode: non-interactive overlay, subtle text rendering, no editing controls
  if (mode === 'PREVIEW') {
    return (
      <div
        id={`overlay-preview-${field.templateFieldId}`}
        className="absolute pointer-events-none select-none overflow-hidden font-sans text-stone-900 leading-tight"
        style={{
          left: `${vp.leftPx}px`,
          top: `${vp.topPx}px`,
          width: `${vp.widthPx}px`,
          height: `${vp.heightPx}px`,
          fontSize: `${currentFontSizePx}px`,
          padding: `${2 * zoomScale}px ${4 * zoomScale}px`,
        }}
        title={`${field.label}: ${displayValue}`}
      >
        <div className="w-full h-full whitespace-pre-wrap break-words">
          {displayValue}
        </div>
      </div>
    );
  }

  // EDIT mode: L2 interactive input + L3 non-printable adornments
  return (
    <div
      id={`overlay-container-${field.templateFieldId}`}
      className={`absolute transition-colors group ${
        isActive ? 'z-30' : 'z-10'
      }`}
      style={{
        left: `${vp.leftPx}px`,
        top: `${vp.topPx}px`,
        width: `${vp.widthPx}px`,
        height: `${vp.heightPx}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onFocus}
    >
      {/* L2: Interactive Input Field */}
      {field.fieldType === 'TEXT_LONG' ? (
        <textarea
          id={`input-${field.templateFieldId}`}
          value={displayValue}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={onFocus}
          placeholder={field.label}
          className={`w-full h-full resize-none font-sans text-stone-950 bg-transparent focus:bg-amber-50/70 outline-none leading-relaxed transition-all ${
            isActive
              ? 'ring-2 ring-amber-700 bg-amber-50/80 rounded-xs'
              : isFilled
              ? 'hover:bg-blue-50/30'
              : 'border border-dashed border-stone-400/60 hover:border-amber-600 bg-amber-50/15'
          }`}
          style={{
            fontSize: `${currentFontSizePx}px`,
            padding: `${3 * zoomScale}px ${4 * zoomScale}px`,
          }}
        />
      ) : (
        <input
          id={`input-${field.templateFieldId}`}
          type={field.fieldType === 'DATE' ? 'date' : 'text'}
          value={displayValue}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={onFocus}
          placeholder={field.label}
          className={`w-full h-full font-sans text-stone-950 bg-transparent focus:bg-amber-50/70 outline-none leading-normal transition-all ${
            isActive
              ? 'ring-2 ring-amber-700 bg-amber-50/80 rounded-xs'
              : isFilled
              ? 'hover:bg-blue-50/30'
              : 'border border-dashed border-stone-400/60 hover:border-amber-600 bg-amber-50/15'
          }`}
          style={{
            fontSize: `${currentFontSizePx}px`,
            padding: `${2 * zoomScale}px ${4 * zoomScale}px`,
          }}
        />
      )}

      {/* L3: Non-printable Editing Adornments (Only visible on focus or hover in EDIT mode) */}
      {(isActive || isHovered) && (
        <div
          id={`badge-l3-${field.templateFieldId}`}
          className="absolute -top-6 left-0 pointer-events-none flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-tight font-semibold bg-stone-900 text-white shadow-md z-40 whitespace-nowrap"
          style={{
            transform: `scale(${Math.max(0.85, Math.min(1.1, 1 / zoomScale))})`,
            transformOrigin: 'bottom left',
          }}
        >
          <span className="truncate max-w-[200px]">{field.label}</span>
          {field.required && <span className="text-amber-400 font-bold">*</span>}
          <span className="text-stone-400 text-[9px] font-mono">[{field.templateFieldId}]</span>
        </div>
      )}
    </div>
  );
};
