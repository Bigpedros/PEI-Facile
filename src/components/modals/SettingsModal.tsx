import React, { useState, useEffect } from 'react';
import type { ThemeType, SchoolOrder, AppSettings } from '../../types/pei';
import { X, Palette, Shield, Building2, UserCheck, Check, School } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  currentTheme: ThemeType;
  onChangeTheme: (theme: ThemeType) => void;
  defaultSchoolOrder: SchoolOrder;
  onChangeDefaultSchoolOrder: (order: SchoolOrder) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  currentTheme,
  onChangeTheme,
  defaultSchoolOrder,
  onChangeDefaultSchoolOrder,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof AppSettings, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'theme') {
      onChangeTheme(value);
    }
    if (field === 'defaultSchoolOrder') {
      onChangeDefaultSchoolOrder(value);
    }
  };

  const handleSaveAndClose = () => {
    onSaveSettings(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 z-50 text-xs">
      <div className="bg-white rounded-lg border border-stone-300 shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-[var(--chrome-bg)] p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
            <School className="w-4 h-4 text-amber-800" />
            <span>Impostazioni Istituzionali e di Profilo (PEI Facile)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-stone-200/50 rounded text-stone-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* DATI SCUOLA */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
              <Building2 className="w-4 h-4 text-amber-800" />
              <h3 className="font-bold text-stone-900 text-sm">Dati Scuola</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-stone-700 mb-1 font-medium">Denominazione istituzione scolastica *</label>
                <input
                  type="text"
                  value={form.schoolName}
                  onChange={(e) => handleChange('schoolName', e.target.value)}
                  placeholder="Es. I.C. Statale Alessandro Manzoni"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">Codice meccanografico (facoltativo)</label>
                <input
                  type="text"
                  value={form.schoolCode}
                  onChange={(e) => handleChange('schoolCode', e.target.value)}
                  placeholder="Es. MIIC8XX00Q"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">Plesso / Sede (facoltativo)</label>
                <input
                  type="text"
                  value={form.building}
                  onChange={(e) => handleChange('building', e.target.value)}
                  placeholder="Es. Plesso Centrale / Via Roma"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-stone-700 mb-1 font-medium">Indirizzo</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Es. Via Dante Alighieri 12"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">CAP</label>
                <input
                  type="text"
                  value={form.cap}
                  onChange={(e) => handleChange('cap', e.target.value)}
                  placeholder="Es. 20121"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">Comune</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Es. Milano"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">Provincia</label>
                <input
                  type="text"
                  value={form.province}
                  onChange={(e) => handleChange('province', e.target.value)}
                  placeholder="Es. MI"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>
            </div>
          </div>

          {/* DATI DOCENTE */}
          <div className="space-y-3 pt-3 border-t border-stone-200">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
              <UserCheck className="w-4 h-4 text-amber-800" />
              <h3 className="font-bold text-stone-900 text-sm">Dati Docente (Riferimento GLO)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-stone-700 mb-1 font-medium">Nome</label>
                <input
                  type="text"
                  value={form.teacherName}
                  onChange={(e) => handleChange('teacherName', e.target.value)}
                  placeholder="Es. Anna"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">Cognome</label>
                <input
                  type="text"
                  value={form.teacherSurname}
                  onChange={(e) => handleChange('teacherSurname', e.target.value)}
                  placeholder="Es. Rossi"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>

              <div>
                <label className="block text-stone-700 mb-1 font-medium">Ruolo / Funzione (facoltativo)</label>
                <input
                  type="text"
                  value={form.teacherRole}
                  onChange={(e) => handleChange('teacherRole', e.target.value)}
                  placeholder="Es. Docente di Sostegno / Coordinatore"
                  className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
                />
              </div>
            </div>
            <p className="text-[11px] text-stone-500">
              * Il docente configurato è disponibile come metadato predefinito e non viene inserito automaticamente nel GLO senza conferma esplicita.
            </p>
          </div>

          {/* PREFERENZE */}
          <div className="space-y-3 pt-3 border-t border-stone-200">
            <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
              <Palette className="w-4 h-4 text-amber-800" />
              <h3 className="font-bold text-stone-900 text-sm">Preferenze di Lavoro</h3>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-stone-800 block">
                Modello ministeriale predefinito
              </label>
              <select
                value={form.defaultSchoolOrder}
                onChange={(e) => handleChange('defaultSchoolOrder', e.target.value as SchoolOrder)}
                className="w-full p-2 border border-stone-300 rounded bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-800 disabled:bg-stone-100 disabled:text-stone-500"
              >
                <option value="A1">A1 — Scuola dell’Infanzia (Allegato A1)</option>
                <option value="A2">A2 — Scuola Primaria (Allegato A2)</option>
                <option value="A3">A3 — Scuola Secondaria di I Grado (Allegato A3)</option>
                <option value="A4">A4 — Scuola Secondaria di II Grado (Allegato A4)</option>
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <label className="font-bold text-stone-800 block">
                Tema Visivo Interfaccia
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'sabbia', label: 'Sabbia', desc: 'Chiaro Caldo (#F3EBD9)', bg: '#F3EBD9', text: '#2A2521' },
                  { id: 'navy', label: 'Blu Navy 35%', desc: 'Default (#C3CEDD)', bg: '#C3CEDD', text: '#152238' },
                  { id: 'antracite', label: 'Antracite', desc: 'Scuro Caldo (#222528)', bg: '#222528', text: '#F0EFEA' },
                ].map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleChange('theme', th.id as ThemeType)}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                      form.theme === th.id
                        ? 'border-amber-800 ring-1 ring-amber-800 shadow-xs'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                    style={{ backgroundColor: th.bg, color: th.text }}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>{th.label}</span>
                      {form.theme === th.id && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <div className="text-[10px] opacity-80 mt-1">{th.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="p-3 bg-stone-50 border border-stone-200 rounded space-y-1">
            <div className="font-bold text-stone-800 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-700" />
              <span>Persistenza Locale (pei_facile_settings_v1)</span>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Le impostazioni e i dati inseriti sono salvati esclusivamente nella memoria locale del browser (localStorage). Nessun dato viene inviato a server esterni.
            </p>
          </div>
        </div>

        <div className="bg-[var(--chrome-bg)] p-3 border-t border-[var(--border)] flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-300"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-4 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold cursor-pointer"
          >
            Salva e Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

