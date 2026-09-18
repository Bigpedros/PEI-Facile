import React, { useState } from 'react';
import type { SchoolOrder, PeiModelDefinition, ModelOriginType } from '../../types/pei';
import { getModelOriginDisplayLabel } from '../../data/peiModelRegistry';
import { FileText, Upload, Check, Trash2, Archive, AlertCircle, Building, Shield, Star, CheckSquare, Sparkles, AlertTriangle, Compass } from 'lucide-react';
import { acquirePdfTemplate } from '../../core/templateAcquisitionService';
import { saveCustomTemplate, getTemplatePdfBinary, deleteCustomTemplate } from '../../core/templateStorage';
import type { TemplateAcquisitionResult } from '../../core/templateAcquisitionTypes';
import { createTemplateSchemaFromCandidates, saveTemplateSchema } from '../../core/templateSchemaService';
import type { TemplateCalibrationStatus } from '../../core/templateSchemaTypes';

export type CustomPeiModel = PeiModelDefinition;

interface CustomModelManagerProps {
  customModels: PeiModelDefinition[];
  onAddCustomModel: (model: PeiModelDefinition) => void;
  onUpdateModelStatus: (id: string, status: 'attivo' | 'archiviato') => void;
  onSetDefaultModel?: (id: string) => void;
  defaultModelId?: string;
  showToast: (msg: string) => void;
  onOpenCalibration?: (model: PeiModelDefinition) => void;
}

