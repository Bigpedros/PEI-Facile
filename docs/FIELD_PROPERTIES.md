# Proprietà dei campi durante la compilazione

Nei PDF acquisiti e calibrati selezionare un campo e usare **Proprietà** accanto
all'etichetta. La finestra offre cursori per larghezza e altezza (mostrate in mm),
carattere in punti (6–72), Grassetto, Corsivo e Sottolineato. Il riquadro resta nei
bordi pagina. Per le caselle si modificano soltanto le dimensioni.

Le modifiche vengono salvate in `PeiDocument.fieldProperties` per ID del campo e
valgono per il PEI aperto. Schema calibrato condiviso, PDF di sfondo e valori non
cambiano. **Ripristina** rimuove le personalizzazioni. I documenti precedenti senza
la nuova proprietà opzionale mantengono il comportamento esistente.

Compilazione, anteprima e stampa usano lo stesso adattamento. Se un valore nel
raster non cambia ma lo stile è personalizzato, il testo vecchio viene mascherato
nell'area originale e ridisegnato: non è saltato come valore immutato. In stampa
si usano 96 pixel CSS per pollice e 72 punti per pollice: 15 pt diventano 20 px,
indipendentemente dallo zoom. Il bitmap PDF è conservato durante `beforeprint` per
evitare render asincroni che possano svuotare la pagina. Finestra e comandi non
vengono stampati.

Verifiche:

    npx vitest run src/core/fieldPresentation.test.ts
    node scripts/verify-field-properties.mjs

Il browser modifica dimensioni e stile, salva e ricarica da IndexedDB, verifica
schema/valori/hash invariati e controlla il percorso di stampa e i punti.
