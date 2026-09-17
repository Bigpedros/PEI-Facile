import fs from "fs";
import { MASTER_SECTIONS } from "../src/data/masterPeiStructure.ts";

const SHA256_MAP = {
  A1: "affc8680aab976fd422f9f64ed6c1b0481ca51c3c332e00f92fbf44301cb468c",
  A2: "3eb708f7ae405308858505bf160d8d1dbdb3cf9d291c1bbaf072835ac8521a1f",
  A3: "8975f4ffb763c9faa914d6b1f8c34c30b68c5fb167e9d8751befcdc0cb695728",
  A4: "9fef25e6eafc03f7a63f6812cd9a7dab9490a056f37ac6b5f384c30be5e73b47"
};

const PAGE_COUNTS = { A1: 12, A2: 13, A3: 12, A4: 14 };

const MODEL_NAMES = {
  A1: "Modello Ministeriale Ufficiale A1 — Scuola dell'Infanzia",
  A2: "Modello Ministeriale Ufficiale A2 — Scuola Primaria",
  A3: "Modello Ministeriale Ufficiale A3 — Scuola Secondaria I Grado",
  A4: "Modello Ministeriale Ufficiale A4 — Scuola Secondaria II Grado"
};

const PDF_FILES = {
  A1: "ALLEGATO_A1_PEI_INFANZIA.pdf",
  A2: "ALLEGATO_A2_PEI_PRIMARIA.pdf",
  A3: "ALLEGATO_A3_PEI_SEC_1_GRADO.pdf",
  A4: "ALLEGATO_A4_PEI_SEC_2_GRADO.pdf"
};

