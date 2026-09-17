import type {
  SchoolOrder,
  SchoolOrderMetadata,
  PeiSectionDefinition,
  PeiDocument,
  PeiModelDefinition,
} from '../types/pei';

export const SCHOOL_ORDERS_METADATA: Record<SchoolOrder, SchoolOrderMetadata> = {
  A1: {
    id: 'A1',
    name: "Scuola dell'Infanzia",
    schoolLevel: 'Infanzia',
    description: 'Bambini da 3 a 6 anni. Modello incentrato sui campi di esperienza.',
    officialAllegato: 'ALLEGATO A1',
    decree: 'D.I. 182/2020 e D.I. 153/2023',
    pdfFileName: 'ALLEGATO_A1_PEI_INFANZIA.pdf',
    pageCount: 12,
    specialRules: 'Assenza della sezione 10 (Certificazione competenze) ammessa e conforme alle linee guida.',
  },
  A2: {
    id: 'A2',
    name: 'Scuola Primaria',
    schoolLevel: 'Primaria',
    description: 'Alunni da 6 a 11 anni. Percorso curricolare e discipline con valutazione in itinere.',
    officialAllegato: 'ALLEGATO A2',
    decree: 'D.I. 182/2020 e D.I. 153/2023',
    pdfFileName: 'ALLEGATO_A2_PEI_PRIMARIA.pdf',
    pageCount: 13,
    specialRules: 'Tutte le sezioni 1-12 applicabili con specifica per la scuola primaria.',
  },
  A3: {
    id: 'A3',
    name: 'Scuola Secondaria di I Grado',
    schoolLevel: 'Secondaria I Grado',
    description: 'Alunni da 11 a 14 anni. Prove d’esame e certificazione delle competenze.',
    officialAllegato: 'ALLEGATO A3',
    decree: 'D.I. 182/2020 e D.I. 153/2023',
    pdfFileName: 'ALLEGATO_A3_PEI_SEC_1_GRADO.pdf',
    pageCount: 12,
    specialRules: 'Include modalità di svolgimento delle prove standardizzate e dell’esame di Stato.',
  },
  A4: {
    id: 'A4',
    name: 'Scuola Secondaria di II Grado',
    schoolLevel: 'Secondaria II Grado',
    description: 'Studenti da 14 a 19 anni. Percorsi curricolari ordinari, personalizzati o differenziati.',
    officialAllegato: 'ALLEGATO A4',
    decree: 'D.I. 182/2020 e D.I. 153/2023',
    pdfFileName: 'ALLEGATO_A4_PEI_SEC_2_GRADO.pdf',
    pageCount: 14,
    specialRules: 'Include PCTO e tipologia di percorso: A (ordinario), B (personalizzato), C (differenziato).',
  },
};

