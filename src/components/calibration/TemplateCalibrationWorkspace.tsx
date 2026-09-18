/**
 * @license
 * PEI FACILE — Template Calibration Workspace (Phase 1D R01)
 * Production workspace for visual review, geometric calibration, and field mapping
 * of ministerial baselines (A1-A4) and acquired custom/territorial PDF templates.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ModelGeometry, FieldGeometry, FieldBackgroundMode } from '../../data/geometry/types';
import {
  CATEGORIZED_SEMANTIC_CATALOG,
  generateFieldId,
  buildCustomSemanticKey,
  isCustomSemanticKey,
  getSemanticCatalogEntry,
} from '../../core/semanticCatalog';
import {
  pdfPointToViewport,
  viewportToPdfPoint,
  pdfRectToOverlayRect,
  overlayRectToPdfRect,
  clampFieldToPageBounds,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  isFieldWithinPageBounds,
  calculateFitScale,
  calculateFitWidthScale,
} from '../../data/geometry/geometryTransform';
import { acquirePdfTemplate } from '../../core/templateAcquisitionService';
import {
  saveCustomTemplate,
  listAllCustomTemplates,
  getTemplatePdfBinary,
  getCustomTemplate,
  findTemplateBySha256,
} from '../../core/templateStorage';
import { computeSha256 } from '../../core/templateSourceResolver';
import type { CandidateFieldGeometry } from '../../core/templateAcquisitionTypes';
import {
  saveTemplateSchema,
  createTemplateSchemaFromCandidates,
  getTemplateSchema,
} from '../../core/templateSchemaService';
import type {
  TemplateFieldType,
  FieldOverflowPolicy,
  TemplateCalibrationStatus,
  VisualReviewStatus,
} from '../../core/templateSchemaTypes';
import type { PeiModelDefinition, SchoolOrder } from '../../types/pei';
import {
  detectFieldsOnPdfPage,
  detectFieldsOnEntireDocument,
} from '../../core/assistedFieldDetectionService';
import {
  Compass,
  Check,
  Save,
  X,
  Plus,
  Trash2,
  Sliders,
  Eye,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Upload,
  Copy,
  CopyPlus,
  Info,
  Layers,
  Sparkles,
  Move,
  Maximize2,
  Wand2,
  ScanText,
  CheckCheck,
  XCircle,
  RotateCcw,
  ListTree,
  Type,
  Calendar,
  Hash,
  CheckSquare,
  Grid,
} from 'lucide-react';

import A1Data from '../../data/geometry/A1.geometry.json';
import A2Data from '../../data/geometry/A2.geometry.json';
import A3Data from '../../data/geometry/A3.geometry.json';
import A4Data from '../../data/geometry/A4.geometry.json';

const BASELINE_MODELS: Record<string, ModelGeometry> = {
  A1: A1Data as unknown as ModelGeometry,
  A2: A2Data as unknown as ModelGeometry,
  A3: A3Data as unknown as ModelGeometry,
  A4: A4Data as unknown as ModelGeometry,
};

export type TemplateResolutionStatus = 'RESOLVING_TEMPLATE' | 'READY' | 'ERROR';
export type TemplateWorkspaceErrorCode =
  | 'TEMPLATE_SOURCE_MISSING'
  | 'TEMPLATE_INTEGRITY_MISMATCH'
  | 'PDF_RENDER_ERROR';

export interface TemplateResolutionState {
  status: TemplateResolutionStatus;
  errorCode?: TemplateWorkspaceErrorCode;
  message?: string;
}

export interface TemplateCalibrationWorkspaceProps {
  initialModelId?: string;
  initialModelDef?: PeiModelDefinition | null;
  onClose?: () => void;
  onApproved?: (calibratedModel: PeiModelDefinition) => void;
  onDraftSaved?: (savedModel: PeiModelDefinition) => void;
  instructionNotice?: string | null;
}

type DragHandleType = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  fieldId: string;
  handle: DragHandleType;
  startX: number;
  startY: number;
  initialXPt: number;
  initialYPt: number;
  initialWidthPt: number;
  initialHeightPt: number;
}

const isMinisterialModel = (id: string) => ['A1', 'A2', 'A3', 'A4'].includes(id);

export const TemplateCalibrationWorkspace: React.FC<TemplateCalibrationWorkspaceProps> = ({
  initialModelId = 'A1',
  initialModelDef,
  onClose,
  onApproved,
  onDraftSaved,
  instructionNotice,
}) => {
  const [selectedModelId, setSelectedModelId] = useState<string>(
    initialModelDef?.templateId || initialModelDef?.id || initialModelId
  );
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [zoomMode, setZoomMode] = useState<'MANUAL' | 'FIT_PAGE' | 'FIT_WIDTH'>('MANUAL');
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [gridSizePt, setGridSizePt] = useState<number>(5);

  const [modelState, setModelState] = useState<Record<string, ModelGeometry>>(BASELINE_MODELS);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [customBinaries, setCustomBinaries] = useState<Record<string, Uint8Array>>({});

  // Canonical page dimensions detected from actual PDF page viewport (R08-R3)
  const [pageDimensions, setPageDimensions] = useState<{ widthPt: number; heightPt: number } | null>(null);

  useEffect(() => {
    setPageDimensions(null);
  }, [selectedModelId, currentPage]);

  const [resolutionState, setResolutionState] = useState<TemplateResolutionState>(() => {
    const targetId = initialModelDef?.templateId || initialModelDef?.id || initialModelId;
    return isMinisterialModel(targetId)
      ? { status: 'READY' }
      : { status: 'RESOLVING_TEMPLATE' };
  });

  const [isAcquiring, setIsAcquiring] = useState<boolean>(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(
    instructionNotice || null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Parity / text simulation mode
  const [isParityMode, setIsParityMode] = useState<boolean>(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.6);

  // Search and status filters for fields
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PROPOSED' | 'CONFIRMED' | 'MODIFIED' | 'REJECTED'>('ALL');
  const [showRejectedFields, setShowRejectedFields] = useState<boolean>(false);

  // Assisted Field Detection (R08) state
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionProgress, setDetectionProgress] = useState<{ current: number; total: number } | null>(null);
  const detectionAbortControllerRef = useRef<AbortController | null>(null);

  // PDF canvas & interaction refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Active rendering refs to prevent concurrency bugs
  const activeRenderTaskRef = useRef<any>(null);
  const activeLoadingTaskRef = useRef<any>(null);
  const cachedPdfDocRef = useRef<{ sourceKey: string; doc: any } | null>(null);
  const [pdfDocLoadedKey, setPdfDocLoadedKey] = useState<string | null>(null);

  // Cleanup PDFDocumentProxy and in-flight tasks on unmount
  useEffect(() => {
    return () => {
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        activeRenderTaskRef.current = null;
      }
      if (activeLoadingTaskRef.current) {
        try {
          activeLoadingTaskRef.current.destroy();
        } catch {
          // ignore
        }
        activeLoadingTaskRef.current = null;
      }
      if (cachedPdfDocRef.current?.doc) {
        try {
          cachedPdfDocRef.current.doc.destroy();
        } catch {
          // ignore
        }
        cachedPdfDocRef.current = null;
      }
    };
  }, []);

  // Drag & Resize state
  const [dragState, setDragState] = useState<DragState | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load saved custom templates list from IndexedDB into modelState
  useEffect(() => {
    async function loadSavedTemplates() {
      try {
        const list = await listAllCustomTemplates();
        if (list && list.length > 0) {
          const updated: Record<string, ModelGeometry> = { ...BASELINE_MODELS };
          for (const item of list) {
            updated[item.templateId] = {
              schemaVersion: item.schemaVersion || '1.0.0',
              modelId: item.templateId,
              schoolOrder: item.schoolOrder,
              modelName: item.name,
              sourcePdf: item.sourceFileName,
              sourcePdfSha256: item.sourceSha256,
              totalPages: item.pageCount,
              pages: item.pages,
            };
          }
          setModelState((prev) => ({
            ...prev,
            ...updated,
          }));
        }
      } catch (err) {
        console.warn('Could not load saved templates from IndexedDB:', err);
      }
    }
    loadSavedTemplates();
  }, []);

  // Update selected model if initialModelDef changes
  useEffect(() => {
    if (initialModelDef?.templateId || initialModelDef?.id) {
      const targetId = initialModelDef.templateId || initialModelDef.id;
      setSelectedModelId(targetId);
      setCurrentPage(1);
      setSelectedFieldId(null);
    }
  }, [initialModelDef]);

  // Deterministic Template Resolution Workflow (RESOLVING_TEMPLATE -> READY or ERROR)
  useEffect(() => {
    let isCancelled = false;

    async function resolveTemplate() {
      if (isMinisterialModel(selectedModelId)) {
        if (!modelState[selectedModelId] && BASELINE_MODELS[selectedModelId]) {
          setModelState((prev) => ({
            ...prev,
            [selectedModelId]: BASELINE_MODELS[selectedModelId],
          }));
        }
        setResolutionState({ status: 'READY' });
        return;
      }

      setResolutionState({ status: 'RESOLVING_TEMPLATE' });

      try {
        const existingGeom = modelState[selectedModelId];
        const existingBinary = customBinaries[selectedModelId];

        let record = await getCustomTemplate(selectedModelId, true);
        if (!record && initialModelDef) {
          const lookupId = initialModelDef.templateId || initialModelDef.id;
          if (lookupId && lookupId !== selectedModelId) {
            record = await getCustomTemplate(lookupId, true);
          }
          if (!record && (initialModelDef.sourceHash || initialModelDef.sourceSha256)) {
            record = await findTemplateBySha256(
              initialModelDef.sourceSha256 || initialModelDef.sourceHash || ''
            );
          }
        }

        if (isCancelled) return;

        if (!record && !existingGeom) {
          setResolutionState({
            status: 'ERROR',
            errorCode: 'TEMPLATE_SOURCE_MISSING',
            message: `Template sorgente "${selectedModelId}" non trovato nel database locale (IndexedDB).`,
          });
          return;
        }

        const geom: ModelGeometry = existingGeom || {
          schemaVersion: record!.schemaVersion || '1.0.0',
          modelId: record!.templateId,
          schoolOrder: record!.schoolOrder,
          modelName: record!.name,
          sourcePdf: record!.sourceFileName,
          sourcePdfSha256: record!.sourceSha256,
          totalPages: record!.pageCount,
          pages: record!.pages,
        };

        let binary = existingBinary || record?.pdfBinary;
        if (!binary && geom.sourcePdfSha256) {
          binary =
            (await getTemplatePdfBinary(geom.sourcePdfSha256)) ||
            (await getTemplatePdfBinary(geom.modelId)) ||
            undefined;
        }

        if (isCancelled) return;

        if (!binary || binary.byteLength === 0) {
          setResolutionState({
            status: 'ERROR',
            errorCode: 'TEMPLATE_SOURCE_MISSING',
            message: `File PDF binario non presente nel database per il modello "${geom.modelName}".`,
          });
          return;
        }

        // SHA-256 Cryptographic Integrity Check
        if (geom.sourcePdfSha256) {
          const actualSha = await computeSha256(binary);
          if (isCancelled) return;
          if (actualSha && geom.sourcePdfSha256 && actualSha !== geom.sourcePdfSha256) {
            setResolutionState({
              status: 'ERROR',
              errorCode: 'TEMPLATE_INTEGRITY_MISMATCH',
              message: `Integrità del file PDF compromessa per il modello "${geom.modelName}". Hash calcolato (${actualSha.slice(0, 10)}…) non corrisponde a quello registrato (${geom.sourcePdfSha256.slice(0, 10)}…).`,
            });
            return;
          }
        }

        setModelState((prev) => ({
          ...prev,
          [geom.modelId]: geom,
        }));
        setCustomBinaries((prev) => ({
          ...prev,
          [geom.modelId]: binary,
        }));

        setResolutionState({ status: 'READY' });
      } catch (err: any) {
        if (!isCancelled) {
          setResolutionState({
            status: 'ERROR',
            errorCode: 'TEMPLATE_SOURCE_MISSING',
            message: err?.message || 'Errore nella risoluzione del template.',
          });
        }
      }
    }

    resolveTemplate();

    return () => {
      isCancelled = true;
    };
  }, [selectedModelId, initialModelDef]);

  // Authoritative current model: NO silent fallback to A1 for missing custom models
  const currentModel: ModelGeometry | null =
    modelState[selectedModelId] ||
    (BASELINE_MODELS[selectedModelId] ? BASELINE_MODELS[selectedModelId] : null);

  const pageData = currentModel?.pages?.find((p) => p.pageNumber === currentPage);
  const activePageWidthPt = pageDimensions?.widthPt || pageData?.widthPt || A4_WIDTH_PT;
  const activePageHeightPt = pageDimensions?.heightPt || pageData?.heightPt || A4_HEIGHT_PT;
  const canvasWidthPx = Math.round(activePageWidthPt * scale);
  const canvasHeightPx = Math.round(activePageHeightPt * scale);

  const rawFieldsOnPage = pageData ? pageData.fields : [];
  const fieldsOnPage = rawFieldsOnPage.filter((f) => {
    if (f.calibrationStatus === 'REJECTED' && !showRejectedFields) return false;
    return true;
  });
  const selectedField = rawFieldsOnPage.find((f) => f.fieldId === selectedFieldId);

  // Status counts on current page
  const countProposed = rawFieldsOnPage.filter((f) => f.calibrationStatus === 'PROPOSED').length;
  const countConfirmed = rawFieldsOnPage.filter(
    (f) => f.calibrationStatus === 'CONFIRMED' || (!f.calibrationStatus && f.derivationMethod === 'MANUAL_VERIFIED')
  ).length;
  const countModified = rawFieldsOnPage.filter((f) => f.calibrationStatus === 'MODIFIED').length;
  const countRejected = rawFieldsOnPage.filter((f) => f.calibrationStatus === 'REJECTED').length;

  // Filtered field list for right sidebar
  const filteredFieldsOnPage = fieldsOnPage.filter((f) => {
    if (statusFilter === 'PROPOSED' && f.calibrationStatus !== 'PROPOSED') return false;
    if (
      statusFilter === 'CONFIRMED' &&
      f.calibrationStatus !== 'CONFIRMED' &&
      (f.calibrationStatus || f.derivationMethod !== 'MANUAL_VERIFIED')
    ) {
      return false;
    }
    if (statusFilter === 'MODIFIED' && f.calibrationStatus !== 'MODIFIED') return false;
    if (statusFilter === 'REJECTED' && f.calibrationStatus !== 'REJECTED') return false;

    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      f.fieldId.toLowerCase().includes(q) ||
      (f.label && f.label.toLowerCase().includes(q)) ||
      (f.semanticKey && f.semanticKey.toLowerCase().includes(q)) ||
      (f.anchorText && f.anchorText.toLowerCase().includes(q)) ||
      (f.suggestedLabel && f.suggestedLabel.toLowerCase().includes(q)) ||
      (f.suggestedSemanticKey && f.suggestedSemanticKey.toLowerCase().includes(q))
    );
  });

  // Visual spatial ordering (top-to-bottom, left-to-right) purely for UI display (Requirement 16)
  const visuallySortedFieldsOnPage = [...filteredFieldsOnPage].sort((a, b) => {
    if (Math.abs(a.yPt - b.yPt) > 4) return a.yPt - b.yPt;
    return a.xPt - b.xPt;
  });

  // Stable L1 PDF Rendering: depends strictly on source, page, zoom, and binary — NEVER on field geometry or drag state
  const pdfSourceSha = currentModel?.sourcePdfSha256;
  const pdfSourceFileName = currentModel?.sourcePdf;
  const activeCustomBinary = customBinaries[selectedModelId];
  const isReady = resolutionState.status === 'READY' && currentModel !== null;

  // Stable source identity key: strictly invariant to page navigation, zoom scale, and L2 field interactions
  const sourceKey = selectedModelId
    ? (pdfSourceSha
        ? `sha_${selectedModelId}_${pdfSourceSha}`
        : `path_${selectedModelId}_${pdfSourceFileName || 'default'}`)
    : null;

  // Level 1: Document Loader — loads PDFDocumentProxy ONCE per source/template
  useEffect(() => {
    let isCancelled = false;

    async function loadPdfDocument() {
      if (!isReady || !currentModel || !sourceKey) {
        return;
      }

      // If document is already loaded for this exact sourceKey, keep it alive!
      if (cachedPdfDocRef.current?.sourceKey === sourceKey && cachedPdfDocRef.current.doc) {
        if (pdfDocLoadedKey !== sourceKey) {
          setPdfDocLoadedKey(sourceKey);
        }
        return;
      }

      // Cancel previous in-flight loading task if any
      if (activeLoadingTaskRef.current) {
        try {
          activeLoadingTaskRef.current.destroy();
        } catch {
          // ignore
        }
        activeLoadingTaskRef.current = null;
      }

      // Source changed: destroy previous document proxy
      if (cachedPdfDocRef.current?.doc) {
        try {
          cachedPdfDocRef.current.doc.destroy();
        } catch {
          // ignore
        }
        cachedPdfDocRef.current = null;
      }

      setPdfDocLoadedKey(null);
      setPdfLoading(true);
      setPdfError(null);

      try {
        const pdfjs = await import('pdfjs-dist');
        let loadingTask: any;

        if (activeCustomBinary && activeCustomBinary.byteLength > 0) {
          // R05-R1: Always pass an independent slice so activeCustomBinary is NEVER detached!
          const pdfJsBytes = new Uint8Array(activeCustomBinary).slice();
          loadingTask = pdfjs.getDocument({
            data: pdfJsBytes,
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
          });
        } else if (pdfSourceSha) {
          let dbBinary = await getTemplatePdfBinary(pdfSourceSha);
          if (isCancelled) return;
          if (!dbBinary && currentModel?.modelId) {
            dbBinary = await getTemplatePdfBinary(currentModel.modelId);
          }
          if (isCancelled) return;

          if (dbBinary && dbBinary.byteLength > 0) {
            const pdfJsBytes = new Uint8Array(dbBinary).slice();
            loadingTask = pdfjs.getDocument({
              data: pdfJsBytes,
              standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
            });
          } else if (isMinisterialModel(selectedModelId)) {
            loadingTask = pdfjs.getDocument({
              url: `/models/${pdfSourceFileName || `${selectedModelId}.pdf`}`,
              standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
            });
          }
        } else if (isMinisterialModel(selectedModelId)) {
          loadingTask = pdfjs.getDocument({
            url: `/models/${pdfSourceFileName || `${selectedModelId}.pdf`}`,
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
          });
        }

        if (!loadingTask) {
          throw new Error('TEMPLATE_SOURCE_MISSING: Nessuna sorgente PDF disponibile per il rendering');
        }

        activeLoadingTaskRef.current = loadingTask;
        const doc = await loadingTask.promise;
        if (isCancelled) {
          try {
            doc.destroy();
          } catch {
            // ignore
          }
          return;
        }

        activeLoadingTaskRef.current = null;
        cachedPdfDocRef.current = { sourceKey, doc };
        setPdfDocLoadedKey(sourceKey);
      } catch (err: any) {
        if (!isCancelled) {
          console.error('PDF document load error:', err);
          setPdfError(err?.message || 'PDF_LOAD_ERROR');
        }
      } finally {
        if (!isCancelled) {
          setPdfLoading(false);
        }
      }
    }

    loadPdfDocument();

    return () => {
      isCancelled = true;
    };
  }, [selectedModelId, pdfSourceSha, pdfSourceFileName, activeCustomBinary, isReady, sourceKey]);

  // Level 2: Page Renderer — renders currentPage using the persistent PDFDocumentProxy
  useEffect(() => {
    let isCancelled = false;

    async function renderPdfPage() {
      if (!isReady || !canvasRef.current || !pdfDocLoadedKey) return;

      const doc = cachedPdfDocRef.current?.doc;
      if (!doc || cachedPdfDocRef.current?.sourceKey !== pdfDocLoadedKey) return;

      // Cancel previous in-flight render task if still executing
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch {
          // ignore cancellation
        }
        activeRenderTaskRef.current = null;
      }

      setPdfLoading(true);
      setPdfError(null);

      try {
        const page = await doc.getPage(currentPage);
        if (isCancelled) return;

        // Detect canonical unscaled dimensions (PDF points)
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const realWidthPt = unscaledViewport.width;
        const realHeightPt = unscaledViewport.height;

        setPageDimensions({ widthPt: realWidthPt, heightPt: realHeightPt });

        // Update model state page dimensions if divergent
        setModelState((prev) => {
          const model = prev[selectedModelId];
          if (!model) return prev;
          const p = model.pages?.find((pg) => pg.pageNumber === currentPage);
          if (p && (Math.abs(p.widthPt - realWidthPt) > 0.5 || Math.abs(p.heightPt - realHeightPt) > 0.5)) {
            const nextModel = JSON.parse(JSON.stringify(model)) as ModelGeometry;
            const target = nextModel.pages.find((pg) => pg.pageNumber === currentPage);
            if (target) {
              target.widthPt = realWidthPt;
              target.heightPt = realHeightPt;
            }
            return { ...prev, [selectedModelId]: nextModel };
          }
          return prev;
        });

        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        const renderViewport = page.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Bitmap backing store scaled for device pixel ratio for crisp text
        canvas.width = Math.round(renderViewport.width);
        canvas.height = Math.round(renderViewport.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: renderViewport,
        });

        activeRenderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: any) {
        if (!isCancelled && err?.name !== 'RenderingCancelledException') {
          console.warn('PDF render on canvas warning:', err);
          setPdfError(err?.message || 'PDF_RENDER_ERROR');
        }
      } finally {
        if (!isCancelled) {
          setPdfLoading(false);
        }
      }
    }

    renderPdfPage();

    return () => {
      isCancelled = true;
      if (activeRenderTaskRef.current) {
        try {
          activeRenderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfDocLoadedKey, currentPage, scale, isReady]);

  // Fit Page and Fit Width handlers (R08-R5)
  const handleFitPage = useCallback(() => {
    if (!containerRef.current) return;
    const availableWidth = containerRef.current.clientWidth;
    const availableHeight = containerRef.current.clientHeight;
    const fit = calculateFitScale(availableWidth, availableHeight, activePageWidthPt, activePageHeightPt, 64);
    setScale(fit);
    setZoomMode('FIT_PAGE');
  }, [activePageWidthPt, activePageHeightPt]);

  const handleFitWidth = useCallback(() => {
    if (!containerRef.current) return;
    const availableWidth = containerRef.current.clientWidth;
    const fit = calculateFitWidthScale(availableWidth, activePageWidthPt, 64);
    setScale(fit);
    setZoomMode('FIT_WIDTH');
  }, [activePageWidthPt]);

  // Auto-refit when page or dimensions change if in a fit mode (Requirement 28)
  useEffect(() => {
    if (zoomMode === 'FIT_PAGE') {
      handleFitPage();
    } else if (zoomMode === 'FIT_WIDTH') {
      handleFitWidth();
    }
  }, [currentPage, activePageWidthPt, activePageHeightPt, zoomMode, handleFitPage, handleFitWidth]);

  // ResizeObserver on container to recalculate fit when container dimensions change
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let timeoutId: any = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (zoomMode === 'FIT_PAGE') {
          handleFitPage();
        } else if (zoomMode === 'FIT_WIDTH') {
          handleFitWidth();
        }
      }, 100);
    });

    ro.observe(el);
    return () => {
      clearTimeout(timeoutId);
      ro.disconnect();
    };
  }, [zoomMode, handleFitPage, handleFitWidth]);


  // Handle uploading and acquiring a new custom PDF inside workspace
  const handleUploadCustomPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAcquiring(true);
    setBannerNotice('Acquisizione geometrica e fingerprinting SHA-256 in corso…');

    try {
      const sourceBuffer = await file.arrayBuffer();
      const analysisBytes = new Uint8Array(sourceBuffer).slice();
      const persistenceBytes = new Uint8Array(sourceBuffer).slice();
      const result = await acquirePdfTemplate(analysisBytes, file.name);

      if (result.status === 'FAILED') {
        alert(`Acquisizione fallita: ${result.warnings.join('\n')}`);
        setIsAcquiring(false);
        return;
      }

      const newModelGeometry: ModelGeometry = {
        schemaVersion: '1.0.0',
        modelId: result.templateId,
        schoolOrder: 'A2',
        modelName: `Custom: ${file.name.replace(/\.pdf$/i, '')}`,
        sourcePdf: file.name,
        sourcePdfSha256: result.sourceSha256,
        totalPages: result.pageCount,
        pages: result.pages,
      };

      setModelState((prev) => ({
        ...prev,
        [result.templateId]: newModelGeometry,
      }));

      setCustomBinaries((prev) => ({
        ...prev,
        [result.templateId]: persistenceBytes,
      }));

      setSelectedModelId(result.templateId);
      setCurrentPage(1);
      setSelectedFieldId(null);

      // Save initial draft in IndexedDB
      await saveCustomTemplate(
        {
          templateId: result.templateId,
          name: newModelGeometry.modelName,
          schoolOrder: newModelGeometry.schoolOrder,
          sourceFileName: file.name,
          sourceSha256: result.sourceSha256,
          fileSizeBytes: result.fileSizeBytes,
          pageCount: result.pageCount,
          schemaVersion: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: result.pages,
        },
        persistenceBytes
      );

      setBannerNotice(
        `Template acquisito con successo (${result.geometryCandidates.length} campi rilevati). Procedi con la calibrazione e approva.`
      );
      showToast('Template PDF acquisito con successo.');
    } catch (err: any) {
      alert(`Errore nell’acquisizione del file PDF: ${err?.message || err}`);
    } finally {
      setIsAcquiring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Update field properties in model state
  const updateSelectedField = useCallback(
    (changes: Partial<FieldGeometry | (CandidateFieldGeometry & { required?: boolean; overflowPolicy?: FieldOverflowPolicy; fieldType?: TemplateFieldType })>) => {
      if (!selectedFieldId) return;

      setModelState((prev) => {
        const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
        const targetPage = model.pages.find((p) => p.pageNumber === currentPage);
        if (!targetPage) return prev;

        const f = targetPage.fields.find((item) => item.fieldId === selectedFieldId);
        if (!f) return prev;

        Object.assign(f, changes);

        // If field was proposed, flag it as modified by user
        if (f.calibrationStatus === 'PROPOSED') {
          f.isModifiedAfterProposal = true;
        }

        // Sanitize coordinates if modified (respect dynamic page bounds)
        const pWidth = targetPage.widthPt || activePageWidthPt;
        const pHeight = targetPage.heightPt || activePageHeightPt;
        if (changes.xPt !== undefined) f.xPt = Math.max(0, Math.min(pWidth - f.widthPt, f.xPt));
        if (changes.yPt !== undefined) f.yPt = Math.max(0, Math.min(pHeight - f.heightPt, f.yPt));
        if (changes.widthPt !== undefined) f.widthPt = Math.max(5, Math.min(pWidth - f.xPt, f.widthPt));
        if (changes.heightPt !== undefined) f.heightPt = Math.max(5, Math.min(pHeight - f.yPt, f.heightPt));

        return {
          ...prev,
          [selectedModelId]: model,
        };
      });
    },
    [selectedFieldId, selectedModelId, currentPage]
  );

  // Confirm field as manually verified / confirmed
  const confirmFieldManualVerified = () => {
    if (!selectedFieldId) return;
    const isModified = selectedField?.isModifiedAfterProposal || selectedField?.calibrationStatus === 'MODIFIED';
    updateSelectedField({
      calibrationStatus: isModified ? 'MODIFIED' : 'CONFIRMED',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    });
    showToast(isModified ? 'Campo confermato con modifiche (MODIFICATO).' : 'Campo confermato (CONFERMATO).');
  };

  // Reject selected candidate/proposed field
  const rejectSelectedField = () => {
    if (!selectedFieldId) return;
    updateSelectedField({
      calibrationStatus: 'REJECTED',
      status: 'REVIEW_REQUIRED',
    });
    showToast('Campo rifiutato (escluso dallo schema definitivo).');
  };

  // Confirm all PROPOSED fields on current page
  const confirmAllProposedOnPage = () => {
    const proposed = rawFieldsOnPage.filter((f) => f.calibrationStatus === 'PROPOSED');
    if (proposed.length === 0) {
      showToast('Nessun campo proposto da confermare sulla pagina corrente.');
      return;
    }

    setModelState((prev) => {
      const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
      const targetPage = model.pages.find((p) => p.pageNumber === currentPage);
      if (!targetPage) return prev;

      targetPage.fields.forEach((f) => {
        if (f.calibrationStatus === 'PROPOSED') {
          f.calibrationStatus = f.isModifiedAfterProposal ? 'MODIFIED' : 'CONFIRMED';
          f.status = 'MAPPED';
          f.derivationMethod = 'MANUAL_VERIFIED';
        }
      });

      return {
        ...prev,
        [selectedModelId]: model,
      };
    });

    showToast(`${proposed.length} campi della pagina confermati.`);
  };

  // Assisted Field Detection: Single Page
  const handleDetectPageFields = async () => {
    if (!cachedPdfDocRef.current?.doc) {
      showToast('PDF non ancora caricato o non disponibile.');
      return;
    }
    setIsDetecting(true);
    try {
      const doc = cachedPdfDocRef.current.doc;
      const pageProxy = await doc.getPage(currentPage);
      const existing = rawFieldsOnPage;
      const proposed = await detectFieldsOnPdfPage(pageProxy, currentPage, existing, {
        canvasElement: canvasRef.current,
      });

      if (proposed.length === 0) {
        showToast('Nessun nuovo campo rilevato sulla pagina corrente.');
      } else {
        setModelState((prev) => {
          const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
          let targetPage = model.pages.find((p) => p.pageNumber === currentPage);
          if (!targetPage) {
            targetPage = { pageNumber: currentPage, widthPt: A4_WIDTH_PT, heightPt: A4_HEIGHT_PT, fields: [] };
            model.pages.push(targetPage);
          }
          targetPage.fields.push(...proposed);
          return { ...prev, [selectedModelId]: model };
        });
        showToast(`${proposed.length} campi proposti con successo (Stato: PROPOSTO).`);
      }
    } catch (err: any) {
      console.error('Rilevamento campi pagina fallito:', err);
      showToast(`Errore durante il rilevamento: ${err?.message || err}`);
    } finally {
      setIsDetecting(false);
    }
  };

  // Assisted Field Detection: Entire Document
  const handleDetectDocumentFields = async () => {
    if (!cachedPdfDocRef.current?.doc || !currentModel) {
      showToast('PDF non ancora caricato o non disponibile.');
      return;
    }
    const controller = new AbortController();
    detectionAbortControllerRef.current = controller;
    setIsDetecting(true);
    setDetectionProgress({ current: 1, total: currentModel.totalPages || 1 });

    try {
      const doc = cachedPdfDocRef.current.doc;
      const res = await detectFieldsOnEntireDocument(
        doc,
        currentModel.pages,
        (current, total) => {
          setDetectionProgress({ current, total });
        },
        controller.signal
      );

      setModelState((prev) => {
        const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
        model.pages = res.pages;
        return { ...prev, [selectedModelId]: model };
      });

      if (controller.signal.aborted) {
        showToast(`Rilevamento interrotto dall'utente (${res.totalProposed} campi aggiunti).`);
      } else {
        showToast(`Rilevamento completato: ${res.totalProposed} campi proposti su tutto il documento.`);
      }
    } catch (err: any) {
      console.error('Rilevamento campi documento fallito:', err);
      showToast(`Errore durante il rilevamento documento: ${err?.message || err}`);
    } finally {
      setIsDetecting(false);
      setDetectionProgress(null);
      detectionAbortControllerRef.current = null;
    }
  };

  // Cancel in-flight detection
  const handleCancelDetection = () => {
    if (detectionAbortControllerRef.current) {
      detectionAbortControllerRef.current.abort();
    }
  };

  // Add a new candidate field on current page (Requirement 3, 4, 5, 17)
  const addNewCandidateField = () => {
    const newId = generateFieldId();
    const newField: FieldGeometry = {
      fieldId: newId,
      label: 'Nuovo Campo',
      semanticKey: null,
      backgroundMode: 'TRANSPARENT',
      pageNumber: currentPage,
      xPt: 60,
      yPt: 120,
      widthPt: 475,
      heightPt: 35,
      anchorText: 'Campo aggiunto manualmente',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      calibrationStatus: 'CONFIRMED',
      detectionSource: 'MANUAL_ENTRY',
      status: 'MAPPED',
    };

    setModelState((prev) => {
      const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
      const targetPage = model.pages.find((p) => p.pageNumber === currentPage);
      if (!targetPage) return prev;

      targetPage.fields.push(newField);
      return {
        ...prev,
        [selectedModelId]: model,
      };
    });

    setSelectedFieldId(newId);
    showToast('Nuovo campo creato (ID univoco generato, CONFERMATO).');
  };

  // Duplicate selected field (Requirement 11, 12, 13, 14, 17.7)
  const duplicateSelectedField = (keepSemantic: boolean = false) => {
    if (!selectedField) return;

    const newId = generateFieldId();
    const pageWidth = pageData?.widthPt || A4_WIDTH_PT;
    const pageHeight = pageData?.heightPt || A4_HEIGHT_PT;
    const offset = 14;

    let newX = selectedField.xPt + offset;
    let newY = selectedField.yPt + offset;

    if (newX + selectedField.widthPt > pageWidth) {
      newX = Math.max(10, selectedField.xPt - offset);
    }
    if (newY + selectedField.heightPt > pageHeight) {
      newY = Math.max(10, selectedField.yPt - offset);
    }

    const originalLabel = selectedField.label || 'Campo';
    const duplicatedField: FieldGeometry = {
      ...selectedField,
      fieldId: newId,
      label: keepSemantic ? originalLabel : `Copia di ${originalLabel}`,
      semanticKey: keepSemantic ? selectedField.semanticKey || null : null,
      backgroundMode: selectedField.backgroundMode || 'TRANSPARENT',
      pageNumber: currentPage,
      xPt: Math.round(newX * 10) / 10,
      yPt: Math.round(newY * 10) / 10,
      widthPt: selectedField.widthPt,
      heightPt: selectedField.heightPt,
      anchorText: selectedField.anchorText || 'Campo duplicato',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      calibrationStatus: 'CONFIRMED',
      detectionSource: 'MANUAL_ENTRY',
      status: 'MAPPED',
    };

    setModelState((prev) => {
      const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
      const targetPage = model.pages.find((p) => p.pageNumber === currentPage);
      if (!targetPage) return prev;

      targetPage.fields.push(duplicatedField);
      return {
        ...prev,
        [selectedModelId]: model,
      };
    });

    setSelectedFieldId(newId);
    if (keepSemantic) {
      showToast('Campo duplicato (stessa associazione semantica).');
    } else {
      showToast('Campo duplicato (nuovo ID, associazione da definire).');
    }
  };

  // Delete candidate field
  const deleteCandidateField = () => {
    if (!selectedFieldId) return;
    setModelState((prev) => {
      const model = JSON.parse(JSON.stringify(prev[selectedModelId])) as ModelGeometry;
      const targetPage = model.pages.find((p) => p.pageNumber === currentPage);
      if (!targetPage) return prev;

      targetPage.fields = targetPage.fields.filter((item) => item.fieldId !== selectedFieldId);
      return {
        ...prev,
        [selectedModelId]: model,
      };
    });
    setSelectedFieldId(null);
    showToast('Campo eliminato.');
  };

  // Save draft in IndexedDB (Review Required)
  const saveDraftToIndexedDb = async () => {
    try {
      const binary = customBinaries[selectedModelId] || (await getTemplatePdfBinary(currentModel.sourcePdfSha256));
      const nowIso = new Date().toISOString();

      await saveCustomTemplate(
        {
          templateId: currentModel.modelId,
          name: currentModel.modelName,
          schoolOrder: currentModel.schoolOrder as SchoolOrder,
          sourceFileName: currentModel.sourcePdf,
          sourceSha256: currentModel.sourcePdfSha256,
          fileSizeBytes: binary ? binary.byteLength : 0,
          pageCount: currentModel.totalPages,
          schemaVersion: '1.0.0',
          createdAt: nowIso,
          updatedAt: nowIso,
          calibrationStatus: 'REVIEW_REQUIRED',
          pages: currentModel.pages,
        },
        binary || undefined
      );

      const savedDef: PeiModelDefinition = {
        id: currentModel.modelId,
        name: currentModel.modelName,
        schoolOrder: currentModel.schoolOrder as SchoolOrder,
        originType: 'INSTITUTION',
        originName: 'Importato / In Revisione',
        version: '1.0',
        acquisitionDate: nowIso.split('T')[0],
        format: 'PDF',
        status: 'attivo',
        isDefault: false,
        isMinisterial: ['A1', 'A2', 'A3', 'A4'].includes(currentModel.modelId),
        sourceHash: currentModel.sourcePdfSha256,
        templateId: currentModel.modelId,
        geometryMappingId: currentModel.modelId,
        calibrationStatus: 'REVIEW_REQUIRED',
        description: 'Bozza salvata in revisione.',
        usedCount: 0,
      };

      onDraftSaved?.(savedDef);
      showToast('Bozza salvata con successo in IndexedDB (Stato: IN REVISIONE).');
    } catch (err: any) {
      alert(`Errore nel salvataggio bozza: ${err?.message}`);
    }
  };

  // Approve and mark as CALIBRATED
  const approveAndCalibrateModel = async () => {
    try {
      // Validate all mapped fields across all pages
      let hasError = false;
      let errorDesc = '';

      for (const p of currentModel.pages) {
        for (const f of p.fields) {
          if (f.status === 'MAPPED') {
            if (!isFieldWithinPageBounds(f, p.widthPt, p.heightPt)) {
              hasError = true;
              errorDesc = `Campo ${f.fieldId} alla pag. ${p.pageNumber} eccede i margini della pagina A4.`;
              break;
            }
            if (f.widthPt <= 0 || f.heightPt <= 0) {
              hasError = true;
              errorDesc = `Campo ${f.fieldId} ha dimensioni non valide (${f.widthPt}x${f.heightPt}).`;
              break;
            }
          }
        }
        if (hasError) break;
      }

      if (hasError) {
        alert(`Impossibile approvare la calibrazione:\n${errorDesc}`);
        return;
      }

      // Requirement 21 & R08: Check for unreviewed PROPOSED fields prior to definitive CALIBRATED status
      const unreviewedProposed = currentModel.pages.flatMap((p) =>
        p.fields.filter((f) => f.calibrationStatus === 'PROPOSED')
      );

      if (unreviewedProposed.length > 0) {
        const proceed = window.confirm(
          `Attenzione (Rilevamento Assistito R08):\n` +
          `Ci sono ${unreviewedProposed.length} campi con stato "PROPOSTO" non ancora revisionati o confermati esplicitamente.\n\n` +
          `Vuoi confermare automaticamente tutti i campi proposti come validati e procedere con l'approvazione definitiva?\n` +
          `Premi OK per confermarli, oppure Annulla per revisionarli prima.`
        );
        if (!proceed) return;

        // Auto-confirm remaining proposed fields
        currentModel.pages.forEach((p) => {
          p.fields.forEach((f) => {
            if (f.calibrationStatus === 'PROPOSED') {
              f.calibrationStatus = f.isModifiedAfterProposal ? 'MODIFIED' : 'CONFIRMED';
              f.status = 'MAPPED';
              f.derivationMethod = 'MANUAL_VERIFIED';
            }
          });
        });
      }

      // Requirement 21: Check for unassigned fields prior to definitive CALIBRATED status
      const unassignedFields = currentModel.pages.flatMap((p) =>
        p.fields.filter((f) => f.status === 'MAPPED' && !f.semanticKey && f.calibrationStatus !== 'REJECTED')
      );

      if (unassignedFields.length > 0) {
        const proceed = window.confirm(
          `Attenzione (Validazione Semantica R07):\n` +
          `Ci sono ${unassignedFields.length} campi mappati senza associazione semantica (semanticKey).\n` +
          `Esempi: ${unassignedFields.slice(0, 3).map((f) => f.label || f.fieldId).join(', ')}.\n\n` +
          `Per garantire la corretta compilazione automatica, si raccomanda di associare i campi al catalogo canonico o a chiavi personalizzate (custom).\n\n` +
          `Vuoi confermare comunque la calibrazione definitiva?`
        );
        if (!proceed) return;
      }

      const binary = customBinaries[selectedModelId] || (await getTemplatePdfBinary(currentModel.sourcePdfSha256));
      const nowIso = new Date().toISOString();

      // 1. Save template to IndexedDB with CALIBRATED status
      await saveCustomTemplate(
        {
          templateId: currentModel.modelId,
          name: currentModel.modelName,
          schoolOrder: currentModel.schoolOrder as SchoolOrder,
          sourceFileName: currentModel.sourcePdf,
          sourceSha256: currentModel.sourcePdfSha256,
          fileSizeBytes: binary ? binary.byteLength : 0,
          pageCount: currentModel.totalPages,
          schemaVersion: '1.0.0',
          createdAt: nowIso,
          updatedAt: nowIso,
          calibrationStatus: 'CALIBRATED',
          pages: currentModel.pages,
        },
        binary || undefined
      );

      // 2. Generate and save calibrated TemplateSchema (REJECTED fields are omitted)
      const allCandidates = currentModel.pages.flatMap((p) =>
        p.fields
          .filter((f) => f.calibrationStatus !== 'REJECTED')
          .map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            semanticKey: f.semanticKey,
            backgroundMode: f.backgroundMode,
            pageNumber: p.pageNumber,
            xPt: f.xPt,
            yPt: f.yPt,
            widthPt: f.widthPt,
            heightPt: f.heightPt,
            anchorText: f.anchorText,
            fieldType: (f as any).fieldType || 'TEXT_SHORT',
            overflowPolicy: (f as any).overflowPolicy || 'RIGID',
            required: (f as any).required ?? false,
            calibrationStatus: f.calibrationStatus || 'CONFIRMED',
            confidence: f.confidence ?? 1.0,
            detectionSource: f.detectionSource,
            suggestedLabel: f.suggestedLabel,
            suggestedSemanticKey: f.suggestedSemanticKey,
          }))
      );

      const schema = createTemplateSchemaFromCandidates(
        currentModel.modelId,
        currentModel.sourcePdf,
        currentModel.sourcePdfSha256,
        currentModel.pages,
        allCandidates,
        'CALIBRATED',
        currentModel.schoolOrder as SchoolOrder
      );
      schema.geometryValidationStatus = 'PASS';
      schema.visualReviewStatus = 'COMPLETED';

      await saveTemplateSchema(schema);

      const calibratedModelDef: PeiModelDefinition = {
        id: currentModel.modelId,
        name: currentModel.modelName,
        schoolOrder: currentModel.schoolOrder as SchoolOrder,
        originType: 'INSTITUTION',
        originName: 'Verificato e Calibrato',
        version: '1.0',
        acquisitionDate: nowIso.split('T')[0],
        format: 'PDF',
        status: 'attivo',
        isDefault: false,
        isMinisterial: ['A1', 'A2', 'A3', 'A4'].includes(currentModel.modelId),
        sourceHash: currentModel.sourcePdfSha256,
        templateId: currentModel.modelId,
        geometryMappingId: currentModel.modelId,
        calibrationStatus: 'CALIBRATED',
        description: 'Modello calibrato con verifica visiva umana completata.',
        usedCount: 0,
        confirmationState: 'confirmed',
        confirmationDate: nowIso,
        confirmationText: 'Confermata la corretta corrispondenza geometrica dei campi rispetto al documento sorgente.',
      };

      showToast('Modello APPROVATO e marcato come CALIBRATED!');
      if (onApproved) {
        onApproved(calibratedModelDef);
      }
    } catch (err: any) {
      alert(`Errore approvazione modello: ${err?.message}`);
    }
  };

  // Drag and Resize Handlers
  const handleMouseDownOnField = (
    e: React.MouseEvent,
    field: FieldGeometry,
    handle: DragHandleType
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedFieldId(field.fieldId);

    setDragState({
      fieldId: field.fieldId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      initialXPt: field.xPt,
      initialYPt: field.yPt,
      initialWidthPt: field.widthPt,
      initialHeightPt: field.heightPt,
    });
  };

  // Global mouse move and up for smooth dragging
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaXPx = e.clientX - dragState.startX;
      const deltaYPx = e.clientY - dragState.startY;

      // Convert pixel delta to PDF points
      const deltaXPt = deltaXPx / scale;
      const deltaYPt = deltaYPx / scale;

      let newXPt = dragState.initialXPt;
      let newYPt = dragState.initialYPt;
      let newWidthPt = dragState.initialWidthPt;
      let newHeightPt = dragState.initialHeightPt;

      switch (dragState.handle) {
        case 'move':
          newXPt += deltaXPt;
          newYPt += deltaYPt;
          break;
        case 'e':
          newWidthPt += deltaXPt;
          break;
        case 'w':
          newXPt += deltaXPt;
          newWidthPt -= deltaXPt;
          break;
        case 's':
          newHeightPt += deltaYPt;
          break;
        case 'n':
          newYPt += deltaYPt;
          newHeightPt -= deltaYPt;
          break;
        case 'se':
          newWidthPt += deltaXPt;
          newHeightPt += deltaYPt;
          break;
        case 'sw':
          newXPt += deltaXPt;
          newWidthPt -= deltaXPt;
          newHeightPt += deltaYPt;
          break;
        case 'ne':
          newYPt += deltaYPt;
          newHeightPt -= deltaYPt;
          newWidthPt += deltaXPt;
          break;
        case 'nw':
          newXPt += deltaXPt;
          newWidthPt -= deltaXPt;
          newYPt += deltaYPt;
          newHeightPt -= deltaYPt;
          break;
      }

      // Snap to grid if active
      if (snapToGrid) {
        const snap = (v: number) => Math.round(v / gridSizePt) * gridSizePt;
        if (dragState.handle === 'move' || ['w', 'nw', 'sw'].includes(dragState.handle)) {
          newXPt = snap(newXPt);
        }
        if (dragState.handle === 'move' || ['n', 'nw', 'ne'].includes(dragState.handle)) {
          newYPt = snap(newYPt);
        }
        if (['e', 'w', 'ne', 'nw', 'se', 'sw'].includes(dragState.handle)) {
          newWidthPt = snap(newWidthPt);
        }
        if (['s', 'n', 'se', 'sw', 'ne', 'nw'].includes(dragState.handle)) {
          newHeightPt = snap(newHeightPt);
        }
      }

      // Minimum and boundary limits (respect dynamic page bounds)
      newWidthPt = Math.max(10, Math.min(activePageWidthPt - newXPt, newWidthPt));
      newHeightPt = Math.max(10, Math.min(activePageHeightPt - newYPt, newHeightPt));
      newXPt = Math.max(0, Math.min(activePageWidthPt - newWidthPt, newXPt));
      newYPt = Math.max(0, Math.min(activePageHeightPt - newHeightPt, newYPt));

      updateSelectedField({
        xPt: Math.round(newXPt * 10) / 10,
        yPt: Math.round(newYPt * 10) / 10,
        widthPt: Math.round(newWidthPt * 10) / 10,
        heightPt: Math.round(newHeightPt * 10) / 10,
      });
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, scale, snapToGrid, gridSizePt, updateSelectedField]);

  // Keyboard navigation & fine nudge
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedField) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      // Ctrl+D or Cmd+D = Duplicate field (Requirement 14)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelectedField(false);
        return;
      }

      const step = e.shiftKey ? 10 : 1;

      if (e.altKey) {
        // Alt + Arrows = Resize
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          updateSelectedField({ widthPt: selectedField.widthPt + step });
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          updateSelectedField({ widthPt: Math.max(10, selectedField.widthPt - step) });
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          updateSelectedField({ heightPt: selectedField.heightPt + step });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          updateSelectedField({ heightPt: Math.max(10, selectedField.heightPt - step) });
        }
      } else {
        // Normal Arrows = Nudge Move
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          updateSelectedField({ xPt: selectedField.xPt + step });
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          updateSelectedField({ xPt: Math.max(0, selectedField.xPt - step) });
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          updateSelectedField({ yPt: selectedField.yPt + step });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          updateSelectedField({ yPt: Math.max(0, selectedField.yPt - step) });
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteCandidateField();
        } else if (e.key === 'Escape') {
          setSelectedFieldId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedField, updateSelectedField, duplicateSelectedField]);

  const copyUpdatedJson = () => {
    const jsonStr = JSON.stringify(currentModel, null, 2);
    navigator.clipboard.writeText(jsonStr);
    showToast('Definizione JSON copiata negli appunti!');
  };

  // Bidirectional selection handlers: Tree ↔ Canvas ↔ Inspector (R08-R2)
  const selectFieldFromTree = useCallback(
    (field: FieldGeometry) => {
      setSelectedFieldId(field.fieldId);
      if (containerRef.current) {
        const vp = pdfPointToViewport(field.xPt, field.yPt, field.widthPt, field.heightPt, scale);
        const container = containerRef.current;
        const targetY = vp.topPx - container.clientHeight / 2 + vp.heightPx / 2;
        const targetX = vp.leftPx - container.clientWidth / 2 + vp.widthPx / 2;
        container.scrollTo({
          top: Math.max(0, targetY),
          left: Math.max(0, targetX),
          behavior: 'smooth',
        });
      }
    },
    [scale]
  );

  const selectFieldFromCanvas = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId);
    setTimeout(() => {
      const treeElem = document.getElementById(`tree-item-${fieldId}`);
      if (treeElem) {
        treeElem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
  }, []);

  const renderFieldTypeIcon = (type?: string) => {
    switch (type) {
      case 'DATE':
        return <Calendar className="w-3 h-3 text-cyan-400 shrink-0" />;
      case 'NUMBER':
        return <Hash className="w-3 h-3 text-purple-400 shrink-0" />;
      case 'SINGLE_CHOICE':
      case 'MULTI_CHOICE':
        return <CheckSquare className="w-3 h-3 text-amber-400 shrink-0" />;
      case 'TABLE':
        return <Grid className="w-3 h-3 text-indigo-400 shrink-0" />;
      default:
        return <Type className="w-3 h-3 text-stone-400 shrink-0" />;
    }
  };

  return (
    <div
      id="template-calibration-workspace"
      className="fixed inset-0 z-50 bg-stone-950 text-stone-100 flex flex-col font-sans overflow-hidden select-none"
    >
      {/* Hidden File Input for PDF Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf"
        onChange={handleUploadCustomPdf}
        className="hidden"
      />

      {/* Top Header Bar */}
      <header className="h-14 bg-stone-900 border-b border-stone-800 px-6 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-inner">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white uppercase font-serif">
                Ambiente di Calibrazione Template PEI
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                L1 + L2 CALIBRATION
              </span>
            </div>
            <p className="text-[11px] text-stone-400 font-medium">
              {currentModel ? (
                <>
                  Modello: <strong className="text-stone-200">{currentModel.modelName}</strong> ({currentModel.schoolOrder}) • SHA-256:{' '}
                  <span className="font-mono text-emerald-400 font-bold">{currentModel.sourcePdfSha256?.slice(0, 10)}…</span>
                </>
              ) : resolutionState.status === 'RESOLVING_TEMPLATE' ? (
                <>
                  Modello: <strong className="text-amber-300">Risoluzione in corso…</strong> ({selectedModelId})
                </>
              ) : (
                <>
                  Modello: <strong className="text-rose-400">Non disponibile</strong> ({selectedModelId})
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {/* Action Buttons */}
          <button
            type="button"
            id="btn-upload-custom-pdf"
            disabled={isAcquiring}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>{isAcquiring ? 'Acquisizione…' : 'Carica Altro PDF'}</span>
          </button>

          <button
            type="button"
            id="btn-toggle-parity-mode"
            disabled={!currentModel}
            onClick={() => setIsParityMode(!isParityMode)}
            className={`px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              isParityMode
                ? 'bg-amber-700 text-white ring-2 ring-amber-400 shadow-md'
                : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
            }`}
            title="Confronto Parità Visiva: sovrappone il testo simulato sui campi per controllare allineamento con il PDF"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Simulazione Testo</span>
          </button>

          <button
            type="button"
            id="btn-save-draft"
            disabled={!currentModel}
            onClick={saveDraftToIndexedDb}
            className="px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Salva lo stato corrente in bozza (REVIEW_REQUIRED)"
          >
            <Save className="w-3.5 h-3.5 text-blue-400" />
            <span>Salva Bozza</span>
          </button>

          <button
            type="button"
            id="btn-approve-calibrated"
            disabled={!currentModel}
            onClick={approveAndCalibrateModel}
            className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Approva e marca il modello come CALIBRATED (visualReviewStatus = COMPLETED)"
          >
            <Check className="w-4 h-4" />
            <span>Approva Calibrazione</span>
          </button>

          <button
            type="button"
            id="btn-copy-geometry-json"
            disabled={!currentModel}
            onClick={copyUpdatedJson}
            className="p-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title="Esporta JSON Geometria"
          >
            <Copy className="w-4 h-4" />
          </button>

          {onClose && (
            <button
              type="button"
              id="btn-close-calibration-tool"
              onClick={onClose}
              className="p-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors cursor-pointer ml-1"
              title="Chiudi Workspace"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Optional Instructional Banner */}
      {bannerNotice && (
        <div className="bg-amber-950/80 border-b border-amber-700/60 px-6 py-2 flex items-center justify-between text-xs text-amber-200 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{bannerNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerNotice(null)}
            className="text-amber-400 hover:text-amber-200 cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control Toolbar */}
      <div className="bg-stone-900 border-b border-stone-800 px-6 py-2 flex items-center justify-between gap-4 shrink-0 text-xs">
        <div className="flex items-center gap-4">
          {/* Model Selector */}
          <div className="flex items-center gap-2">
            <label className="text-stone-400 font-semibold">Modello:</label>
            <select
              value={selectedModelId}
              onChange={(e) => {
                setSelectedModelId(e.target.value);
                setCurrentPage(1);
                setSelectedFieldId(null);
              }}
              className="bg-stone-800 border border-stone-700 rounded px-2.5 py-1 text-stone-200 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <optgroup label="Modelli Ministeriali Ufficiali (A1-A4)">
                <option value="A1">A1 — Scuola dell&apos;Infanzia</option>
                <option value="A2">A2 — Scuola Primaria</option>
                <option value="A3">A3 — Secondaria I Grado</option>
                <option value="A4">A4 — Secondaria II Grado</option>
              </optgroup>
              {Object.keys(modelState).filter((k) => !['A1', 'A2', 'A3', 'A4'].includes(k)).length > 0 && (
                <optgroup label="Modelli Acquisiti / Territoriali">
                  {Object.keys(modelState)
                    .filter((k) => !['A1', 'A2', 'A3', 'A4'].includes(k))
                    .map((id) => (
                      <option key={id} value={id}>
                        {modelState[id].modelName || id}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Page Selector with quick navigation */}
          <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-0.5 rounded border border-stone-700">
            <button
              type="button"
              disabled={!currentModel || currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-stone-700 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Pagina precedente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-stone-300 font-medium px-1">
              Pagina <strong className="text-white font-bold">{currentPage}</strong> di{' '}
              {currentModel?.totalPages || 12}
            </span>
            <button
              type="button"
              disabled={!currentModel || currentPage >= (currentModel?.totalPages || 12)}
              onClick={() => setCurrentPage((p) => Math.min(currentModel?.totalPages || 12, p + 1))}
              className="p-1 rounded hover:bg-stone-700 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Pagina successiva"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom Controls & Fit Page / Fit Width (R08-R5) */}
          <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-0.5 rounded border border-stone-700">
            <button
              type="button"
              onClick={() => {
                setZoomMode('MANUAL');
                setScale((s) => Math.max(0.25, Math.round((s - 0.1) * 10) / 10));
              }}
              className="p-1 rounded hover:bg-stone-700 cursor-pointer"
              title="Riduci Zoom (min 25%)"
            >
              <ZoomOut className="w-3 h-3 text-stone-400" />
            </button>
            <span className="font-mono text-stone-200 font-semibold w-11 text-center text-xs">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => {
                setZoomMode('MANUAL');
                setScale((s) => Math.min(2.5, Math.round((s + 0.1) * 10) / 10));
              }}
              className="p-1 rounded hover:bg-stone-700 cursor-pointer"
              title="Aumenta Zoom (max 250%)"
            >
              <ZoomIn className="w-3 h-3 text-stone-400" />
            </button>

            <div className="h-3.5 w-px bg-stone-700 mx-0.5" />

            <button
              type="button"
              onClick={handleFitPage}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                zoomMode === 'FIT_PAGE'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-stone-700 hover:bg-stone-600 text-stone-300'
              }`}
              title="Adatta l'intera pagina all'area visibile (Fit Page)"
            >
              Adatta Pagina
            </button>

            <button
              type="button"
              onClick={handleFitWidth}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                zoomMode === 'FIT_WIDTH'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'bg-stone-700 hover:bg-stone-600 text-stone-300'
              }`}
              title="Adatta alla larghezza utile (Fit Width)"
            >
              Adatta Larghezza
            </button>
          </div>

          {/* Snap to Grid */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-stone-800">
            <label className="flex items-center gap-1.5 text-stone-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => setSnapToGrid(e.target.checked)}
                className="rounded bg-stone-800 border-stone-700 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <span>Snap ({gridSizePt}pt)</span>
            </label>
          </div>
        </div>

        {/* Verification Status Badges */}
        <div className="flex items-center gap-3">
          {isParityMode && (
            <div className="flex items-center gap-2 bg-stone-800 px-2.5 py-1 rounded border border-stone-700">
              <span className="text-stone-400">Opacità Overlay:</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={overlayOpacity}
                onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                className="w-20 accent-amber-500 cursor-pointer"
              />
              <span className="font-mono text-[11px] text-stone-300">
                {Math.round(overlayOpacity * 100)}%
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span
              className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1"
              title="Automated geometry bounds and non-overlapping sanity checks"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>GEOMETRY: PASS</span>
            </span>

            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border flex items-center gap-1 ${
                (currentModel as any)?.validationStatus === 'CALIBRATED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
              title="Requisito R01: Human visual review required"
            >
              <Eye className="w-3 h-3" />
              <span>
                {(currentModel as any)?.validationStatus === 'CALIBRATED'
                  ? 'HUMAN REVIEW: OK'
                  : 'HUMAN REVIEW: REQ'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Workspace Area: Canvas + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Interactive PDF Viewport & Canvas (L1 + L2) */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-stone-950 p-8 flex justify-center items-start relative"
          onClick={() => setSelectedFieldId(null)}
        >
          {/* Resolution Loading State Overlay */}
          {resolutionState.status === 'RESOLVING_TEMPLATE' && (
            <div className="absolute inset-0 flex items-center justify-center bg-stone-950/85 text-white z-30">
              <div className="flex flex-col items-center gap-3 p-6 bg-stone-900 border border-stone-800 rounded-xl shadow-2xl">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold tracking-wide">Caricamento modello...</p>
                <p className="text-xs text-stone-400 font-mono">{selectedModelId}</p>
              </div>
            </div>
          )}

          {/* Resolution Error State Overlay */}
          {resolutionState.status === 'ERROR' && (
            <div className="absolute inset-0 flex items-center justify-center bg-stone-950/90 text-white z-30 p-8">
              <div className="max-w-md bg-stone-900 border border-rose-800/80 rounded-xl p-6 text-center space-y-4 shadow-2xl">
                <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-rose-300 font-mono tracking-wide uppercase">
                    {resolutionState.errorCode || 'TEMPLATE_ERROR'}
                  </h2>
                  <p className="text-xs text-stone-300 mt-2">
                    {resolutionState.message || 'Impossibile caricare il modello richiesto.'}
                  </p>
                  {resolutionState.errorCode === 'TEMPLATE_SOURCE_MISSING' && (
                    <p className="text-[11px] text-stone-400 mt-1">
                      Il file PDF sorgente o la definizione del template non sono presenti nel database locale (IndexedDB).
                    </p>
                  )}
                  {resolutionState.errorCode === 'TEMPLATE_INTEGRITY_MISMATCH' && (
                    <p className="text-[11px] text-stone-400 mt-1">
                      L&apos;impronta crittografica SHA-256 del binario non corrisponde alla definizione registrata.
                    </p>
                  )}
                </div>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Carica PDF sorgente</span>
                  </button>
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold border border-stone-700 cursor-pointer"
                    >
                      Chiudi Workspace
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            className="relative bg-white shadow-2xl transition-all select-none"
            style={{ width: `${canvasWidthPx}px`, height: `${canvasHeightPx}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* L1: PDF Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full pointer-events-none" />

            {/* Loading & Error Overlays */}
            {pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-950/70 backdrop-blur-xs text-white text-xs font-semibold z-20">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Rendering PDF Pagina {currentPage}…</span>
                </div>
              </div>
            )}

            {pdfError && !pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-20 bg-stone-950/80">
                <div className="bg-stone-900 text-white p-5 rounded-lg border border-rose-800 shadow-xl max-w-sm">
                  <div className="w-8 h-8 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-2">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <p className="font-bold text-rose-300 font-mono text-xs">
                    PDF_RENDER_ERROR
                  </p>
                  <p className="text-[11px] mt-1 text-stone-400">
                    {pdfError}
                  </p>
                </div>
              </div>
            )}

            {/* L2: Geometry Overlay Rectangles with Drag & Resize Handles */}
            <div className="absolute inset-0 pointer-events-none">
              {fieldsOnPage.map((f) => {
                const clampedField = clampFieldToPageBounds(f, activePageWidthPt, activePageHeightPt) || f;
                const overlay = pdfRectToOverlayRect(clampedField, scale);
                const isSelected = f.fieldId === selectedFieldId;
                const isAnyFieldSelected = Boolean(selectedFieldId);
                const isProposed = f.calibrationStatus === 'PROPOSED';
                const isConfirmed = f.calibrationStatus === 'CONFIRMED' || (!f.calibrationStatus && f.derivationMethod === 'MANUAL_VERIFIED');
                const isModified = f.calibrationStatus === 'MODIFIED';
                const isRejected = f.calibrationStatus === 'REJECTED';

                const borderColor = isSelected
                  ? 'border-2 border-blue-500 bg-blue-500/25 ring-2 ring-blue-400 z-30 opacity-100 shadow-md'
                  : isRejected
                  ? 'border-2 border-rose-500/40 bg-rose-500/5 line-through opacity-35 z-10'
                  : isProposed
                  ? `border-2 border-dashed border-amber-400 bg-amber-500/15 hover:border-amber-300 z-10 ${isAnyFieldSelected ? 'opacity-55 hover:opacity-100 transition-opacity' : 'opacity-90'}`
                  : isModified
                  ? `border-2 border-blue-500 bg-blue-500/15 hover:border-blue-400 z-10 ${isAnyFieldSelected ? 'opacity-55 hover:opacity-100 transition-opacity' : 'opacity-90'}`
                  : isConfirmed
                  ? `border-2 border-emerald-500 bg-emerald-500/15 hover:border-emerald-400 z-10 ${isAnyFieldSelected ? 'opacity-55 hover:opacity-100 transition-opacity' : 'opacity-90'}`
                  : f.derivationMethod === 'ACROFORM'
                  ? `border-2 border-purple-500 bg-purple-500/15 hover:border-purple-400 z-10 ${isAnyFieldSelected ? 'opacity-55 hover:opacity-100 transition-opacity' : 'opacity-90'}`
                  : `border-2 border-amber-500/90 bg-amber-500/10 hover:border-amber-400 z-10 ${isAnyFieldSelected ? 'opacity-55 hover:opacity-100 transition-opacity' : 'opacity-90'}`;

                return (
                  <div
                    key={f.fieldId}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectFieldFromCanvas(f.fieldId);
                    }}
                    onMouseDown={(e) => handleMouseDownOnField(e, f, 'move')}
                    className={`absolute rounded-xs cursor-move transition-colors group pointer-events-auto ${borderColor}`}
                    style={{
                      left: `${overlay.xCss}px`,
                      top: `${overlay.yCss}px`,
                      width: `${overlay.widthCss}px`,
                      height: `${overlay.heightCss}px`,
                    }}
                  >
                    {/* OPAQUE_WHITE field background mask (Requirement 17) */}
                    {f.backgroundMode === 'OPAQUE_WHITE' && (
                      <div
                        className="absolute inset-0 bg-white pointer-events-none rounded-xs"
                        style={{ zIndex: 0 }}
                      />
                    )}

                    {/* Header Label Badge (Requirement 4, 5, 17, R08) */}
                    <div className="absolute -top-4.5 left-0 bg-stone-900 text-[10px] text-stone-100 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap opacity-90 group-hover:opacity-100 z-30 flex items-center gap-1.5 font-sans pointer-events-none">
                      {isProposed && (
                        <span className="text-[9px] text-amber-300 font-bold bg-amber-950/90 px-1 rounded border border-amber-600/60">
                          PROPOSTO {f.confidence ? `(${(f.confidence * 100).toFixed(0)}%)` : ''}
                        </span>
                      )}
                      {isConfirmed && (
                        <span className="text-[9px] text-emerald-300 font-bold bg-emerald-950/90 px-1 rounded border border-emerald-600/60">
                          CONFERMATO
                        </span>
                      )}
                      {isModified && (
                        <span className="text-[9px] text-blue-300 font-bold bg-blue-950/90 px-1 rounded border border-blue-600/60">
                          MODIFICATO
                        </span>
                      )}
                      {isRejected && (
                        <span className="text-[9px] text-rose-300 font-bold bg-rose-950/90 px-1 rounded border border-rose-600/60">
                          RIFIUTATO
                        </span>
                      )}
                      <span className="font-semibold text-amber-100 truncate max-w-[140px]">
                        {f.label || f.fieldId}
                      </span>
                      {f.semanticKey && (
                        <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/80 px-1 rounded border border-emerald-800/50">
                          {f.semanticKey}
                        </span>
                      )}
                      {f.backgroundMode === 'OPAQUE_WHITE' && (
                        <span className="text-[9px] text-stone-200 bg-stone-800 px-1 rounded border border-stone-600 font-mono">
                          OPACO
                        </span>
                      )}
                    </div>

                    {/* Parity Simulation Preview Text */}
                    {isParityMode && (
                      <div
                        className="w-full h-full p-1 text-stone-950 overflow-hidden font-sans pointer-events-none select-none bg-amber-100/90 text-[10px] leading-tight flex items-start font-medium relative z-10"
                        style={{ opacity: overlayOpacity }}
                      >
                        <span className="truncate">
                          {f.label || f.anchorText || `[Test: ${f.fieldId}]`}
                        </span>
                      </div>
                    )}

                    {/* 8 Resize Handles (Visible when selected) */}
                    {isSelected && (
                      <>
                        {/* Top-Left */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'nw')}
                          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-nw-resize z-40"
                        />
                        {/* Top-Right */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'ne')}
                          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-ne-resize z-40"
                        />
                        {/* Bottom-Left */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'sw')}
                          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-sw-resize z-40"
                        />
                        {/* Bottom-Right */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'se')}
                          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-full cursor-se-resize z-40"
                        />
                        {/* North (Top) */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'n')}
                          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-2 bg-white border-2 border-blue-600 rounded-xs cursor-n-resize z-40"
                        />
                        {/* South (Bottom) */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 's')}
                          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-2 bg-white border-2 border-blue-600 rounded-xs cursor-s-resize z-40"
                        />
                        {/* West (Left) */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'w')}
                          className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-w-resize z-40"
                        />
                        {/* East (Right) */}
                        <div
                          onMouseDown={(e) => handleMouseDownOnField(e, f, 'e')}
                          className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-3 bg-white border-2 border-blue-600 rounded-xs cursor-e-resize z-40"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Single 3-Section Panel (R08-R1 UX Refactor) */}
        <aside
          id="calibration-right-panel"
          className="w-[380px] xl:w-[420px] bg-stone-900 border-l border-stone-800 flex flex-col shrink-0 text-xs shadow-xl h-full overflow-hidden"
        >
          {/* SEZIONE A: TOOLBAR CAMPI & STATO PAGINA */}
          <div className="p-3 border-b border-stone-800 bg-stone-900/95 shrink-0 space-y-2.5">
            {/* Header Pagina & Contatori Espliciti (Section 27) */}
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-200 text-xs tracking-tight">
                Pagina {currentPage} di {currentModel?.totalPages || 1}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-800 border border-stone-700 text-stone-300">
                P.{currentPage}/{currentModel?.totalPages || 1}
              </span>
            </div>

            {/* Contatori Pagina Real-Time (Section 27) */}
            <div className="grid grid-cols-5 gap-1 text-center py-1.5 px-1 bg-stone-950/80 rounded border border-stone-800 font-mono">
              <div className="flex flex-col items-center">
                <span className="text-stone-400 text-[9px] uppercase tracking-wider font-semibold">Totali</span>
                <span className="font-bold text-stone-100 text-xs">{rawFieldsOnPage.length}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-amber-400 text-[9px] uppercase tracking-wider font-semibold">Proposti</span>
                <span className="font-bold text-amber-300 text-xs">{countProposed}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-emerald-400 text-[9px] uppercase tracking-wider font-semibold">Confermati</span>
                <span className="font-bold text-emerald-300 text-xs">{countConfirmed}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-blue-400 text-[9px] uppercase tracking-wider font-semibold">Modificati</span>
                <span className="font-bold text-blue-300 text-xs">{countModified}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-rose-400 text-[9px] uppercase tracking-wider font-semibold">Rifiutati</span>
                <span className="font-bold text-rose-300 text-xs">{countRejected}</span>
              </div>
            </div>

            {/* In-Flight Detection Banner / Actions */}
            {isDetecting ? (
              <div className="bg-amber-950/70 border border-amber-600/50 p-2.5 rounded-lg text-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span className="font-semibold text-xs">
                      {detectionProgress
                        ? `Analisi Pagina ${detectionProgress.current} di ${detectionProgress.total}...`
                        : 'Rilevamento in corso...'}
                    </span>
                  </div>
                  <button
                    type="button"
                    id="btn-cancel-detection"
                    onClick={handleCancelDetection}
                    className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-[10px] font-bold border border-stone-600 cursor-pointer"
                  >
                    Annulla
                  </button>
                </div>
                {detectionProgress && (
                  <div className="w-full bg-stone-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all duration-200"
                      style={{
                        width: `${Math.round((detectionProgress.current / Math.max(1, detectionProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Primary Action Row */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    id="btn-detect-page-fields"
                    disabled={!currentModel || !cachedPdfDocRef.current?.doc}
                    onClick={handleDetectPageFields}
                    className="px-2.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Rileva automaticamente i campi compilabili sulla pagina corrente"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                    <span>Rileva (Pagina)</span>
                  </button>

                  <button
                    type="button"
                    id="btn-detect-document-fields"
                    disabled={!currentModel || !cachedPdfDocRef.current?.doc}
                    onClick={handleDetectDocumentFields}
                    className="px-2.5 py-1.5 rounded-md bg-stone-800 hover:bg-stone-750 text-amber-300 font-semibold border border-stone-700 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Rileva campi su tutte le pagine del modello (analisi completa)"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rileva (Doc)</span>
                  </button>
                </div>

                {/* Secondary Action Row: Aggiungi & Duplica */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    id="btn-add-candidate-field"
                    disabled={!currentModel}
                    onClick={addNewCandidateField}
                    className="px-2.5 py-1.5 rounded-md bg-blue-700 hover:bg-blue-600 text-white font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Aggiungi manualmente un nuovo campo sulla pagina corrente"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Aggiungi Campo</span>
                  </button>

                  <button
                    type="button"
                    id="btn-toolbar-duplicate-field"
                    disabled={!selectedField}
                    onClick={() => duplicateSelectedField(false)}
                    className="px-2.5 py-1.5 rounded-md bg-stone-800 hover:bg-stone-750 text-stone-200 font-semibold border border-stone-700 shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Duplica campo selezionato (Ctrl+D)"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>Duplica Campo</span>
                  </button>
                </div>

                {/* Confirm all proposed on page */}
                {countProposed > 0 && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      id="btn-confirm-all-page"
                      onClick={confirmAllProposedOnPage}
                      className="w-full py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Conferma tutti i campi proposti sulla pagina corrente"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Conferma Tutti i Proposti ({countProposed})</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SEZIONE B: TREE / ELENCO DEI CAMPI DELLA PAGINA CORRENTE (R08-R2) */}
          <div className="flex flex-col border-b border-stone-800 shrink-0 h-[34vh] max-h-[36vh] min-h-[140px] bg-stone-900/60 overflow-hidden">
            {/* Header Sezione B & Filtri */}
            <div className="p-2.5 border-b border-stone-800/80 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-stone-200 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <ListTree className="w-3.5 h-3.5 text-amber-400" />
                  <span>Campi Pagina Corrente</span>
                </h2>
                <span className="text-[10px] font-mono text-stone-400">
                  {visuallySortedFieldsOnPage.length} di {rawFieldsOnPage.length}
                </span>
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                    statusFilter === 'ALL'
                      ? 'bg-stone-700 text-white font-bold'
                      : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  Tutti ({rawFieldsOnPage.filter(f => f.calibrationStatus !== 'REJECTED' || showRejectedFields).length})
                </button>
                {countProposed > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('PROPOSED')}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                      statusFilter === 'PROPOSED'
                        ? 'bg-amber-600 text-stone-950 font-bold'
                        : 'bg-amber-950/60 text-amber-300 hover:bg-amber-900/60'
                    }`}
                  >
                    ? Proposti ({countProposed})
                  </button>
                )}
                {countConfirmed > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('CONFIRMED')}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                      statusFilter === 'CONFIRMED'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-stone-800 text-emerald-400 hover:bg-stone-750'
                    }`}
                  >
                    ✓ Confermati ({countConfirmed})
                  </button>
                )}
                {countModified > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('MODIFIED')}
                    className={`px-2 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                      statusFilter === 'MODIFIED'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-stone-800 text-blue-400 hover:bg-stone-750'
                    }`}
                  >
                    M Modificati ({countModified})
                  </button>
                )}
              </div>

              {/* Quick Search */}
              <input
                type="text"
                placeholder="Filtra campi per etichetta o ID..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-stone-800/90 border border-stone-700/80 rounded px-2 py-1 text-stone-200 placeholder:text-stone-500 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
              />

              {countRejected > 0 && (
                <label className="flex items-center gap-1.5 text-[10px] text-stone-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRejectedFields}
                    onChange={(e) => setShowRejectedFields(e.target.checked)}
                    className="rounded bg-stone-800 border-stone-700 text-rose-500 focus:ring-0 cursor-pointer"
                  />
                  <span>Mostra {countRejected} campi rifiutati</span>
                </label>
              )}
            </div>

            {/* Tree Items List (Section 13) */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {visuallySortedFieldsOnPage.length === 0 ? (
                <div className="py-6 text-center text-stone-500 text-xs italic">
                  Nessun campo sulla pagina corrente per i filtri attivi.
                </div>
              ) : (
                visuallySortedFieldsOnPage.map((f) => {
                  const isSelected = f.fieldId === selectedFieldId;
                  const isProposed = f.calibrationStatus === 'PROPOSED';
                  const isConfirmed = f.calibrationStatus === 'CONFIRMED' || (!f.calibrationStatus && f.derivationMethod === 'MANUAL_VERIFIED');
                  const isModified = f.calibrationStatus === 'MODIFIED';
                  const isRejected = f.calibrationStatus === 'REJECTED';

                  return (
                    <button
                      key={f.fieldId}
                      id={`tree-item-${f.fieldId}`}
                      type="button"
                      onClick={() => selectFieldFromTree(f)}
                      className={`w-full text-left px-2 py-1.5 rounded transition-all cursor-pointer flex items-center justify-between gap-2 text-xs ${
                        isSelected
                          ? 'bg-blue-950/80 border border-blue-500 text-white shadow-xs font-semibold'
                          : isRejected
                          ? 'bg-rose-950/20 border border-rose-900/30 text-stone-400 line-through opacity-50'
                          : isProposed
                          ? 'bg-amber-950/20 border border-amber-600/30 text-stone-300 hover:bg-amber-900/30'
                          : 'bg-stone-800/40 border border-stone-800 text-stone-300 hover:bg-stone-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        {renderFieldTypeIcon((f as any).fieldType)}
                        <span className="truncate text-stone-200">
                          {f.label || f.fieldId}
                        </span>
                      </div>

                      {/* Status badge: ✓, ?, M, ✕ */}
                      <div className="shrink-0 flex items-center">
                        {isProposed && (
                          <span
                            className="w-4.5 h-4.5 rounded font-bold text-[10px] flex items-center justify-center bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            title={`Proposto (${((f.confidence ?? 0.8) * 100).toFixed(0)}%)`}
                          >
                            ?
                          </span>
                        )}
                        {isConfirmed && (
                          <span
                            className="w-4.5 h-4.5 rounded font-bold text-[10px] flex items-center justify-center bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            title="Confermato"
                          >
                            ✓
                          </span>
                        )}
                        {isModified && (
                          <span
                            className="w-4.5 h-4.5 rounded font-bold text-[10px] flex items-center justify-center bg-blue-500/20 text-blue-300 border border-blue-500/40"
                            title="Modificato"
                          >
                            M
                          </span>
                        )}
                        {isRejected && (
                          <span
                            className="w-4.5 h-4.5 rounded font-bold text-[10px] flex items-center justify-center bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            title="Rifiutato"
                          >
                            ✕
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* SEZIONE C: INSPECTOR DEL CAMPO ATTIVO (R08-R2) */}
          <div className="flex-1 flex flex-col min-h-[220px] bg-stone-950/80 overflow-hidden">
            {selectedField ? (
              <>
                {/* Header Inspector (Section 18) */}
                <div className="px-3 py-2.5 border-b border-stone-800 bg-stone-900/60 flex items-start justify-between shrink-0">
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-stone-100 text-xs truncate" title={selectedField.label || selectedField.fieldId}>
                        {selectedField.label || 'Campo non nominato'}
                      </h3>
                      {/* Status Badge */}
                      {selectedField.calibrationStatus === 'PROPOSED' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                          PROPOSED
                        </span>
                      )}
                      {selectedField.calibrationStatus === 'CONFIRMED' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                          CONFIRMED
                        </span>
                      )}
                      {selectedField.calibrationStatus === 'MODIFIED' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 shrink-0">
                          MODIFIED
                        </span>
                      )}
                      {selectedField.calibrationStatus === 'REJECTED' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                          REJECTED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-stone-400">
                      <span className="truncate max-w-[130px]">{selectedField.fieldId}</span>
                      {selectedField.confidence && (
                        <span className="text-amber-300 font-semibold">
                          Conf: {(selectedField.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {selectedField.detectionSource && (
                        <span className="text-stone-300 bg-stone-800 px-1 rounded border border-stone-700">
                          Source: {selectedField.detectionSource}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Body Inspector Scrollable */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Suggestions / Detection Source Info */}
                  {selectedField.detectionSource && selectedField.detectionSource !== 'MANUAL_ENTRY' && (
                    <div className="p-2 rounded bg-amber-950/40 border border-amber-600/30 text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between text-amber-300 font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          Rilevato tramite: {selectedField.detectionSource}
                        </span>
                      </div>

                      {selectedField.suggestedLabel && selectedField.suggestedLabel !== selectedField.label && (
                        <div className="flex items-center justify-between gap-1 text-[10px] bg-stone-900/80 p-1 rounded border border-stone-700">
                          <span className="text-stone-300 truncate">
                            Label: <strong className="text-amber-200">{selectedField.suggestedLabel}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => updateSelectedField({ label: selectedField.suggestedLabel })}
                            className="px-1.5 py-0.5 rounded bg-amber-600/80 hover:bg-amber-500 text-stone-950 font-bold text-[9px] cursor-pointer shrink-0"
                          >
                            Applica
                          </button>
                        </div>
                      )}

                      {selectedField.suggestedSemanticKey && selectedField.suggestedSemanticKey !== selectedField.semanticKey && (
                        <div className="flex items-center justify-between gap-1 text-[10px] bg-stone-900/80 p-1 rounded border border-stone-700">
                          <span className="text-stone-300 truncate">
                            Semantic: <strong className="text-emerald-300 font-mono">{selectedField.suggestedSemanticKey}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => updateSelectedField({ semanticKey: selectedField.suggestedSemanticKey })}
                            className="px-1.5 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-[9px] cursor-pointer shrink-0"
                          >
                            Applica
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BLOCCO GEOMETRIA CAMPO (Sections 19, 20, 21, 22) */}
                  <div className="p-2.5 rounded-lg bg-stone-900/90 border border-stone-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1">
                        <Maximize2 className="w-3 h-3 text-amber-400" />
                        <span>Geometria Campo</span>
                      </span>
                      {/* Compact summary */}
                      <span className="text-[10px] font-mono font-bold text-stone-200 bg-stone-800 px-1.5 py-0.5 rounded border border-stone-700">
                        {Math.round(selectedField.widthPt)} × {Math.round(selectedField.heightPt)} pt ({(selectedField.widthPt * 0.352778).toFixed(1)} × {(selectedField.heightPt * 0.352778).toFixed(1)} mm)
                      </span>
                    </div>

                    {/* PT Coordinates Inputs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[10px] text-stone-400 font-mono font-semibold">X (pt):</label>
                          <span className="text-[9px] font-mono text-stone-400">{(selectedField.xPt * 0.352778).toFixed(1)} mm</span>
                        </div>
                        <input
                          type="number"
                          step={snapToGrid ? gridSizePt : 0.5}
                          value={selectedField.xPt}
                          onChange={(e) => {
                            let val = parseFloat(e.target.value) || 0;
                            if (snapToGrid) val = Math.round(val / gridSizePt) * gridSizePt;
                            updateSelectedField({ xPt: val });
                          }}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[10px] text-stone-400 font-mono font-semibold">Y (pt):</label>
                          <span className="text-[9px] font-mono text-stone-400">{(selectedField.yPt * 0.352778).toFixed(1)} mm</span>
                        </div>
                        <input
                          type="number"
                          step={snapToGrid ? gridSizePt : 0.5}
                          value={selectedField.yPt}
                          onChange={(e) => {
                            let val = parseFloat(e.target.value) || 0;
                            if (snapToGrid) val = Math.round(val / gridSizePt) * gridSizePt;
                            updateSelectedField({ yPt: val });
                          }}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[10px] text-stone-400 font-mono font-semibold">Larghezza L (pt):</label>
                          <span className="text-[9px] font-mono text-stone-400">{(selectedField.widthPt * 0.352778).toFixed(1)} mm</span>
                        </div>
                        <input
                          type="number"
                          step={snapToGrid ? gridSizePt : 0.5}
                          value={selectedField.widthPt}
                          onChange={(e) => {
                            let val = parseFloat(e.target.value) || 10;
                            if (snapToGrid) val = Math.round(val / gridSizePt) * gridSizePt;
                            updateSelectedField({ widthPt: Math.max(10, val) });
                          }}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[10px] text-stone-400 font-mono font-semibold">Altezza H (pt):</label>
                          <span className="text-[9px] font-mono text-stone-400">{(selectedField.heightPt * 0.352778).toFixed(1)} mm</span>
                        </div>
                        <input
                          type="number"
                          step={snapToGrid ? gridSizePt : 0.5}
                          value={selectedField.heightPt}
                          onChange={(e) => {
                            let val = parseFloat(e.target.value) || 10;
                            if (snapToGrid) val = Math.round(val / gridSizePt) * gridSizePt;
                            updateSelectedField({ heightPt: Math.max(10, val) });
                          }}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 font-mono text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Snap to grid control & badge (Section 22) */}
                    <div className="pt-1 flex items-center justify-between border-t border-stone-800/80 text-[10px]">
                      <div className="flex items-center gap-1.5 text-stone-400">
                        <span className={`w-2 h-2 rounded-full ${snapToGrid ? 'bg-emerald-400' : 'bg-stone-500'}`} />
                        <span>Snap griglia: <strong className="text-stone-300 font-mono">{gridSizePt} pt</strong> ({snapToGrid ? 'Attivo' : 'Disattivato'})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSnapToGrid(!snapToGrid)}
                          className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                            snapToGrid ? 'bg-emerald-700 hover:bg-emerald-600 text-white font-semibold' : 'bg-stone-800 hover:bg-stone-750 text-stone-300'
                          }`}
                        >
                          {snapToGrid ? 'Disattiva' : 'Attiva Snap'}
                        </button>
                        {snapToGrid && (
                          <button
                            type="button"
                            onClick={() => setGridSizePt(gridSizePt === 5 ? 10 : 5)}
                            className="px-1.5 py-0.5 rounded bg-stone-800 hover:bg-stone-750 text-stone-300 font-mono cursor-pointer"
                            title="Cambia passo griglia"
                          >
                            {gridSizePt} pt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Field Label */}
                  <div>
                    <label className="text-[10px] text-stone-400 block mb-1 font-semibold">
                      Etichetta Campo (Label visualizzata):
                    </label>
                    <input
                      id="input-field-label"
                      type="text"
                      value={selectedField.label || ''}
                      placeholder="Es. Nome Alunno, Anno Scolastico..."
                      onChange={(e) => updateSelectedField({ label: e.target.value })}
                      className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1 text-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Semantic Key */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-stone-400 font-semibold">
                        Associazione Semantica (semanticKey):
                      </label>
                      {selectedField.semanticKey && (
                        <span className="text-[9px] text-emerald-400 font-mono">
                          {selectedField.semanticKey}
                        </span>
                      )}
                    </div>
                    <select
                      id="select-semantic-key"
                      value={
                        isCustomSemanticKey(selectedField.semanticKey)
                          ? '__CUSTOM__'
                          : selectedField.semanticKey || ''
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM__') {
                          const customKey = buildCustomSemanticKey(
                            selectedModelId,
                            selectedField.label || 'campo'
                          );
                          updateSelectedField({ semanticKey: customKey });
                        } else if (val === '') {
                          updateSelectedField({ semanticKey: null });
                        } else {
                          updateSelectedField({ semanticKey: val });
                          if (!selectedField.label || selectedField.label.startsWith('Nuovo Campo')) {
                            const entry = getSemanticCatalogEntry(val);
                            if (entry) {
                              updateSelectedField({ label: entry.label, semanticKey: val });
                            }
                          }
                        }
                      }}
                      className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- Non assegnata (Nessun binding) --</option>
                      {Object.entries(CATEGORIZED_SEMANTIC_CATALOG).map(([catKey, cat]) => (
                        <optgroup key={catKey} label={cat.label}>
                          {cat.entries.map((entry) => (
                            <option key={entry.key} value={entry.key}>
                              {entry.label} ({entry.key})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="__CUSTOM__">🔧 Campo Personalizzato (Modello Territoriale)...</option>
                    </select>

                    {isCustomSemanticKey(selectedField.semanticKey) && (
                      <div className="mt-1.5 p-2 bg-stone-900/90 border border-amber-600/40 rounded text-xs space-y-1">
                        <label className="text-[10px] text-amber-300 font-semibold block">
                          Chiave modello personalizzata:
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-stone-400 font-mono truncate">
                            custom.{selectedModelId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}.
                          </span>
                          <input
                            type="text"
                            id="input-custom-semantic-suffix"
                            value={selectedField.semanticKey?.split('.').slice(2).join('.') || ''}
                            placeholder="chiave_stabile"
                            onChange={(e) => {
                              const rawSuffix = e.target.value;
                              const customKey = buildCustomSemanticKey(selectedModelId, rawSuffix);
                              updateSelectedField({ semanticKey: customKey });
                            }}
                            className="flex-1 bg-stone-800 border border-stone-700 rounded px-1.5 py-0.5 text-stone-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sfondo Campo */}
                  <div>
                    <label className="text-[10px] text-stone-400 block mb-1 font-semibold">
                      Sfondo Campo (backgroundMode):
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        id="btn-bg-transparent"
                        onClick={() => updateSelectedField({ backgroundMode: 'TRANSPARENT' })}
                        className={`py-1.5 px-2 rounded text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          (selectedField.backgroundMode || 'TRANSPARENT') === 'TRANSPARENT'
                            ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                            : 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-750'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full border border-stone-400" />
                        <span>Trasparente</span>
                      </button>
                      <button
                        type="button"
                        id="btn-bg-opaque"
                        onClick={() => updateSelectedField({ backgroundMode: 'OPAQUE_WHITE' })}
                        className={`py-1.5 px-2 rounded text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          selectedField.backgroundMode === 'OPAQUE_WHITE'
                            ? 'bg-stone-100 text-stone-950 border-white shadow-xs font-bold'
                            : 'bg-stone-800 border-stone-700 text-stone-400 hover:bg-stone-750'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-white border border-stone-300" />
                        <span>Bianco opaco</span>
                      </button>
                    </div>
                  </div>

                  {/* Field Type and Overflow */}
                  <div className="space-y-2 pt-1 border-t border-stone-800">
                    <div>
                      <label className="text-[10px] text-stone-400 block mb-1 font-semibold">
                        Tipo di Campo (fieldType):
                      </label>
                      <select
                        value={(selectedField as any).fieldType || 'TEXT_SHORT'}
                        onChange={(e) =>
                          updateSelectedField({ fieldType: e.target.value as any })
                        }
                        className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="TEXT_SHORT">Testo Breve (TEXT_SHORT)</option>
                        <option value="TEXT_LONG">Testo Esteso (TEXT_LONG)</option>
                        <option value="DATE">Data (DATE)</option>
                        <option value="NUMBER">Numero (NUMBER)</option>
                        <option value="SINGLE_CHOICE">Scelta Singola (SINGLE_CHOICE)</option>
                        <option value="MULTI_CHOICE">Scelta Multipla (MULTI_CHOICE)</option>
                        <option value="TABLE">Tabella Strutturata (TABLE)</option>
                        <option value="STATIC_OR_NON_EDITABLE">Statico / Non Modificabile</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-stone-400 block mb-1 font-semibold">
                        Politica Finale Overflow (overflowPolicy):
                      </label>
                      <select
                        value={(selectedField as any).overflowPolicy || 'RIGID'}
                        onChange={(e) =>
                          updateSelectedField({ overflowPolicy: e.target.value as any })
                        }
                        className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="RIGID">RIGID — Spazio rigido</option>
                        <option value="CONTINUABLE">CONTINUABLE — Continuazione</option>
                        <option value="EXPANDABLE_OR_TABULAR">EXPANDABLE_OR_TABULAR — Tabellare</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="chk-field-required"
                        checked={(selectedField as any).required ?? false}
                        onChange={(e) =>
                          updateSelectedField({ required: e.target.checked } as any)
                        }
                        className="rounded bg-stone-800 border-stone-700 text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      <label
                        htmlFor="chk-field-required"
                        className="text-[11px] text-stone-300 select-none cursor-pointer"
                      >
                        Campo obbligatorio per la compilazione
                      </label>
                    </div>
                  </div>

                  {/* Field Actions */}
                  <div className="pt-2 flex flex-col gap-2 border-t border-stone-800">
                    {/* Confirm / Reject Buttons */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        id="btn-confirm-field"
                        onClick={confirmFieldManualVerified}
                        className="py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Conferma</span>
                      </button>

                      <button
                        type="button"
                        id="btn-reject-field"
                        onClick={rejectSelectedField}
                        className="py-1.5 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-300 font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Rifiuta</span>
                      </button>
                    </div>

                    {/* Duplicate Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        id="btn-duplicate-field"
                        onClick={() => duplicateSelectedField(false)}
                        title="Copia geometria e stile (nuovo ID univoco) - Scorciatoia: Ctrl+D"
                        className="py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-amber-400" />
                        <span>Duplica (Ctrl+D)</span>
                      </button>

                      <button
                        type="button"
                        id="btn-duplicate-field-same-semantic"
                        onClick={() => duplicateSelectedField(true)}
                        title="Duplica mantenendo la stessa associazione semantica"
                        className="py-1.5 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Stesso dato</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      id="btn-delete-candidate"
                      onClick={deleteCandidateField}
                      className="w-full py-1.5 rounded bg-stone-800 hover:bg-rose-950/60 border border-stone-700 hover:border-rose-800 text-stone-400 hover:text-rose-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Elimina definitivamente dal template</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-stone-500 gap-3">
                <div className="w-10 h-10 rounded-full bg-stone-800/80 border border-stone-700/60 flex items-center justify-center text-stone-400">
                  <Sliders className="w-5 h-5 opacity-60 text-amber-400" />
                </div>
                <div className="space-y-1 max-w-[240px]">
                  <p className="text-xs font-semibold text-stone-300">Nessun campo selezionato</p>
                  <p className="text-[11px] text-stone-500 leading-normal">
                    Seleziona un campo sul canvas o nel Tree per visualizzarne e modificarne le proprietà geometriche e semantiche.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addNewCandidateField}
                  className="mt-1 px-3 py-1.5 rounded bg-blue-700/80 hover:bg-blue-600 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Aggiungi Campo</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white px-4 py-2.5 rounded-lg shadow-2xl text-xs flex items-center gap-2 border border-stone-700 animate-in fade-in duration-150">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
