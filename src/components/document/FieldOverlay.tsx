/**
 * @license
 * PEI FACILE — Field Overlay Component (Phase 1C R01)
 * Renders L2 (real mapped fields) and L3 (non-printable editing UI) on top of L1.
 * Supports EDIT, PREVIEW, and PRINT modes with viewport-scale invariant positioning.
 */

import React, { useState } from 'react';
import type { TemplateSchemaField, DocumentSurfaceMode } from '../../core/templateSchemaTypes';
import { pdfPointToViewport } from '../../data/geometry/geometryTransform';
import {defaultFieldFontSize} from '../../core/fieldPresentation';
import {SlidersHorizontal} from 'lucide-react';

interface FieldOverlayProps {
  field: TemplateSchemaField;
  value: any;
  onChange?: (val: any) => void;
  mode: DocumentSurfaceMode;
  zoomScale: number;
  isActive?: boolean;
  onFocus?: () => void;
  onProperties?:()=>void;
}

export const FieldOverlay: React.FC<FieldOverlayProps> = ({
  field,
  value,
  onChange,
  mode,
  zoomScale,
  isActive = false,
  onFocus,
  onProperties,
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

  const displayValue = field.inputType === 'checkbox' ? (value === true ? '☑' : '☐') : value !== undefined && value !== null ? String(value) : '';
  const isFilled = displayValue.trim().length > 0;

  // Compute responsive font size based on height and zoom
  const baseFontSizePt=field.presentation?.fontSizePt??defaultFieldFontSize(field);
  const currentFontSizePx=field.presentation?baseFontSizePt*zoomScale:Math.max(9,Math.round(baseFontSizePt*zoomScale));
  const textStyle:React.CSSProperties={fontWeight:field.presentation?.bold?'bold':'normal',fontStyle:field.presentation?.italic?'italic':'normal',textDecoration:field.presentation?.underline?'underline':'none'};
  const source=field.sourceGeometry;
  const mask=source&&field.originalValue!==undefined&&String(field.originalValue)!==''?pdfPointToViewport(source.xPt,source.yPt,source.widthPt,source.heightPt,zoomScale):null;
  const withOriginalMask=(content:React.ReactNode)=><>{mask&&<div aria-hidden="true" className="absolute pointer-events-none bg-white" style={{left:mask.leftPx,top:mask.topPx,width:mask.widthPx,height:mask.heightPx}}/>}{content}</>;

  // An unchanged observed value is already present in the source raster.
  if (mode !== 'EDIT' && !field.presentation && field.originalValue !== undefined && String(value ?? '') === String(field.originalValue)) return null;

  // In PRINT mode: strictly print typography, no L3 borders, no background
  if (mode === 'PRINT') {
    return withOriginalMask(
      <div
        id={`overlay-print-${field.templateFieldId}`}
        className={`absolute pointer-events-none select-none overflow-hidden font-sans text-stone-900 leading-tight ${
          field.backgroundMode === 'OPAQUE_WHITE' ? 'bg-white' : ''
        }`}
        style={{
          ...textStyle,
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
    return withOriginalMask(
      <div
        id={`overlay-preview-${field.templateFieldId}`}
        className={`absolute pointer-events-none select-none overflow-hidden font-sans text-stone-900 leading-tight ${
          field.backgroundMode === 'OPAQUE_WHITE' ? 'bg-white' : ''
        }`}
        style={{
          ...textStyle,
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
  return withOriginalMask(
    <div
      id={`overlay-container-${field.templateFieldId}`}
      className={`absolute transition-colors group ${
        field.backgroundMode === 'OPAQUE_WHITE' ? 'bg-white' : ''
      } ${
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
      {field.inputType === 'checkbox' ? (
        <input id={`input-${field.templateFieldId}`} aria-label={field.label} type="checkbox" checked={value===true} onChange={e=>onChange?.(e.target.checked)} onFocus={onFocus} className="w-full h-full"/>
      ) : field.inputType === 'select' ? (
        <select id={`input-${field.templateFieldId}`} aria-label={field.label} value={value??''} onChange={e=>onChange?.(e.target.value)} onFocus={onFocus} className="w-full h-full bg-transparent" style={{...textStyle,fontSize:currentFontSizePx}}>
          <option value=""></option>{field.options?.map(option=><option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.fieldType === 'TEXT_LONG' ? (
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
            ...textStyle,
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
            ...textStyle,
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
          {onProperties&&<button type="button" aria-label={`Proprietà campo: ${field.label}`} className="pointer-events-auto inline-flex items-center gap-1 rounded bg-white/15 px-2 py-1 hover:bg-white/25 cursor-pointer" onClick={e=>{e.stopPropagation();onProperties();}}><SlidersHorizontal size={13}/>Proprietà</button>}
        </div>
      )}
    </div>
  );
};
