/**
 * @license
 * PEI FACILE — Applicazione Integrata
 * Conforme alle Linee Guida D.I. 182/2020 e D.I. 153/2023
 */

import React, { useState, useEffect } from 'react';
import type {
  ScreenId,
  SchoolOrder,
  ThemeType,
  PeiDocument,
  AppSettings,
  PeiModelDefinition,
} from './types/pei';
import {
  MASTER_PEI_SECTIONS,
  DEMO_PEI_DOCUMENT,
  createEmptyPeiDocument,
  filterSectionsForSchoolOrder,
  SCHOOL_ORDERS_METADATA,
} from './data/masterPeiStructure';

import { AppHeader } from './components/common/AppHeader';
import { HomeScreen } from './components/screens/HomeScreen';
import { CompilazioneScreen } from './components/screens/CompilazioneScreen';
import { AnteprimaScreen } from './components/screens/AnteprimaScreen';
import { MasterTree } from './components/navigation/MasterTree';

import { NewPeiModal } from './components/modals/NewPeiModal';
import { PdfIntakeModal } from './components/modals/PdfIntakeModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { HelpModal } from './components/modals/HelpModal';
import { ShareModal } from './components/modals/ShareModal';

const DEFAULT_SETTINGS: AppSettings = {
  schoolName: 'I.C. Statale Alessandro Manzoni',
  schoolCode: '',
  address: '',
  cap: '',
  city: '',
  province: '',
  building: '',
  teacherName: '',
  teacherSurname: '',
  teacherRole: 'Docente di Sostegno',
  defaultSchoolOrder: 'A2',
  theme: 'navy',
};

