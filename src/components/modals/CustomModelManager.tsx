import React, { useState } from 'react';
import type { SchoolOrder, PeiModelDefinition, ModelOriginType } from '../../types/pei';
import { getModelOriginDisplayLabel } from '../../data/peiModelRegistry';
import { FileText, Upload, Check, Trash2, Archive, AlertCircle, Building, Shield, Star, CheckSquare } from 'lucide-react';

export type CustomPeiModel = PeiModelDefinition;

interface CustomModelManagerProps {
  customModels: PeiModelDefinition[];
  onAddCustomModel: (model: PeiModelDefinition) => void;
  onUpdateModelStatus: (id: string, status: 'attivo' | 'archiviato') => void;
  onSetDefaultModel?: (id: string) => void;
  defaultModelId?: string;
  showToast: (msg: string) => void;
}

export const CustomModelManager: React.FC<CustomModelManagerProps> = ({
  customModels,
  onAddCustomModel,
  onUpdateModelStatus,
  onSetDefaultModel,
  defaultModelId,
  showToast,
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

  const handleSimulateFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      if (file.name.endsWith('.docx')) {
        setFormat('DOCX');
      } else {
        setFormat('PDF');
      }
      if (!modelName) {
        setModelName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName || !institution) {
      showToast('Compila i campi obbligatori per registrare il modello.');
      return;
    }

    if (!confirmedEmptyAndVerified) {
      showToast('È obbligatorio confermare che il modello è vuoto e verificato prima di procedere.');
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
      format,
      status: 'attivo',
      isDefault: false,
      isMinisterial: false,
      sourceHash: `hash_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      description: description || 'Modello personalizzato/territoriale validato dall’istituto o ente competente.',
      usedCount: 0,
      confirmationState: 'confirmed',
      confirmationDate: nowIso,
      confirmationText: "Confermo che il modello è vuoto e che ne ho verificato l'adozione/idoneità presso l'istituzione competente.",
    };

    onAddCustomModel(newModel);
    showToast(`Modello "${modelName}" registrato con successo.`);
    setIsImporting(false);
    setModelName('');
    setInstitution('');
    setDescription('');
    setFileName('');
    setConfirmedEmptyAndVerified(false);
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
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card-bg)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--chrome-bg)] text-[var(--text-title)] text-[11px] border-b border-[var(--border)]">
              <th className="p-2.5 font-bold">Nome Modello</th>
              <th className="p-2.5 font-bold">Ordine</th>
              <th className="p-2.5 font-bold">Ente / Origine</th>
              <th className="p-2.5 font-bold">Versione</th>
              <th className="p-2.5 font-bold">Stato</th>
              <th className="p-2.5 font-bold text-right">Azioni</th>
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
                  <tr key={m.id} className="hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="p-2.5 font-bold text-[var(--text)]">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                        <span>{m.name}</span>
                        {isCurrentDefault && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold">
                            <Star className="w-2.5 h-2.5 fill-current" /> Predefinito
                          </span>
                        )}
                      </div>
                      {m.description && <div className="text-[10px] text-[var(--text-secondary)] font-medium">{m.description}</div>}
                    </td>
                    <td className="p-2.5 text-[var(--text)] font-semibold">{m.schoolOrder}</td>
                    <td className="p-2.5 text-[var(--text)] font-medium">
                      <div className="font-semibold">{getModelOriginDisplayLabel(m)}</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Ente dichiarato: {m.originName}</div>
                      {m.confirmationState === 'confirmed' && (
                        <div className="text-[9px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                          <CheckSquare className="w-2.5 h-2.5" /> Idoneità confermata dall&apos;utente
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-[var(--text-secondary)] font-mono text-[11px] font-medium">{m.version}</td>
                    <td className="p-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.status === 'attivo'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300'
                            : 'bg-[var(--badge-bg)] text-[var(--badge-text)] border border-[var(--border)]'
                        }`}
                      >
                        {m.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-2.5 text-right space-x-1">
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
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold border border-emerald-300 cursor-pointer"
                        >
                          Riattiva
                        </button>
                      )}
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
                <label className="block font-bold text-[var(--text-title)] mb-1">Seleziona file modello (PDF o DOCX) *</label>
                <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-4 text-center hover:bg-[var(--hover-bg)] transition-colors relative cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    required
                    onChange={handleSimulateFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-6 h-6 text-amber-800 dark:text-[var(--accent-paglierino)]" />
                    <span className="font-bold text-[var(--text)]">
                      {fileName || 'Clicca o trascina qui il file del modello'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] font-medium">Formati supportati: PDF, DOCX (Senza dati alunno)</span>
                  </div>
                </div>
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

