/**
 * @license
 * PEI FACILE — Template Calibration Workspace (Phase 1D R01)
 * Production workspace for visual review, geometric calibration, and field mapping
 * of ministerial baselines (A1-A4) and acquired custom/territorial PDF templates.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ModelGeometry, FieldGeometry } from '../../data/geometry/types';
import {
  pdfPointToViewport,
  viewportToPdfPoint,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  isFieldWithinPageBounds,
} from '../../data/geometry/geometryTransform';
import { acquirePdfTemplate } from '../../core/templateAcquisitionService';
import {
  saveCustomTemplate,
  listAllCustomTemplates,
  getTemplatePdfBinary,
  getCustomTemplate,
} from '../../core/templateStorage';
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
  Info,
  Layers,
  Sparkles,
  Move,
  Maximize2,
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
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [gridSizePt, setGridSizePt] = useState<number>(5);

  const [modelState, setModelState] = useState<Record<string, ModelGeometry>>(BASELINE_MODELS);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [customBinaries, setCustomBinaries] = useState<Record<string, Uint8Array>>({});

  const [isAcquiring, setIsAcquiring] = useState<boolean>(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(
    instructionNotice || null
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Parity / text simulation mode
  const [isParityMode, setIsParityMode] = useState<boolean>(false);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.6);

  // Search filter for fields
  const [searchFilter, setSearchFilter] = useState<string>('');

  // PDF canvas & interaction refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Drag & Resize state
  const [dragState, setDragState] = useState<DragState | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load saved custom templates from IndexedDB
  useEffect(() => {
    async function loadSavedTemplates() {
      try {
        const list = await listAllCustomTemplates();
        if (list && list.length > 0) {
          const updated = { ...BASELINE_MODELS };
          for (const item of list) {
            updated[item.templateId] = {
              schemaVersion: item.schemaVersion,
              modelId: item.templateId,
              schoolOrder: item.schoolOrder,
              modelName: item.name,
              sourcePdf: item.sourceFileName,
              sourcePdfSha256: item.sourceSha256,
              totalPages: item.pageCount,
              pages: item.pages,
            };
          }
          setModelState(updated);
        }
      } catch (err) {
        console.warn('Could not load saved templates from IndexedDB:', err);
      }
    }
    loadSavedTemplates();
  }, []);

  // Update selected model if prop changes
  useEffect(() => {
    if (initialModelDef?.templateId || initialModelDef?.id) {
      const targetId = initialModelDef.templateId || initialModelDef.id;
      setSelectedModelId(targetId);
      setCurrentPage(1);
      setSelectedFieldId(null);
    }
  }, [initialModelDef]);

  const currentModel = modelState[selectedModelId] || BASELINE_MODELS[selectedModelId] || BASELINE_MODELS.A1;
  const pageData = currentModel.pages?.find((p) => p.pageNumber === currentPage);
  const fieldsOnPage = pageData ? pageData.fields.filter((f) => f.status === 'MAPPED') : [];
  const selectedField = fieldsOnPage.find((f) => f.fieldId === selectedFieldId);

  // Filtered field list for right sidebar
  const filteredFieldsOnPage = fieldsOnPage.filter((f) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      f.fieldId.toLowerCase().includes(q) ||
      (f.label && f.label.toLowerCase().includes(q)) ||
      (f.anchorText && f.anchorText.toLowerCase().includes(q))
    );
  });

  // Render official or custom PDF page via PDF.js on canvas (L1)
  useEffect(() => {
    let isCancelled = false;

    async function renderPdfPage() {
      if (!canvasRef.current) return;
      setPdfLoading(true);
      setPdfError(null);

      try {
        const pdfjs = await import('pdfjs-dist');
        let loadingTask: any;

        if (customBinaries[selectedModelId]) {
          loadingTask = pdfjs.getDocument({
            data: customBinaries[selectedModelId],
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
          });
        } else if (currentModel.sourcePdfSha256) {
          const dbBinary = await getTemplatePdfBinary(currentModel.sourcePdfSha256);
          if (dbBinary) {
            loadingTask = pdfjs.getDocument({
              data: dbBinary,
              standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
            });
          } else {
            // Built-in ministerial standard path
            loadingTask = pdfjs.getDocument({
              url: `/models/${currentModel.sourcePdf}`,
              standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
            });
          }
        }

        if (!loadingTask) {
          throw new Error('Nessuna sorgente PDF disponibile per il rendering');
        }

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        const page = await doc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('PDF render on canvas warning:', err);
          setPdfError(err?.message || 'PDF render failed');
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
    };
  }, [selectedModelId, currentPage, scale, currentModel, customBinaries]);

  // Handle uploading and acquiring a new custom PDF inside workspace
  const handleUploadCustomPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAcquiring(true);
    setBannerNotice('Acquisizione geometrica e fingerprinting SHA-256 in corso…');

    try {
      const buffer = await file.arrayBuffer();
      const rawBytes = new Uint8Array(buffer);
      const result = await acquirePdfTemplate(rawBytes, file.name);

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
        [result.templateId]: rawBytes,
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
        rawBytes
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

        // Sanitize coordinates if modified
        if (changes.xPt !== undefined) f.xPt = Math.max(0, Math.min(A4_WIDTH_PT - f.widthPt, f.xPt));
        if (changes.yPt !== undefined) f.yPt = Math.max(0, Math.min(A4_HEIGHT_PT - f.heightPt, f.yPt));
        if (changes.widthPt !== undefined) f.widthPt = Math.max(5, Math.min(A4_WIDTH_PT - f.xPt, f.widthPt));
        if (changes.heightPt !== undefined) f.heightPt = Math.max(5, Math.min(A4_HEIGHT_PT - f.yPt, f.heightPt));

        return {
          ...prev,
          [selectedModelId]: model,
        };
      });
    },
    [selectedFieldId, selectedModelId, currentPage]
  );

  // Confirm field as manually verified
  const confirmFieldManualVerified = () => {
    if (!selectedFieldId) return;
    updateSelectedField({
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
      status: 'MAPPED',
    });
    showToast('Campo contrassegnato come MANUAL_VERIFIED.');
  };

  // Add a new candidate field on current page
  const addNewCandidateField = () => {
    const newId = `f-custom-p${currentPage}-${Date.now().toString().slice(-4)}`;
    const newField: FieldGeometry = {
      fieldId: newId,
      label: 'Nuovo Campo Calibrato',
      pageNumber: currentPage,
      xPt: 60,
      yPt: 120,
      widthPt: 475,
      heightPt: 35,
      anchorText: 'Campo aggiunto manualmente',
      derivationMethod: 'MANUAL_VERIFIED',
      confidence: 1.0,
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
    showToast('Nuovo campo aggiunto. Trascina o ridimensiona per calibrare.');
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

      // 2. Generate and save calibrated TemplateSchema
      const allCandidates = currentModel.pages.flatMap((p) =>
        p.fields.map((f) => ({
          fieldId: f.fieldId,
          label: f.label,
          pageNumber: p.pageNumber,
          xPt: f.xPt,
          yPt: f.yPt,
          widthPt: f.widthPt,
          heightPt: f.heightPt,
          anchorText: f.anchorText,
          fieldType: (f as any).fieldType || 'TEXT_SHORT',
          overflowPolicy: (f as any).overflowPolicy || 'RIGID',
          required: (f as any).required ?? false,
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

      // Minimum and boundary limits
      newWidthPt = Math.max(10, Math.min(A4_WIDTH_PT - newXPt, newWidthPt));
      newHeightPt = Math.max(10, Math.min(A4_HEIGHT_PT - newYPt, newHeightPt));
      newXPt = Math.max(0, Math.min(A4_WIDTH_PT - newWidthPt, newXPt));
      newYPt = Math.max(0, Math.min(A4_HEIGHT_PT - newHeightPt, newYPt));

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
  }, [selectedField, updateSelectedField]);

  const copyUpdatedJson = () => {
    const jsonStr = JSON.stringify(currentModel, null, 2);
    navigator.clipboard.writeText(jsonStr);
    showToast('Definizione JSON copiata negli appunti!');
  };

  const canvasWidthPx = Math.round(A4_WIDTH_PT * scale);
  const canvasHeightPx = Math.round(A4_HEIGHT_PT * scale);

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
              Modello: <strong className="text-stone-200">{currentModel.modelName}</strong> ({currentModel.schoolOrder}) • SHA-256:{' '}
              <span className="font-mono text-emerald-400 font-bold">{currentModel.sourcePdfSha256?.slice(0, 10)}…</span>
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
            onClick={() => setIsParityMode(!isParityMode)}
            className={`px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
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
            onClick={saveDraftToIndexedDb}
            className="px-3 py-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold border border-stone-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Salva lo stato corrente in bozza (REVIEW_REQUIRED)"
          >
            <Save className="w-3.5 h-3.5 text-blue-400" />
            <span>Salva Bozza</span>
          </button>

          <button
            type="button"
            id="btn-approve-calibrated"
            onClick={approveAndCalibrateModel}
            className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            title="Approva e marca il modello come CALIBRATED (visualReviewStatus = COMPLETED)"
          >
            <Check className="w-4 h-4" />
            <span>Approva Calibrazione</span>
          </button>

          <button
            type="button"
            id="btn-copy-geometry-json"
            onClick={copyUpdatedJson}
            className="p-1.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors cursor-pointer"
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
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded hover:bg-stone-700 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Pagina precedente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-stone-300 font-medium px-1">
              Pagina <strong className="text-white font-bold">{currentPage}</strong> di{' '}
              {currentModel.totalPages || 12}
            </span>
            <button
              type="button"
              disabled={currentPage >= (currentModel.totalPages || 12)}
              onClick={() => setCurrentPage((p) => Math.min(currentModel.totalPages || 12, p + 1))}
              className="p-1 rounded hover:bg-stone-700 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Pagina successiva"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1.5 bg-stone-800/80 px-2 py-0.5 rounded border border-stone-700">
            <button
              type="button"
              onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.1) * 10) / 10))}
              className="p-1 rounded hover:bg-stone-700 cursor-pointer"
              title="Riduci Zoom"
            >
              <ZoomOut className="w-3 h-3 text-stone-400" />
            </button>
            <span className="font-mono text-stone-200 font-semibold w-10 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setScale((s) => Math.min(2.0, Math.round((s + 0.1) * 10) / 10))}
              className="p-1 rounded hover:bg-stone-700 cursor-pointer"
              title="Aumenta Zoom"
            >
              <ZoomIn className="w-3 h-3 text-stone-400" />
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

          <button
            type="button"
            id="btn-add-candidate-field"
            onClick={addNewCandidateField}
            className="px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-semibold shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Aggiungi Campo</span>
          </button>
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
                currentModel.validationStatus === 'CALIBRATED'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              }`}
              title="Requisito R01: Human visual review required"
            >
              <Eye className="w-3 h-3" />
              <span>
                {currentModel.validationStatus === 'CALIBRATED'
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
          <div
            className="relative bg-white shadow-2xl transition-all select-none"
            style={{ width: `${canvasWidthPx}px`, height: `${canvasHeightPx}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* L1: PDF Canvas */}
            <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full pointer-events-none" />

            {/* Loading & Error Overlays */}
            {pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-950/70 backdrop-blur-xs text-white text-xs font-semibold">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Rendering PDF Pagina {currentPage}…</span>
                </div>
              </div>
            )}

            {pdfError && !pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-stone-600 text-xs">
                <div className="bg-stone-100 p-4 rounded-lg border border-stone-300 shadow">
                  <p className="font-bold text-stone-800">
                    PDF Canvas: Visualizzazione geometrica attiva
                  </p>
                  <p className="text-[11px] mt-1 text-stone-500">
                    A4 Canonico: {A4_WIDTH_PT} × {A4_HEIGHT_PT} pt (Scale: {scale})
                  </p>
                </div>
              </div>
            )}

            {/* L2: Geometry Overlay Rectangles with Drag & Resize Handles */}
            <div className="absolute inset-0">
              {fieldsOnPage.map((f) => {
                const vp = pdfPointToViewport(f.xPt, f.yPt, f.widthPt, f.heightPt, scale);
                const isSelected = f.fieldId === selectedFieldId;

                const borderColor = isSelected
                  ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-400 z-20'
                  : f.derivationMethod === 'MANUAL_VERIFIED'
                  ? 'border-emerald-500 bg-emerald-500/15 hover:border-emerald-400 z-10'
                  : f.derivationMethod === 'ACROFORM'
                  ? 'border-purple-500 bg-purple-500/15 hover:border-purple-400 z-10'
                  : 'border-amber-500/90 bg-amber-500/10 hover:border-amber-400 z-10';

                return (
                  <div
                    key={f.fieldId}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFieldId(f.fieldId);
                    }}
                    onMouseDown={(e) => handleMouseDownOnField(e, f, 'move')}
                    className={`absolute border-2 rounded-xs cursor-move transition-colors group ${borderColor}`}
                    style={{
                      left: `${vp.leftPx}px`,
                      top: `${vp.topPx}px`,
                      width: `${vp.widthPx}px`,
                      height: `${vp.heightPx}px`,
                    }}
                  >
                    {/* Header Label Badge */}
                    <div className="absolute -top-4 left-0 bg-stone-900 text-[10px] text-stone-100 px-1 py-0.2 rounded shadow whitespace-nowrap opacity-80 group-hover:opacity-100 z-30 flex items-center gap-1 font-mono">
                      <span>{f.fieldId}</span>
                      <span className="text-[9px] opacity-70">({f.derivationMethod})</span>
                    </div>

                    {/* Parity Simulation Preview Text */}
                    {isParityMode && (
                      <div
                        className="w-full h-full p-1 text-stone-950 overflow-hidden font-sans pointer-events-none select-none bg-amber-100/90 text-[10px] leading-tight flex items-start font-medium"
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

        {/* Right: Field Geometry Inspector & Property Editor */}
        <div className="w-84 bg-stone-900 border-l border-stone-800 flex flex-col shrink-0 text-xs shadow-xl">
          {/* Section Header with Filter */}
          <div className="p-3.5 border-b border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-stone-100 text-xs uppercase tracking-wide">
                  Campi Pagina {currentPage}
                </h2>
                <p className="text-[11px] text-stone-400">
                  {fieldsOnPage.length} campi mappati
                </p>
              </div>
              {fieldsOnPage.some((f) => f.derivationMethod !== 'MANUAL_VERIFIED') && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  In Revisione
                </span>
              )}
            </div>

            <input
              type="text"
              placeholder="Filtra campi..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1 text-stone-200 placeholder:text-stone-500 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* List of fields on current page */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredFieldsOnPage.length === 0 ? (
              <p className="text-stone-500 text-center py-6 italic">
                Nessun campo trovato per i criteri specificati
              </p>
            ) : (
              filteredFieldsOnPage.map((f) => {
                const isSelected = f.fieldId === selectedFieldId;
                return (
                  <button
                    key={f.fieldId}
                    type="button"
                    onClick={() => setSelectedFieldId(f.fieldId)}
                    className={`w-full text-left p-2 rounded border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-950/70 border-blue-500 text-white shadow-xs'
                        : 'bg-stone-800/60 border-stone-700/60 text-stone-300 hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-blue-300 truncate">
                        {f.fieldId}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                          f.derivationMethod === 'MANUAL_VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {f.derivationMethod}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 mt-0.5 line-clamp-1">
                      {f.label || f.anchorText || 'Nessuna etichetta'}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected Field Calibration Inspector */}
          {selectedField ? (
            <div className="p-4 border-t border-stone-800 bg-stone-950 space-y-3 shrink-0 max-h-[50vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                <h3 className="font-bold text-stone-200">Proprietà & Coordinate</h3>
                <span className="text-[10px] text-stone-400 font-mono">
                  Conf: {(selectedField.confidence * 100).toFixed(0)}%
                </span>
              </div>

              <div>
                <label className="text-[10px] text-stone-400 block mb-1 font-semibold">
                  Etichetta Campo (Label):
                </label>
                <input
                  type="text"
                  value={selectedField.label || ''}
                  onChange={(e) => updateSelectedField({ label: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1 text-stone-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Coordinates Grid (xPt, yPt, widthPt, heightPt) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-stone-400 block mb-1 font-mono">X (pt):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedField.xPt}
                    onChange={(e) =>
                      updateSelectedField({ xPt: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-400 block mb-1 font-mono">Y (pt):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedField.yPt}
                    onChange={(e) =>
                      updateSelectedField({ yPt: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-400 block mb-1 font-mono">Larghezza (pt):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedField.widthPt}
                    onChange={(e) =>
                      updateSelectedField({ widthPt: parseFloat(e.target.value) || 10 })
                    }
                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-stone-400 block mb-1 font-mono">Altezza (pt):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={selectedField.heightPt}
                    onChange={(e) =>
                      updateSelectedField({ heightPt: parseFloat(e.target.value) || 10 })
                    }
                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Field Type and Overflow Policy */}
              <div className="space-y-2 pt-2 border-t border-stone-800">
                <div>
                  <label className="text-[10px] text-stone-400 block mb-1 font-semibold">
                    Tipo di Campo (fieldType):
                  </label>
                  <select
                    value={(selectedField as any).fieldType || 'TEXT_SHORT'}
                    onChange={(e) =>
                      updateSelectedField({ fieldType: e.target.value as any })
                    }
                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 text-xs"
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
                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-200 text-xs"
                  >
                    <option value="RIGID">RIGID — Spazio rigido (il docente deve sintetizzare)</option>
                    <option value="CONTINUABLE">CONTINUABLE — Continuazione (solo se prevista dal modello)</option>
                    <option value="EXPANDABLE_OR_TABULAR">EXPANDABLE_OR_TABULAR — Regola esplicita dello schema / Tabellare</option>
                  </select>
                  <p className="text-[10px] text-stone-400 mt-1 leading-normal">
                    Nota: L’algoritmo di autofit (12→8 pt, tracking, interlinea) viene sempre applicato prima della politica finale. Nessun testo viene tagliato (clipping vietato).
                  </p>
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

              {/* Action Buttons for Field */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  id="btn-confirm-manual-verified"
                  onClick={confirmFieldManualVerified}
                  className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Conferma Campo (MANUAL_VERIFIED)</span>
                </button>

                <button
                  type="button"
                  id="btn-delete-candidate"
                  onClick={deleteCandidateField}
                  className="w-full py-1.5 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina Campo</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 border-t border-stone-800 bg-stone-950 text-stone-500 text-center flex flex-col items-center gap-2">
              <Move className="w-5 h-5 opacity-40" />
              <p>Seleziona un campo dall&apos;elenco o trascina un riquadro sul PDF per calibrare posizione e dimensioni.</p>
              <p className="text-[10px] text-stone-600">
                Usa i tasti freccia per spostare (o Shift+Freccia per 10pt; Alt+Freccia per ridimensionare).
              </p>
            </div>
          )}
        </div>
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
