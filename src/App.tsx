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
import { OtherModelCatalogModal } from './components/modals/OtherModelCatalogModal';
import { AcquisitionModal, AcquisitionSuccessPayload } from './components/modals/AcquisitionModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { HelpModal } from './components/modals/HelpModal';
import { ShareModal } from './components/modals/ShareModal';
import { TemplateCalibrationWorkspace } from './components/calibration/TemplateCalibrationWorkspace';
import { GeometryCalibrationTool } from './dev/GeometryCalibrationTool';
import {
  findModelDefinition,
  getMinisterialCanonicalInfo,
} from './data/peiModelRegistry';

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
  theme: 'verde_prato',
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
  const [currentTheme, setCurrentTheme] = useState<ThemeType>(settings.theme || 'verde_prato');

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

  const [savedDocument, setSavedDocument] = useState<PeiDocument | null>(() => {
    try {
      const s = localStorage.getItem('pei_facile_saved_doc');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  const handleDeleteSavedDocument = () => {
    try {
      localStorage.removeItem('pei_facile_saved_doc');
    } catch {
      // ignore
    }
    setSavedDocument(null);
    setHasOpenDocument(false);
    setDocument(
      createEmptyPeiDocument(
        settings.defaultSchoolOrder || 'A2',
        '',
        settings.schoolName,
        settings.building
      )
    );
    setCurrentScreen('SCR-001');
    showToast('Documento eliminato con successo dalla memoria locale.');
  };

  // 5. Sezione Attiva nella compilazione
  const [activeSectionId, setActiveSectionId] = useState<string>('sec1_quadro_informativo');

  // 6. Livello di Zoom
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // 7. Stati Modali
  const [isNewPeiModalOpen, setIsNewPeiModalOpen] = useState(false);
  const [isOtherModelCatalogOpen, setIsOtherModelCatalogOpen] = useState(false);
  const [isPdfIntakeModalOpen, setIsPdfIntakeModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCalibrationWorkspaceOpen, setIsCalibrationWorkspaceOpen] = useState(false);
  const [calibrationModel, setCalibrationModel] = useState<PeiModelDefinition | null>(null);
  const [calibrationNotice, setCalibrationNotice] = useState<string | null>(null);

  // Risoluzione deterministica del modello corrente per header e binding
  const currentModelDef = React.useMemo(() => {
    return findModelDefinition(
      document.modelId || document.customModelId || `MINISTERIAL_${document.schoolOrder}`,
      customModels
    );
  }, [customModels, document.modelId, document.customModelId, document.schoolOrder]);

  const handleOpenCalibration = (model?: PeiModelDefinition | null, notice?: string) => {
    setCalibrationModel(model || null);
    setCalibrationNotice(notice || null);
    setIsCalibrationWorkspaceOpen(true);
  };

  const handleCalibrationApproved = (calibratedModel: PeiModelDefinition) => {
    setCustomModels((prev) => {
      const exists = prev.some((m) => m.id === calibratedModel.id);
      const updated = exists
        ? prev.map((m) => (m.id === calibratedModel.id ? calibratedModel : m))
        : [calibratedModel, ...prev];
      try {
        localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });

    if (document.modelDefinitionId === calibratedModel.id) {
      setDocument((prev) => ({
        ...prev,
        calibrationStatus: 'CALIBRATED',
      }));
    }

    showToast(`Modello "${calibratedModel.name}" approvato e pronto per la compilazione!`);
    setIsCalibrationWorkspaceOpen(false);
  };

  const handleCalibrationDraftSaved = (savedModel: PeiModelDefinition) => {
    setCustomModels((prev) => {
      const exists = prev.some((m) => m.id === savedModel.id);
      const updated = exists
        ? prev.map((m) => (m.id === savedModel.id ? savedModel : m))
        : [savedModel, ...prev];
      try {
        localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    showToast('Bozza salvata in revisione.');
  };

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
        setSavedDocument(updated);
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Cambio ordine di scuola (A1 - A4)
  const handleChangeSchoolOrder = (newOrder: SchoolOrder) => {
    const canonical = getMinisterialCanonicalInfo(newOrder);
    setDocument((prev) => {
      const updated: PeiDocument = {
        ...prev,
        schoolOrder: newOrder,
        modelId: canonical ? canonical.modelId : `MINISTERIAL_${newOrder}`,
        modelVersion: 'D.I. 182/2020 - D.I. 153/2023',
        modelOrigin: 'MINISTERIAL',
        modelName: SCHOOL_ORDERS_METADATA[newOrder].officialAllegato,
        customModelId: undefined,
        customModelName: undefined,
        customModelOrigin: undefined,
        lastModifiedDate: new Date().toISOString(),
      };
      try {
        localStorage.setItem('pei_facile_saved_doc', JSON.stringify(updated));
        setSavedDocument(updated);
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

  // Selezione modello personalizzato / non-ministeriale dal catalogo o dropdown
  const handleSelectCustomModel = (modelDef: PeiModelDefinition) => {
    setDocument((prev) => {
      const updated: PeiDocument = {
        ...prev,
        schoolOrder: modelDef.schoolOrder,
        modelId: modelDef.id,
        modelVersion: modelDef.version,
        modelOrigin: modelDef.originType,
        modelName: modelDef.name,
        customModelId: modelDef.id,
        customModelName: modelDef.name,
        customModelOrigin:
          modelDef.originType === 'TERRITORIAL'
            ? 'territoriale'
            : modelDef.originType === 'INSTITUTION'
            ? 'istituto'
            : 'altro',
        lastModifiedDate: new Date().toISOString(),
      };
      try {
        localStorage.setItem('pei_facile_saved_doc', JSON.stringify(updated));
        setSavedDocument(updated);
      } catch {
        // ignore
      }
      return updated;
    });
    const newSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, modelDef.schoolOrder);
    if (!newSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(newSections[0].id);
    }
    showToast(`Modello impostato su: ${modelDef.name}`);
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
    setSavedDocument(newDoc);
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
        setSavedDocument(doc);
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
      setSavedDocument(document);
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

  // Acquisizione Documento PEI completata (Import = Nuovo Documento autonomo)
  const handleAcquisitionSuccess = (payload: AcquisitionSuccessPayload) => {
    const targetModelDef = payload.modelId
      ? customModels.find((m) => m.id === payload.modelId)
      : undefined;

    const newDoc = createEmptyPeiDocument(
      payload.schoolOrder,
      payload.studentCode,
      payload.schoolName,
      payload.classOrSection,
      targetModelDef
    );

    // Popola esclusivamente con i valori estratti e approvati nella coda di revisione
    newDoc.values = {
      ...newDoc.values,
      ...payload.extractedValues,
    };
    if (payload.compilationDate) {
      newDoc.lastModifiedDate = payload.compilationDate;
      newDoc.values['f-01-data-redazione'] = payload.compilationDate;
    }

    // Segna i campi approvati come compilati
    Object.keys(payload.extractedValues).forEach((fId) => {
      newDoc.fieldStatuses[fId] = 'compilato';
    });

    setDocument(newDoc);
    setHasOpenDocument(true);
    setSavedDocument(newDoc);

    try {
      localStorage.setItem('pei_facile_saved_doc', JSON.stringify(newDoc));
    } catch {
      // ignore
    }

    const orderSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, payload.schoolOrder);
    setActiveSectionId(orderSections[0]?.id || 'sec1_quadro_informativo');
    setCurrentScreen('SCR-002');
    showToast(
      `Nuovo PEI creato da acquisizione (${payload.schoolOrder}) con ${Object.keys(payload.extractedValues).length} campi compilati!`
    );
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
        onOpenCalibration={() => handleOpenCalibration(currentModelDef)}
        currentModelDef={currentModelDef}
        customModels={customModels}
        onOpenOtherModelCatalog={() => setIsOtherModelCatalogOpen(true)}
        onSelectCustomModel={handleSelectCustomModel}
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
              onDeleteSavedDocument={handleDeleteSavedDocument}
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
            onOpenCalibration={() => handleOpenCalibration(currentModelDef)}
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
            onOpenCalibration={() => handleOpenCalibration(currentModelDef)}
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

      <OtherModelCatalogModal
        isOpen={isOtherModelCatalogOpen}
        onClose={() => setIsOtherModelCatalogOpen(false)}
        customModels={customModels}
        currentModelId={document.modelId || document.customModelId}
        onSelectModel={handleSelectCustomModel}
        onOpenImportModal={() => setIsSettingsModalOpen(true)}
        onOpenCalibration={(model) => handleOpenCalibration(model)}
      />

      <AcquisitionModal
        isOpen={isPdfIntakeModalOpen}
        onClose={() => setIsPdfIntakeModalOpen(false)}
        customModels={customModels}
        onAcquisitionSuccess={handleAcquisitionSuccess}
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
        onOpenCalibration={handleOpenCalibration}
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

      {/* Production Template Calibration Workspace (Phase 1D R01) */}
      {isCalibrationWorkspaceOpen && (
        <TemplateCalibrationWorkspace
          initialModelDef={calibrationModel}
          instructionNotice={calibrationNotice}
          onClose={() => {
            setIsCalibrationWorkspaceOpen(false);
            setCalibrationModel(null);
            setCalibrationNotice(null);
          }}
          onApproved={handleCalibrationApproved}
          onDraftSaved={handleCalibrationDraftSaved}
        />
      )}

      {/* Dev-only Geometry Calibration Tool URL parameter (?dev=geometry) */}
      {typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('dev') === 'geometry' && (
          <GeometryCalibrationTool
            onClose={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('dev');
              window.history.replaceState({}, '', url.toString());
              window.location.reload();
            }}
          />
        )}
    </div>
  );
}