export const MASTER_SECTIONS: PeiSectionDefinition[] = [
  {
    id: 'sec-01',
    number: 1,
    title: 'Quadro informativo',
    shortTitle: '1. Quadro informativo',
    description: 'Situazione familiare, descrizione dell’alunno/a e prospettiva dei genitori',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [1, 2],
    fields: [
      {
        id: 'f-01-scuola',
        code: 'SEC-01-F01',
        label: 'Istituzione scolastica',
        componentType: 'CMP-01',
        required: true,
        placeholder: 'Es. I.C. "Gianni Rodari"',
        helpText: 'Denominazione ufficiale dell’istituto comprensivo o scuola polo.',
        maxLength: 120,
        pageNumber: 1,
      },
      {
        id: 'f-01-studente',
        code: 'SEC-01-F02',
        label: 'Codice identificativo alunno/a (pseudonimizzato)',
        componentType: 'CMP-01',
        required: true,
        placeholder: 'Es. ALU-2026-X09',
        helpText: 'Utilizzare esclusivamente codici o pseudonimi a tutela della privacy.',
        maxLength: 40,
        pageNumber: 1,
      },
      {
        id: 'f-01-classe',
        code: 'SEC-01-F03',
        label: 'Classe / Sezione e Plesso',
        componentType: 'CMP-01',
        required: true,
        placeholder: 'Es. Sezione B - Plesso Collodi',
        maxLength: 80,
        pageNumber: 1,
      },
      {
        id: 'f-01-data-redazione',
        code: 'SEC-01-F04',
        label: 'Data di redazione del PEI',
        componentType: 'CMP-08',
        required: true,
        helpText: 'Data del GLO di approvazione iniziale del PEI.',
        pageNumber: 1,
      },
      {
        id: 'f-01-situazione-famiglia',
        code: 'SEC-01-F05',
        label: 'Descrizione del contesto familiare e prospettiva dei genitori',
        componentType: 'CMP-02',
        placeholder: 'Sintesi condivisa con la famiglia su aspettative, abitudini e punti di forza...',
        minLines: 4,
        helpText: 'Riflette la visione della famiglia e il loro contributo informativo essenziale.',
        pageNumber: 1,
      },
      {
        id: 'f-01-alunno-voce',
        code: 'SEC-01-F06',
        label: 'La voce dello studente / del bambino (autodeterminazione)',
        componentType: 'CMP-03',
        placeholder: 'Cosa gli piace fare a scuola, preferenze, attività che lo entusiasmano...',
        suggestedPhrases: [
          'Esprime forte interesse per le attività manipolative, musicali e laboratoriali.',
          'Mostra motivazione quando coinvolto in attività cooperative a piccoli gruppi.',
          'Gradisce routine prevedibili e supporti visivi per la pianificazione della giornata.',
          'Partecipa attivamente alle conversazioni guidate su argomenti di proprio interesse.',
        ],
        helpText: 'D.I. 182/2020: valorizzazione della partecipazione attiva e dell’autodeterminazione.',
        pageNumber: 2,
      },
    ],
  },
  {
    id: 'sec-02',
    number: 2,
    title: 'Elementi desunti dal Profilo di Funzionamento',
    shortTitle: '2. Profilo Funzionamento',
    description: 'Sintesi diagnostica, assi di sviluppo e correlazione con classificazione ICF',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [2, 3],
    fields: [
      {
        id: 'f-02-doc-riferimento',
        code: 'SEC-02-F01',
        label: 'Documento clinico-funzionale di riferimento',
        componentType: 'CMP-05',
        required: true,
        options: [
          { value: 'PF_ICF', label: 'Profilo di Funzionamento (ICF - D.Lgs 66/2017)' },
          { value: 'DF_PDF', label: 'Diagnosi Funzionale e Profilo Dinamico Funzionale (regime transitorio)' },
          { value: 'ALTRO', label: 'Altra certificazione specialistica integrata', isOther: true },
        ],
        pageNumber: 2,
      },
      {
        id: 'f-02-data-emissione',
        code: 'SEC-02-F02',
        label: 'Data rilascio documento diagnostico',
        componentType: 'CMP-08',
        pageNumber: 2,
      },
      {
        id: 'f-02-sintesi-assi',
        code: 'SEC-02-F03',
        label: 'Sintesi delle capacità e delle performance secondo il Profilo',
        componentType: 'CMP-03',
        suggestedPhrases: [
          'Buone capacità di orientamento spaziale e riconoscimento delle figure di riferimento.',
          'Emergono potenzialità nell’elaborazione visuo-spaziale a fronte di fragilità nell’attenzione sostenuta.',
          'Capacità comunicative verbali in evoluzione supportate da canali multimodali.',
          'Punti di forza nell’imitazione e nella disponibilità alla relazione diadica.',
        ],
        helpText: 'Sintetizzare i punti salienti senza violare il principio di minimizzazione dei dati sensibili.',
        pageNumber: 2,
      },
    ],
  },
  {
    id: 'sec-03',
    number: 3,
    title: 'Raccordo con il Progetto Individuale',
    shortTitle: '3. Progetto Individuale',
    description: 'Integrazione con i servizi territoriali, sanitari e sociali (art. 14 L. 328/2000)',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [3, 3],
    fields: [
      {
        id: 'f-03-stato-progetto',
        code: 'SEC-03-F01',
        label: 'Stato di attivazione del Progetto Individuale',
        componentType: 'CMP-05',
        required: true,
        options: [
          { value: 'NON_RICHIESTO', label: 'Non ancora richiesto dalla famiglia' },
          { value: 'RICHIESTO_IN_ATTESA', label: 'Richiesto dall’Ente competente ma in attesa di formalizzazione' },
          { value: 'ATTIVO_REDAZIONE', label: 'Formalizzato e attivo ai sensi dell’art. 14 L. 328/2000' },
        ],
        pageNumber: 3,
      },
      {
        id: 'f-03-accordi-territorio',
        code: 'SEC-03-F02',
        label: 'Interventi coordinati scuola-famiglia-servizi',
        componentType: 'CMP-02',
        placeholder: 'Sintesi degli accordi operativi per il raccordo extrascolastico...',
        pageNumber: 3,
      },
    ],
  },
  {
    id: 'sec-04',
    number: 4,
    title: 'Osservazioni sull’alunno/a per individuare i punti di forza',
    shortTitle: '4. Osservazioni e punti di forza',
    description: 'Le 4 dimensioni fondamentali: Relazione, Comunicazione, Autonomia, Cognitiva',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [4, 5],
    fields: [
      {
        id: 'f-04-dim-relazione',
        code: 'SEC-04-F01',
        label: 'Dimensione della Relazione, dell’interazione e della socializzazione',
        componentType: 'CMP-04',
        required: true,
        guidedQuestions: [
          {
            id: 'q1',
            prompt: 'In quali situazioni l’alunno/a interagisce più spontaneamente con i pari?',
            options: ['Nel gioco libero', 'Durante i lavori di gruppo', 'Nelle pause ricreative', 'In attività individuali affiancate'],
          },
          {
            id: 'q2',
            prompt: 'Qual è l’atteggiamento prevalente verso le figure adulte educative?',
            options: ['Fiducioso e collaborativo', 'Cerca supporto continuo', 'Inizialmente diffidente ma responsivo', 'Autonomo'],
          },
          {
            id: 'q3',
            prompt: 'Quali facilitatori relazionali hanno dimostrato maggiore efficacia?',
            options: ['Coinvolgimento del compagno tutor', 'Regole visive condivise', 'Attività di circle time', 'Rinforzi positivi immediati'],
          },
        ],
        helpText: 'Traccia guidata per esplorare la sfera relazionale con domande strutturate.',
        pageNumber: 4,
      },
      {
        id: 'f-04-dim-comunicazione',
        code: 'SEC-04-F02',
        label: 'Dimensione della Comunicazione e dei linguaggi',
        componentType: 'CMP-03',
        suggestedPhrases: [
          'Comunica con linguaggio verbale comprensibile in contesti familiari; necessita di tempo di decodifica nelle novità.',
          'Utilizza supporti visivi e immagini/simboli per arricchire la produzione e comprendere le consegne complesse.',
          'Interagisce efficacemente con il linguaggio gestuale e l’espressione mimica quando sollecitato positivamente.',
        ],
        pageNumber: 4,
      },
      {
        id: 'f-04-dim-autonomia',
        code: 'SEC-04-F03',
        label: 'Dimensione dell’Autonomia e dell’orientamento',
        componentType: 'CMP-03',
        suggestedPhrases: [
          'Gestisce con buona autonomia la cura dei propri materiali scolastici e gli spostamenti nel plesso.',
          'Necessita di mediazione per l’organizzazione della sequenza operativa dei compiti.',
          'Riconosce i punti di riferimento cardinali della scuola ed è capace di chiedere aiuto in caso di disorientamento.',
        ],
        pageNumber: 5,
      },
      {
        id: 'f-04-dim-cognitiva',
        code: 'SEC-04-F04',
        label: 'Dimensione Cognitiva, neuropsicologica e dell’apprendimento',
        componentType: 'CMP-02',
        placeholder: 'Capacità mnestiche, stili cognitivi (visivo, uditivo, cinestesico), tempi di attenzione...',
        pageNumber: 5,
      },
    ],
  },
  {
    id: 'sec-05',
    number: 5,
    title: 'Interventi per l’alunno/a: obiettivi educativi e didattici',
    shortTitle: '5. Interventi e obiettivi',
    description: 'Definizione degli obiettivi nelle 4 dimensioni, strategie, strumenti e verifiche',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [5, 6],
    fields: [
      {
        id: 'f-05-tabella-obiettivi',
        code: 'SEC-05-F01',
        label: 'Obiettivi educativi, didattici, strategie e criteri di valutazione',
        componentType: 'CMP-09',
        required: true,
        columns: [
          { id: 'dimensione', label: 'Dimensione ICF', type: 'select', width: '22%', options: ['Relazione', 'Comunicazione', 'Autonomia', 'Cognitiva'] },
          { id: 'obiettivo', label: 'Obiettivo specifico', type: 'text', width: '38%' },
          { id: 'strategia', label: 'Strategie e strumenti', type: 'text', width: '25%' },
          { id: 'verifica', label: 'Verifica / Criteri', type: 'text', width: '15%' },
        ],
        minRows: 1,
        pageNumber: 5,
      },
      {
        id: 'f-05-facilitatori-scelta',
        code: 'SEC-05-F02',
        label: 'Strumenti compensativi e mediatori didattici prioritari',
        componentType: 'CMP-06',
        options: [
          { value: 'MAPPE_SCHEMI', label: 'Mappe concettuali e schemi riassuntivi' },
          { value: 'SYNTH_VOCALE', label: 'Sintesi vocale e audiolibri' },
          { value: 'CALCOLATRICE', label: 'Calcolatrice / tabelle compensative' },
          { value: 'PC_SOFTWARE', label: 'Computer con programmi di videoscrittura e correttore' },
          { value: 'TEMPI_AGGIUNTIVI', label: 'Tempi aggiuntivi per le verifiche' },
          { value: 'DISPENSA_LETTURA_ALTA', label: 'Dispensa dalla lettura ad alta voce in pubblico' },
          { value: 'ALTRO_STRUMENTO', label: 'Altri strumenti specifici concordati', isOther: true },
        ],
        pageNumber: 6,
      },
    ],
  },
  {
    id: 'sec-06',
    number: 6,
    title: 'Osservazioni sul contesto: barriere e facilitatori',
    shortTitle: '6. Barriere e facilitatori',
    description: 'Analisi dei fattori ambientali secondo la prospettiva bio-psico-sociale',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [7, 7],
    fields: [
      {
        id: 'f-06-barriere',
        code: 'SEC-06-F01',
        label: 'Fattori contestuali che costituiscono barriere (e1-e5 ICF)',
        componentType: 'CMP-02',
        placeholder: 'Es. Eccessivo rumore di fondo in aula, cambi frequenti di docenti, carenza di segnaletica visiva...',
        pageNumber: 7,
      },
      {
        id: 'f-06-facilitatori',
        code: 'SEC-06-F02',
        label: 'Fattori contestuali che costituiscono facilitatori (e1-e5 ICF)',
        componentType: 'CMP-03',
        suggestedPhrases: [
          'Clima di classe accogliente e collaborativo, favorito da attività di accoglienza strutturate.',
          'Presenza di sussidi digitali inclusivi (LIM, monitor interattivo, tablet dedicati).',
          'Collaborazione continuativa e propositiva tra docenti curricolari e di sostegno.',
          'Spazi dedicati al rilassamento o alla decantazione sensoriale in caso di sovraccarico.',
        ],
        pageNumber: 7,
      },
    ],
  },
  {
    id: 'sec-07',
    number: 7,
    title: 'Interventi sul contesto per un ambiente inclusivo',
    shortTitle: '7. Interventi sul contesto',
    description: 'Azioni per rimuovere le barriere e potenziare i facilitatori a livello di scuola e classe',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [7, 8],
    fields: [
      {
        id: 'f-07-interventi',
        code: 'SEC-07-F01',
        label: 'Azioni programmate per l’accessibilità e l’inclusione ambientale',
        componentType: 'CMP-02',
        placeholder: 'Descrivere gli adattamenti fisici, relazionali e metodologici introdotti nel gruppo classe...',
        pageNumber: 7,
      },
    ],
  },
  {
    id: 'sec-08',
    number: 8,
    title: 'Interventi sul percorso curricolare',
    shortTitle: '8. Percorso curricolare',
    description: 'Programmazione delle discipline / campi di esperienza, prove e criteri',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [8, 9],
    fields: [
      {
        id: 'f-08-tipo-percorso',
        code: 'SEC-08-F01',
        label: 'Tipologia di percorso curricolare adottato',
        componentType: 'CMP-05',
        required: true,
        options: [
          { value: 'ORDINARIO', label: 'A - Percorso ordinario conforme alle Indicazioni Nazionali' },
          { value: 'PERSONALIZZATO', label: 'B - Percorso personalizzato con prove equipollenti' },
          { value: 'DIFFERENZIATO', label: 'C - Percorso differenziato (non equipollente, solo Secondaria II)' },
        ],
        helpText: 'Per Infanzia e Primaria fare riferimento agli adattamenti didattici delle linee guida.',
        pageNumber: 8,
      },
      {
        id: 'f-08-adattamenti-discipline',
        code: 'SEC-08-F02',
        label: 'Modalità di svolgimento delle prove e discipline con programmazione personalizzata',
        componentType: 'CMP-02',
        placeholder: 'Specificare eventuali riduzioni quantitative o sostituzioni qualitative per singole materie...',
        pageNumber: 8,
      },
    ],
  },
  {
    id: 'sec-09',
    number: 9,
    title: 'Organizzazione generale del progetto di inclusione',
    shortTitle: '9. Risorse e organizzazione',
    description: 'Risorse umane, orario scolastico, sostegno didattico e assistenza specialistica',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [9, 10],
    fields: [
      {
        id: 'f-09-ore-sostegno',
        code: 'SEC-09-F01',
        label: 'Ore settimanali di sostegno didattico assegnate',
        componentType: 'CMP-07',
        required: true,
        unit: 'ore/sett.',
        min: 0,
        max: 30,
        step: 1,
        pageNumber: 9,
      },
      {
        id: 'f-09-ore-assistenza',
        code: 'SEC-09-F02',
        label: 'Ore settimanali di assistenza all’autonomia e comunicazione',
        componentType: 'CMP-07',
        unit: 'ore/sett.',
        min: 0,
        max: 30,
        step: 1,
        pageNumber: 9,
      },
      {
        id: 'f-09-totale-ore',
        code: 'SEC-09-F03',
        label: 'Totale monte ore di supporto settimanale',
        componentType: 'CMP-10',
        calculationType: 'sum',
        sourceFieldIds: ['f-09-ore-sostegno', 'f-09-ore-assistenza'],
        helpText: 'Calcolato automaticamente dalla somma di sostegno didattico e assistenza.',
        pageNumber: 9,
      },
      {
        id: 'f-09-presenza-altre-figure',
        code: 'SEC-09-F04',
        label: 'Altre figure e servizi di supporto operativi',
        componentType: 'CMP-06',
        options: [
          { value: 'COLLABORATORE_SCOLASTICO', label: 'Collaboratore scolastico (assistenza di base)' },
          { value: 'EDUCATORE_DOMICILIARE', label: 'Educatore domiciliare / territoriale' },
          { value: 'TERAPISTA_ESTERNO', label: 'Terapista (logopedista/psicomotricista in raccordo)' },
          { value: 'TRASPORTO_DEDICATO', label: 'Servizio di trasporto scolastico dedicato' },
        ],
        pageNumber: 10,
      },
    ],
  },
  {
    id: 'sec-10',
    number: 10,
    title: 'Certificazione delle competenze',
    shortTitle: '10. Certificazione competenze',
    description: 'Criteri per la compilazione della certificazione delle competenze (non ammesso in Infanzia)',
    applicableModels: ['A2', 'A3', 'A4'],
    pageRange: [10, 11],
    fields: [
      {
        id: 'f-10-modalita-certificazione',
        code: 'SEC-10-F01',
        label: 'Adattamenti del modello ministeriale di certificazione',
        componentType: 'CMP-05',
        options: [
          { value: 'INTEGRALE', label: 'Adozione del modello ministeriale senza variazioni descrittive' },
          { value: 'DESCRITTORI_ADATTATI', label: 'Modello con descrittori coerenti con il PEI' },
          { value: 'SCHEDA_INTEGRATIVA', label: 'Accompagnato da nota esplicativa del livello reale raggiunto' },
        ],
        pageNumber: 10,
      },
      {
        id: 'f-10-note-certificazione',
        code: 'SEC-10-F02',
        label: 'Note esplicative sui livelli di competenza chiave',
        componentType: 'CMP-02',
        placeholder: 'Note per la commissione d’esame o per il passaggio all’ordine successivo...',
        pageNumber: 11,
      },
    ],
  },
  {
    id: 'sec-11',
    number: 11,
    title: 'Verifica finale / Valutazione globale dei risultati',
    shortTitle: '11. Verifica finale',
    description: 'Valutazione conclusiva del GLO sul raggiungimento degli obiettivi del PEI',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [11, 12],
    fields: [
      {
        id: 'f-11-data-verifica',
        code: 'SEC-11-F01',
        label: 'Data del GLO di verifica finale',
        componentType: 'CMP-08',
        pageNumber: 11,
      },
      {
        id: 'f-11-esito-globale',
        code: 'SEC-11-F02',
        label: 'Valutazione globale dei progressi compiuti',
        componentType: 'CMP-05',
        options: [
          { value: 'COMPLETO', label: 'Obiettivi pienamente raggiunti in tutte le dimensioni' },
          { value: 'BUONO', label: 'Raggiungimento soddisfacente della maggior parte degli obiettivi' },
          { value: 'PARZIALE', label: 'Raggiungimento parziale: necessari ulteriori consolidamenti' },
          { value: 'RIVALUTARE', label: 'Revisione complessiva delle strategie per l’anno successivo' },
        ],
        pageNumber: 11,
      },
      {
        id: 'f-11-relazione-finale',
        code: 'SEC-11-F03',
        label: 'Relazione sintetica conclusiva del team docente e specialistico',
        componentType: 'CMP-02',
        placeholder: 'Sintesi dei punti di arrivo e raccomandazioni per il futuro percorso...',
        pageNumber: 12,
      },
    ],
  },
  {
    id: 'sec-12',
    number: 12,
    title: 'PEI provvisorio per l’anno scolastico successivo',
    shortTitle: '12. PEI provvisorio',
    description: 'Proposte di fabbisogno di risorse e orario per l’anno scolastico successivo',
    applicableModels: ['A1', 'A2', 'A3', 'A4'],
    pageRange: [12, 12],
    fields: [
      {
        id: 'f-12-richiesta-ore-sostegno',
        code: 'SEC-12-F01',
        label: 'Proposta orario sostegno per il prossimo anno scolastico',
        componentType: 'CMP-07',
        unit: 'ore/sett.',
        min: 0,
        max: 30,
        step: 1,
        pageNumber: 12,
      },
      {
        id: 'f-12-richiesta-assistenza',
        code: 'SEC-12-F02',
        label: 'Proposta ore assistenza specialistica per il prossimo anno',
        componentType: 'CMP-07',
        unit: 'ore/sett.',
        min: 0,
        max: 30,
        step: 1,
        pageNumber: 12,
      },
      {
        id: 'f-12-avanzamento-globale',
        code: 'SEC-12-F03',
        label: 'Stato di completezza complessiva della redazione del PEI',
        componentType: 'CMP-10',
        calculationType: 'progress_percentage',
        helpText: 'Percentuale di campi obbligatori validati e compilati.',
        pageNumber: 12,
      },
    ],
  },
];