export default function App() {
  // 1. Stato Impostazioni (pei_facile_settings_v1)
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('pei_facile_settings_v1');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('pei_facile_settings_v1', JSON.stringify(newSettings));
    } catch {
      // ignore
    }
    setCurrentTheme(newSettings.theme);
    showToast('Impostazioni salvate con successo nella memoria locale.');
  };

  // Modelli PEI personalizzati (Territoriali / Istituto)
  const [customModels, setCustomModels] = useState<PeiModelDefinition[]>(() => {
    try {
      const saved = localStorage.getItem('pei_facile_custom_models_v1');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'model_demo_1',
        name: 'Modello PEI Inclusivo Territoriale',
        schoolOrder: 'A3',
        originType: 'TERRITORIAL',
        originName: 'Comune / ATS di Riferimento',
        version: '2.1',
        acquisitionDate: '2026-01-15',
        format: 'PDF',
        status: 'attivo',
        isDefault: false,
        isMinisterial: false,
        sourceHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        description: 'Adattamento territoriale per la Secondaria di I Grado validato dall’accordo di programma.',
        usedCount: 1,
      },
    ];
  });

  const handleAddCustomModel = (model: PeiModelDefinition) => {
    setCustomModels((prev) => {
      const updated = [model, ...prev];
      try {
        localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const handleUpdateModelStatus = (id: string, status: 'attivo' | 'archiviato') => {
    setCustomModels((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, status } : m));
      try {
        localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    showToast(`Stato del modello aggiornato a: ${status}`);
  };

  // 2. Stato di Navigazione
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('SCR-001');

  // 3. Stato del Tema
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(settings.theme || 'navy');

  // 4. Documento PEI Corrente (Inizialmente senza documento aperto, o caricato da salvataggio locale)
  const [document, setDocument] = useState<PeiDocument>(() => {
    try {
      const savedDoc = localStorage.getItem('pei_facile_saved_doc');
      if (savedDoc) {
        return JSON.parse(savedDoc);
      }
    } catch {
      // ignore
    }
    return createEmptyPeiDocument(settings.defaultSchoolOrder || 'A2', '', settings.schoolName, settings.building);
  });
  const [hasOpenDocument, setHasOpenDocument] = useState<boolean>(() => {
    return !!localStorage.getItem('pei_facile_saved_doc');
  });

  const savedDocument = (() => {
    try {
      const s = localStorage.getItem('pei_facile_saved_doc');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  })();

  // 5. Sezione Attiva nella compilazione
  const [activeSectionId, setActiveSectionId] = useState<string>('sec1_quadro_informativo');

  // 6. Livello di Zoom
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // 7. Stati Modali
  const [isNewPeiModalOpen, setIsNewPeiModalOpen] = useState(false);
  const [isPdfIntakeModalOpen, setIsPdfIntakeModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  // 8. Notifiche Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Aggiorna data-theme nel body/container per le variabili CSS
  useEffect(() => {
    window.document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  // Sezioni filtrate per l'ordine di scuola corrente
  const currentSections = filterSectionsForSchoolOrder(
    MASTER_PEI_SECTIONS,
    document.schoolOrder
  );

  const currentSection =
    currentSections.find((s) => s.id === activeSectionId) || currentSections[0];

  // Gestione modifica campo
  const handleFieldValueChange = (fieldId: string, value: any) => {
    setDocument((prev) => {
      const isFilled =
        value !== undefined &&
        value !== null &&
        value !== '' &&
        (!Array.isArray(value) || value.length > 0);

      const updated = {
        ...prev,
        updatedAt: new Date().toISOString(),
        values: {
          ...prev.values,
          [fieldId]: value,
        },
        fieldStatuses: {
          ...prev.fieldStatuses,
          [fieldId]: isFilled ? 'compilato' : 'vuoto',
        },
      };
      try {
        localStorage.setItem('pei_facile_saved_doc', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Cambio ordine di scuola (A1 - A4)
  const handleChangeSchoolOrder = (newOrder: SchoolOrder) => {
    setDocument((prev) => {
      const updated = {
        ...prev,
        schoolOrder: newOrder,
        updatedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem('pei_facile_saved_doc', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    const newSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, newOrder);
    if (!newSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(newSections[0].id);
    }
    showToast(`Modello ministeriale aggiornato ad ${newOrder} (${SCHOOL_ORDERS_METADATA[newOrder].officialAllegato})`);
  };

  // Creazione nuovo PEI
  const handleConfirmCreateNewPei = (
    order: SchoolOrder,
    studentCode: string,
    schoolName: string,
    classSec: string,
    modelDef?: PeiModelDefinition
  ) => {
    const newDoc = createEmptyPeiDocument(order, studentCode, schoolName, classSec, modelDef);
    setDocument(newDoc);
    setHasOpenDocument(true);
    try {
      localStorage.setItem('pei_facile_saved_doc', JSON.stringify(newDoc));
    } catch {
      // ignore
    }
    const orderSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, order);
    setActiveSectionId(orderSections[0].id);
    setCurrentScreen('SCR-002');
    showToast(`Nuovo PEI creato con modello ${modelDef?.name || order}.`);
  };

  // Apertura PEI Esistente / Salvato
  const handleOpenSavedPei = () => {
    try {
      const s = localStorage.getItem('pei_facile_saved_doc');
      if (s) {
        const doc = JSON.parse(s);
        setDocument(doc);
        setHasOpenDocument(true);
        const orderSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, doc.schoolOrder);
        setActiveSectionId(orderSections[0]?.id || 'sec1_quadro_informativo');
        setCurrentScreen('SCR-002');
        showToast('PEI esistente aperto dalla memoria locale.');
        return;
      }
    } catch {
      // ignore
    }
    showToast('Nessun PEI esistente salvato in memoria locale. Creane uno nuovo.');
  };

  // Salvataggio manuale
  const handleSaveDocument = () => {
    try {
      localStorage.setItem('pei_facile_saved_doc', JSON.stringify(document));
      showToast('PEI salvato con successo nella memoria locale.');
    } catch {
      showToast('Errore durante il salvataggio locale.');
    }
  };

  // Chiusura PEI
  const handleClosePei = () => {
    setCurrentScreen('SCR-001');
    showToast('PEI chiuso. Ritorno alla schermata iniziale.');
  };

  // Integrazione Intake PDF R3 completata
  const handleIntakeImportSuccess = (imported: {
    schoolOrder?: SchoolOrder;
    extractedValues: Record<string, string>;
    logs: string[];
  }) => {
    let order = imported.schoolOrder || document.schoolOrder;
    setDocument((prev) => {
      const mergedValues = { ...prev.values, ...imported.extractedValues };
      const mergedStatuses = { ...prev.fieldStatuses };
      Object.keys(imported.extractedValues).forEach((fId) => {
        mergedStatuses[fId] = 'compilato';
      });
      const updated = {
        ...prev,
        schoolOrder: order,
        values: mergedValues,
        fieldStatuses: mergedStatuses,
        updatedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem('pei_facile_saved_doc', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    setHasOpenDocument(true);
    setCurrentScreen('SCR-002');
    showToast('Dati estratti dal PDF applicati con successo alle sezioni!');
  };

  return (
    <div
      data-theme={currentTheme}
      className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--app-bg)] text-[var(--text)] font-sans antialiased"
    >
      {/* Intestazione Superiore, Ribbon e Menu */}
      <AppHeader
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        schoolOrder={document.schoolOrder}
        onChangeSchoolOrder={handleChangeSchoolOrder}
        currentTheme={currentTheme}
        onChangeTheme={(th) => {
          setCurrentTheme(th);
          handleSaveSettings({ ...settings, theme: th });
        }}
        zoomScale={zoomScale}
        onChangeZoom={setZoomScale}
        activeSectionTitle={currentSection?.shortTitle}
        hasOpenDocument={hasOpenDocument}
        onNewPei={() => setIsNewPeiModalOpen(true)}
        onOpenSamplePei={handleOpenSavedPei}
        onOpenPdfIntake={() => setIsPdfIntakeModalOpen(true)}
        onSaveDemo={handleSaveDocument}
        onClosePei={handleClosePei}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenHelpModal={() => setIsHelpModalOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
      />

      {/* Contenuto Principale: Visualizzazione Schermata Corrente */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* SCR-001: Schermata Home con Albero Attenuato */}
        {currentScreen === 'SCR-001' && (
          <div className="flex-1 flex overflow-hidden min-h-0">
            <aside className="w-72 shrink-0 h-full hidden lg:block border-r border-[var(--border)] bg-[var(--chrome-bg)]">
              <MasterTree
                sections={currentSections}
                activeSectionId={activeSectionId}
                schoolOrder={document.schoolOrder}
                disabled={true}
              />
            </aside>

            <HomeScreen
              onNewPei={() => setIsNewPeiModalOpen(true)}
              onOpenPdfIntake={() => setIsPdfIntakeModalOpen(true)}
              onOpenSavedPei={handleOpenSavedPei}
              savedDocument={savedDocument}
              onSelectSavedDocument={handleOpenSavedPei}
              onOpenHelpModal={() => setIsHelpModalOpen(true)}
              currentSchoolOrder={document.schoolOrder}
              currentDocument={hasOpenDocument ? document : null}
              customModels={customModels}
            />
          </div>
        )}

        {/* SCR-002: Schermata Compilazione Tripartita */}
        {currentScreen === 'SCR-002' && (
          <CompilazioneScreen
            document={document}
            sections={currentSections}
            activeSectionId={activeSectionId}
            onSelectSection={setActiveSectionId}
            onFieldValueChange={handleFieldValueChange}
            zoomScale={zoomScale}
            onSave={handleSaveDocument}
            onGoToPreview={() => setCurrentScreen('SCR-003')}
          />
        )}

        {/* SCR-003: Schermata Anteprima di Stampa Continua */}
        {currentScreen === 'SCR-003' && (
          <AnteprimaScreen
            document={document}
            sections={currentSections}
            onBackToCompilazione={() => setCurrentScreen('SCR-002')}
            zoomScale={zoomScale}
            onChangeZoom={setZoomScale}
            onOpenShareModal={() => setIsShareModalOpen(true)}
          />
        )}
      </div>

      {/* Toast Notifiche */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-stone-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs flex items-center gap-2 border border-stone-700 animate-in fade-in duration-200">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modali */}
      <NewPeiModal
        isOpen={isNewPeiModalOpen}
        onClose={() => setIsNewPeiModalOpen(false)}
        settings={settings}
        customModels={customModels}
        onConfirmCreate={handleConfirmCreateNewPei}
      />

      <PdfIntakeModal
        isOpen={isPdfIntakeModalOpen}
        onClose={() => setIsPdfIntakeModalOpen(false)}
        onImportSuccess={handleIntakeImportSuccess}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        currentTheme={currentTheme}
        onChangeTheme={(th) => {
          setCurrentTheme(th);
          handleSaveSettings({ ...settings, theme: th });
        }}
        defaultSchoolOrder={settings.defaultSchoolOrder}
        onChangeDefaultSchoolOrder={(ord) => {
          handleSaveSettings({ ...settings, defaultSchoolOrder: ord });
          handleChangeSchoolOrder(ord);
        }}
        customModels={customModels}
        onAddCustomModel={handleAddCustomModel}
        onUpdateModelStatus={handleUpdateModelStatus}
        showToast={showToast}
      />

      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        documentTitle={document.schoolName ? `${document.schoolName} — Alunno ${document.studentCode}` : 'PEI'}
        showToast={showToast}
      />
    </div>
  );
}

