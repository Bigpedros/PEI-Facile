import React, { useState, useEffect } from 'react';
import type { SchoolOrder, PeiModelDefinition } from '../../types/pei';
import type {
  AcquisitionProgress,
  DocumentAcquisitionResult,
  MappingEvidence,
  MultiPageImageItem,
} from '../../types/documentAcquisitionTypes';
import { processDocumentAcquisition } from '../../core/documentAcquisitionService';
import {
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Image as ImageIcon,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  Edit3,
  HelpCircle,
  Layers,
  FileCode,
} from 'lucide-react';

export interface AcquisitionSuccessPayload {
  schoolOrder: SchoolOrder;
  modelId?: string;
  modelName?: string;
  studentCode: string;
  schoolName: string;
  classOrSection: string;
  compilationDate: string;
  extractedValues: Record<string, string>;
  evidenceList: MappingEvidence[];
  logs: string[];
}

interface AcquisitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  customModels?: PeiModelDefinition[];
  onAcquisitionSuccess: (payload: AcquisitionSuccessPayload) => void;
}

export const AcquisitionModal: React.FC<AcquisitionModalProps> = ({
  isOpen,
  onClose,
  customModels = [],
  onAcquisitionSuccess,
}) => {
  // Input mode: 'FILE' | 'MULTI_IMAGE' | 'SAMPLE'
  const [inputMode, setInputMode] = useState<'FILE' | 'MULTI_IMAGE' | 'SAMPLE'>('FILE');
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [imageGallery, setImageGallery] = useState<MultiPageImageItem[]>([]);
  const [selectedSamplePath, setSelectedSamplePath] = useState<string>('');

  // Processing & Progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<AcquisitionProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Result & Review Queue
  const [acquisitionResult, setAcquisitionResult] = useState<DocumentAcquisitionResult | null>(null);
  const [selectedSchoolOrder, setSelectedSchoolOrder] = useState<SchoolOrder>('A2');
  const [editableEvidences, setEditableEvidences] = useState<MappingEvidence[]>([]);
  const [studentCodeInput, setStudentCodeInput] = useState<string>('');
  const [schoolNameInput, setSchoolNameInput] = useState<string>('');
  const [classInput, setClassInput] = useState<string>('');
  const [dateInput, setDateInput] = useState<string>('');

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      imageGallery.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, [imageGallery]);

  if (!isOpen) return null;

  // Gestione caricamento file singolo o misto
  const handleSingleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      if (files.length === 1 && !isImageFile(files[0])) {
        // PDF o DOCX o DOC
        const f = files[0];
        if (f.name.toLowerCase().endsWith('.doc')) {
          setErrorMsg('Formato DOC legacy non ancora supportato. Convertire il file in DOCX o PDF.');
          setSingleFile(null);
          return;
        }
        setSingleFile(f);
        setInputMode('FILE');
        setErrorMsg(null);
      } else {
        // Sequenza di immagini
        const imageItems: MultiPageImageItem[] = files.map((file, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          file,
          previewUrl: URL.createObjectURL(file),
          pageNumber: idx + 1,
          rotationDegrees: 0,
        }));
        setImageGallery(imageItems);
        setInputMode('MULTI_IMAGE');
        setSingleFile(null);
        setErrorMsg(null);
      }
      setSelectedSamplePath('');
      setAcquisitionResult(null);
    }
  };

  const isImageFile = (file: File) => {
    const l = file.name.toLowerCase();
    return l.endsWith('.jpg') || l.endsWith('.jpeg') || l.endsWith('.png') || l.endsWith('.tiff') || l.endsWith('.tif') || file.type.startsWith('image/');
  };

  // Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      if (files.length === 1 && !isImageFile(files[0])) {
        const f = files[0];
        if (f.name.toLowerCase().endsWith('.doc')) {
          setErrorMsg('Formato DOC legacy non ancora supportato. Convertire il file in DOCX o PDF.');
          setSingleFile(null);
          return;
        }
        setSingleFile(f);
        setInputMode('FILE');
        setErrorMsg(null);
      } else {
        const imageItems: MultiPageImageItem[] = files.map((file, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          file,
          previewUrl: URL.createObjectURL(file),
          pageNumber: idx + 1,
          rotationDegrees: 0,
        }));
        setImageGallery(imageItems);
        setInputMode('MULTI_IMAGE');
        setSingleFile(null);
        setErrorMsg(null);
      }
      setSelectedSamplePath('');
      setAcquisitionResult(null);
    }
  };

  // Operazioni su immagini multiple
  const handleAddMoreImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const newItems: MultiPageImageItem[] = files.map((file, idx) => ({
        id: `img_${Date.now()}_${idx}`,
        file,
        previewUrl: URL.createObjectURL(file),
        pageNumber: imageGallery.length + idx + 1,
        rotationDegrees: 0,
      }));
      setImageGallery((prev) => [...prev, ...newItems]);
    }
  };

  const handleRotateImage = (id: string) => {
    setImageGallery((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, rotationDegrees: (item.rotationDegrees + 90) % 360 } : item
      )
    );
  };

  const handleMoveImage = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= imageGallery.length) return;
    const updated = [...imageGallery];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    // Ri-indicizza numeri di pagina
    setImageGallery(updated.map((it, i) => ({ ...it, pageNumber: i + 1 })));
  };

  const handleDeleteImage = (id: string) => {
    setImageGallery((prev) => {
      const filtered = prev.filter((it) => it.id !== id);
      return filtered.map((it, i) => ({ ...it, pageNumber: i + 1 }));
    });
  };

  // Esecuzione Acquisizione
  const runAcquisition = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProgress({
      currentPage: 0,
      totalPages: 0,
      percentage: 2,
      stage: 'READING',
      stageLabel: 'Lettura documento',
      detail: 'Inizializzazione acquisizione...',
    });

    try {
      let inputTarget: File | File[] | ArrayBuffer;
      let targetName = 'documento';

      if (inputMode === 'MULTI_IMAGE' && imageGallery.length > 0) {
        inputTarget = imageGallery.map((it) => it.file);
        targetName = `PEI_Acquisizione_${imageGallery.length}_Pagine.jpg`;
      } else if (inputMode === 'FILE' && singleFile) {
        inputTarget = singleFile;
        targetName = singleFile.name;
      } else if (inputMode === 'SAMPLE' && selectedSamplePath) {
        setProgress({
          currentPage: 0,
          totalPages: 0,
          percentage: 5,
          stage: 'READING',
          stageLabel: 'Lettura documento',
          detail: `Caricamento modello di test ${selectedSamplePath}...`,
        });
        const resp = await fetch(selectedSamplePath);
        if (!resp.ok) {
          throw new Error(`Impossibile scaricare il file di test: ${resp.statusText}`);
        }
        inputTarget = await resp.arrayBuffer();
        targetName = selectedSamplePath.split('/').pop() || 'modello.pdf';
      } else {
        throw new Error('Seleziona un file, una sequenza di immagini o un documento di test.');
      }

      const result = await processDocumentAcquisition(inputTarget, targetName, {
        renderScale: 1.8,
        customModels,
        onProgress: (p) => setProgress(p),
      });

      setAcquisitionResult(result);
      setEditableEvidences(result.evidenceList);
      setSelectedSchoolOrder(result.classification.detectedOrder || 'A2');
      setStudentCodeInput(result.studentCode || 'ALU-ACQUISITO');
      setSchoolNameInput(result.schoolName || 'Istituzione Scolastica');
      setClassInput(result.classOrSection || 'Classe 1^');
      setDateInput(result.compilationDate || new Date().toISOString().split('T')[0]);
    } catch (err: any) {
      console.error('Acquisition error:', err);
      setErrorMsg(err.message || 'Errore durante l’acquisizione del documento.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Aggiornamento evidenza in coda di revisione
  const handleToggleEvidenceStatus = (index: number) => {
    setEditableEvidences((prev) =>
      prev.map((ev, i) =>
        i === index
          ? {
              ...ev,
              status: ev.status === 'IGNORED' ? 'ACCEPTED' : 'IGNORED',
            }
          : ev
      )
    );
  };

  const handleEvidenceValueChange = (index: number, val: string) => {
    setEditableEvidences((prev) =>
      prev.map((ev, i) =>
        i === index
          ? {
              ...ev,
              userModifiedValue: val,
              status: 'MODIFIED',
            }
          : ev
      )
    );
  };

  // Conferma finale: crea NUOVO documento PEI
  const handleConfirmCreateDocument = () => {
    if (!acquisitionResult) return;

    const finalValues: Record<string, string> = {};
    editableEvidences.forEach((ev) => {
      if (ev.status !== 'IGNORED') {
        const val = ev.status === 'MODIFIED' && ev.userModifiedValue !== undefined ? ev.userModifiedValue : ev.extractedValue;
        if (val && val.trim().length > 0) {
          finalValues[ev.fieldId] = val.trim();
        }
      }
    });

    onAcquisitionSuccess({
      schoolOrder: selectedSchoolOrder,
      modelId: acquisitionResult.classification.detectedModelId,
      modelName: acquisitionResult.classification.detectedModelName,
      studentCode: studentCodeInput.trim() || 'ALU-ACQUISITO',
      schoolName: schoolNameInput.trim() || 'Istituzione Scolastica',
      classOrSection: classInput.trim() || 'Classe 1^',
      compilationDate: dateInput.trim() || new Date().toISOString().split('T')[0],
      extractedValues: finalValues,
      evidenceList: editableEvidences,
      logs: [
        `Acquisizione completata da file: ${acquisitionResult.fileName} (${acquisitionResult.detectedFormat})`,
        `Pagine analizzate: ${acquisitionResult.totalPages}`,
        `Campi approvati e registrati nel nuovo PEI: ${Object.keys(finalValues).length}`,
      ],
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-[var(--text)]">
        
        {/* Header Modale */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-raised)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-900/10 border border-amber-800/30 flex items-center justify-center text-amber-800">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-[var(--text)]">
                ACQUISIZIONE PEI
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Seleziona il documento PEI da acquisire.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-md transition-colors"
            title="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Modale */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* FASE 1: Selezione Documento / Immagini (se non ancora elaborato) */}
          {!acquisitionResult && (
            <div className="space-y-5">
              
              {/* Privacy Local-First Guarantee Notice */}
              <div className="flex items-start gap-3 p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-emerald-900 text-xs">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" />
                <p>
                  <strong>Elaborazione locale sicura:</strong> Nessun dato dell'alunno o della scuola viene trasmesso all'esterno.
                  L'acquisizione avviene interamente sul dispositivo locale.
                </p>
              </div>

              {/* Area Drag & Drop Principale */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-[var(--border)] hover:border-amber-800/60 rounded-xl p-6 text-center transition-colors bg-[var(--surface-hover)]/30 flex flex-col items-center justify-center cursor-pointer relative"
              >
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.docx,.doc"
                  onChange={handleSingleFileInput}
                  disabled={isProcessing}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  title="Seleziona file o immagini"
                />
                <div className="w-12 h-12 rounded-full bg-amber-900/10 flex items-center justify-center text-amber-800 mb-3">
                  <FileCode className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-[var(--text)] mb-1">
                  Trascina qui il documento o clicca per sfogliare
                </p>
                <p className="text-xs text-[var(--text-secondary)] max-w-md">
                  Supporta <strong>PDF</strong>, immagini singole o multiple (<strong>JPG, PNG, TIFF</strong>) e documenti <strong>DOCX</strong>.
                </p>
              </div>

              {/* Anteprima File Singolo Selezionato */}
              {inputMode === 'FILE' && singleFile && (
                <div className="flex items-center justify-between p-3.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-amber-800" />
                    <div>
                      <p className="text-xs font-semibold text-[var(--text)]">{singleFile.name}</p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {(singleFile.size / 1024 / 1024).toFixed(2)} MB • Formato identificato
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSingleFile(null)}
                    className="p-1 text-[var(--text-secondary)] hover:text-red-500 rounded"
                    title="Rimuovi"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Anteprima Galleria Immagini Multiple */}
              {inputMode === 'MULTI_IMAGE' && imageGallery.length > 0 && (
                <div className="space-y-3 p-4 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text)] flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-amber-800" />
                      Sequenza Pagine PEI ({imageGallery.length} pagine caricate)
                    </span>
                    <label className="text-xs text-amber-800 font-semibold cursor-pointer hover:underline flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Aggiungi ulteriori pagine
                      <input
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.tiff,.tif"
                        onChange={handleAddMoreImages}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
                    {imageGallery.map((item, idx) => (
                      <div
                        key={item.id}
                        className="border border-[var(--border)] rounded-lg p-2 bg-[var(--surface)] flex flex-col gap-2 relative group"
                      >
                        <div className="relative aspect-[3/4] bg-neutral-900 rounded overflow-hidden flex items-center justify-center">
                          <img
                            src={item.previewUrl}
                            alt={`Pagina ${item.pageNumber}`}
                            className="object-contain w-full h-full transition-transform duration-200"
                            style={{ transform: `rotate(${item.rotationDegrees}deg)` }}
                          />
                          <span className="absolute top-1 left-1 bg-black/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            Pag. {item.pageNumber}
                          </span>
                        </div>

                        {/* Toolbar di gestione pagina */}
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border)]">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, 'UP')}
                              disabled={idx === 0}
                              className="p-1 hover:text-[var(--text)] disabled:opacity-30 rounded hover:bg-[var(--surface-hover)]"
                              title="Sposta prima"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveImage(idx, 'DOWN')}
                              disabled={idx === imageGallery.length - 1}
                              className="p-1 hover:text-[var(--text)] disabled:opacity-30 rounded hover:bg-[var(--surface-hover)]"
                              title="Sposta dopo"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRotateImage(item.id)}
                              className="p-1 hover:text-amber-800 rounded hover:bg-[var(--surface-hover)]"
                              title="Ruota 90°"
                            >
                              <RotateCw className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteImage(item.id)}
                              className="p-1 hover:text-red-500 rounded hover:bg-[var(--surface-hover)]"
                              title="Elimina pagina"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modelli di Esempio Ministeriali per test rapido */}
              <div className="p-3.5 bg-[var(--surface-raised)] border border-[var(--border)] rounded-lg space-y-2">
                <span className="text-xs font-semibold text-[var(--text)]">
                  Oppure esegui una prova con un modello ministeriale di test:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'A1', name: 'Infanzia (A1)', path: '/ALLEGATO_A1_PEI_INFANZIA.pdf' },
                    { id: 'A2', name: 'Primaria (A2)', path: '/ALLEGATO_A2_PEI_PRIMARIA.pdf' },
                    { id: 'A3', name: 'Secondaria I (A3)', path: '/ALLEGATO_A3_PEI_SEC_1_GRADO.pdf' },
                    { id: 'A4', name: 'Secondaria II (A4)', path: '/ALLEGATO_A4_PEI_SEC_2_GRADO.pdf' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedSamplePath(m.path);
                        setInputMode('SAMPLE');
                        setSingleFile(null);
                        setImageGallery([]);
                        setErrorMsg(null);
                      }}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                        selectedSamplePath === m.path
                          ? 'border-amber-800 bg-amber-900/10 text-amber-900 font-bold'
                          : 'border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text)]'
                      }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Barra di avanzamento reale durante l'elaborazione */}
              {isProcessing && progress && (
                <div className="p-4 bg-[var(--surface-raised)] border border-amber-800/30 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--text)]">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-amber-800" />
                      ACQUISIZIONE IN CORSO — {progress.stageLabel}
                    </span>
                    <span className="text-amber-800 font-bold">{progress.percentage}%</span>
                  </div>

                  <div className="w-full bg-[var(--border)] rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-amber-800 h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>

                  <p className="text-xs text-[var(--text-secondary)]">{progress.detail}</p>
                </div>
              )}

              {/* Messaggio di Errore */}
              {errorMsg && (
                <div className="flex items-start gap-3 p-3.5 bg-red-950/20 border border-red-800/40 rounded-lg text-red-900 text-xs">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                  <p>{errorMsg}</p>
                </div>
              )}
            </div>
          )}

          {/* FASE 2: Coda di Revisione Semantica (OCR PROPONE → UTENTE VERIFICA → APPLICAZIONE REGISTRA) */}
          {acquisitionResult && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Esito Riconoscimento Modello */}
              <div className="p-4 bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Classificazione Modello Documento
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {acquisitionResult.classification.isModelRecognized ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/30 text-emerald-800 border border-emerald-800/30">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          {acquisitionResult.classification.detectedModelName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/30 text-amber-800 border border-amber-800/30">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          MODELLO NON RICONOSCIUTO
                        </span>
                      )}
                      <span className="text-xs text-[var(--text-secondary)]">
                        • {acquisitionResult.totalPages} pagine analizzate
                      </span>
                    </div>
                  </div>

                  {/* Selettore Ordine / Modello per il nuovo PEI */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-[var(--text)] whitespace-nowrap">
                      Modello di destinazione:
                    </label>
                    <select
                      value={selectedSchoolOrder}
                      onChange={(e) => setSelectedSchoolOrder(e.target.value as SchoolOrder)}
                      className="px-2.5 py-1 text-xs font-semibold bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800"
                    >
                      <option value="A1">A1 — Infanzia</option>
                      <option value="A2">A2 — Primaria</option>
                      <option value="A3">A3 — Secondaria I Grado</option>
                      <option value="A4">A4 — Secondaria II Grado</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                  {acquisitionResult.classification.recognitionReason}
                </p>
              </div>

              {/* Dati Generali Riconosciuti */}
              <div className="p-4 bg-[var(--surface-raised)] border border-[var(--border)] rounded-xl space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Dati Identificativi per il Nuovo PEI
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      Identificativo Alunno
                    </label>
                    <input
                      type="text"
                      value={studentCodeInput}
                      onChange={(e) => setStudentCodeInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                      placeholder="Codice alunno..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      Istituzione Scolastica
                    </label>
                    <input
                      type="text"
                      value={schoolNameInput}
                      onChange={(e) => setSchoolNameInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                      placeholder="Nome scuola..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      Classe / Sezione
                    </label>
                    <input
                      type="text"
                      value={classInput}
                      onChange={(e) => setClassInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                      placeholder="Classe / Sezione..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      Data Redazione
                    </label>
                    <input
                      type="text"
                      value={dateInput}
                      onChange={(e) => setDateInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
                      placeholder="AAAA-MM-GG"
                    />
                  </div>
                </div>
              </div>

              {/* Elenco Evidenze e Campi Riconosciuti */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Campi Riconosciuti ({editableEvidences.length} Proposte)
                    </h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      Verifica i valori prima della creazione del documento. Puoi modificare il testo o escludere i campi non desiderati.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditableEvidences((prev) => prev.map((ev) => ({ ...ev, status: 'ACCEPTED' })))
                      }
                      className="px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-900/10 rounded transition-colors"
                    >
                      Accetta Tutti
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditableEvidences((prev) => prev.map((ev) => ({ ...ev, status: 'IGNORED' })))
                      }
                      className="px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] rounded transition-colors"
                    >
                      Escludi Tutti
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {editableEvidences.map((ev, idx) => {
                    const isAccepted = ev.status !== 'IGNORED';
                    const currentValue = ev.userModifiedValue !== undefined ? ev.userModifiedValue : ev.extractedValue;

                    return (
                      <div
                        key={ev.fieldId + '_' + idx}
                        className={`p-3.5 rounded-lg border transition-colors ${
                          isAccepted
                            ? 'bg-[var(--surface-raised)] border-[var(--border)]'
                            : 'bg-neutral-900/40 border-neutral-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isAccepted}
                              onChange={() => handleToggleEvidenceStatus(idx)}
                              className="w-4 h-4 rounded text-amber-800 focus:ring-amber-800 cursor-pointer"
                              id={`check_${ev.fieldId}_${idx}`}
                            />
                            <label
                              htmlFor={`check_${ev.fieldId}_${idx}`}
                              className="text-xs font-bold text-[var(--text)] cursor-pointer"
                            >
                              {ev.fieldLabel}
                            </label>
                            <span className="text-[10px] text-[var(--text-secondary)] px-1.5 py-0.5 bg-[var(--surface)] border border-[var(--border)] rounded">
                              {ev.sectionTitle}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                ev.confidence >= 80
                                  ? 'bg-emerald-950/40 text-emerald-700 border border-emerald-800/30'
                                  : ev.confidence >= 60
                                  ? 'bg-amber-950/40 text-amber-700 border border-amber-800/30'
                                  : 'bg-neutral-800 text-neutral-400'
                              }`}
                            >
                              Confidenza: {ev.confidence}%
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)]">
                              Pag. {ev.pageNumber}
                            </span>
                          </div>
                        </div>

                        {/* Valore Proposto Modificabile */}
                        {isAccepted && (
                          <div className="mt-2 space-y-1.5 pl-6">
                            <textarea
                              value={currentValue}
                              onChange={(e) => handleEvidenceValueChange(idx, e.target.value)}
                              rows={Math.min(4, Math.max(1, Math.ceil(currentValue.length / 80)))}
                              className="w-full px-2.5 py-1.5 text-xs bg-[var(--input-bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-sans leading-relaxed"
                              placeholder="Inserisci o correggi il valore del campo..."
                            />
                            <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                              <span className="italic truncate max-w-lg" title={ev.mappingReason}>
                                Motivo: {ev.mappingReason}
                              </span>
                              {ev.status === 'MODIFIED' && (
                                <span className="text-amber-800 font-semibold">Modificato dall’utente</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Avviso Autonomia Documento */}
              <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg text-amber-900 text-xs flex items-center gap-2">
                <HelpCircle className="w-4 h-4 shrink-0 text-amber-800" />
                <span>
                  <strong>Nota di integrità:</strong> La conferma genererà un'istanza autonoma di PEI. Il PEI precedentemente attivo non verrà sovrascritto.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modale con Azioni */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--surface-raised)]">
          <button
            type="button"
            onClick={() => {
              if (acquisitionResult) {
                setAcquisitionResult(null);
                setProgress(null);
              } else {
                onClose();
              }
            }}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
          >
            {acquisitionResult ? 'Indietro' : 'Annulla'}
          </button>

          {!acquisitionResult ? (
            <button
              type="button"
              onClick={runAcquisition}
              disabled={
                isProcessing ||
                (inputMode === 'FILE' && !singleFile) ||
                (inputMode === 'MULTI_IMAGE' && imageGallery.length === 0) ||
                (inputMode === 'SAMPLE' && !selectedSamplePath)
              }
              className="px-5 py-2 text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  ACQUISIZIONE IN CORSO...
                </>
              ) : (
                <>
                  AVVIA ACQUISIZIONE
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirmCreateDocument}
              className="px-5 py-2 text-xs font-bold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Conferma e Crea Documento PEI
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Aliases for compatibility
export const PdfIntakeModal = AcquisitionModal;
