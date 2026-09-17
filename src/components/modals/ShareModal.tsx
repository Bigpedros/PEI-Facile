import React, { useState } from 'react';
import { ShieldCheck, X, FileText, Lock, Send, Check } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  showToast: (msg: string) => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  showToast,
}) => {
  const [format, setFormat] = useState<'pdf' | 'package'>('pdf');
  const [recipient, setRecipient] = useState<string>('');
  const [protection, setProtection] = useState<'pubkey' | 'password'>('pubkey');
  const [removeMetadata, setRemoveMetadata] = useState<boolean>(true);
  const [requireConfirmation, setRequireConfirmation] = useState<boolean>(true);
  const [createLocalCopy, setCreateLocalCopy] = useState<boolean>(true);
  const [isCreated, setIsCreated] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreated(true);
    showToast('Pacchetto protetto creato con successo (simulazione DLG-001).');
    setTimeout(() => {
      setIsCreated(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--card-bg)] rounded-xl shadow-2xl border border-[var(--border)] w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modale */}
        <div className="bg-amber-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-200" />
            <div>
              <h2 className="text-base font-bold font-serif tracking-wide">
                CONDIVIDI IN SICUREZZA (DLG-001)
              </h2>
              <p className="text-xs text-amber-100 font-medium">
                Generazione pacchetto PEI cifrato e conforme al GDPR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-amber-200 hover:text-white p-1 rounded transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Modulo */}
        <form onSubmit={handleCreate} className="p-6 space-y-5 text-[var(--text)] text-xs md:text-sm">
          {/* Documento */}
          <div className="space-y-1.5">
            <label className="block font-bold text-[var(--text-title)]">Documento</label>
            <div className="px-3 py-2 bg-[var(--card-sub-bg)] border border-[var(--border)] rounded text-[var(--text)] font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-800 dark:text-[var(--accent-paglierino)]" />
              <span className="truncate">{documentTitle || 'PEI corrente'}</span>
            </div>
          </div>

          {/* Formato */}
          <div className="space-y-2">
            <label className="block font-bold text-[var(--text-title)]">Formato di esportazione</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                onClick={() => setFormat('pdf')}
                className={`p-3 border rounded-lg flex items-center gap-2.5 cursor-pointer transition-colors ${
                  format === 'pdf'
                    ? 'border-amber-800 bg-[var(--badge-bg)] text-[var(--text-title)] font-bold'
                    : 'border-[var(--border)] bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)]'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="text-amber-800 focus:ring-amber-800"
                />
                <div>
                  <div className="text-xs font-bold text-[var(--text-title)]">PDF protetto</div>
                  <div className="text-[11px] text-[var(--text-secondary)] font-medium">Sola lettura cifrata</div>
                </div>
              </label>

              <label
                onClick={() => setFormat('package')}
                className={`p-3 border rounded-lg flex items-center gap-2.5 cursor-pointer transition-colors ${
                  format === 'package'
                    ? 'border-amber-800 bg-[var(--badge-bg)] text-[var(--text-title)] font-bold'
                    : 'border-[var(--border)] bg-[var(--card-bg)] hover:bg-[var(--hover-bg)] text-[var(--text)]'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  checked={format === 'package'}
                  onChange={() => setFormat('package')}
                  className="text-amber-800 focus:ring-amber-800"
                />
                <div>
                  <div className="text-xs font-bold text-[var(--text-title)]">Pacchetto PEI</div>
                  <div className="text-[11px] text-[var(--text-secondary)] font-medium">Interscambio modificabile</div>
                </div>
              </label>
            </div>
          </div>

          {/* Destinatario */}
          <div className="space-y-1.5">
            <label className="block font-bold text-[var(--text-title)]">Destinatario autorizzato</label>
            <input
              type="text"
              required
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Es. Dirigente Scolastico / GLO / Famiglia (email o ID chiave)"
              className="w-full px-3 py-2 border border-[var(--border)] rounded bg-[var(--input-bg)] text-[var(--text)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-amber-800 font-medium"
            />
          </div>

          {/* Protezione */}
          <div className="space-y-2">
            <label className="block font-bold text-[var(--text-title)]">Metodo di protezione crittografica</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="protection"
                  checked={protection === 'pubkey'}
                  onChange={() => setProtection('pubkey')}
                  className="text-amber-800 focus:ring-amber-800"
                />
                <span className="text-[var(--text)] font-semibold text-xs">
                  Chiave pubblica del destinatario (GPG / x509)
                </span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="protection"
                  checked={protection === 'password'}
                  onChange={() => setProtection('password')}
                  className="text-amber-800 focus:ring-amber-800"
                />
                <span className="text-[var(--text)] font-semibold text-xs">
                  Password concordata separatamente (AES-256)
                </span>
              </label>
            </div>
          </div>

          {/* Opzioni di sicurezza */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            <label className="block font-bold text-[var(--text-title)]">Opzioni di pulizia e invio</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeMetadata}
                  onChange={(e) => setRemoveMetadata(e.target.checked)}
                  className="rounded text-amber-800 focus:ring-amber-800"
                />
                <span className="text-[var(--text)] font-medium text-xs">Rimuovi metadati non necessari e tracce di editing</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireConfirmation}
                  onChange={(e) => setRequireConfirmation(e.target.checked)}
                  className="rounded text-amber-800 focus:ring-amber-800"
                />
                <span className="text-[var(--text)] font-medium text-xs">Richiedi conferma esplicita prima della creazione</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createLocalCopy}
                  onChange={(e) => setCreateLocalCopy(e.target.checked)}
                  className="rounded text-amber-800 focus:ring-amber-800"
                />
                <span className="text-[var(--text)] font-medium text-xs">Crea copia locale cifrata dell&apos;invio nel registro</span>
              </label>
            </div>
          </div>

          {/* Nota informativa */}
          <div className="bg-[var(--card-sub-bg)] border border-[var(--border)] rounded p-3 text-[11px] text-[var(--text-secondary)] leading-relaxed font-medium">
            Nel prototipo il flusso è simulato. La cifratura reale richiede una specifica di sicurezza separata e prove tecniche conformi alle linee guida AgID.
          </div>

          {/* Footer Bottoni */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border)] bg-[var(--badge-bg)] rounded font-semibold text-[var(--text)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isCreated}
              className="px-5 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCreated ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Pacchetto generato!</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Crea pacchetto protetto</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
