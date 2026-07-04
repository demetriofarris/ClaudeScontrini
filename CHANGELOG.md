# Changelog — Gestione Scontrini

Tutte le modifiche rilevanti dell'app. Le date sono in formato GG/MM/AAAA.

## v4.8.0 — 04/07/2026
- **PDF di chiusura mese ridisegnato** in stile più sobrio e professionale: intestazione "Nota spese" con il mese per esteso, tabella riepilogativa rifatta, palette neutra (via i colori accesi), niente emoji, piè di pagina. Le immagini degli scontrini restano grandi e leggibili.

## v4.7.0 — 03/07/2026
- Nuova sezione **Statistiche**: totali di spesa per categoria, con barre e percentuali. Periodo selezionabile **Mese** o **Anno** (default: mese corrente).
- **Link agli allegati**: aprendo una spesa dall'elenco/ricerca compaiono i pulsanti per aprire su Drive lo scontrino, il pagamento e l'eventuale PDF.
- Pulizia interna del codice.

## v4.6.0 — 03/07/2026
- **Totale del mese sempre completo**: l'elenco non è più limitato a 50 spese (il limite resta solo per la ricerca testuale).
- **Protezione anti-duplicato**: se salvi una spesa identica a una già presente (stessa data, totale e negozio), l'app chiede conferma prima di procedere.
- **Avviso versione**: se il backend Apps Script non è allineato all'app, compare un banner con le istruzioni.
- **Modifica/eliminazione più sicure**: l'app verifica che la riga corrisponda ancora alla spesa selezionata prima di agire.
- Estrazione AI più robusta su scontrini con testi lunghi; limite esplicito di 20 MB sui PDF caricati.

## v4.5.5 — 03/07/2026
- **Avviso data anomala**: se la data letta dallo scontrino è lontana più di un mese da oggi (tipico anno sbagliato su stampe sbiadite), il form la segnala in rosso prima del salvataggio.
- Istruzioni AI più severe sulla lettura dell'**anno** della data.
- **Auto-riparazione** del foglio se compare una riga vuota sopra le intestazioni (rompeva elenco e ricerche); il salvataggio ora dà un errore chiaro invece di scrivere una riga vuota.

## v4.5.4 — 17/06/2026
- In **Modifica spesa**, sostituendo l'immagine (o il PDF) dello scontrino l'app ora **ri-scansiona con l'AI** e aggiorna automaticamente data, totale, negozio e categoria (poi li rivedi e salvi). Il pagamento/bancomat resta solo prova, senza ri-scansione.

## v4.5.3 — 15/06/2026
- In **Modifica spesa** lo scontrino può essere sostituito anche con un **PDF** (oltre che con una foto). Cambiando tipo, la versione precedente viene rimossa.

## v4.5.2 — 15/06/2026
- L'estrazione AI ora riceve la **data odierna** come riferimento: niente più anni sbagliati (es. 2025 al posto di 2026) che facevano sparire la spesa dal mese.
- Funzioni di servizio per creare un foglio nuovo e pulito e per raccogliere foglio e cartelle in un'unica cartella **ClaudeScontrini** su Drive.

## v4.5.1 — 13/06/2026
- Correzione: la **data** delle spese viene salvata in modo univoco, così le spese dei primi giorni del mese non finiscono più nel mese sbagliato.

## v4.5.0 — 13/06/2026
- Il **pagamento (bancomat)** può essere allegato anche come **PDF**, non solo come foto.

## v4.4.0 — 13/06/2026
- Nuovo tasto **Elimina spesa** nella modifica.
- Il caricamento di uno scontrino in **PDF** viene letto dall'**AI** come le foto.
- Il tasto **Foto scontrino** accetta anche i PDF.

## v4.3.0 — 12/06/2026
- **Modifica** di una spesa già salvata (tocca una riga dell'elenco o un risultato di ricerca).
- Modello AI configurabile; impostato **Claude Haiku** come predefinito (più economico).
- PDF di chiusura mese in orizzontale, immagini non più tagliate.

## v4.2.0 — 12/06/2026
- **Ricerca** spese per testo e/o mese.
- **Elenco spese del mese** in tabella a schermo, con totale.
- **Chiusura mese** con link diretto al PDF generato e archivio dei riepiloghi.

## v4.1 — 11/06/2026
- Prima versione dell'app: foto dello scontrino → estrazione dati con **Claude Vision** → riga sul Google Sheet → chiusura mese con PDF riepilogativo.
- Ambiente nuovo e separato dal vecchio sistema; PWA installabile pubblicata su GitHub Pages.