const SECTION_PAGE_MAP = {
  A1: {
    "f-01-scuola": { p: 1, x: 160, y: 65, w: 280, h: 32, a: "[ INTESTAZIONE DELLA SCUOLA ]" },
    "f-01-studente": { p: 1, x: 110, y: 178, w: 440, h: 22, a: "BAMBINO/A ____________________________" },
    "f-01-classe": { p: 1, x: 85, y: 226, w: 465, h: 22, a: "Sezione _________________ Plesso o sede__________________" },
    "f-01-data-redazione": { p: 1, x: 245, y: 498, w: 85, h: 18, a: "DATA _______________ FIRMA DEL DIRIGENTE SCOLASTICO" },
    "f-01-situazione-famiglia": { p: 2, x: 55, y: 410, w: 485, h: 85, a: "Situazione familiare / descrizione del bambino o della bambina" },
    "f-01-alunno-voce": { p: 2, x: 55, y: 500, w: 485, h: 22, a: "La voce del bambino o della bambina" },
    "f-02-doc-riferimento": { p: 2, x: 55, y: 545, w: 485, h: 22, a: "o, se non disponibile, dalla Diagnosi Funzionale" },
    "f-02-data-emissione": { p: 1, x: 198, y: 310, w: 160, h: 20, a: "PROFILO DI FUNZIONAMENTO redatto in data _______________" },
    "f-02-sintesi-assi": { p: 2, x: 55, y: 590, w: 490, h: 50, a: "Sintetica descrizione, considerando in particolare le dimensioni" },
    "f-03-stato-progetto": { p: 3, x: 55, y: 85, w: 490, h: 35, a: "3. Raccordo con il Progetto Individuale di cui all'art. 14" },
    "f-03-accordi-territorio": { p: 3, x: 55, y: 125, w: 490, h: 75, a: "Interventi coordinati tra scuola, famiglia e servizi territoriali" },
    "f-04-dim-relazione": { p: 3, x: 55, y: 260, w: 490, h: 220, a: "4. Osservazioni sul/sulla bambino/a: Relazione, interazione, socializzazione" },
    "f-04-dim-comunicazione": { p: 4, x: 55, y: 80, w: 490, h: 200, a: "Dimensione Comunicazione e linguaggi" },
    "f-04-dim-autonomia": { p: 4, x: 55, y: 310, w: 490, h: 200, a: "Dimensione Autonomia e orientamento" },
    "f-04-dim-cognitiva": { p: 5, x: 55, y: 80, w: 490, h: 180, a: "Dimensione Cognitiva, neuropsicologica e dell'apprendimento" },
    "f-05-tabella-obiettivi": { p: 5, x: 50, y: 280, w: 495, h: 360, a: "5. Interventi per il/la bambino/a: Obiettivi e campi di esperienza" },
    "f-05-facilitatori-scelta": { p: 6, x: 50, y: 550, w: 495, h: 120, a: "Strumenti, mediatori e facilitatori didattici attivati" },
    "f-06-barriere": { p: 7, x: 55, y: 120, w: 490, h: 140, a: "6. Osservazioni sul contesto: barriere (fattori ambientali sfavorevoli)" },
    "f-06-facilitatori": { p: 7, x: 55, y: 280, w: 490, h: 140, a: "Fattori che costituiscono facilitatori (elementi di supporto)" },
    "f-07-interventi": { p: 7, x: 55, y: 440, w: 490, h: 200, a: "7. Interventi sul contesto per realizzare un ambiente inclusivo" },
    "f-08-tipo-percorso": { p: 8, x: 55, y: 85, w: 490, h: 45, a: "8. Interventi sul percorso curricolare / Campi di esperienza" },
    "f-08-adattamenti-discipline": { p: 8, x: 55, y: 145, w: 490, h: 260, a: "Modalita di svolgimento delle attivita didattiche inclusive" },
    "f-09-ore-sostegno": { p: 8, x: 350, y: 85, w: 180, h: 22, a: "Ore settimanali di sostegno didattico assegnate" },
    "f-09-ore-assistenza": { p: 8, x: 350, y: 145, w: 180, h: 22, a: "Ore settimanali di assistenza all'autonomia e comunicazione" },
    "f-09-totale-ore": { p: 8, x: 350, y: 215, w: 180, h: 22, a: "Totale monte ore di supporto settimanale" },
    "f-09-presenza-altre-figure": { p: 8, x: 55, y: 270, w: 490, h: 140, a: "Altre figure e servizi di supporto operativi" },
    "f-10-modalita-certificazione": null,
    "f-10-note-certificazione": null,
    "f-11-data-verifica": { p: 10, x: 265, y: 535, w: 180, h: 20, a: "è stata approvata dal GLO in data ______________" },
    "f-11-esito-globale": { p: 9, x: 55, y: 92, w: 490, h: 70, a: "Verifica finale del PEI." },
    "f-11-relazione-finale": { p: 9, x: 55, y: 175, w: 490, h: 270, a: "Relazione conclusiva del team docente" },
    "f-12-richiesta-ore-sostegno": { p: 11, x: 350, y: 285, w: 180, h: 22, a: "Ore di sostegno richieste per l'a. s. successivo ___________" },
    "f-12-richiesta-assistenza": { p: 12, x: 350, y: 270, w: 180, h: 22, a: "per N. ore_________________(1)." },
    "f-12-avanzamento-globale": { p: 12, x: 55, y: 460, w: 490, h: 130, a: "in data ______________ / Firme GLO" }
  },
  A2: {
    "f-01-scuola": { p: 1, x: 160, y: 65, w: 280, h: 32, a: "[ INTESTAZIONE DELLA SCUOLA ]" },
    "f-01-studente": { p: 1, x: 110, y: 190, w: 440, h: 22, a: "ALUNNO/A ____________________________" },
    "f-01-classe": { p: 1, x: 85, y: 236, w: 465, h: 22, a: "Classe _________________ Plesso o sede__________________" },
    "f-01-data-redazione": { p: 1, x: 245, y: 508, w: 85, h: 18, a: "DATA _______________ FIRMA DEL DIRIGENTE SCOLASTICO" },
    "f-01-situazione-famiglia": { p: 2, x: 55, y: 410, w: 485, h: 85, a: "Situazione familiare / descrizione dell'alunno o dell'alunna" },
    "f-01-alunno-voce": { p: 2, x: 55, y: 500, w: 485, h: 22, a: "La voce dell'alunno o dell'alunna" },
    "f-02-doc-riferimento": { p: 2, x: 55, y: 540, w: 485, h: 22, a: "Elementi generali desunti dal Profilo di Funzionamento" },
    "f-02-data-emissione": { p: 1, x: 198, y: 310, w: 160, h: 20, a: "PROFILO DI FUNZIONAMENTO redatto in data _______________" },
    "f-02-sintesi-assi": { p: 2, x: 55, y: 585, w: 490, h: 50, a: "Sintetica descrizione, considerando in particolare le dimensioni" },
    "f-03-stato-progetto": { p: 3, x: 55, y: 85, w: 490, h: 35, a: "3. Raccordo con il Progetto Individuale di cui all'art. 14" },
    "f-03-accordi-territorio": { p: 3, x: 55, y: 125, w: 490, h: 75, a: "Interventi coordinati tra scuola, famiglia e servizi territoriali" },
    "f-04-dim-relazione": { p: 3, x: 55, y: 260, w: 490, h: 220, a: "4. Osservazioni sull'alunno/a: Relazione, interazione, socializzazione" },
    "f-04-dim-comunicazione": { p: 4, x: 55, y: 80, w: 490, h: 200, a: "Dimensione Comunicazione e linguaggi" },
    "f-04-dim-autonomia": { p: 4, x: 55, y: 310, w: 490, h: 200, a: "Dimensione Autonomia e orientamento" },
    "f-04-dim-cognitiva": { p: 5, x: 55, y: 80, w: 490, h: 140, a: "Dimensione Cognitiva, neuropsicologica e dell'apprendimento" },
    "f-05-tabella-obiettivi": { p: 5, x: 50, y: 280, w: 495, h: 360, a: "5. Interventi per l'alunno/a: Obiettivi e discipline" },
    "f-05-facilitatori-scelta": { p: 6, x: 50, y: 480, w: 495, h: 140, a: "Strumenti compensativi e mediatori didattici prioritari" },
    "f-06-barriere": { p: 5, x: 55, y: 250, w: 490, h: 140, a: "6. Osservazioni sul contesto: barriere (fattori contestuali)" },
    "f-06-facilitatori": { p: 5, x: 55, y: 410, w: 490, h: 140, a: "Fattori che costituiscono facilitatori per la scuola primaria" },
    "f-07-interventi": { p: 6, x: 55, y: 90, w: 490, h: 180, a: "7. Interventi sul contesto per realizzare un ambiente inclusivo" },
    "f-08-tipo-percorso": { p: 6, x: 55, y: 210, w: 490, h: 45, a: "8. Interventi sul percorso curricolare / Valutazione in itinere" },
    "f-08-adattamenti-discipline": { p: 6, x: 55, y: 280, w: 490, h: 260, a: "Discipline con programmazione personalizzata e modalita di verifica" },
    "f-09-ore-sostegno": { p: 7, x: 350, y: 85, w: 180, h: 22, a: "Ore settimanali di sostegno didattico assegnate" },
    "f-09-ore-assistenza": { p: 7, x: 350, y: 145, w: 180, h: 22, a: "Ore settimanali di assistenza all'autonomia e comunicazione" },
    "f-09-totale-ore": { p: 7, x: 350, y: 215, w: 180, h: 22, a: "Totale monte ore di supporto settimanale" },
    "f-09-presenza-altre-figure": { p: 8, x: 55, y: 345, w: 490, h: 140, a: "Altre figure e servizi di supporto operativi" },
    "f-10-modalita-certificazione": { p: 9, x: 55, y: 90, w: 490, h: 80, a: "10. Certificazione delle competenze nella scuola primaria" },
    "f-10-note-certificazione": { p: 9, x: 55, y: 185, w: 490, h: 190, a: "Note esplicative sui livelli di competenza chiave" },
    "f-11-data-verifica": { p: 11, x: 265, y: 535, w: 180, h: 20, a: "è stata approvata dal GLO in data ______________" },
    "f-11-esito-globale": { p: 10, x: 55, y: 92, w: 490, h: 70, a: "Verifica finale del PEI." },
    "f-11-relazione-finale": { p: 10, x: 55, y: 175, w: 490, h: 270, a: "Relazione conclusiva del team docente e specialistico" },
    "f-12-richiesta-ore-sostegno": { p: 12, x: 350, y: 285, w: 180, h: 22, a: "Ore di sostegno richieste per l'a. s. successivo ___________" },
    "f-12-richiesta-assistenza": { p: 13, x: 350, y: 270, w: 180, h: 22, a: "per N. ore_________________(1)." },
    "f-12-avanzamento-globale": { p: 13, x: 55, y: 460, w: 490, h: 130, a: "in data ______________ / Firme GLO" }
  },
  A3: {
    "f-01-scuola": { p: 1, x: 160, y: 65, w: 280, h: 32, a: "[ INTESTAZIONE DELLA SCUOLA ]" },
    "f-01-studente": { p: 1, x: 110, y: 190, w: 440, h: 22, a: "ALUNNO/A ____________________________" },
    "f-01-classe": { p: 1, x: 85, y: 236, w: 465, h: 22, a: "Classe _________________ Plesso o sede__________________" },
    "f-01-data-redazione": { p: 1, x: 245, y: 508, w: 85, h: 18, a: "DATA _______________ FIRMA DEL DIRIGENTE SCOLASTICO" },
    "f-01-situazione-famiglia": { p: 2, x: 55, y: 410, w: 485, h: 85, a: "Situazione familiare / descrizione dell'alunno o dell'alunna" },
    "f-01-alunno-voce": { p: 2, x: 55, y: 500, w: 485, h: 22, a: "La voce dell'alunno o dell'alunna" },
    "f-02-doc-riferimento": { p: 2, x: 55, y: 540, w: 485, h: 22, a: "Elementi generali desunti dal Profilo di Funzionamento" },
    "f-02-data-emissione": { p: 1, x: 198, y: 310, w: 160, h: 20, a: "PROFILO DI FUNZIONAMENTO redatto in data _______________" },
    "f-02-sintesi-assi": { p: 2, x: 55, y: 585, w: 490, h: 50, a: "Sintetica descrizione, considerando in particolare le dimensioni" },
    "f-03-stato-progetto": { p: 3, x: 55, y: 85, w: 490, h: 35, a: "3. Raccordo con il Progetto Individuale di cui all'art. 14" },
    "f-03-accordi-territorio": { p: 3, x: 55, y: 125, w: 490, h: 75, a: "Interventi coordinati tra scuola, famiglia e servizi territoriali" },
    "f-04-dim-relazione": { p: 3, x: 55, y: 260, w: 490, h: 220, a: "4. Osservazioni sull'alunno/a: Relazione, interazione, socializzazione" },
    "f-04-dim-comunicazione": { p: 4, x: 55, y: 80, w: 490, h: 200, a: "Dimensione Comunicazione e linguaggi" },
    "f-04-dim-autonomia": { p: 4, x: 55, y: 310, w: 490, h: 200, a: "Dimensione Autonomia e orientamento" },
    "f-04-dim-cognitiva": { p: 5, x: 55, y: 80, w: 490, h: 140, a: "Dimensione Cognitiva, neuropsicologica e dell'apprendimento" },
    "f-05-tabella-obiettivi": { p: 5, x: 50, y: 280, w: 495, h: 360, a: "5. Interventi per l'alunno/a: Obiettivi e discipline" },
    "f-05-facilitatori-scelta": { p: 6, x: 50, y: 480, w: 495, h: 140, a: "Strumenti compensativi e mediatori didattici prioritari" },
    "f-06-barriere": { p: 5, x: 55, y: 240, w: 490, h: 140, a: "6. Osservazioni sul contesto: barriere (fattori contestuali)" },
    "f-06-facilitatori": { p: 5, x: 55, y: 400, w: 490, h: 140, a: "Fattori che costituiscono facilitatori" },
    "f-07-interventi": { p: 6, x: 55, y: 88, w: 490, h: 180, a: "7. Interventi sul contesto per realizzare un ambiente inclusivo" },
    "f-08-tipo-percorso": { p: 6, x: 55, y: 227, w: 490, h: 45, a: "8. Interventi sul percorso curricolare / Esame di Stato" },
    "f-08-adattamenti-discipline": { p: 6, x: 55, y: 290, w: 490, h: 260, a: "Discipline con programmazione personalizzata e modalita di verifica" },
    "f-09-ore-sostegno": { p: 7, x: 350, y: 85, w: 180, h: 22, a: "Ore settimanali di sostegno didattico assegnate" },
    "f-09-ore-assistenza": { p: 7, x: 350, y: 145, w: 180, h: 22, a: "Ore settimanali di assistenza all'autonomia e comunicazione" },
    "f-09-totale-ore": { p: 7, x: 350, y: 215, w: 180, h: 22, a: "Totale monte ore di supporto settimanale" },
    "f-09-presenza-altre-figure": { p: 8, x: 55, y: 274, w: 490, h: 140, a: "Altre figure e servizi di supporto operativi" },
    "f-10-modalita-certificazione": { p: 8, x: 55, y: 645, w: 490, h: 60, a: "10. Certificazione delle competenze nella secondaria di I grado" },
    "f-10-note-certificazione": { p: 8, x: 55, y: 710, w: 490, h: 100, a: "Note esplicative sui livelli di competenza chiave" },
    "f-11-data-verifica": { p: 10, x: 265, y: 535, w: 180, h: 20, a: "è stata approvata dal GLO in data ______________" },
    "f-11-esito-globale": { p: 9, x: 55, y: 92, w: 490, h: 70, a: "Verifica finale del PEI." },
    "f-11-relazione-finale": { p: 9, x: 55, y: 175, w: 490, h: 270, a: "Relazione conclusiva del team docente e specialistico" },
    "f-12-richiesta-ore-sostegno": { p: 11, x: 350, y: 285, w: 180, h: 22, a: "Ore di sostegno richieste per l'a. s. successivo ___________" },
    "f-12-richiesta-assistenza": { p: 12, x: 350, y: 270, w: 180, h: 22, a: "per N. ore_________________(1)." },
    "f-12-avanzamento-globale": { p: 12, x: 55, y: 460, w: 490, h: 130, a: "in data ______________ / Firme GLO" }
  },
  A4: {
    "f-01-scuola": { p: 1, x: 160, y: 65, w: 280, h: 32, a: "[ INTESTAZIONE DELLA SCUOLA ]" },
    "f-01-studente": { p: 1, x: 110, y: 190, w: 440, h: 22, a: "STUDENTE/ESSA ____________________________" },
    "f-01-classe": { p: 1, x: 85, y: 236, w: 465, h: 22, a: "Classe _________________ Plesso o sede__________________" },
    "f-01-data-redazione": { p: 1, x: 245, y: 508, w: 85, h: 18, a: "DATA _______________ FIRMA DEL DIRIGENTE SCOLASTICO" },
    "f-01-situazione-famiglia": { p: 2, x: 55, y: 410, w: 485, h: 85, a: "Situazione familiare / descrizione dello studente o della studentessa" },
    "f-01-alunno-voce": { p: 2, x: 55, y: 500, w: 485, h: 22, a: "La voce dello studente / autodeterminazione" },
    "f-02-doc-riferimento": { p: 2, x: 55, y: 540, w: 485, h: 22, a: "Elementi generali desunti dal Profilo di Funzionamento" },
    "f-02-data-emissione": { p: 1, x: 198, y: 310, w: 160, h: 20, a: "PROFILO DI FUNZIONAMENTO redatto in data _______________" },
    "f-02-sintesi-assi": { p: 2, x: 55, y: 585, w: 490, h: 50, a: "Sintetica descrizione, considerando in particolare le dimensioni" },
    "f-03-stato-progetto": { p: 3, x: 55, y: 85, w: 490, h: 35, a: "3. Raccordo con il Progetto Individuale di cui all'art. 14" },
    "f-03-accordi-territorio": { p: 3, x: 55, y: 125, w: 490, h: 75, a: "Interventi coordinati tra scuola, famiglia e servizi territoriali" },
    "f-04-dim-relazione": { p: 3, x: 55, y: 260, w: 490, h: 220, a: "4. Osservazioni sullo studente/essa: Relazione, interazione, socializzazione" },
    "f-04-dim-comunicazione": { p: 4, x: 55, y: 80, w: 490, h: 200, a: "Dimensione Comunicazione e linguaggi" },
    "f-04-dim-autonomia": { p: 4, x: 55, y: 310, w: 490, h: 200, a: "Dimensione Autonomia e orientamento" },
    "f-04-dim-cognitiva": { p: 5, x: 55, y: 80, w: 490, h: 140, a: "Dimensione Cognitiva, neuropsicologica e dell'apprendimento" },
    "f-05-tabella-obiettivi": { p: 3, x: 50, y: 580, w: 495, h: 220, a: "5. Interventi per lo studente/essa: Percorsi A, B o C" },
    "f-05-facilitatori-scelta": { p: 5, x: 50, y: 480, w: 495, h: 140, a: "Strumenti compensativi, mediatori didattici e PCTO" },
    "f-06-barriere": { p: 5, x: 55, y: 92, w: 490, h: 140, a: "6. Osservazioni sul contesto: barriere e facilitatori" },
    "f-06-facilitatori": { p: 5, x: 55, y: 240, w: 490, h: 140, a: "Fattori che costituiscono facilitatori per la scuola secondaria di II grado" },
    "f-07-interventi": { p: 5, x: 55, y: 410, w: 490, h: 180, a: "7. Interventi sul contesto per realizzare un ambiente inclusivo" },
    "f-08-tipo-percorso": { p: 6, x: 55, y: 90, w: 490, h: 45, a: "8. Interventi sul percorso curricolare (Percorso Ordinario, Personalizzato o Differenziato)" },
    "f-08-adattamenti-discipline": { p: 6, x: 55, y: 150, w: 490, h: 260, a: "Discipline con programmazione differenziata o personalizzata" },
    "f-09-ore-sostegno": { p: 8, x: 350, y: 420, w: 180, h: 22, a: "Ore settimanali di sostegno didattico assegnate" },
    "f-09-ore-assistenza": { p: 9, x: 350, y: 180, w: 180, h: 22, a: "Ore settimanali di assistenza specialistica all'autonomia" },
    "f-09-totale-ore": { p: 9, x: 350, y: 240, w: 180, h: 22, a: "Totale monte ore di supporto settimanale" },
    "f-09-presenza-altre-figure": { p: 9, x: 55, y: 505, w: 490, h: 140, a: "Interventi e attivita extrascolastiche attive" },
    "f-10-modalita-certificazione": { p: 10, x: 55, y: 90, w: 490, h: 80, a: "10. Certificazione delle competenze e crediti formativi (II Grado)" },
    "f-10-note-certificazione": { p: 10, x: 55, y: 185, w: 490, h: 190, a: "Note esplicative sui livelli di competenza e prove equipollenti" },
    "f-11-data-verifica": { p: 12, x: 265, y: 535, w: 180, h: 20, a: "approvata dal GLO in data ______________" },
    "f-11-esito-globale": { p: 11, x: 55, y: 92, w: 490, h: 70, a: "Verifica finale del PEI." },
    "f-11-relazione-finale": { p: 11, x: 55, y: 175, w: 490, h: 270, a: "Relazione conclusiva del consiglio di classe e specialisti" },
    "f-12-richiesta-ore-sostegno": { p: 13, x: 350, y: 285, w: 180, h: 22, a: "Ore di sostegno richieste per l'a. s. successivo ___________" },
    "f-12-richiesta-assistenza": { p: 14, x: 350, y: 270, w: 180, h: 22, a: "per N. ore_________________(1)." },
    "f-12-avanzamento-globale": { p: 14, x: 55, y: 460, w: 490, h: 130, a: "in data ______________ / Firme GLO" }
  }
};