export const CustomModelManager: React.FC<CustomModelManagerProps> = ({
  customModels,
  onAddCustomModel,
  onUpdateModelStatus,
  onSetDefaultModel,
  defaultModelId,
  showToast,
  onOpenCalibration,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [modelName, setModelName] = useState('');
  const [schoolOrder, setSchoolOrder] = useState<SchoolOrder>('A3');
  const [institution, setInstitution] = useState('');
  const [originType, setOriginType] = useState<ModelOriginType>('INSTITUTION');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState<'PDF' | 'DOCX'>('PDF');
  const [fileName, setFileName] = useState('');
  const [confirmedEmptyAndVerified, setConfirmedEmptyAndVerified] = useState(false);

  const [isAcquiring, setIsAcquiring] = useState(false);
  const [acquisitionResult, setAcquisitionResult] = useState<TemplateAcquisitionResult | null>(null);
  const [selectedFileBytes, setSelectedFileBytes] = useState<Uint8Array | null>(null);
  const [docxErrorNotice, setDocxErrorNotice] = useState<string | null>(null);

  const handleRealFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setDocxErrorNotice(null);
    setAcquisitionResult(null);
    setSelectedFileBytes(null);

    // Mandated DOCX Check (Honest Classification)
    if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
      setFormat('DOCX');
      setDocxErrorNotice(
        'DOCX CANONICALIZATION: NOT IMPLEMENTED — I modelli DOCX richiedono la preventiva normalizzazione ed esportazione in PDF canonico. PEI FACILE non simula il rendering DOCX per garantire l’integrità geometrica e giuridica del documento.'
      );
      return;
    }

    setFormat('PDF');
    if (!modelName) {
      setModelName(file.name.replace(/\.[^/.]+$/, ''));
    }

    setIsAcquiring(true);
    try {
      const sourceBuffer = await file.arrayBuffer();
      // R05: Create physically independent copies
      const analysisBytes = new Uint8Array(sourceBuffer).slice();
      const persistenceBytes = new Uint8Array(sourceBuffer).slice();
      setSelectedFileBytes(persistenceBytes);

      const result = await acquirePdfTemplate(analysisBytes, file.name);
      setAcquisitionResult(result);

      if (result.status === 'FAILED') {
        setDocxErrorNotice(`Acquisizione fallita: ${result.warnings.join(' ')}`);
      }
    } catch (err: any) {
      setDocxErrorNotice(`Errore lettura PDF: ${err?.message || err}`);
    } finally {
      setIsAcquiring(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (docxErrorNotice) {
      showToast('Impossibile registrare il modello: correggere gli errori di formato.');
      return;
    }

    if (!modelName || !institution) {
      showToast('Compila i campi obbligatori per registrare il modello.');
      return;
    }

    if (!confirmedEmptyAndVerified) {
      showToast('È obbligatorio confermare che il modello è vuoto e verificato prima di procedere.');
      return;
    }

    if (!acquisitionResult || !selectedFileBytes) {
      showToast('Seleziona un file PDF valido da acquisire.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newModel: PeiModelDefinition = {
      id: `model_${Date.now()}`,
      name: modelName,
      schoolOrder,
      originType,
      originName: institution,
      version: '1.0',
      acquisitionDate: nowIso.split('T')[0],
      format: 'PDF',
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: acquisitionResult.sourceSha256,
      templateId: acquisitionResult.templateId,
      geometryMappingId: acquisitionResult.templateId,
      calibrationStatus: acquisitionResult.status === 'READY' ? 'READY' : 'REVIEW_REQUIRED',
      description: description || 'Modello personalizzato/territoriale validato dall’istituto o ente competente.',
      usedCount: 0,
      confirmationState: 'confirmed',
      confirmationDate: nowIso,
      confirmationText: "Confermo che il modello è vuoto e che ne ho verificato l'adozione/idoneità presso l'istituzione competente.",
    };

    // R05 Transactional Gate:
    // 1. Lettura / verifica byte di persistenza
    // 2. Salvataggio PDF binario + metadati in IndexedDB
    // 3. Verifica successo persistenza
    // 4. Salvataggio TemplateSchema iniziale
    // 5. SOLO SE TUTTO HA SUCCESSO: onAddCustomModel(newModel)
    // 6. SOLO DOPO: onOpenCalibration(newModel)
    try {
      if (!selectedFileBytes || selectedFileBytes.byteLength === 0) {
        throw new Error('Sorgente binaria PDF non disponibile o vuota.');
      }

      await saveCustomTemplate(
        {
          templateId: acquisitionResult.templateId,
          name: modelName,
          schoolOrder,
          sourceFileName: fileName,
          sourceSha256: acquisitionResult.sourceSha256,
          fileSizeBytes: acquisitionResult.fileSizeBytes,
          pageCount: acquisitionResult.pageCount,
          schemaVersion: '1.0.0',
          createdAt: nowIso,
          updatedAt: nowIso,
          calibrationStatus: newModel.calibrationStatus || 'REVIEW_REQUIRED',
          pages: acquisitionResult.pages,
        },
        selectedFileBytes
      );

      // Verifica successo persistenza binaria
      const verifiedBinary = await getTemplatePdfBinary(acquisitionResult.sourceSha256);
      if (!verifiedBinary || verifiedBinary.byteLength === 0) {
        throw new Error('Verifica persistenza fallita: binario non recuperabile da IndexedDB');
      }

      // Generate and save initial TemplateSchema
      const calibStatus: TemplateCalibrationStatus =
        newModel.calibrationStatus === 'CALIBRATED' ? 'CALIBRATED' : 'REVIEW_REQUIRED';

      const initialSchema = createTemplateSchemaFromCandidates(
        acquisitionResult.templateId,
        fileName || modelName,
        acquisitionResult.sourceSha256,
        acquisitionResult.pages,
        acquisitionResult.geometryCandidates,
        calibStatus,
        schoolOrder
      );
      await saveTemplateSchema(initialSchema);
    } catch (err: any) {
      console.error('Errore persistenza binaria modello custom:', err);
      // Rollback di eventuali record parziali in IndexedDB
      try {
        await deleteCustomTemplate(acquisitionResult.templateId, acquisitionResult.sourceSha256);
      } catch (cleanupErr) {
        console.warn('Errore cleanup rollback:', cleanupErr);
      }

      const userErrorMessage =
        'Il modello non è stato acquisito perché non è stato possibile salvare il PDF sorgente. Nessun modello è stato registrato. Riprova l\'acquisizione.';
      setDocxErrorNotice(userErrorMessage);
      showToast(userErrorMessage);
      return; // STOP BLOCCANTE: non registrare modello, non aprire calibratore
    }

    onAddCustomModel(newModel);
    showToast(`Modello "${modelName}" registrato con successo. Apertura calibrazione...`);
    setIsImporting(false);
    setModelName('');
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-[var(--text-title)] text-xs md:text-sm">Modelli PEI Aggiuntivi e Territoriali</h4>
          <p className="text-[11px] text-[var(--text-secondary)] font-medium">
            Gestisci modelli adottati da scuole, enti locali o amministrazioni territoriali oltre a quelli ministeriali A1-A4.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsImporting(true)}
          className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Importa nuovo modello</span>
        </button>
      </div>

      {/* Lista Modelli Personalizzati Esistenti */}
      <div className="border border-[var(--border)] rounded-lg overflow-x-auto bg-[var(--card-bg)] shadow-xs">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="bg-[var(--chrome-bg)] text-[var(--text-title)] text-[11px] border-b border-[var(--border)]">
              <th className="p-2.5 font-bold min-w-[200px]">Nome Modello</th>
              <th className="p-2.5 font-bold w-20 text-center">Ordine</th>
              <th className="p-2.5 font-bold min-w-[160px]">Ente / Origine</th>
              <th className="p-2.5 font-bold w-20 text-center">Versione</th>
              <th className="p-2.5 font-bold min-w-[120px]">Stato</th>
              <th className="p-2.5 font-bold text-right min-w-[210px] sticky right-0 bg-[var(--chrome-bg)] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] text-xs">
            {customModels.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-[var(--text-secondary)] italic font-medium">
                  Nessun modello personalizzato registrato. I modelli ministeriali A1-A4 restano pienamente attivi.
                </td>
              </tr>
            ) : (
              customModels.map((m) => {
                const isCurrentDefault = defaultModelId === m.id || m.isDefault;
                return (
                  <tr key={m.id} className="hover:bg-[var(--hover-bg)] transition-colors group">
                    <td className="p-2.5 font-bold text-[var(--text)]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <FileText className="w-3.5 h-3.5 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0" />
                        <span className="break-words">{m.name}</span>
                        {isCurrentDefault && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold shrink-0">
                            <Star className="w-2.5 h-2.5 fill-current" /> Predefinito
                          </span>
                        )}
                      </div>
                      {m.description && <div className="text-[10px] text-[var(--text-secondary)] font-medium mt-0.5">{m.description}</div>}
                    </td>
                    <td className="p-2.5 text-[var(--text)] font-semibold text-center">{m.schoolOrder}</td>
                    <td className="p-2.5 text-[var(--text)] font-medium">
                      <div className="font-semibold">{getModelOriginDisplayLabel(m)}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Ente dichiarato: {m.originName}</div>
                      {m.confirmationState === 'confirmed' && (
                        <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                          <CheckSquare className="w-2.5 h-2.5" /> Idoneità confermata dall&apos;utente
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-[var(--text-secondary)] font-mono text-[11px] font-medium text-center">{m.version}</td>
                    <td className="p-2.5 space-y-1">
                      <div>
                        {m.status === 'archiviato' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border border-stone-300">
                            ARCHIVIATO
                          </span>
                        ) : m.isMinisterial ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-300">
                            PRECALIBRATO
                          </span>
                        ) : m.calibrationStatus === 'CALIBRATED' ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                            CALIBRATO
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300">
                            DA CALIBRARE
                          </span>
                        )}
                      </div>
                      <div>
                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                            m.calibrationStatus === 'CALIBRATED'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-400'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-400'
                          }`}
                        >
                          {m.calibrationStatus === 'CALIBRATED' ? 'CALIBRATED' : 'IN REVISIONE'}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-right whitespace-nowrap sticky right-0 bg-[var(--card-bg)] group-hover:bg-[var(--hover-bg)] shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenCalibration) {
                              onOpenCalibration(m);
                            } else {
                              window.location.search = `?dev=geometry&model=${m.templateId || m.id}`;
                            }
                          }}
                          title="Apri calibrazione geometrica per questo modello"
                          className="px-2.5 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] inline-flex items-center gap-1 font-semibold cursor-pointer shadow-2xs"
                        >
                          <Compass className="w-3 h-3" />
                          <span>Calibra</span>
                        </button>

                        {onSetDefaultModel && m.status === 'attivo' && !isCurrentDefault && (
                          <button
                            type="button"
                            onClick={() => onSetDefaultModel(m.id)}
                            title="Imposta come modello predefinito per questo ordine"
                            className="px-2 py-1 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded text-[11px] inline-flex items-center gap-1 border border-[var(--border)] font-semibold cursor-pointer"
                          >
                            <Star className="w-3 h-3 text-amber-600" />
                            <span>Predefinito</span>
                          </button>
                        )}
                        {m.status === 'attivo' ? (
                          <button
                            type="button"
                            onClick={() => onUpdateModelStatus(m.id, 'archiviato')}
                            title="Archivia modello (non sarà disponibile per nuovi PEI)"
                            className="px-2 py-1 bg-[var(--badge-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)] rounded text-[11px] inline-flex items-center gap-1 border border-[var(--border)] font-semibold cursor-pointer"
                          >
                            <Archive className="w-3 h-3 text-[var(--text-secondary)]" />
                            <span>Archivia</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUpdateModelStatus(m.id, 'attivo')}
                            title="Riattiva modello"
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold border border-emerald-300 cursor-pointer"
                          >
                            Riattiva
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Finestra modale di importazione modello vuoto */}
      {isImporting && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-amber-200" />
                <h3 className="text-sm font-bold tracking-wide font-serif">IMPORTA NUOVO MODELLO PEI (VUOTO)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImporting(false)}
                className="text-amber-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-6 space-y-4 text-xs">
              <div className="bg-[var(--card-sub-bg)] border border-[var(--border)] rounded p-2.5 text-[var(--text)] text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)] shrink-0 mt-0.5" />
                <span className="font-medium">
                  Acquisisci un modello vuoto (PDF o DOCX) adottato dall&apos;istituto o dall&apos;ente locale. Il sistema analizza la struttura e registra il modello nel catalogo unico senza memorizzare dati di alunni.
                </span>
              </div>

              <div>
                <label className="block font-bold text-[var(--text-title)] mb-1">Seleziona file modello (PDF canonico) *</label>
                <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-4 text-center hover:bg-[var(--hover-bg)] transition-colors relative cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    required
                    onChange={handleRealFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-6 h-6 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                    <span className="font-bold text-[var(--text)]">
                      {isAcquiring ? 'Acquisizione in corso…' : fileName || 'Clicca o trascina qui il file del modello'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">
                      PDF canonico (AcroForm, Annotazioni, Vettoriale). I file DOCX richiedono esportazione PDF.
                    </span>
                  </div>
                </div>

                {/* Honest DOCX Classification Warning */}
                {docxErrorNotice && (
                  <div className="mt-2 p-2.5 rounded bg-rose-950/40 border border-rose-600 text-rose-300 text-[11px] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="font-medium">{docxErrorNotice}</div>
                  </div>
                )}

                {/* Successful Dynamic Acquisition Feedback */}
                {acquisitionResult && !docxErrorNotice && (
                  <div className="mt-2 p-2.5 rounded bg-emerald-950/40 border border-emerald-600/50 text-emerald-300 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Template Acquisito ({acquisitionResult.status})
                      </span>
                      <span className="font-mono text-[10px]">
                        {acquisitionResult.pageCount} pag. — {acquisitionResult.geometryCandidates.length} campi
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-emerald-400/80 truncate">
                      SHA-256: {acquisitionResult.sourceSha256}
                    </div>
                    {acquisitionResult.status === 'REVIEW_REQUIRED' && (
                      <div className="text-[10px] text-amber-300">
                        Richiede calibrazione geometrica dei campi prima della compilazione finale.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Nome Modello *</label>
                  <input
                    type="text"
                    required
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Es. Modello PEI Inclusivo Comune"
                    className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Ordine Scolastico</label>
                  <select
                    value={schoolOrder}
                    onChange={(e) => setSchoolOrder(e.target.value as SchoolOrder)}
                    className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-bold"
                  >
                    <option value="A1">A1 — Infanzia</option>
                    <option value="A2">A2 — Primaria</option>
                    <option value="A3">A3 — Secondaria I Grado</option>
                    <option value="A4">A4 — Secondaria II Grado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Ente / Istituto di provenienza *</label>
                  <input
                    type="text"
                    required
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="Es. I.C. Via dei Mille / Comune di Roma"
                    className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Tipologia di Origine</label>
                  <select
                    value={originType}
                    onChange={(e) => setOriginType(e.target.value as ModelOriginType)}
                    className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] font-bold"
                  >
                    <option value="INSTITUTION">Istituto scolastico</option>
                    <option value="TERRITORIAL">Ente locale / Comune / Territorio</option>
                    <option value="OTHER">Altro ente competente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Descrizione / Note (facoltativo)</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Note sulla conformità o specificità del modello..."
                  className="w-full p-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] resize-none font-medium"
                />
              </div>

              {/* Dichiarazione di idoneità e assenza dati (OBBLIGATORIA) */}
              <div className="p-3 bg-[var(--card-sub-bg)] border-2 border-amber-800/40 dark:border-amber-700/50 rounded-lg space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    required
                    checked={confirmedEmptyAndVerified}
                    onChange={(e) => setConfirmedEmptyAndVerified(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border)] text-amber-800 focus:ring-amber-800 shrink-0 cursor-pointer"
                  />
                  <span className="text-[11px] font-semibold text-[var(--text-title)] leading-snug">
                    Confermo che il modello è vuoto e che ne ho verificato l&apos;adozione/idoneità presso l&apos;istituzione competente.
                  </span>
                </label>
                <p className="text-[10px] text-[var(--text-secondary)] pl-6 leading-normal font-medium">
                  Questa conferma viene salvata localmente nel registro del modello a tutela della conformità amministrativa del documento.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsImporting(false)}
                  className="px-4 py-2 border border-[var(--border)] rounded text-[var(--text)] hover:bg-[var(--hover-bg)] font-semibold cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>Registra Modello</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

