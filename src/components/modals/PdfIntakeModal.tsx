import React, { useState } from 'react';
import { processPdfDocument } from '../../core/pdfIntakeService';
import type { PdfIntakeResult } from '../../core/pdfIntakeTypes';
import type { SchoolOrder, PeiDocument } from '../../types/pei';
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  FileSearch,
} from 'lucide-react';

interface PdfIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (importedData: {
    schoolOrder?: SchoolOrder;
    extractedValues: Record<string, string>;
    logs: string[];
  }) => void;
}

export const PdfIntakeModal: React.FC<PdfIntakeModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [selectedOfficialModel, setSelectedOfficialModel] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [intakeResult, setIntakeResult] = useState<PdfIntakeResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSelectedOfficialModel('');
      setIntakeResult(null);
      setErrorMsg(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.type === 'application/pdf' || dropped.name.endsWith('.pdf')) {
        setFile(dropped);
        setSelectedOfficialModel('');
        setIntakeResult(null);
        setErrorMsg(null);
      } else {
        setErrorMsg('Carica esclusivamente file in formato PDF.');
      }
    }
  };

  const handleSelectOfficialPdf = async (modelPath: string) => {
    setSelectedOfficialModel(modelPath);
    setFile(null);
    setIntakeResult(null);
    setErrorMsg(null);
  };

  const runIntake = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProgressStatus('Inizializzazione motore PDF.js R3...');

    try {
      let arrayBuffer: ArrayBuffer;
      let docName = 'documento.pdf';

      if (file) {
        setProgressStatus(`Lettura file ${file.name}...`);
        arrayBuffer = await file.arrayBuffer();
        docName = file.name;
      } else if (selectedOfficialModel) {
        setProgressStatus(`Scaricamento modello ufficiale ${selectedOfficialModel}...`);
        const resp = await fetch(selectedOfficialModel);
        if (!resp.ok) {
          throw new Error(`Impossibile caricare il PDF: ${resp.statusText}`);
        }
        arrayBuffer = await resp.arrayBuffer();
        docName = selectedOfficialModel.split('/').pop() || 'modello.pdf';
      } else {
        throw new Error('Seleziona un file PDF o un modello ministeriale di test.');
      }

      setProgressStatus('Analisi pagine e text layer nativo...');
      const result = await processPdfDocument(arrayBuffer, docName, {
        renderScale: 1.5,
      });

      setIntakeResult(result);
      setProgressStatus('Elaborazione completata con successo!');
    } catch (err: any) {
      console.error('PDF Intake error:', err);
      setErrorMsg(err.message || 'Errore durante l’analisi del documento PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyToEditor = () => {
    if (!intakeResult) return;

    // Detect school order from filename or text
    let detectedOrder: SchoolOrder | undefined = undefined;
    const fullText = intakeResult.pages.map((p) => p.text).join(' ');
    const lower = fullText.toLowerCase();

    if (lower.includes('scuola dell’infanzia') || lower.includes('allegato a1') || intakeResult.fileName.includes('a1')) {
      detectedOrder = 'A1';
    } else if (lower.includes('scuola primaria') || lower.includes('allegato a2') || intakeResult.fileName.includes('a2')) {
      detectedOrder = 'A2';
    } else if (lower.includes('secondaria di primo grado') || lower.includes('allegato a3') || intakeResult.fileName.includes('a3')) {
      detectedOrder = 'A3';
    } else if (lower.includes('secondaria di secondo grado') || lower.includes('allegato a4') || intakeResult.fileName.includes('a4')) {
      detectedOrder = 'A4';
    }

    // Map extracted texts into candidate field values
    const extractedValues: Record<string, string> = {};
    intakeResult.pages.forEach((page, pIdx) => {
      const pageTrimmed = page.text.trim();
      if (pageTrimmed.length > 20) {
        // Map to corresponding section based on page or headers
        if (pIdx === 0) {
          extractedValues['sec1_famiglia'] = pageTrimmed.slice(0, 300);
        } else if (pIdx === 1) {
          extractedValues['sec2_sintesi_profilo'] = pageTrimmed.slice(0, 400);
        } else {
          const key = `sec${Math.min(pIdx + 1, 12)}_approfondimento`;
          extractedValues[key] = pageTrimmed.slice(0, 300);
        }
      }
    });

    onImportSuccess({
      schoolOrder: detectedOrder,
      extractedValues,
      logs: [
        `File elaborato: ${intakeResult.fileName}`,
        `Pagine totali: ${intakeResult.totalPages}`,
        `Caratteri nativi estratti: ${intakeResult.totalNativeChars}`,
        `Tempo esecuzione: ${intakeResult.durationMs}ms`,
        detectedOrder ? `Modello ministeriale rilevato: ${detectedOrder}` : 'Ordine non rilevato con certezza',
      ],
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg border border-stone-300 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-amber-800" />
            <div>
              <h2 className="text-base font-bold font-serif text-stone-900">
                Modulo PDF Intake & OCR R3
              </h2>
              <p className="text-[11px] text-stone-500">
                Ingestione documentale locale basata su PDF.js e Tesseract.js (ita.traineddata)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-stone-200/50 rounded text-stone-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Zona Selezione / Drag & Drop */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-stone-300 hover:border-amber-800 bg-stone-50/50 rounded-lg p-6 text-center space-y-2 cursor-pointer transition-colors"
          >
            <FileSearch className="w-8 h-8 text-stone-400 mx-auto" />
            <div className="font-semibold text-stone-800">
              {file ? (
                <span className="text-emerald-800 font-bold">{file.name}</span>
              ) : selectedOfficialModel ? (
                <span className="text-amber-800 font-bold">
                  Selezionato: {selectedOfficialModel.split('/').pop()}
                </span>
              ) : (
                'Trascina qui il tuo file PDF del PEI o sfoglia i file locali'
              )}
            </div>
            <p className="text-stone-500 text-[11px]">
              Supporta scansioni PDF raster o documenti con text layer nativo
            </p>
            <div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-300 rounded font-medium text-stone-700 hover:bg-stone-50 cursor-pointer shadow-2xs">
                <span>Sfoglia file...</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Test Rapido con Modelli Ufficiali Certificati */}
          <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-2">
            <div className="font-bold text-amber-950 flex items-center justify-between">
              <span>Oppure testa subito con un modello ministeriale certificato:</span>
              <span className="text-[10px] text-amber-700 uppercase">Cartella /models/</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { label: 'A1 Infanzia', path: '/models/allegato-a1-infanzia.pdf' },
                { label: 'A2 Primaria', path: '/models/allegato-a2-primaria.pdf' },
                { label: 'A3 Sec I Gr.', path: '/models/allegato-a3-secondaria-primo-grado.pdf' },
                { label: 'A4 Sec II Gr.', path: '/models/allegato-a4-secondaria-secondo-grado.pdf' },
              ].map((m) => (
                <button
                  key={m.path}
                  type="button"
                  onClick={() => handleSelectOfficialPdf(m.path)}
                  className={`p-2 rounded border text-center transition-all ${
                    selectedOfficialModel === m.path
                      ? 'bg-amber-800 text-white border-amber-900 font-semibold shadow-2xs'
                      : 'bg-white border-stone-200 hover:border-amber-300 text-stone-800'
                  }`}
                >
                  <div className="font-bold text-[11px]">{m.label}</div>
                  <div className="text-[9px] opacity-80 truncate">PDF Ufficiale</div>
                </button>
              ))}
            </div>
          </div>

          {/* Messaggi di Errore */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Risultati Elaborazione Intake */}
          {intakeResult && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg space-y-2 text-emerald-950">
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Analisi completata con successo
                </span>
                <span className="font-mono text-xs">{intakeResult.durationMs}ms</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs bg-white p-2 rounded border border-emerald-200">
                <div>
                  <div className="text-stone-500 text-[10px]">Pagine totali</div>
                  <div className="font-bold font-mono text-sm text-stone-800">
                    {intakeResult.totalPages}
                  </div>
                </div>
                <div>
                  <div className="text-stone-500 text-[10px]">Testo nativo</div>
                  <div className="font-bold font-mono text-sm text-stone-800">
                    {intakeResult.textNativePages} pag.
                  </div>
                </div>
                <div>
                  <div className="text-stone-500 text-[10px]">Caratteri estratti</div>
                  <div className="font-bold font-mono text-sm text-stone-800">
                    {intakeResult.totalNativeChars}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stato in avanzamento */}
          {isProcessing && (
            <div className="p-4 bg-stone-50 border border-stone-200 rounded flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-amber-800 animate-spin" />
              <div>
                <div className="font-semibold text-stone-800">Elaborazione in corso...</div>
                <div className="text-[11px] text-stone-500">{progressStatus}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[var(--chrome-bg)] p-3 border-t border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-stone-500 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Elaborazione locale local-first conforme a GDPR</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-white border border-stone-300 text-stone-700 rounded hover:bg-stone-50"
            >
              Chiudi
            </button>

            {!intakeResult ? (
              <button
                type="button"
                onClick={runIntake}
                disabled={(!file && !selectedOfficialModel) || isProcessing}
                className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 disabled:bg-stone-300 text-white rounded font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>Avvia Ingestione R3</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyToEditor}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Applica dati al PEI</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