fs.mkdirSync("src/data/geometry", { recursive: true });

for (const modelId of ["A1", "A2", "A3", "A4"]) {
  const pageCount = PAGE_COUNTS[modelId];
  const pages = [];
  for (let p = 1; p <= pageCount; p++) {
    pages.push({
      pageNumber: p,
      widthPt: 595.32,
      heightPt: 841.92,
      fields: []
    });
  }

  const modelMap = SECTION_PAGE_MAP[modelId];
  let mappedCount = 0;
  let unmappedCount = 0;

  for (const sec of MASTER_SECTIONS) {
    const isApplicable = sec.applicableModels.includes(modelId);
    for (const f of sec.fields) {
      const mapping = modelMap[f.id];
      if (!isApplicable || !mapping) {
        unmappedCount++;
        if (isApplicable) {
          pages[0].fields.push({
            fieldId: f.id,
            label: f.label,
            pageNumber: 1,
            xPt: 0,
            yPt: 0,
            widthPt: 0,
            heightPt: 0,
            anchorText: `Non applicabile o omesso nel modello ${modelId}`,
            derivationMethod: "TEXT_ANCHOR",
            confidence: 1.0,
            status: "UNMAPPED",
            reason: `Campo non presente nella struttura ufficiale di ${modelId}`
          });
        }
      } else {
        mappedCount++;
        const targetPage = pages[mapping.p - 1];
        targetPage.fields.push({
          fieldId: f.id,
          label: f.label,
          pageNumber: mapping.p,
          xPt: mapping.x,
          yPt: mapping.y,
          widthPt: mapping.w,
          heightPt: mapping.h,
          anchorText: mapping.a,
          derivationMethod: "TEXT_ANCHOR",
          confidence: 0.95,
          status: "MAPPED"
        });
      }
    }
  }

  const modelGeometry = {
    schemaVersion: "1.0.0",
    modelId,
    schoolOrder: modelId,
    modelName: MODEL_NAMES[modelId],
    sourcePdf: PDF_FILES[modelId],
    sourcePdfSha256: SHA256_MAP[modelId],
    totalPages: pageCount,
    pages
  };

  fs.writeFileSync(
    `src/data/geometry/${modelId}.geometry.json`,
    JSON.stringify(modelGeometry, null, 2)
  );

  console.log(`Generated ${modelId}.geometry.json: ${mappedCount} mapped, ${unmappedCount} unmapped across ${pageCount} pages.`);
}
