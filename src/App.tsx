/**
 * @license
 * PEI FACILE — Applicazione Integrata
 * Conforme alle Linee Guida D.I. 182/2020 e D.I. 153/2023
 */

import React, { useState, useEffect } from 'react';
import type { ScreenId, SchoolOrder, ThemeType, PeiDocument, PeiSectionDefinition } from './types/pei';
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

export default function App() {
  // 1. Stato di Navigazione
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('SCR-001');

  // 2. Stato del Tema (Sabbia, Blu Navy 35%, Antracite)
  const [currentTheme, setCurrentTheme] = useState<ThemeType>('navy');

  // 3. Documento PEI Corrente
  const [document, setDocument] = useState<PeiDocument>(DEMO_PEI_DOCUMENT);
  const [hasOpenDocument, setHasOpenDocument] = useState<boolean>(true);

  // 4. Sezione Attiva nella compilazione
  const [activeSectionId, setActiveSectionId] = useState<string>('sec1_quadro_informativo');

  // 5. Livello di Zoom
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // 6. Stati Modali
  const [isNewPeiModalOpen, setIsNewPeiModalOpen] = useState(false);
  const [isPdfIntakeModalOpen, setIsPdfIntakeModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // 7. Notifiche Toast
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

      return {
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
    });
  };

  // Cambio ordine di scuola (A1 - A4)
  const handleChangeSchoolOrder = (newOrder: SchoolOrder) => {
    setDocument((prev) => ({
      ...prev,
      schoolOrder: newOrder,
      updatedAt: new Date().toISOString(),
    }));
    const newSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, newOrder);
    if (!newSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(newSections[0].id);
    }
    showToast(`Modello ministeriale aggiornato ad ${newOrder} (${SCHOOL_ORDERS_METADATA[newOrder].officialAllegato})`);
  };

  // Creazione nuovo PEI vuoto
  const handleConfirmCreateNewPei = (
    order: SchoolOrder,
    studentCode: string,
    schoolName: string,
    classSec: string
  ) => {
    const newDoc = createEmptyPeiDocument(order, studentCode, schoolName, classSec);
    setDocument(newDoc);
    setHasOpenDocument(true);
    const orderSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, order);
    setActiveSectionId(orderSections[0].id);
    setCurrentScreen('SCR-002');
    showToast(`Nuovo PEI ${order} creato con successo.`);
  };

  // Apertura PEI Demo
  const handleOpenSamplePei = () => {
    setDocument(DEMO_PEI_DOCUMENT);
    setHasOpenDocument(true);
    setActiveSectionId('sec1_quadro_informativo');
    setCurrentScreen('SCR-002');
    showToast('PEI di Esempio caricato con dati fittizi realistici.');
  };

  // Selezione documento recente dalla home
  const handleSelectRecent = (order: SchoolOrder) => {
    setDocument((prev) => ({
      ...prev,
      schoolOrder: order,
      studentCode: `ALUNNO_${order}_DEMO`,
    }));
    setHasOpenDocument(true);
    const orderSections = filterSectionsForSchoolOrder(MASTER_PEI_SECTIONS, order);
    setActiveSectionId(orderSections[0].id);
    setCurrentScreen('SCR-002');
    showToast(`Aperto documento ${order} dall'archivio recente.`);
  };

  // Salvataggio simulato
  const handleSaveDemo = () => {
    try {
      localStorage.setItem('pei_facile_saved_doc', JSON.stringify(document));
    } catch {
      // ignore
    }
    showToast('Bozza PEI salvata localmente in memoria.');
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
    if (imported.schoolOrder) {
      handleChangeSchoolOrder(imported.schoolOrder);
    }
    setDocument((prev) => {
      const mergedValues = { ...prev.values, ...imported.extractedValues };
      const mergedStatuses = { ...prev.fieldStatuses };
      Object.keys(imported.extractedValues).forEach((fId) => {
        mergedStatuses[fId] = 'compilato';
      });
      return {
        ...prev,
        values: mergedValues,
        fieldStatuses: mergedStatuses,
        updatedAt: new Date().toISOString(),
      };
    });
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
        onChangeTheme={setCurrentTheme}
        zoomScale={zoomScale}
        onChangeZoom={setZoomScale}
        activeSectionTitle={currentSection?.shortTitle}
        hasOpenDocument={hasOpenDocument}
        onNewPei={() => setIsNewPeiModalOpen(true)}
        onOpenSamplePei={handleOpenSamplePei}
        onOpenPdfIntake={() => setIsPdfIntakeModalOpen(true)}
        onSaveDemo={handleSaveDemo}
        onClosePei={handleClosePei}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenHelpModal={() => setIsHelpModalOpen(true)}
      />

      {/* Contenuto Principale: Visualizzazione Schermata Corrente */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* SCR-001: Schermata Home con Albero Attenuato come da Pagebook R04 */}
        {currentScreen === 'SCR-001' && (
          <div className="flex-1 flex overflow-hidden">
            <aside className="w-72 shrink-0 h-full hidden lg:block opacity-40 pointer-events-none select-none border-r border-[var(--border)]">
              <MasterTree
                sections={currentSections}
                activeSectionId={activeSectionId}
                schoolOrder={document.schoolOrder}
                disabled={true}
              />
            </aside>

            <HomeScreen
              onNewPei={() => setIsNewPeiModalOpen(true)}
              onOpenSamplePei={handleOpenSamplePei}
              onOpenPdfIntake={() => setIsPdfIntakeModalOpen(true)}
              onSelectRecentDocument={handleSelectRecent}
              onOpenHelpModal={() => setIsHelpModalOpen(true)}
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
            onSave={handleSaveDemo}
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
        currentTheme={currentTheme}
        onChangeTheme={setCurrentTheme}
        defaultSchoolOrder={document.schoolOrder}
        onChangeDefaultSchoolOrder={handleChangeSchoolOrder}
      />

      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </div>
  );
}
