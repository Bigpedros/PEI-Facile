import {savePeiDocument,loadSavedPeiDocument,deleteSavedPeiDocument} from './core/documentPersistence';
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
import { deleteCustomTemplate } from './core/templateStorage';
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
  theme: 'verde_prato',
};

export const restoreUint8Array = (value: unknown): Uint8Array | undefined => {
  if (!value) return undefined;
  if (value instanceof Uint8Array) return value;

  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, number>)
      .filter(([key, v]) => /^\d+$/.test(key) && Number.isFinite(v))
      .sort((a, b) => Number(a[0]) - Number(b[0]));

    if (entries.length > 0) {
      return new Uint8Array(entries.map(([, v]) => v));
    }
  }

  return undefined;
};

export const restorePeiDocumentBinaries = (doc: any): any => {
  if (!doc) return doc;
  const restored = { ...doc };
  if (restored.sourcePdfBinary) {
    const restoredBinary = restoreUint8Array(restored.sourcePdfBinary);
    if (restoredBinary) {
      restored.sourcePdfBinary = restoredBinary;
    }
  }
  if (restored.originalSourceBinary) restored.originalSourceBinary=restoreUint8Array(restored.originalSourceBinary);
  if (restored.canonicalDocument) {
    const restoredBinary = restoreUint8Array(restored.canonicalDocument);
    if (restoredBinary) {
      restored.canonicalDocument = restoredBinary;
    }
  }
  return restored;
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
    if (!hasOpenDocument) {
      setSelectedModelId(newSettings.defaultModelId || null);
    }
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

  // Sincronizza modelli personalizzati salvati in IndexedDB garantendo identità unica e stato autentico
  useEffect(() => {
    async function syncCustomModelsFromStorage() {
      try {
        const { listAllCustomTemplates } = await import('./core/templateStorage');
        const list = await listAllCustomTemplates();
        if (list && list.length > 0) {
          setCustomModels((prev) => {
            // Mappa unificata per chiave canonica templateId / id
            const modelMap = new Map<string, PeiModelDefinition>();

            // 1. Popola con i modelli già in memoria (rimappa id = templateId se presente)
            for (const m of prev) {
              const canonicalKey = m.templateId || m.id;
              modelMap.set(canonicalKey, {
                ...m,
                id: canonicalKey,
                templateId: canonicalKey,
              });
            }

            // 2. Riconcilia con i record di IndexedDB (fonte autorevole per calibrationStatus e metadati)
            for (const rec of list) {
              const canonicalKey = rec.templateId;
              const existing = modelMap.get(canonicalKey);

              if (existing) {
                // Aggiorna e preserva i campi autentici senza duplicare la voce
                modelMap.set(canonicalKey, {
                  ...existing,
                  name: rec.name || existing.name,
                  schoolOrder: (rec.schoolOrder || existing.schoolOrder) as SchoolOrder,
                  sourceSha256: rec.sourceSha256 || existing.sourceSha256,
                  sourceHash: rec.sourceSha256 || existing.sourceHash,
                  normalizedSha256: rec.normalizedSha256 !== undefined ? rec.normalizedSha256 : existing.normalizedSha256,
                  sourcePdfSha256: rec.sourceSha256 || existing.sourcePdfSha256,
                  normalizedPdfSha256: rec.normalizedSha256 !== undefined ? rec.normalizedSha256 : existing.normalizedPdfSha256,
                  normalizationSucceeded: rec.normalizationSucceeded !== undefined ? rec.normalizationSucceeded : existing.normalizationSucceeded,
                  calibrationStatus: rec.calibrationStatus || existing.calibrationStatus || 'REVIEW_REQUIRED',
                  engineUsed: rec.engineUsed || existing.engineUsed,
                  globalSkewDegrees: rec.globalSkewDegrees !== undefined ? rec.globalSkewDegrees : existing.globalSkewDegrees,
                  perspectiveApplied: rec.perspectiveApplied !== undefined ? rec.perspectiveApplied : existing.perspectiveApplied,
                  dewarpingMapApplied: rec.dewarpingMapApplied !== undefined ? rec.dewarpingMapApplied : existing.dewarpingMapApplied,
                  localCurvatureMaxDeviationPx: rec.localCurvatureMaxDeviationPx !== undefined ? rec.localCurvatureMaxDeviationPx : existing.localCurvatureMaxDeviationPx,
                  normalizationReport: rec.normalizationReport || existing.normalizationReport,
                  pageMetrics: rec.pageMetrics || rec.normalizationReport?.rectificationMetrics || existing.pageMetrics,
                });
              } else {
                modelMap.set(canonicalKey, {
                  id: rec.templateId,
                  name: rec.name,
                  schoolOrder: rec.schoolOrder as SchoolOrder,
                  originType: 'TERRITORIAL',
                  originName: 'Modello Personalizzato / Acquisito',
                  version: rec.schemaVersion || '1.0',
                  format: 'PDF',
                  status: 'attivo',
                  isDefault: false,
                  isMinisterial: false,
                  sourceKind: 'USER_IMPORTED',
                  sourceHash: rec.sourceSha256,
                  sourceSha256: rec.sourceSha256,
                  normalizedSha256: rec.normalizedSha256,
                  sourcePdfSha256: rec.sourceSha256,
                  normalizedPdfSha256: rec.normalizedSha256,
                  normalizationSucceeded: rec.normalizationSucceeded,
                  templateId: rec.templateId,
                  calibrationStatus: rec.calibrationStatus || 'REVIEW_REQUIRED',
                  engineUsed: rec.engineUsed,
                  globalSkewDegrees: rec.globalSkewDegrees,
                  perspectiveApplied: rec.perspectiveApplied,
                  dewarpingMapApplied: rec.dewarpingMapApplied,
                  localCurvatureMaxDeviationPx: rec.localCurvatureMaxDeviationPx,
                  normalizationReport: rec.normalizationReport,
                  pageMetrics: rec.pageMetrics || rec.normalizationReport?.rectificationMetrics || rec.normalizationReport?.pageMetrics,
                });
              }
            }

            const unifiedList = Array.from(modelMap.values());
            try {
              localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(unifiedList));
            } catch {
              // ignore
            }
            return unifiedList;
          });
        }
      } catch (err) {
        console.warn('Could not sync custom models from IndexedDB on app init:', err);
      }
    }
    syncCustomModelsFromStorage();
  }, []);

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

  const handleUpdateModelName = (id: string, newName: string) => {
    setCustomModels((prev) => {
      const updated = prev.map((m) => (m.id === id ? { ...m, name: newName } : m));
      try {
        localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    showToast('Modello rinominato con successo.');
  };

  const handleDeleteCustomModel = async (id: string) => {
    const targetModel = customModels.find((m) => m.id === id);
    if (!targetModel) return;

    const isUsedBySavedDoc =
      savedDocument &&
      (savedDocument.modelId === id || savedDocument.customModelId === id);

    if (isUsedBySavedDoc) {
      showToast('Impossibile eliminare: il modello è attualmente utilizzato dal PEI salvato.');
      return;
    }

    try {
      const otherModelsUsingSameBinary = customModels.filter(
        (m) => m.id !== id && (m.sourcePdfSha256 === targetModel.sourcePdfSha256 || m.templateId === targetModel.templateId)
      );
      const keepBinary = otherModelsUsingSameBinary.length > 0;

      await deleteCustomTemplate(targetModel.id, keepBinary ? undefined : targetModel.sourcePdfSha256);

      const updated = customModels.filter((m) => m.id !== id);
      setCustomModels(updated);
      try {
        localStorage.setItem('pei_facile_custom_models_v1', JSON.stringify(updated));
      } catch {
        // ignore
      }

      if (settings.defaultModelId === id) {
        const newSettings = { ...settings, defaultModelId: `MINISTERIAL_${targetModel.schoolOrder}` };
        setSettings(newSettings);
        localStorage.setItem('pei_facile_settings', JSON.stringify(newSettings));
      }

      showToast(`Modello "${targetModel.name}" eliminato con successo.`);
    } catch (err) {
      console.error('Failed to delete custom model:', err);
      showToast('Errore durante l’eliminazione del modello.');
    }
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
        return restorePeiDocumentBinaries(JSON.parse(savedDoc));
      }
    } catch {
      // ignore
    }
    return createEmptyPeiDocument(settings.defaultSchoolOrder || 'A2', '', settings.schoolName, settings.building);
  });
  const [hasOpenDocument, setHasOpenDocument] = useState<boolean>(() => {
    const raw=localStorage.getItem('pei_facile_saved_doc');
    try{return !!raw && JSON.parse(raw).binaryStorage!=='indexeddb-020';}catch{return false;}
  });

  const [savedDocument, setSavedDocument] = useState<PeiDocument | null>(() => {
    try {
      const s = localStorage.getItem('pei_facile_saved_doc');
      return s ? restorePeiDocumentBinaries(JSON.parse(s)) : null;
    } catch {
      return null;
    }
  });

  useEffect(()=>{
    const raw=localStorage.getItem('pei_facile_saved_doc');
    try{if(!raw||JSON.parse(raw).binaryStorage!=='indexeddb-020')return;}catch{return;}
    let active=true;
    loadSavedPeiDocument().then(doc=>{if(active&&doc){setDocument(doc);setSavedDocument(doc);setHasOpenDocument(true);}}).catch(()=>showToast('Impossibile recuperare il documento salvato.'));
    return ()=>{active=false;};
  },[]);

  // Model Selection Gate: stato deterministico modello attivo/selezionato
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => {
    try {
      const savedDoc = localStorage.getItem('pei_facile_saved_doc');
      if (savedDoc) {
        const parsed = JSON.parse(savedDoc);
        return parsed.modelId || (parsed.schoolOrder ? `MINISTERIAL_${parsed.schoolOrder}` : null);
      }
    } catch {
      // ignore
    }
    try {
      const savedSettings = localStorage.getItem('pei_facile_settings_v1');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.defaultModelId) return parsed.defaultModelId;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const handleDeleteSavedDocument = async () => {
    try {
      await deleteSavedPeiDocument();
    } catch {
      // ignore
    }
    setSavedDocument(null);
    setHasOpenDocument(false);
    setSelectedModelId(settings.defaultModelId || null);
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
    if (hasOpenDocument) {
      return findModelDefinition(
        document.modelId || document.customModelId || `MINISTERIAL_${document.schoolOrder}`,
        customModels
      );
    }
    if (selectedModelId) {
      return findModelDefinition(selectedModelId, customModels);
    }
    return null;
  }, [hasOpenDocument, document.modelId, document.customModelId, document.schoolOrder, selectedModelId, customModels]);

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

      const nextValues: Record<string, any> = {
        ...prev.values,
        [fieldId]: value,
      };

      // Rigoroso allineamento sincronizzato esclusivamente per alias 1:1 accertati
      // Previene il riaffiorare di valori obsoleti se un campo viene modificato o cancellato
      const STRICT_ALIASES: Record<string, string> = {
        'f-02-sintesi-assi': 'f-02-sintesi-profilo',
        'f-02-sintesi-profilo': 'f-02-sintesi-assi',
        'f-07-interventi': 'f-07-interventi-contesto',
        'f-07-interventi-contesto': 'f-07-interventi',
        'f-08-adattamenti-discipline': 'f-08-curricolare-obiettivi',
        'f-08-curricolare-obiettivi': 'f-08-adattamenti-discipline',
      };

      const mirrorKey = STRICT_ALIASES[fieldId];
      if (mirrorKey && mirrorKey in nextValues) {
        if (value === undefined || value === null || value === '') {
          delete nextValues[mirrorKey];
        } else {
          nextValues[mirrorKey] = value;
        }
      }

      const updated = {
        ...prev,
        updatedAt: new Date().toISOString(),
        values: nextValues,
        fieldStatuses: {
          ...prev.fieldStatuses,
          [fieldId]: isFilled ? 'compilato' : 'vuoto',
        },
      };
      try {
        void savePeiDocument(updated).then(()=>setSavedDocument(updated)).catch(()=>showToast('Salvataggio automatico non riuscito.'));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Cambio ordine di scuola (A1 - A4)
  const handleChangeSchoolOrder = (newOrder: SchoolOrder) => {
    if (hasOpenDocument) return; // Protected: open document model cannot be changed implicitly
    const canonical = getMinisterialCanonicalInfo(newOrder);
    const newModelId = canonical ? canonical.modelId : `MINISTERIAL_${newOrder}`;
    setSelectedModelId(newModelId);
    showToast(`Modello selezionato: ${SCHOOL_ORDERS_METADATA[newOrder].officialAllegato}`);
  };

  // Selezione modello personalizzato / non-ministeriale dal catalogo o dropdown
  const handleSelectCustomModel = (modelDef: PeiModelDefinition) => {
    if (hasOpenDocument) return; // Protected: open document model cannot be changed implicitly
    setSelectedModelId(modelDef.id);
    showToast(`Modello selezionato: ${modelDef.name}`);
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
    setSelectedModelId(newDoc.modelId || `MINISTERIAL_${order}`);
    try {
      void savePeiDocument(newDoc).catch(()=>showToast('Salvataggio del PEI non riuscito.'));
    } catch {
      // ignore
    }
    const orderSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, order);
    setActiveSectionId(orderSections[0].id);
    setCurrentScreen('SCR-002');
    showToast(`Nuovo PEI creato con modello ${modelDef?.name || order}.`);
  };

  // Apertura PEI Esistente / Salvato
  const handleOpenSavedPei = async () => {
    try {
      const saved = await loadSavedPeiDocument();
      if (saved) {
        const doc = restorePeiDocumentBinaries(saved);
        setDocument(doc);
        setHasOpenDocument(true);
        setSavedDocument(doc);
        setSelectedModelId(doc.modelId || (doc.schoolOrder ? `MINISTERIAL_${doc.schoolOrder}` : null));
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
  const handleSaveDocument = async () => {
    try {
      await savePeiDocument(document);
      setSavedDocument(document);
      showToast('PEI salvato con successo nella memoria locale.');
    } catch {
      showToast('Errore durante il salvataggio locale.');
    }
  };

  // Chiusura PEI
  const handleClosePei = () => {
    setHasOpenDocument(false);
    setSelectedModelId(settings.defaultModelId || null);
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
      targetModelDef,
      payload.studentName
    );

    if (payload.schoolYear) {
      newDoc.schoolYear = payload.schoolYear;
    }

    newDoc.originalSourceBinary = payload.sourcePdfBinary;
    newDoc.originalSourceSha256 = payload.originalSourceSha256;
    newDoc.acquiredSchema = payload.acquiredSchema;
    newDoc.acquiredBinarySha256 = payload.acquiredBinarySha256;

    // CTE-FIX-01: Pass-through of canonical/acquired document binary
    if (payload.canonicalDocument || payload.sourcePdfBinary) {
      newDoc.canonicalDocument = payload.canonicalDocument || payload.sourcePdfBinary;
      newDoc.sourcePdfBinary = payload.canonicalDocument || payload.sourcePdfBinary;
    }

    // Popola con i valori estratti e approvati nella coda di revisione
    const resolvedValues: Record<string, string> = { ...payload.extractedValues };

    // Distingui identificativo interno, nome alunno e codice sostitutivo personale
    if (payload.studentCode) {
      resolvedValues['f-01-codice-sostitutivo'] = payload.studentCode;
    }
    if (payload.studentName) {
      resolvedValues['f-01-studente'] = payload.studentName;
    } else if (resolvedValues['f-01-studente'] && /^ALU-[A-Z0-9_-]+$/i.test(resolvedValues['f-01-studente'])) {
      // Non usare il valore sostitutivo come nome estratto sulla riga BAMBINO/A
      delete resolvedValues['f-01-studente'];
    }

    // Sincronizzazione esclusivamente per alias 1:1 accertati di identico tipo, significato e cardinalità
    const STRICT_ALIAS_PAIRS: [string, string][] = [
      ['f-02-sintesi-assi', 'f-02-sintesi-profilo'],
      ['f-07-interventi', 'f-07-interventi-contesto'],
      ['f-08-adattamenti-discipline', 'f-08-curricolare-obiettivi'],
    ];

    STRICT_ALIAS_PAIRS.forEach(([canon, alias]) => {
      if (resolvedValues[alias] && !resolvedValues[canon]) {
        resolvedValues[canon] = resolvedValues[alias];
      } else if (resolvedValues[canon] && !resolvedValues[alias]) {
        resolvedValues[alias] = resolvedValues[canon];
      }
    });

    newDoc.values = {
      ...newDoc.values,
      ...resolvedValues,
    };
    if (payload.compilationDate) {
      newDoc.lastModifiedDate = payload.compilationDate;
      newDoc.values['f-01-data-redazione'] = payload.compilationDate;
    }

    // Segna i campi approvati come compilati
    Object.keys(resolvedValues).forEach((fId) => {
      newDoc.fieldStatuses[fId] = 'compilato';
    });

    setDocument(newDoc);
    setHasOpenDocument(true);
    setSavedDocument(newDoc);
    setSelectedModelId(newDoc.modelId || `MINISTERIAL_${payload.schoolOrder}`);

    try {
      void savePeiDocument(newDoc).catch(()=>showToast('Salvataggio del PEI non riuscito.'));
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
        schoolOrder={currentModelDef?.schoolOrder || document.schoolOrder}
        selectedModelId={selectedModelId}
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
                hasOpenDocument={hasOpenDocument}
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
            customModels={customModels}
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
            customModels={customModels}
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
        initialModelId={selectedModelId}
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

      {isPdfIntakeModalOpen && (
        <AcquisitionModal
          isOpen={true}
          onClose={() => setIsPdfIntakeModalOpen(false)}
          customModels={customModels}
          onAcquisitionSuccess={handleAcquisitionSuccess}
        />
      )}

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
        onUpdateModelName={handleUpdateModelName}
        onDeleteModel={handleDeleteCustomModel}
        savedDocument={savedDocument}
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
          evidenceDocument={hasOpenDocument ? document : undefined}
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

