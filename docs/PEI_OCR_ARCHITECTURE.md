# PEI FACILE — architettura OCR iniziale

## Principio
La baseline Motore-OCR v1.0.0 resta invariata. Questo pacchetto è un derivato controllato destinato a PEI FACILE.

## Pipeline corretta per i PDF
1. Caricare PDF.
2. Verificare se esiste un text layer nativo.
3. Se esiste, estrarre testo/coordinate senza OCR.
4. Individuare pagine o regioni prive di testo nativo.
5. Renderizzare solo quelle pagine/regioni in immagine a risoluzione adeguata (target 300 DPI).
6. Passare le immagini al core OCR locale (`analyzeDocumentImage`).
7. Unificare testo nativo + testo OCR mantenendo provenienza e confidence.
8. Passare il risultato al PEI Document Parser.
9. Mostrare sempre una schermata di revisione umana prima dell'importazione definitiva.

## Componenti esclusi intenzionalmente
Non importare dal Motore-OCR originale:
- SupplierParser
- LineItemParser / LineItemParserV2
- TotalParser / SubtotalParser
- PaymentEvidenceParser / PaymentMethodParser
- DiscountParser
- VatParser
- TaxIdentifierParser
- ReceiptZoneSegmenter
- ReceiptKnowledgeBase / merchantDirectory
- recovery contabili, prezzi, matcher e benchmark RC-05H specifici scontrini

Sono validi per Gestione Casa, non per PEI FACILE.

## Da costruire in PEI FACILE
- PDF intake (text layer first)
- render PDF→immagine solo quando necessario
- riconoscimento ordine scolastico
- riconoscimento versione/modello ministeriale
- segmentazione per sezioni e sottosezioni PEI
- mappatura campo→campo interno applicazione
- confidence a livello campo
- revisione umana
- test con documenti PEI anonimizzati/sintetici

## Privacy
Il core OCR è locale. Il modello `ita.traineddata` è incluso nel pacchetto. Non inviare PDF o contenuti degli alunni a servizi OCR remoti senza una decisione architetturale esplicita e separata.
