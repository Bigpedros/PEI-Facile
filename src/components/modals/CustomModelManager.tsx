/**
 * @license
 * PEI FACILE — Custom Model Manager (Simplified Model Management)
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { SchoolOrder, PeiModelDefinition, ModelOriginType, PeiDocument } from '../../types/pei';
import { getModelOriginDisplayLabel } from '../../data/peiModelRegistry';
import {
  FileText,
  Upload,
  Check,
  Trash2,
  Archive,
  AlertCircle,
  Star,
  CheckSquare,
  Sparkles,
  AlertTriangle,
  Compass,
  Image as ImageIcon,
  MoreVertical,
  Info,
  Edit2,
  Loader2,
  Clock,
  X,
  Download,
} from 'lucide-react';
import { acquirePdfTemplate } from '../../core/templateAcquisitionService';
import {
  saveCustomTemplate,
  getTemplatePdfBinary,
  deleteCustomTemplate,
  getNormalizedTemplatePdfBinary,
  getOriginalTemplatePdfBinary,
  triggerBrowserFileDownload,
} from '../../core/templateStorage';
import type { TemplateAcquisitionResult, AcquireTemplateOptions } from '../../core/templateAcquisitionTypes';
import { createTemplateSchemaFromCandidates, saveTemplateSchema } from '../../core/templateSchemaService';
import type { TemplateCalibrationStatus } from '../../core/templateSchemaTypes';

const SCHOOL_ORDER_FULL_NAMES: Record<string, string> = {
  A1: "Scuola dell'Infanzia",
  A2: "Scuola Primaria",
  A3: "Scuola Secondaria I Grado",
  A4: "Scuola Secondaria II Grado",
};

export type CustomPeiModel = PeiModelDefinition;

interface CustomModelManagerProps {
  customModels: PeiModelDefinition[];
  onAddCustomModel: (model: PeiModelDefinition) => void;
  onUpdateModelStatus: (id: string, status: 'attivo' | 'archiviato') => void;
  onUpdateModelName?: (id: string, newName: string) => void;
  onSetDefaultModel?: (id: string) => void;
  onRemoveDefaultModel?: () => void;
  defaultModelId?: string;
  showToast: (msg: string) => void;
  onOpenCalibration?: (model: PeiModelDefinition) => void;
  onDeleteModel?: (id: string) => void;
  savedDocument?: PeiDocument | null;
}

export const CustomModelManager: React.FC<CustomModelManagerProps> = ({
  customModels,
  onAddCustomModel,
  onUpdateModelStatus,
  onUpdateModelName,
  onSetDefaultModel,
  onRemoveDefaultModel,
  defaultModelId,
  showToast,
  onOpenCalibration,
  onDeleteModel,
  savedDocument,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<PeiModelDefinition | null>(null);
  const [modelToInspect, setModelToInspect] = useState<PeiModelDefinition | null>(null);
  const [modelToRename, setModelToRename] = useState<PeiModelDefinition | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; right?: number } | null>(null);

  // Import form state
  const [modelName, setModelName] = useState('');
  const [schoolOrder, setSchoolOrder] = useState<SchoolOrder | ''>('');
  const [manualSchoolOrderSelected, setManualSchoolOrderSelected] = useState(false);
  const [institution, setInstitution] = useState('');
  const [originType, setOriginType] = useState<ModelOriginType>('INSTITUTION');
  const [description, setDescription] = useState('');
  const [fileName, setFileName] = useState('');
  const [confirmedEmptyAndVerified, setConfirmedEmptyAndVerified] = useState(false);

  const [isAcquiring, setIsAcquiring] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [acquisitionProgress, setAcquisitionProgress] = useState<{
    currentPage: number;
    totalPages: number;
    percentage: number;
    stageLabel: string;
  } | null>(null);
  const [acquisitionStartTime, setAcquisitionStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [acquisitionResult, setAcquisitionResult] = useState<TemplateAcquisitionResult | null>(null);
  const [selectedFileBytes, setSelectedFileBytes] = useState<Uint8Array | null>(null);
  const [docxErrorNotice, setDocxErrorNotice] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Timer per il tempo trascorso durante l'acquisizione
  useEffect(() => {
    let interval: any = null;
    if (isAcquiring && acquisitionStartTime) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - acquisitionStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAcquiring, acquisitionStartTime]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const nameCounts = useMemo(() => {
    const map = new Map<string, number>();
    customModels.forEach((m) => {
      map.set(m.name, (map.get(m.name) || 0) + 1);
    });
    return map;
  }, [customModels]);

  const handleCancelAcquisition = () => {
    if (abortControllerRef.current) {
      setIsAborting(true);
      abortControllerRef.current.abort();
    }
    setIsAcquiring(false);
    setIsAborting(false);
    setAcquisitionProgress(null);
    setAcquisitionStartTime(null);
    setFileName('');
    setSelectedFileBytes(null);
    setAcquisitionResult(null);
    setDocxErrorNotice(null);
  };

  const handleResetFile = () => {
    if (isAcquiring) {
      handleCancelAcquisition();
    }
    setFileName('');
    setSelectedFileBytes(null);
    setAcquisitionResult(null);
    setDocxErrorNotice(null);
    setAcquisitionProgress(null);
    setAcquisitionStartTime(null);
    setModelName('');
    setSchoolOrder('');
    setManualSchoolOrderSelected(false);
    setInstitution('');
    setDescription('');
    setConfirmedEmptyAndVerified(false);
  };

  const handleRealFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setDocxErrorNotice(null);
    setAcquisitionResult(null);
    setSelectedFileBytes(null);
    setAcquisitionProgress(null);
    setIsAborting(false);

    if (file.name.toLowerCase().endsWith('.doc') && !file.name.toLowerCase().endsWith('.docx')) {
      setDocxErrorNotice('Formato DOC legacy non supportato. Convertire in DOCX o PDF.');
      return;
    }

    // Auto-recognize school order from filename ONLY if not manually selected and evidence is clear
    if (!manualSchoolOrderSelected) {
      const upperName = file.name.toUpperCase();
      if (upperName.includes('INFANZIA') || upperName.includes('A1')) {
        setSchoolOrder('A1');
      } else if (upperName.includes('PRIMARIA') || upperName.includes('A2')) {
        setSchoolOrder('A2');
      } else if (upperName.includes('SECONDARIA') && (upperName.includes('1') || upperName.includes('PRIMO'))) {
        setSchoolOrder('A3');
      } else if (upperName.includes('SECONDARIA') && (upperName.includes('2') || upperName.includes('SECONDO') || upperName.includes('SUPERIORE') || upperName.includes('A4'))) {
        setSchoolOrder('A4');
      } else {
        // Nessun ordine predefinito in assenza di evidenze certe: lascia la scelta all'utente
        setSchoolOrder('');
      }
    }

    if (!modelName) {
      setModelName(file.name.replace(/\.[^/.]+$/, ''));
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsAcquiring(true);
    setAcquisitionStartTime(Date.now());
    setElapsedSeconds(0);

    try {
      const sourceBuffer = await file.arrayBuffer();
      if (controller.signal.aborted) return;
      const analysisBytes = new Uint8Array(sourceBuffer).slice();
      const persistenceBytes = new Uint8Array(sourceBuffer).slice();
      setSelectedFileBytes(persistenceBytes);

      const result = await acquirePdfTemplate(analysisBytes, file.name, {
        signal: controller.signal,
        onProgress: (p) => {
          if (!controller.signal.aborted) {
            setAcquisitionProgress({
              currentPage: p.currentPage,
              totalPages: p.totalPages,
              percentage: p.percentage,
              stageLabel: p.stageLabel,
            });
          }
        },
      });

      if (controller.signal.aborted) return;

      setAcquisitionResult(result);

      if (result.status === 'FAILED') {
        setDocxErrorNotice(`Acquisizione fallita: ${result.warnings.join(' ')}`);
      }
    } catch (err: any) {
      if (err?.name === 'AcquisitionAbortedError' || controller.signal.aborted) {
        return;
      }
      setDocxErrorNotice(`Errore lettura file: ${err?.message || err}`);
    } finally {
      if (!controller.signal.aborted) {
        setIsAcquiring(false);
        setAcquisitionStartTime(null);
      }
    }
  };

  const handleDownloadOriginal = async (model: PeiModelDefinition | { templateId?: string; id?: string; sourcePdfSha256?: string; sourceSha256?: string; name?: string }) => {
    try {
      const orig = await getOriginalTemplatePdfBinary(model);
      if (!orig || !orig.binary) {
        showToast('PDF originale non disponibile nel database locale.');
        return;
      }
      const safeName = ((model as any).name || 'Modello').replace(/[^a-zA-Z0-9_\-]/g, '_');
      triggerBrowserFileDownload(orig.binary, `${safeName}_Originale.pdf`);
      showToast(`Download completato: PDF originale (${Math.round(orig.sizeBytes / 1024)} KB)`);
    } catch (err: any) {
      console.error('Errore download PDF originale:', err);
      showToast(`Errore download: ${err?.message || err}`);
    }
  };

  const handleDownloadProcessed = async (model: PeiModelDefinition | { templateId?: string; id?: string; normalizedPdfSha256?: string; normalizedSha256?: string; sourcePdfSha256?: string; sourceSha256?: string; name?: string }) => {
    try {
      const norm = await getNormalizedTemplatePdfBinary(model);
      if (!norm || !norm.binary) {
        showToast('PDF elaborato non disponibile per questo modello (assenza binario normalizzato).');
        return;
      }
      const safeName = ((model as any).name || 'Modello').replace(/[^a-zA-Z0-9_\-]/g, '_');
      triggerBrowserFileDownload(norm.binary, `${safeName}_Elaborato_A4.pdf`);
      showToast(`Download completato: PDF elaborato A4 (${Math.round(norm.sizeBytes / 1024)} KB)`);
    } catch (err: any) {
      console.error('Errore download PDF elaborato:', err);
      showToast(`Errore download: ${err?.message || err}`);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (docxErrorNotice || acquisitionResult?.status === 'FAILED') {
      showToast('Impossibile registrare il modello: correggere gli errori di acquisizione.');
      return;
    }

    if (!modelName || !institution) {
      showToast('Compila i campi obbligatori per registrare il modello.');
      return;
    }

    if (!schoolOrder) {
      showToast('Seleziona l’ordine scolastico di riferimento per il modello.');
      return;
    }

    if (!confirmedEmptyAndVerified) {
      showToast('È obbligatorio confermare che il modello è vuoto e verificato.');
      return;
    }

    if (!acquisitionResult || !selectedFileBytes) {
      showToast('Seleziona un file PDF valido da acquisire.');
      return;
    }

    const nowIso = new Date().toISOString();
    const resolvedEngine = acquisitionResult.engineUsed;
    const resolvedSkew = acquisitionResult.globalSkewDegrees;
    const resolvedPerspective = acquisitionResult.perspectiveApplied;
    const resolvedDewarping = acquisitionResult.dewarpingMapApplied;
    const resolvedMaxCurv = acquisitionResult.localCurvatureMaxDeviationPx;
    const resolvedNormReport = acquisitionResult.normalizationReport;
    const resolvedPageMetrics = acquisitionResult.pageMetrics;

    const newModel: PeiModelDefinition = {
      id: acquisitionResult.templateId,
      name: modelName,
      schoolOrder: schoolOrder as SchoolOrder,
      originType,
      originName: institution,
      version: '1.0',
      acquisitionDate: nowIso.split('T')[0],
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: acquisitionResult.sourceSha256,
      sourceSha256: acquisitionResult.sourceSha256,
      normalizedSha256: acquisitionResult.normalizedSha256,
      sourcePdfSha256: acquisitionResult.sourceSha256,
      normalizedPdfSha256: acquisitionResult.normalizedSha256,
      normalizationSucceeded: acquisitionResult.normalizationSucceeded,
      templateId: acquisitionResult.templateId,
      geometryMappingId: acquisitionResult.templateId,
      calibrationStatus: acquisitionResult.status === 'READY' ? 'READY' : 'REVIEW_REQUIRED',
      description: description || 'Modello personalizzato/territoriale validato dall’istituto.',
      usedCount: 0,
      confirmationState: 'confirmed',
      confirmationDate: nowIso,
      confirmationText: "Confermo che il modello è vuoto e che ne ho verificato l'idoneità.",
      engineUsed: resolvedEngine,
      globalSkewDegrees: resolvedSkew,
      perspectiveApplied: resolvedPerspective,
      dewarpingMapApplied: resolvedDewarping,
      localCurvatureMaxDeviationPx: resolvedMaxCurv,
      normalizationReport: resolvedNormReport,
      pageMetrics: resolvedPageMetrics,
    };

    try {
      if (!selectedFileBytes || selectedFileBytes.byteLength === 0) {
        throw new Error('Sorgente binaria non disponibile.');
      }

      await saveCustomTemplate(
        {
          templateId: acquisitionResult.templateId,
          name: modelName,
          schoolOrder: schoolOrder as SchoolOrder,
          sourceFileName: fileName,
          sourceSha256: acquisitionResult.sourceSha256,
          normalizedSha256: acquisitionResult.normalizedSha256,
          normalizationSucceeded: acquisitionResult.normalizationSucceeded,
          fileSizeBytes: acquisitionResult.fileSizeBytes,
          pageCount: acquisitionResult.pageCount,
          schemaVersion: '1.0.0',
          createdAt: nowIso,
          updatedAt: nowIso,
          calibrationStatus: newModel.calibrationStatus || 'REVIEW_REQUIRED',
          pages: acquisitionResult.pages,
          canonicalDocument: acquisitionResult.canonicalDocument,
          coordinateTransform: acquisitionResult.coordinateTransform,
          engineUsed: resolvedEngine,
          globalSkewDegrees: resolvedSkew,
          perspectiveApplied: resolvedPerspective,
          dewarpingMapApplied: resolvedDewarping,
          localCurvatureMaxDeviationPx: resolvedMaxCurv,
          normalizationReport: resolvedNormReport,
          pageMetrics: resolvedPageMetrics,
        },
        acquisitionResult.canonicalDocument || selectedFileBytes,
        selectedFileBytes
      );

      const verifiedBinary = await getTemplatePdfBinary(acquisitionResult.sourceSha256);
      if (!verifiedBinary || verifiedBinary.byteLength === 0) {
        throw new Error('Verifica persistenza fallita.');
      }

      const initialSchema = createTemplateSchemaFromCandidates(
        acquisitionResult.templateId,
        fileName || modelName,
        acquisitionResult.sourceSha256,
        acquisitionResult.pages,
        acquisitionResult.geometryCandidates,
        'REVIEW_REQUIRED',
        schoolOrder as SchoolOrder
      );
      await saveTemplateSchema(initialSchema);
    } catch (err: any) {
      console.error('Errore persistenza binaria:', err);
      try {
        await deleteCustomTemplate(acquisitionResult.templateId, acquisitionResult.sourceSha256);
      } catch (cleanupErr) {
        console.warn('Rollback cleanup error:', cleanupErr);
      }
      showToast('Errore nel salvataggio del modello in IndexedDB.');
      return;
    }

    onAddCustomModel(newModel);
    showToast(`Modello "${modelName}" registrato con successo.`);
    setIsImporting(false);
    setModelName('');
    setSchoolOrder('');
    setManualSchoolOrderSelected(false);
    setInstitution('');
    setDescription('');
    setFileName('');
    setAcquisitionResult(null);
    setSelectedFileBytes(null);
    setConfirmedEmptyAndVerified(false);

    if (onOpenCalibration) {
      onOpenCalibration(newModel);
    }
  };

  const resolvedDefaultModel = customModels.find((m) => m.id === defaultModelId);

  return (
    <div className="space-y-6">
      {/* 1. INTESTAZIONE */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <div>
          <h3 className="text-base font-bold text-[var(--text-title)] font-serif">Modelli PEI</h3>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Aggiungi un modello e verifica i campi prima di usarlo
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsImporting(true)}
          className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Aggiungi modello</span>
        </button>
      </div>

      {/* 4. MODELLO PREDEFINITO - Riga compatta */}
      <div className="flex items-center justify-between p-3 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded-lg text-xs">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-600 fill-current shrink-0" />
          <div>
            <span className="font-bold text-[var(--text-title)]">Modello predefinito: </span>
            <span className="text-[var(--text)]">
              {resolvedDefaultModel ? `${resolvedDefaultModel.name} (${SCHOOL_ORDER_FULL_NAMES[resolvedDefaultModel.schoolOrder] || resolvedDefaultModel.schoolOrder})` : 'Nessuno: scegli il modello quando crei un PEI'}
            </span>
          </div>
        </div>
        {resolvedDefaultModel && onRemoveDefaultModel && (
          <button
            type="button"
            onClick={onRemoveDefaultModel}
            className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text)] underline cursor-pointer"
          >
            Rimuovi predefinito
          </button>
        )}
      </div>

      {/* Nota salvataggio */}
      <div className="text-[11px] text-[var(--text-secondary)] bg-[var(--card-sub-bg)] p-2.5 rounded-lg border border-[var(--border)] flex items-center gap-2">
        <Info className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0" />
        <span>I modelli aggiunti o modificati vengono salvati subito nel catalogo locale; “Salva e chiudi” in basso gestisce le impostazioni generali.</span>
      </div>

      {/* 2. ELENCO MODELLI */}
      <div className="border border-[var(--border)] rounded-xl overflow-x-auto overflow-y-visible bg-[var(--card-bg)] shadow-xs">
        <table className="w-full text-left border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-[var(--chrome-bg)] text-[var(--text-title)] text-[11px] border-b border-[var(--border)] font-serif">
              <th className="p-3 font-bold">Modello</th>
              <th className="p-3 font-bold w-44">Ordine Scolastico</th>
              <th className="p-3 font-bold w-32">Stato</th>
              <th className="p-3 font-bold text-right w-48">Azione</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] text-xs">
            {customModels.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-[var(--text-secondary)] italic font-medium">
                  Nessun modello personalizzato registrato. I modelli ministeriali A1-A4 restano attivi.
                </td>
              </tr>
            ) : (
              customModels.map((m) => {
                const isCurrentDefault = defaultModelId === m.id;
                const isArchived = m.status === 'archiviato';
                const isReady = m.calibrationStatus === 'CALIBRATED' || m.isMinisterial;
                const displayStatus = isArchived ? 'Archiviato' : isReady ? 'Pronto' : 'Da verificare';
                const hasDuplicate = (nameCounts.get(m.name) || 0) > 1;
                const distinguishingInfo = hasDuplicate ? ` (Acquisizione: ${m.acquisitionDate || m.id.slice(-6)})` : '';

                return (
                  <tr key={m.id} className="hover:bg-[var(--hover-bg)] transition-colors group">
                    <td className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="w-4 h-4 text-amber-800 dark:text-amber-300 shrink-0" />
                        <div>
                          <span className="font-bold text-[var(--text)] text-sm">{m.name}</span>
                          {distinguishingInfo && (
                            <span className="text-[10px] text-[var(--text-secondary)] font-mono block">
                              {distinguishingInfo}
                            </span>
                          )}
                        </div>
                        {isCurrentDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 font-bold ml-auto">
                            <Star className="w-3 h-3 fill-current" /> Predefinito
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-[var(--text)] font-medium">
                      {SCHOOL_ORDER_FULL_NAMES[m.schoolOrder] || m.schoolOrder}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          displayStatus === 'Pronto'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-300'
                            : displayStatus === 'Archiviato'
                            ? 'bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-300'
                            : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300'
                        }`}
                      >
                        {displayStatus.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end relative">
                        {/* 3. Primary Action */}
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenCalibration) {
                              onOpenCalibration(m);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors ${
                            isReady
                              ? 'bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] border border-[var(--border)]'
                              : 'bg-amber-800 hover:bg-amber-900 text-white'
                          }`}
                        >
                          <Compass className="w-3.5 h-3.5" />
                          <span>{isReady ? 'Apri' : 'Verifica campi'}</span>
                        </button>

                        {/* Secondary Menu ⋯ */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              if (openMenuId === m.id) {
                                setOpenMenuId(null);
                                setMenuPosition(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const menuHeight = 220;
                                if (spaceBelow < menuHeight) {
                                  setMenuPosition({
                                    bottom: window.innerHeight - rect.top + 4,
                                    right: window.innerWidth - rect.right,
                                  });
                                } else {
                                  setMenuPosition({
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  });
                                }
                                setOpenMenuId(m.id);
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] hover:text-[var(--text)] border border-[var(--border)] cursor-pointer"
                            title="Altre azioni"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {openMenuId === m.id && (
                            <div
                              ref={menuRef}
                              style={menuPosition ? {
                                position: 'fixed',
                                top: menuPosition.top,
                                bottom: menuPosition.bottom,
                                right: menuPosition.right,
                              } : { position: 'absolute', right: 0, marginTop: '4px' }}
                              className="w-48 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl py-1 z-50 text-left text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setModelToInspect(m);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="w-full px-3 py-2 text-[var(--text)] hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
                              >
                                <Info className="w-3.5 h-3.5 text-stone-400" />
                                <span>Dettagli</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleDownloadOriginal(m);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="w-full px-3 py-2 text-[var(--text)] hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-stone-400" />
                                <span>Scarica originale</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleDownloadProcessed(m);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="w-full px-3 py-2 text-cyan-600 dark:text-cyan-400 hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-cyan-500" />
                                <span>Scarica PDF elaborato</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setModelToRename(m);
                                  setRenameValue(m.name);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="w-full px-3 py-2 text-[var(--text)] hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer border-t border-[var(--border)]"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-stone-400" />
                                <span>Rinomina</span>
                              </button>
                              {onSetDefaultModel && !isCurrentDefault && m.status === 'attivo' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSetDefaultModel(m.id);
                                    setOpenMenuId(null);
                                    setMenuPosition(null);
                                  }}
                                  className="w-full px-3 py-2 text-[var(--text)] hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
                                >
                                  <Star className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Imposta come predefinito</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateModelStatus(m.id, isArchived ? 'attivo' : 'archiviato');
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="w-full px-3 py-2 text-[var(--text)] hover:bg-[var(--hover-bg)] flex items-center gap-2 cursor-pointer"
                              >
                                <Archive className="w-3.5 h-3.5 text-stone-400" />
                                <span>{isArchived ? 'Ripristina' : 'Archivia'}</span>
                              </button>
                              {!m.isMinisterial && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModelToDelete(m);
                                    setOpenMenuId(null);
                                    setMenuPosition(null);
                                  }}
                                  className="w-full px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer border-t border-[var(--border)]"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Elimina</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modale Dettagli Modello (Inclusa sezione "Strumenti avanzati" chiusa inizialmente) */}
      {modelToInspect && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-lg overflow-hidden">
            <div className="bg-[var(--chrome-bg)] px-6 py-4 flex items-center justify-between border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-[var(--text-title)] font-serif">Dettagli Modello: {modelToInspect.name}</h3>
              <button
                type="button"
                onClick={() => setModelToInspect(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 bg-[var(--card-sub-bg)] p-3 rounded-lg border border-[var(--border)]">
                <div>
                  <span className="text-[var(--text-secondary)] block">Ordine Scolastico</span>
                  <strong className="text-[var(--text)]">{SCHOOL_ORDER_FULL_NAMES[modelToInspect.schoolOrder] || modelToInspect.schoolOrder}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)] block">Versione</span>
                  <strong className="text-[var(--text)] font-mono">{modelToInspect.version || '1.0'}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)] block">Ente / Origine</span>
                  <strong className="text-[var(--text)]">{getModelOriginDisplayLabel(modelToInspect)} — {modelToInspect.originName}</strong>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)] block">File Originale</span>
                  <strong className="text-[var(--text)] font-mono truncate">{modelToInspect.sourcePdf || modelToInspect.sourceHash?.slice(0, 16) || 'N/D'}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-[var(--text-secondary)] block">Identificativo / Template ID</span>
                  <strong className="text-[var(--text)] font-mono text-[11px]">{modelToInspect.templateId || modelToInspect.id}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-[var(--text-secondary)] block">Impronta SHA-256 Originale</span>
                  <strong className="text-[var(--text)] font-mono text-[11px] text-stone-700 dark:text-stone-300">{modelToInspect.sourceSha256 || modelToInspect.sourceHash || 'N/D'}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-[var(--text-secondary)] block">Impronta SHA-256 Normalizzato (A4)</span>
                  <strong className="text-[var(--text)] font-mono text-[11px] text-emerald-600 dark:text-emerald-400">{modelToInspect.normalizedSha256 || modelToInspect.normalizedPdfSha256 || 'Non disponibile'}</strong>
                </div>
              </div>

              {/* Sezione Download Binari Verificati */}
              <div className="bg-[var(--card-sub-bg)] p-3 rounded-lg border border-[var(--border)] space-y-2">
                <span className="font-bold text-[var(--text-title)] block">Download Documenti PDF</span>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Scarica il binario originale non modificato oppure il documento A4 normalizzato e rettificato.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDownloadOriginal(modelToInspect)}
                    className="px-3 py-2 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded border border-[var(--border)] font-semibold flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                    title={`Scarica file originale (${modelToInspect.sourceSha256?.slice(0, 8)}…)`}
                  >
                    <Download className="w-3.5 h-3.5 text-stone-400" />
                    <span>Scarica originale</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadProcessed(modelToInspect)}
                    className="px-3 py-2 bg-cyan-950/40 hover:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 rounded border border-cyan-500/40 font-bold flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                    title={`Scarica PDF elaborato A4 (${modelToInspect.normalizedSha256?.slice(0, 8) || 'A4'}…)`}
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-500" />
                    <span>Scarica PDF elaborato</span>
                  </button>
                </div>
              </div>

              {modelToInspect.description && (
                <div>
                  <span className="font-semibold text-[var(--text-secondary)] block mb-1">Descrizione</span>
                  <p className="text-[var(--text)] bg-[var(--card-sub-bg)] p-2.5 rounded border border-[var(--border)]">{modelToInspect.description}</p>
                </div>
              )}



              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModelToInspect(null)}
                  className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale Rinomina Modello */}
      {modelToRename && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-md overflow-hidden">
            <div className="bg-[var(--chrome-bg)] px-6 py-4 flex items-center justify-between border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-[var(--text-title)] font-serif">Rinomina Modello</h3>
              <button
                type="button"
                onClick={() => setModelToRename(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Nuovo nome leggibile</label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-medium"
                />
                <span className="text-[10px] text-[var(--text-secondary)] mt-1 block">
                  L&apos;identificativo interno del modello resterà invariato.
                </span>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setModelToRename(null)}
                  className="px-4 py-2 border border-[var(--border)] rounded text-[var(--text)] hover:bg-[var(--hover-bg)] font-semibold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onUpdateModelName && renameValue.trim()) {
                      onUpdateModelName(modelToRename.id, renameValue.trim());
                      showToast('Modello rinominato con successo.');
                    }
                    setModelToRename(null);
                  }}
                  className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer"
                >
                  Salva nuovo nome
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Finestra modale di importazione modello vuoto */}
      {isImporting && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-lg overflow-hidden">
            <div className="bg-amber-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-200" />
                <h3 className="text-sm font-bold tracking-wide font-serif">AGGIUNGI MODELLO PEI (VUOTO)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImporting(false)}
                className="text-amber-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-[var(--card-sub-bg)] border border-[var(--border)] rounded p-2.5 text-[var(--text)] text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-800 dark:text-amber-300 shrink-0 mt-0.5" />
                <span className="font-medium">
                  Stai aggiungendo un modello <strong>vuoto</strong>. Distingui questa operazione dall&apos;importazione di un PEI già compilato per un alunno.
                </span>
              </div>

              {/* FASE 1: ACQUISIZIONE IN CORSO */}
              {isAcquiring ? (
                <div className="p-5 space-y-4 bg-[var(--card-sub-bg)] rounded-xl border border-[var(--border)] text-xs">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-6 h-6 text-amber-800 dark:text-amber-300 animate-spin shrink-0" />
                    <div className="overflow-hidden">
                      <div className="font-bold text-[var(--text-title)] truncate text-sm">{fileName}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">Acquisizione ed elaborazione documento in corso...</div>
                    </div>
                  </div>

                  {/* Barra di Avanzamento Reale */}
                  <div className="space-y-1.5 pt-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-[var(--text)]">
                        {acquisitionProgress?.stageLabel || 'Analisi preliminare del documento...'}
                      </span>
                      <span className="font-mono text-[var(--text-title)] font-bold">
                        {acquisitionProgress?.percentage ? `${acquisitionProgress.percentage}%` : 'Avvio...'}
                      </span>
                    </div>
                    <div className="w-full bg-[var(--badge-bg)] rounded-full h-2.5 overflow-hidden border border-[var(--border)]">
                      <div
                        className="bg-amber-800 h-2.5 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(5, acquisitionProgress?.percentage || 8))}%` }}
                      />
                    </div>
                  </div>

                  {/* Metriche Reali: Pagine e Timer */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {acquisitionProgress?.totalPages
                          ? `Pagina ${acquisitionProgress.currentPage} di ${acquisitionProgress.totalPages}`
                          : 'Riconoscimento pagine...'}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-[var(--text-secondary)]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Tempo trascorso: <strong className="font-mono text-[var(--text)]">{Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}</strong>
                      </span>
                    </div>
                    {acquisitionProgress && acquisitionProgress.currentPage > 0 && acquisitionProgress.totalPages > 0 && elapsedSeconds > 1 && (
                      <div className="col-span-2 text-right text-[10px] text-[var(--text-secondary)] italic">
                        Tempo stimato restante: {(() => {
                          const avgSec = elapsedSeconds / acquisitionProgress.currentPage;
                          const remPages = acquisitionProgress.totalPages - acquisitionProgress.currentPage;
                          if (remPages <= 0) return 'Quasi completato...';
                          const remSec = Math.max(1, Math.round(avgSec * remPages));
                          return `Circa ${remSec}s rimanenti (stima)`;
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Pulsante Annulla durante elaborazione */}
                  <div className="pt-3 border-t border-[var(--border)] flex justify-end">
                    <button
                      type="button"
                      disabled={isAborting}
                      onClick={handleCancelAcquisition}
                      className="px-4 py-2 border border-rose-600/40 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded font-semibold cursor-pointer disabled:opacity-50 text-xs transition-colors"
                    >
                      {isAborting ? 'Annullamento in corso…' : 'Annulla'}
                    </button>
                  </div>
                </div>
              ) : !acquisitionResult || acquisitionResult.status === 'FAILED' ? (
                /* FASE 0: SELEZIONE FILE O ERRORE */
                <div className="space-y-4">
                  <div>
                    <label className="block font-bold text-[var(--text-title)] mb-1">Seleziona file modello vuoto (PDF) *</label>
                    <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center hover:bg-[var(--hover-bg)] transition-colors relative cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        required
                        onChange={handleRealFileSelect}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center gap-1.5">
                        <Upload className="w-8 h-8 text-amber-800 dark:text-amber-300 mb-1" />
                        <span className="font-bold text-[var(--text)] text-sm">
                          Clicca o trascina qui il file del modello vuoto (PDF)
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                          Supporta PDF vettoriali, scansionati o con campi modulo AcroForm.
                        </span>
                      </div>
                    </div>

                    {docxErrorNotice && (
                      <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-600 text-rose-300 text-[11px] flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-2 flex-1">
                          <div className="font-medium">{docxErrorNotice}</div>
                          <button
                            type="button"
                            onClick={handleResetFile}
                            className="px-3 py-1 bg-rose-900/60 hover:bg-rose-900 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            Riprova con un altro file
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => {
                        handleResetFile();
                        setIsImporting(false);
                      }}
                      className="px-4 py-2 border border-[var(--border)] rounded text-[var(--text)] hover:bg-[var(--hover-bg)] font-semibold cursor-pointer"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                /* FASE 2: DATI E REGISTRAZIONE (Mostrato SOLO dopo completamento acquisizione) */
                <form onSubmit={handleImportSubmit} className="space-y-4">
                  {/* Badge Riepilogo File Acquisito */}
                  <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-600/40 text-emerald-300 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <Sparkles className="w-4 h-4" />
                        Documento Acquisito con Successo
                      </span>
                      <button
                        type="button"
                        onClick={handleResetFile}
                        className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-200 underline cursor-pointer"
                      >
                        Cambia file
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--text)]">
                      <span className="font-medium truncate max-w-[280px]">{fileName}</span>
                      <span className="font-mono text-[10px] font-bold text-[var(--text-secondary)]">
                        {acquisitionResult.pageCount} pag.
                      </span>
                    </div>
                    <div className="pt-1 text-[10px]">
                      {acquisitionResult.geometryCandidates.length === 0 ? (
                        <span className="text-amber-400 font-semibold">
                          0 campi rilevati automaticamente — Necessaria verifica e tracciamento nel Calibratore.
                        </span>
                      ) : (
                        <span className="text-emerald-300 font-semibold">
                          {acquisitionResult.geometryCandidates.length} campi rilevati automaticamente.
                        </span>
                      )}
                    </div>

                    {/* Quick Download Buttons post-acquisizione */}
                    <div className="flex items-center gap-2 pt-2 border-t border-emerald-800/40">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedFileBytes) {
                            triggerBrowserFileDownload(selectedFileBytes, `${modelName || 'Modello'}_Originale.pdf`);
                            showToast(`Download avviato: PDF originale (${Math.round(selectedFileBytes.byteLength / 1024)} KB)`);
                          }
                        }}
                        className="px-2.5 py-1 bg-stone-900/60 hover:bg-stone-900 text-stone-300 rounded border border-stone-700 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                        title={`Scarica file originale (${acquisitionResult.sourceSha256?.slice(0, 8)}…)`}
                      >
                        <Download className="w-3 h-3 text-stone-400" />
                        <span>Scarica originale</span>
                      </button>

                      {acquisitionResult.canonicalDocument && (
                        <button
                          type="button"
                          onClick={() => {
                            if (acquisitionResult.canonicalDocument) {
                              triggerBrowserFileDownload(acquisitionResult.canonicalDocument, `${modelName || 'Modello'}_Elaborato_A4.pdf`);
                              showToast(`Download avviato: PDF elaborato A4 (${Math.round(acquisitionResult.canonicalDocument.byteLength / 1024)} KB)`);
                            }
                          }}
                          className="px-2.5 py-1 bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 rounded border border-cyan-700/60 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          title={`Scarica PDF elaborato A4 (${acquisitionResult.normalizedSha256?.slice(0, 8) || 'A4'}…)`}
                        >
                          <Download className="w-3 h-3 text-cyan-400" />
                          <span>Scarica PDF elaborato (A4)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[var(--text-secondary)] mb-1">Nome leggibile *</label>
                      <input
                        type="text"
                        required
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        placeholder="Es. Comune di Roma — Infanzia"
                        className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[var(--text-secondary)] mb-1">Ordine Scolastico *</label>
                      <select
                        required
                        value={schoolOrder}
                        onChange={(e) => {
                          setSchoolOrder(e.target.value as SchoolOrder);
                          setManualSchoolOrderSelected(true);
                        }}
                        className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-bold"
                      >
                        <option value="" disabled>Seleziona ordine scolastico *</option>
                        <option value="A1">Scuola dell&apos;Infanzia (A1)</option>
                        <option value="A2">Scuola Primaria (A2)</option>
                        <option value="A3">Scuola Secondaria I Grado (A3)</option>
                        <option value="A4">Scuola Secondaria II Grado (A4)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[var(--text-secondary)] mb-1">Ente / Istituto *</label>
                      <input
                        type="text"
                        required
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        placeholder="Es. Comune di Roma"
                        className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-medium"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[var(--text-secondary)] mb-1">Tipologia</label>
                      <select
                        value={originType}
                        onChange={(e) => setOriginType(e.target.value as ModelOriginType)}
                        className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-bold"
                      >
                        <option value="INSTITUTION">Istituto scolastico</option>
                        <option value="TERRITORIAL">Ente locale / Comune</option>
                        <option value="OTHER">Altro ente</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[var(--text-secondary)] mb-1">Note (facoltativo)</label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Note o dettagli sul modello..."
                      className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] resize-none font-medium"
                    />
                  </div>

                  <div className="p-3 bg-[var(--card-sub-bg)] border border-amber-800/40 rounded-lg space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        required
                        checked={confirmedEmptyAndVerified}
                        onChange={(e) => setConfirmedEmptyAndVerified(e.target.checked)}
                        className="mt-0.5 rounded border-[var(--border)] text-amber-800 focus:ring-amber-800 shrink-0 cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold text-[var(--text-title)] leading-snug">
                        Confermo che il modello è vuoto e che ne ho verificato l&apos;idoneità.
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => {
                        handleResetFile();
                        setIsImporting(false);
                      }}
                      className="px-4 py-2 border border-[var(--border)] rounded text-[var(--text)] hover:bg-[var(--hover-bg)] font-semibold cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Aggiungi modello</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finestra modale di conferma eliminazione modello */}
      {modelToDelete && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-md overflow-hidden">
            <div className="bg-rose-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-200" />
                <h3 className="text-sm font-bold tracking-wide font-serif">CONFERMA ELIMINAZIONE MODELLO</h3>
              </div>
              <button
                type="button"
                onClick={() => setModelToDelete(null)}
                className="text-rose-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {(() => {
                const isUsedBySaved =
                  savedDocument &&
                  (savedDocument.modelId === modelToDelete.id || savedDocument.customModelId === modelToDelete.id);

                return (
                  <>
                    <p className="text-[var(--text)] font-medium">
                      Stai per eliminare definitivamente il modello dal catalogo locale:
                    </p>

                    <div className="bg-[var(--card-sub-bg)] border border-[var(--border)] rounded-lg p-3 space-y-1.5 text-[var(--text)]">
                      <div><strong>Nome:</strong> {modelToDelete.name}</div>
                      <div><strong>Ordine:</strong> {SCHOOL_ORDER_FULL_NAMES[modelToDelete.schoolOrder] || modelToDelete.schoolOrder}</div>
                    </div>

                    {isUsedBySaved ? (
                      <div className="p-3 bg-rose-950/40 border border-rose-600 text-rose-300 rounded text-[11px] space-y-1 font-medium">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          Eliminazione bloccata (Modello in uso)
                        </div>
                        <p>
                          Questo modello è attualmente utilizzato dal PEI salvato. Puoi procedere con l&apos;<strong>archiviazione</strong>.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[var(--text-secondary)] text-[11px] italic">
                        L&apos;azione rimuoverà record e calibrazione associati.
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                      <button
                        type="button"
                        onClick={() => setModelToDelete(null)}
                        className="px-4 py-2 border border-[var(--border)] rounded text-[var(--text)] hover:bg-[var(--hover-bg)] font-semibold cursor-pointer"
                      >
                        Annulla
                      </button>
                      <button
                        type="button"
                        disabled={!!isUsedBySaved}
                        onClick={() => {
                          if (onDeleteModel && !isUsedBySaved) {
                            onDeleteModel(modelToDelete.id);
                            setModelToDelete(null);
                          }
                        }}
                        className={`px-5 py-2 rounded font-bold inline-flex items-center gap-1.5 shadow-xs ${
                          isUsedBySaved
                            ? 'bg-stone-300 dark:bg-stone-800 text-stone-500 cursor-not-allowed'
                            : 'bg-rose-800 hover:bg-rose-900 text-white cursor-pointer'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Conferma ed Elimina</span>
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