export const MASTER_PEI_SECTIONS = MASTER_SECTIONS;

export function filterSectionsForSchoolOrder(
  sections: PeiSectionDefinition[],
  model: SchoolOrder
): PeiSectionDefinition[] {
  return sections.filter((sec) => sec.applicableModels.includes(model));
}

export function getSectionsForModel(model: SchoolOrder): PeiSectionDefinition[] {
  return MASTER_SECTIONS.filter((sec) => sec.applicableModels.includes(model));
}

export function createEmptyPeiDocument(
  model: SchoolOrder,
  studentCode?: string,
  schoolName?: string,
  classOrSection?: string,
  modelDef?: PeiModelDefinition | null
): PeiDocument {
  const meta = SCHOOL_ORDERS_METADATA[model];
  const finalStudentCode = studentCode || `ALU-${model}-2026-F`;
  const finalSchoolName = schoolName || 'I.C. Statale "Gianni Rodari"';
  const finalClassOrSection =
    classOrSection || (model === 'A1' ? 'Sezione Girasoli' : 'Classe 2^ B');

  const isCustom = modelDef ? !modelDef.isMinisterial : false;

  return {
    id: `pei-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    schoolOrder: model,
    schoolYear: '2026/2027',
    studentCode: finalStudentCode,
    schoolName: finalSchoolName,
    classOrSection: finalClassOrSection,
    creationDate: '2026-09-16',
    lastModifiedDate: '2026-09-16',
    // Associazione esplicita al modello
    modelId: modelDef ? modelDef.id : `MINISTERIAL_${model}`,
    modelVersion: modelDef ? modelDef.version : 'D.I. 182/2020 - D.I. 153/2023',
    modelOrigin: modelDef ? modelDef.originType : 'MINISTERIAL',
    modelName: modelDef ? modelDef.name : meta.officialAllegato,
    // Retrocompatibilità per codice esistente
    customModelId: isCustom ? modelDef?.id : undefined,
    customModelName: isCustom ? modelDef?.name : undefined,
    customModelOrigin: isCustom
      ? modelDef?.originType === 'TERRITORIAL'
        ? 'territoriale'
        : modelDef?.originType === 'INSTITUTION'
        ? 'istituto'
        : 'altro'
      : undefined,
    values: {
      'f-01-scuola': finalSchoolName,
      'f-01-studente': finalStudentCode,
      'f-01-classe': finalClassOrSection,
      'f-01-data-redazione': '16/09/2026',
    },
    fieldStatuses: {
      'f-01-scuola': 'compilato',
      'f-01-studente': 'compilato',
      'f-01-classe': 'compilato',
      'f-01-data-redazione': 'compilato',
    },
    notes: {},
  };
}

export function createSamplePeiDocument(model: SchoolOrder): PeiDocument {
  const doc = createEmptyPeiDocument(model);
  doc.values = {
    ...doc.values,
    'f-01-situazione-famiglia':
      'Famiglia composta da entrambi i genitori e un fratello maggiore. Rapporto sereno e costante collaborazione con l’istituzione scolastica; la famiglia segnala un forte desiderio di autonomia e socialità con il gruppo dei pari.',
    'f-01-alunno-voce':
      'Esprime forte interesse per le attività manipolative, musicali e laboratoriali. Gradisce routine prevedibili e supporti visivi per la pianificazione della giornata.',
    'f-02-doc-riferimento': 'PF_ICF',
    'f-02-data-emissione': '12/03/2025',
    'f-02-sintesi-assi':
      'Emergono potenzialità nell’elaborazione visuo-spaziale a fronte di fragilità nell’attenzione sostenuta. Buona disponibilità relazionale con figure di riferimento stabili.',
    'f-03-stato-progetto': 'ATTIVO_REDAZIONE',
    'f-03-accordi-territorio':
      'Coordinamento trimestrale tra scuola, équipe neuropsichiatrica ASL e servizio socio-educativo del comune per favorire la continuità educativo-assistenziale.',
    'f-04-dim-relazione':
      'In situazioni di gioco libero o cooperative learning a coppie, l’alunno interagisce con entusiasmo. Mostra atteggiamento collaborativo con i docenti.',
    'f-04-dim-comunicazione':
      'Comunica con linguaggio verbale comprensibile in contesti familiari; necessita di tempo di decodifica nelle novità. Utilizza volentieri tabelle visive.',
    'f-04-dim-autonomia':
      'Gestisce con buona autonomia la cura dei propri materiali scolastici e gli spostamenti nel plesso.',
    'f-04-dim-cognitiva':
      'Stile di apprendimento visivo e cinestesico. Memorizzazione efficace supportata da mappe illustrate.',
    'f-05-tabella-obiettivi': [
      {
        dimensione: 'Relazione',
        obiettivo: 'Rafforzare la partecipazione cooperativa nei lavori di gruppo',
        strategia: 'Peer tutoring e ruoli operativi ben definiti',
        verifica: 'Osservazione sistematica e rubrica di processo',
      },
      {
        dimensione: 'Comunicazione',
        obiettivo: 'Arricchire il lessico specifico nelle attività descrittive',
        strategia: 'Mappe concettuali e schede illustrate',
        verifica: 'Prove periodiche orali facilitate',
      },
    ],
    'f-05-facilitatori-scelta': ['MAPPE_SCHEMI', 'TEMPI_AGGIUNTIVI', 'PC_SOFTWARE'],
    'f-06-barriere':
      'Rumori improvvisi o repentini cambi di aula non anticipati che possono generare lieve disorientamento transitorio.',
    'f-06-facilitatori':
      'Clima di classe accogliente e collaborativo, favorito da attività di accoglienza strutturate. Presenza della LIM in aula.',
    'f-07-interventi':
      'Predisposizione di una postazione di lavoro ordinata con indicazioni grafiche e scansione visiva della giornata di lezione.',
    'f-08-tipo-percorso': 'PERSONALIZZATO',
    'f-08-adattamenti-discipline':
      'Prove equipollenti con tempi dilatati del 30% e fruizione di schemi concettuali concordati durante le verifiche scritte.',
    'f-09-ore-sostegno': 18,
    'f-09-ore-assistenza': 6,
    'f-09-presenza-altre-figure': ['COLLABORATORE_SCOLASTICO', 'TRASPORTO_DEDICATO'],
    'f-10-modalita-certificazione': 'DESCRITTORI_ADATTATI',
    'f-10-note-certificazione':
      'I descrittori di livello tengono conto dell’autonomia raggiunta e degli strumenti compensativi utilizzati in conformità al PEI.',
    'f-11-data-verifica': '05/06/2026',
    'f-11-esito-globale': 'BUONO',
    'f-11-relazione-finale':
      'L’anno scolastico si conclude con un bilancio ampiamente positivo: ottima integrazione nel gruppo classe e progressi visibili.',
    'f-12-richiesta-ore-sostegno': 18,
    'f-12-richiesta-assistenza': 6,
  };

  // Mark all filled statuses
  Object.keys(doc.values).forEach((k) => {
    doc.fieldStatuses[k] = 'compilato';
  });

  return doc;
}

export const DEMO_PEI_DOCUMENT: PeiDocument = createSamplePeiDocument('A2');
