/**
 * @license
 * PEI FACILE — Semantic Acquisition Engine (DOCUMENT ACQUISITION R01)
 * Pipeline semantica: Model Classifier -> Section Matcher -> Field Mapper -> Confidence & Evidence.
 */

import type { SchoolOrder, PeiModelDefinition } from '../types/pei';
import type {
  ExtractedRawPage,
  MappingEvidence,
  ModelClassificationResult,
} from '../types/documentAcquisitionTypes';
import { MASTER_SECTIONS } from '../data/masterPeiStructure';
import { MINISTERIAL_PEI_MODELS } from '../data/peiModelRegistry';

/**
 * 1. DOCUMENT MODEL CLASSIFIER
 * Classifica il documento in modo deterministico. Se non riconosciuto, NON forza A1-A4.
 */
export function classifyDocumentModel(
  fullText: string,
  customModels: PeiModelDefinition[] = []
): ModelClassificationResult {
  const lower = fullText.toLowerCase();

  // 1. Verifica modelli personalizzati registrati
  for (const cm of customModels) {
    if (
      (cm.name && lower.includes(cm.name.toLowerCase())) ||
      (cm.originName && lower.includes(cm.originName.toLowerCase())) ||
      (cm.sourceHash && fullText.includes(cm.sourceHash))
    ) {
      return {
        detectedOrder: cm.schoolOrder,
        detectedModelId: cm.id,
        detectedModelName: cm.name,
        isModelRecognized: true,
        recognitionReason: `Corrispondenza con modello personalizzato registrato: "${cm.name}" (${cm.originType})`,
        confidence: 95,
      };
    }
  }

  // 2. Verifica modelli ministeriali ufficiali (A1, A2, A3, A4)
  const a1Matches = [
    'allegato a1',
    'scuola dell’infanzia',
    "scuola dell'infanzia",
    'scuola infanzia',
    'campi di esperienza',
    'decreto interministeriale n. 182',
  ].filter((k) => lower.includes(k));

  const a2Matches = [
    'allegato a2',
    'scuola primaria',
    'giudizio descrittivo',
    'quattro livelli di apprendimento',
    'decreto interministeriale n. 182',
  ].filter((k) => lower.includes(k));

  const a3Matches = [
    'allegato a3',
    'secondaria di primo grado',
    'secondaria i grado',
    'esame di stato conclusivo',
    'prove invalsi con misure compensative',
    'decreto interministeriale n. 182',
  ].filter((k) => lower.includes(k));

  const a4Matches = [
    'allegato a4',
    'secondaria di secondo grado',
    'secondaria ii grado',
    'pcto',
    'percorsi per le competenze trasversali',
    'percorso a - ordinario',
    'percorso b - personalizzato',
    'percorso c - differenziato',
  ].filter((k) => lower.includes(k));

  // Punteggi ponderati
  const scores: { order: SchoolOrder; score: number; reason: string }[] = [
    {
      order: 'A1',
      score:
        (lower.includes('allegato a1') ? 50 : 0) +
        (lower.includes('infanzia') ? 30 : 0) +
        (lower.includes('campi di esperienza') ? 20 : 0),
      reason: 'Rilevati marcatori specifici Scuola dell’Infanzia (Allegato A1)',
    },
    {
      order: 'A2',
      score:
        (lower.includes('allegato a2') ? 50 : 0) +
        (lower.includes('scuola primaria') ? 30 : 0) +
        (lower.includes('giudizio descrittivo') ? 20 : 0),
      reason: 'Rilevati marcatori specifici Scuola Primaria (Allegato A2)',
    },
    {
      order: 'A3',
      score:
        (lower.includes('allegato a3') ? 50 : 0) +
        (lower.includes('secondaria di primo grado') || lower.includes('secondaria i grado') ? 30 : 0) +
        (lower.includes('esame di stato') ? 20 : 0),
      reason: 'Rilevati marcatori specifici Scuola Secondaria di I Grado (Allegato A3)',
    },
    {
      order: 'A4',
      score:
        (lower.includes('allegato a4') ? 50 : 0) +
        (lower.includes('secondaria di secondo grado') || lower.includes('secondaria ii grado') ? 30 : 0) +
        (lower.includes('pcto') || lower.includes('percorso differenziato') ? 25 : 0),
      reason: 'Rilevati marcatori specifici Scuola Secondaria di II Grado (Allegato A4)',
    },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (best && best.score >= 30) {
    const minMeta = MINISTERIAL_PEI_MODELS.find((m) => m.schoolOrder === best.order);
    return {
      detectedOrder: best.order,
      detectedModelId: `MINISTERIAL_${best.order}`,
      detectedModelName: minMeta?.name || `Modello Ministeriale ${best.order}`,
      isModelRecognized: true,
      recognitionReason: best.reason,
      confidence: Math.min(95, 60 + best.score),
    };
  }

  // Nessuna corrispondenza affidabile
  return {
    isModelRecognized: false,
    recognitionReason: 'MODELLO NON RICONOSCIUTO: il documento non presenta intestazioni ministeriali o di modelli registrati note.',
    confidence: 0,
  };
}

/**
 * 2. FIELD MAPPER SEMANTICO
 * Mappa i campi mediante anchor semantici ed espressioni regolari sulle pagine estratte,
 * SENZA MAI USARE l'indice della pagina.
 */
export function extractSemanticFieldEvidences(
  rawPages: ExtractedRawPage[],
  schoolOrder: SchoolOrder
): MappingEvidence[] {
  const evidences: MappingEvidence[] = [];

  // Mappa di pattern semantici per i campi standard
  interface FieldExtractor {
    fieldId: string;
    fieldLabel: string;
    sectionId: string;
    sectionTitle: string;
    regexes: RegExp[];
    confidence: number;
    reason: string;
    cleaner?: (val: string) => string;
  }

  const extractors: FieldExtractor[] = [
    {
      fieldId: 'f-01-scuola',
      fieldLabel: 'Istituzione Scolastica',
      sectionId: 'sec-01',
      sectionTitle: '1. Quadro informativo',
      regexes: [
        /(?:ISTITUTO\s+COMPRENSIVO|ISTITUTO\s+D['’]ISTRUZIONE\s+SUPERIORE|SCUOLA|I\.C\.|I\.I\.S\.|LICEO|ITET|IPSIA)[^\n\r,;]{3,80}/i,
        /Istituzione\s+scolastica[:\s]+([^\n\r]{3,80})/i,
        /Denominazione\s+scuola[:\s]+([^\n\r]{3,80})/i,
      ],
      confidence: 92,
      reason: 'Rilevata intestazione istituzione scolastica con pattern standard',
      cleaner: (s) => s.replace(/^(Istituzione\s+scolastica|Denominazione\s+scuola)[:\s]*/i, '').trim(),
    },
    {
      fieldId: 'f-01-studente',
      fieldLabel: 'Identificativo Alunno/a',
      sectionId: 'sec-01',
      sectionTitle: '1. Quadro informativo',
      regexes: [
        /(?:Codice\s+alunno|Identificativo|Alunno\/a|Studente|Allievo|Codice\s+Fiscale)[:\s]+([^\n\r]{2,40})/i,
        /(?:ALU-[A-Z0-9_-]+)/i,
      ],
      confidence: 88,
      reason: 'Rilevato marcatore identificativo studente',
      cleaner: (s) => s.replace(/^(Codice\s+alunno|Identificativo|Alunno\/a|Studente|Allievo|Codice\s+Fiscale)[:\s]*/i, '').trim(),
    },
    {
      fieldId: 'f-01-classe',
      fieldLabel: 'Classe / Sezione e Plesso',
      sectionId: 'sec-01',
      sectionTitle: '1. Quadro informativo',
      regexes: [
        /(?:Classe|Sezione|Plesso)[:\s]+([^\n\r]{2,50})/i,
        /(?:Classe\s+\d+\^?\s*[A-Z]?(?:\s*-\s*[^\n\r]{3,40})?)/i,
        /(?:Sezione\s+[A-Z](?:\s*-\s*[^\n\r]{3,40})?)/i,
      ],
      confidence: 90,
      reason: 'Rilevata indicazione della classe/sezione frequentata',
      cleaner: (s) => s.replace(/^(Classe|Sezione|Plesso)[:\s]*/i, '').trim(),
    },
    {
      fieldId: 'f-01-data-redazione',
      fieldLabel: 'Data Redazione / Approvazione PEI',
      sectionId: 'sec-01',
      sectionTitle: '1. Quadro informativo',
      regexes: [
        /(?:Data\s+di\s+redazione|Data\s+approvazione|Data\s+del\s+GLO|Data)[:\s]+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i,
        /(\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})/i,
      ],
      confidence: 85,
      reason: 'Rilevata data formattata in corrispondenza del riquadro temporale',
      cleaner: (s) => s.replace(/^(Data\s+di\s+redazione|Data\s+approvazione|Data\s+del\s+GLO|Data)[:\s]*/i, '').trim(),
    },
    {
      fieldId: 'f-01-situazione-famiglia',
      fieldLabel: 'Descrizione contesto familiare e prospettiva dei genitori',
      sectionId: 'sec-01',
      sectionTitle: '1. Quadro informativo',
      regexes: [
        /(?:Quadro\s+informativo|Situazione\s+familiare|Prospettiva\s+dei\s+genitori|Dati\s+della\s+famiglia)[:\s]+([\s\S]{20,400}?)(?=(?:Sezione|Elementi|2\.|3\.|Data|$))/i,
        /(?:Descrizione\s+del\s+contesto\s+familiare)[:\s]+([\s\S]{20,400}?)(?=(?:Sezione|Elementi|2\.|3\.|Data|$))/i,
      ],
      confidence: 82,
      reason: 'Rilevato blocco testuale relativo al quadro familiare e prospettiva dei genitori',
      cleaner: (s) => s.replace(/^(Quadro\s+informativo|Situazione\s+familiare|Prospettiva\s+dei\s+genitori|Descrizione\s+del\s+contesto\s+familiare)[:\s]*/i, '').trim(),
    },
    {
      fieldId: 'f-02-sintesi-profilo',
      fieldLabel: 'Sintesi del Profilo di Funzionamento (Sez. 2)',
      sectionId: 'sec-02',
      sectionTitle: '2. Elementi generali dal Profilo di Funzionamento',
      regexes: [
        /(?:Profilo\s+di\s+Funzionamento|Diagnosi\s+Funzionale|Sintesi\s+del\s+profilo)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|3\.|Raccordo|Dimensione|$))/i,
        /(?:Elementi\s+generali\s+desunti\s+dal\s+Profilo)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|3\.|Raccordo|$))/i,
      ],
      confidence: 84,
      reason: 'Rilevato blocco clinico-funzionale del Profilo di Funzionamento (Sez. 2)',
      cleaner: (s) => s.replace(/^(Profilo\s+di\s+Funzionamento|Diagnosi\s+Funzionale|Sintesi\s+del\s+profilo)[:\s]*/i, '').trim(),
    },
    {
      fieldId: 'f-03-raccordo-progetto-individuale',
      fieldLabel: 'Raccordo con il Progetto Individuale (Sez. 3)',
      sectionId: 'sec-03',
      sectionTitle: '3. Raccordo con il Progetto Individuale',
      regexes: [
        /(?:Progetto\s+Individuale\s+ex\s+art\.\s*14|Raccordo\s+con\s+il\s+Progetto\s+Individuale)[:\s]+([\s\S]{20,400}?)(?=(?:Sezione|4\.|Osservazioni|$))/i,
      ],
      confidence: 80,
      reason: 'Rilevata clausola o sintesi del Progetto Individuale ex art. 14 L. 328/2000',
    },
    {
      fieldId: 'f-04-osservazioni-alunno',
      fieldLabel: 'Osservazioni sullo studente (Sez. 4)',
      sectionId: 'sec-04',
      sectionTitle: '4. Osservazioni sullo studente per l’individuazione dei punti di forza',
      regexes: [
        /(?:Osservazioni\s+sull[’']alunno|Osservazioni\s+sullo\s+studente|Punti\s+di\s+forza)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|5\.|Dimensione|Interventi|$))/i,
      ],
      confidence: 82,
      reason: 'Rilevato testo descrittivo osservazioni e punti di forza (Sez. 4)',
    },
    {
      fieldId: 'f-05-dim-sociale-obiettivi',
      fieldLabel: 'Dimensione Socializzazione: Obiettivi (Sez. 5)',
      sectionId: 'sec-05',
      sectionTitle: '5. Interventi per lo studente: obiettivi e strategie',
      regexes: [
        /(?:Dimensione\s+della\s+relazione|Socializzazione|Interazione\s+sociale)[:\s]+([\s\S]{20,400}?)(?=(?:Dimensione|Comunicazione|Autonomia|Cognitiva|Sezione|6\.|$))/i,
      ],
      confidence: 80,
      reason: 'Rilevati obiettivi per la dimensione della relazione e socializzazione (Sez. 5)',
    },
    {
      fieldId: 'f-05-dim-comunicazione-obiettivi',
      fieldLabel: 'Dimensione Comunicazione: Obiettivi (Sez. 5)',
      sectionId: 'sec-05',
      sectionTitle: '5. Interventi per lo studente: obiettivi e strategie',
      regexes: [
        /(?:Dimensione\s+della\s+comunicazione|Linguaggio|Comunicazione\s+aumentativa)[:\s]+([\s\S]{20,400}?)(?=(?:Dimensione|Autonomia|Cognitiva|Sezione|6\.|$))/i,
      ],
      confidence: 80,
      reason: 'Rilevati obiettivi per la dimensione della comunicazione e linguaggio (Sez. 5)',
    },
    {
      fieldId: 'f-05-dim-autonomia-obiettivi',
      fieldLabel: 'Dimensione Autonomia: Obiettivi (Sez. 5)',
      sectionId: 'sec-05',
      sectionTitle: '5. Interventi per lo studente: obiettivi e strategie',
      regexes: [
        /(?:Dimensione\s+dell['’]autonomia|Autonomia\s+personale|Autonomia\s+sociale)[:\s]+([\s\S]{20,400}?)(?=(?:Dimensione|Cognitiva|Sezione|6\.|$))/i,
      ],
      confidence: 80,
      reason: 'Rilevati obiettivi per la dimensione dell’autonomia e orientamento (Sez. 5)',
    },
    {
      fieldId: 'f-05-dim-cognitiva-obiettivi',
      fieldLabel: 'Dimensione Cognitiva: Obiettivi (Sez. 5)',
      sectionId: 'sec-05',
      sectionTitle: '5. Interventi per lo studente: obiettivi e strategie',
      regexes: [
        /(?:Dimensione\s+cognitiva|Neuropsicologica|Apprendimento)[:\s]+([\s\S]{20,400}?)(?=(?:Dimensione|Sezione|6\.|Contesto|$))/i,
      ],
      confidence: 80,
      reason: 'Rilevati obiettivi per la dimensione cognitiva, neuropsicologica e apprendimento (Sez. 5)',
    },
    {
      fieldId: 'f-06-osservazioni-contesto',
      fieldLabel: 'Osservazioni sul Contesto: Barriere e Facilitatori (Sez. 6)',
      sectionId: 'sec-06',
      sectionTitle: '6. Osservazioni sul contesto: barriere e facilitatori',
      regexes: [
        /(?:Barriere\s+e\s+facilitatori|Osservazioni\s+sul\s+contesto|Fattori\s+ambientali)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|7\.|Interventi\s+sul\s+contesto|$))/i,
      ],
      confidence: 83,
      reason: 'Rilevata matrice o analisi barriere e facilitatori ICF (Sez. 6)',
    },
    {
      fieldId: 'f-07-interventi-contesto',
      fieldLabel: 'Interventi sul Contesto di Apprendimento (Sez. 7)',
      sectionId: 'sec-07',
      sectionTitle: '7. Interventi sul contesto di apprendimento',
      regexes: [
        /(?:Interventi\s+sul\s+contesto|Azioni\s+per\s+l['’]inclusione|Misure\s+ambientali)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|8\.|Curricolare|$))/i,
      ],
      confidence: 81,
      reason: 'Rilevate misure e accomodamenti ambientali (Sez. 7)',
    },
    {
      fieldId: 'f-08-curricolare-obiettivi',
      fieldLabel: 'Interventi sul percorso curricolare / Personalizzazione (Sez. 8)',
      sectionId: 'sec-08',
      sectionTitle: '8. Interventi sul percorso curricolare',
      regexes: [
        /(?:Percorso\s+curricolare|Discipline\s+coinvolte|Personalizzazione\s+didattica|Misure\s+dispensative|Strumenti\s+compensativi)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|9\.|Organizzazione|$))/i,
      ],
      confidence: 82,
      reason: 'Rilevato assetto didattico e personalizzazione delle discipline (Sez. 8)',
    },
    {
      fieldId: 'f-09-organizzazione-oraria',
      fieldLabel: 'Organizzazione generale e oraria (Sez. 9)',
      sectionId: 'sec-09',
      sectionTitle: '9. Organizzazione generale del progetto di inclusione',
      regexes: [
        /(?:Orario\s+settimanale|Ore\s+di\s+sostegno|Frequenza\s+scolastica|Presenza\s+educatore)[:\s]+([\s\S]{15,300}?)(?=(?:Sezione|10\.|11\.|Verifica|$))/i,
      ],
      confidence: 80,
      reason: 'Rilevata articolazione oraria e risorse di sostegno assegnate (Sez. 9)',
    },
    {
      fieldId: 'f-11-relazione-finale',
      fieldLabel: 'Relazione conclusiva verifica finale (Sez. 11)',
      sectionId: 'sec-11',
      sectionTitle: '11. Verifica finale e proposte per l’anno successivo',
      regexes: [
        /(?:Relazione\s+finale|Verifica\s+conclusiva|Esito\s+globale\s+del\s+PEI)[:\s]+([\s\S]{20,500}?)(?=(?:Sezione|12\.|Provvisorio|$))/i,
      ],
      confidence: 82,
      reason: 'Rilevato verbale o relazione finale del GLO (Sez. 11)',
    },
    {
      fieldId: 'f-12-richiesta-ore-sostegno',
      fieldLabel: 'Proposta ore sostegno per anno successivo (Sez. 12)',
      sectionId: 'sec-12',
      sectionTitle: '12. PEI provvisorio',
      regexes: [
        /(?:Proposta\s+ore\s+sostegno|Fabbisogno\s+sostegno|Richiesta\s+ore\s+sostegno)[:\s]+(\d{1,2}(?:\s*ore)?)/i,
      ],
      confidence: 88,
      reason: 'Rilevata quantificazione numerica ore sostegno richieste per PEI provvisorio',
      cleaner: (s) => s.replace(/^(Proposta\s+ore\s+sostegno|Fabbisogno\s+sostegno|Richiesta\s+ore\s+sostegno)[:\s]*/i, '').trim(),
    },
  ];

  // Iteriamo su tutte le pagine per trovare evidenze corrispondenti a ciascun extractor
  const matchedFieldIds = new Set<string>();

  for (const page of rawPages) {
    const pageText = page.text;
    if (!pageText || pageText.trim().length === 0) continue;

    for (const extractor of extractors) {
      if (matchedFieldIds.has(extractor.fieldId)) continue;

      for (const regex of extractor.regexes) {
        const match = pageText.match(regex);
        if (match) {
          const rawMatch = match[1] || match[0];
          let cleaned = rawMatch.trim();
          if (extractor.cleaner) {
            cleaned = extractor.cleaner(cleaned);
          }

          if (cleaned.length > 0) {
            // Snippet di contesto
            const matchIndex = match.index ?? 0;
            const snippetStart = Math.max(0, matchIndex - 30);
            const snippetEnd = Math.min(pageText.length, matchIndex + rawMatch.length + 30);
            const sourceSnippet = pageText.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim();

            matchedFieldIds.add(extractor.fieldId);
            evidences.push({
              fieldId: extractor.fieldId,
              fieldLabel: extractor.fieldLabel,
              sectionId: extractor.sectionId,
              sectionTitle: extractor.sectionTitle,
              pageNumber: page.pageNumber,
              sourceSnippet,
              extractedValue: cleaned,
              confidence: Math.min(100, Math.round((extractor.confidence * (page.confidence ?? 80)) / 100)),
              mappingReason: `${extractor.reason} (Pagina ${page.pageNumber})`,
              status: 'ACCEPTED',
            });
            break;
          }
        }
      }
    }
  }

  return evidences;
}
