# ClaudeScontrini — Recap tecnico completo (per revisione / secondo parere)

> Documento pensato per essere letto da un'altra AI (o uno sviluppatore) che deve
> dare un **secondo parere** su architettura, qualità del codice, sicurezza e
> scelte progettuali. Contiene tutto il necessario: descrizione, deployment,
> modello dati, endpoint, problemi noti e domande specifiche. Il codice completo
> è nel repo (vedi §11 Mappa file).

---

## 1. Cos'è

App personale di **nota spese** a uso di un singolo utente (uso privato, volumi
~30–60 scontrini/mese). Flusso:

**foto o PDF dello scontrino → estrazione dati con Claude Vision → una riga su un
Google Sheet → a fine mese, PDF riepilogativo con tabella, immagini e totali per
categoria.**

È un progetto **nuovo e parallelo** a un vecchio sistema "v3.x" (AppSheet + OCR +
OpenAI) che continua a girare intoccato su foglio/cartelle separati. Nessuna
dipendenza o interazione tra i due.

## 2. Architettura

```
   ┌─────────────────────────┐        HTTPS POST (JSON) + token
   │   PWA (GitHub Pages)     │  ───────────────────────────────────►  ┌──────────────────────────┐
   │  HTML/CSS/JS vanilla     │                                        │  Google Apps Script       │
   │  service worker offline  │  ◄───────────────────────────────────  │  Web App (doGet/doPost)   │
   └─────────────────────────┘        JSON                             │  = backend + "server"     │
        telefono / browser                                             └───────────┬──────────────┘
                                                                                    │
                              ┌─────────────────────────────────────────────────────┼───────────────┐
                              ▼                         ▼                            ▼               ▼
                    Anthropic Claude API        Google Sheet             Google Drive        MailApp (alert)
                    (Messages, Vision)       (1 riga per spesa)     (immagini, PDF, riepiloghi)
```

- **Nessun server proprio, nessun DB**: il "backend" è uno script Google Apps
  Script pubblicato come Web App; il "database" è un Google Sheet; i file stanno
  su Google Drive. Tutto nell'account Google dell'utente.
- **Nessun framework** lato frontend: un unico `index.html` (~1550 righe) con CSS
  e JS inline, più un service worker.
- **Costo**: solo le chiamate a Claude (~centesimi/mese con Haiku). Google Apps
  Script, Sheet, Drive e Pages sono gratuiti nei limiti di quota personale.

## 3. Stack e decisioni chiave

| Ambito | Scelta | Motivo |
|---|---|---|
| Backend | Google Apps Script (Web App) | zero hosting, accesso nativo a Sheet/Drive/Mail, gratis |
| DB | Google Sheet (1 riga/spesa) | l'utente vuole poter guardare/editare i dati a mano |
| Frontend | PWA statica vanilla su GitHub Pages | installabile su Android, offline, zero build, gratis |
| AI | Anthropic Claude API (Messages) | estrazione foto→dati in un colpo; sostituisce OCR+OpenAI del v3 |
| Modello AI | `claude-haiku-4-5` (default) | ~5× più economico di Opus; override con Script Property `CLAUDE_MODEL` |
| Output AI | `output_config.format` json_schema (structured outputs) | JSON garantito conforme allo schema |
| Input AI | blocco `image` (foto) o `document` (PDF), base64 | Claude legge nativamente sia immagini che PDF |
| Auth | token condiviso (Script Property `API_TOKEN`) su ogni richiesta | app monoutente, nessun login |

Principio guida dell'utente: **mai modifiche in-place al sistema in produzione;
sempre ambiente nuovo e migrazione solo dopo collaudo.** Da qui la scelta
"standalone parallelo".

## 4. Modello dati

### Google Sheet (tab "Foglio1"), una riga per spesa

Colonne (ordine e nomi in `HEADERS_V4`):

`Data | Totale | Negozio | Categoria | Foto | FotoBancomat | PDF | Testo_scontrino | Ospiti_Interni | Ospiti_Esterni | Note | Alert_Data`

- **Data**: scritta come **oggetto Date** (non stringa) per evitare la
  reinterpretazione per locale del foglio (vedi §8, fix v4.5.1).
- **Totale**: stringa formato `"€ 12,34"` (virgola decimale, formato IT).
- **Categoria**: enum `Ristoranti | Trasporti | Pernottamenti | Altro`.
- **Foto / FotoBancomat / PDF**: path relativo tipo `ScontriniV4_Images/SC_....jpg`
  o `ScontriniV4_Files/DOC_....pdf` (cartella/nome, **non** URL né ID Drive).
- **Testo_scontrino**: trascrizione integrale fatta dall'AI.
- Il codice trova le colonne **per nome** (`_findCol` con alias + normalizzazione),
  non per indice → tollerante a riordini/rinomine.

### Google Drive (tutto sotto un'unica cartella `ClaudeScontrini`)

- `ScontriniV4_Images` — foto scontrini e pagamenti (JPG)
- `ScontriniV4_Files` — PDF caricati
- `NoteSpese_V4/<AAAA-MM>/` — PDF di chiusura mensile + `PDF_Allegati/`
- Le cartelle sono referenziate **per nome con cache dell'ID** in Script
  Properties (`getFolderCached`), così `moveTo` non rompe nulla (gli ID restano).

## 5. Backend — Google Apps Script (`backend/gestione_scontrini.js`, v4.7.0, ~1756 righe)

### Configurazione / segreti
- Tutti i segreti stanno nelle **Script Properties**, mai nel codice:
  `ANTHROPIC_API_KEY`, `API_TOKEN`, `SPREADSHEET_ID`, opzionale `CLAUDE_MODEL`,
  più cache `FOLDER_ID_*`. (Verificato: nessun segreto hardcoded.)
- `CONFIG` in testa al file: nomi cartelle, modello di default, max_tokens (4096),
  risoluzioni thumbnail, guardia runtime 4.5 min.

### Funzioni di setup (eseguite a mano dall'editor, una tantum)
- `setupNuovoAmbiente()` — crea foglio + intestazioni + cartelle, salva SPREADSHEET_ID.
- `creaFoglioNuovoVuoto()` — crea un foglio pulito e ci punta SPREADSHEET_ID.
- `organizzaDriveInCartellaUnica()` — raccoglie foglio+cartelle sotto `ClaudeScontrini`.

### Estrazione AI — `estraiDatiConClaude(blob)`
- Rileva dai magic bytes se è PDF (`_isPdf`) o immagine (`_sniffImageMime`), e
  costruisce il blocco `document` o `image` con `media_type` coerente ai byte reali.
- Usa `output_config.format` con json_schema (data/totale/negozio/categoria/testo).
- **Ancora temporale nel prompt**: passa "Oggi è GG/MM/AAAA" e istruisce a non
  usare anni lontani da oggi (fix per l'AI che leggeva "2023" su stampe sbiadite).
- `validaDatiEstratti` normalizza data (→ GG/MM/AAAA), totale (→ "€ x,yy"),
  categoria (enum).

### Endpoint Web App
`doPost(e)` riceve JSON `{action, token, ...}` e risponde JSON. Azioni:

| action | payload | effetto |
|---|---|---|
| `ping` | — | `{ok, versione}` (usata anche per l'avviso di disallineamento versione) |
| `analizza` | `{foto,fotoMime}` **o** `{pdf}` | estrae dati con Claude Vision |
| `salva` | dati spesa + `foto?/pdf?/fotoBancomat?/pdfBancomat?` + `forzaDuplicato?` | crea file su Drive + appendRow; **anti-duplicato** (§8) |
| `aggiorna` | `{riga, ...campi, rifData, rifTotale}` | modifica riga; verifica impronta riga (§8) |
| `elimina` | `{riga, rifData, rifTotale}` | cancella riga + cestina file collegati |
| `cerca` | `{query?, periodo?}` | ricerca; `periodo` = `"yyyy-MM"` (mese) o `"yyyy"` (anno); ritorna anche `haAllegati` |
| `allegati` | `{riga}` | URL Drive di foto/PDF di quella spesa (risolti on-demand) |
| `chiudi_mese` | `{anno, mese}` | genera il PDF riepilogativo, ritorna `pdfUrl` |
| `riepiloghi` | — | elenco PDF mensili già generati |

`doGet(e)` — endpoint GET legacy per trigger/URL manuali: `chiudi_mese`,
`chiudi_mese_manual`, `controlla_ocr`/`scansiona`. Poco usati dalla PWA (che va di doPost).

### Sicurezza (livello "app personale")
- `verificaToken_(token)` confronta con `API_TOKEN`. Su doGet il token viaggia in
  query string; su doPost nel body JSON. **Nessun HTTPS custom, nessun rate limit,
  nessun login** — accettabile per monoutente ma è un punto da valutare (§10).
- `LockService` contro esecuzioni concorrenti nella scansione automatica.
- CORS: la PWA fa POST **senza** `Content-Type` custom per evitare il preflight
  (pattern classico Apps Script).

### Robustezza
- `getFoglioSpese_()` **auto-ripara** una riga vuota comparsa sopra le intestazioni
  (che romperebbe tutte le letture per nome colonna).
- `parseImporto` / `parseDateGeneric` tolleranti a formati misti.
- `chiudiMeseManuale` idempotente (sovrascrive i file del periodo), PDF A4
  orizzontale generato con `DocumentApp` nativo.

## 6. Frontend — PWA (`index.html` v4.7.0, `sw.js`, `manifest.json`)

- **Viste** (una sola pagina, sezioni mostrate/nascoste da `mostra()`):
  Home (griglia tile), Editor foto (scansione B/N + ritaglio), Analisi (spinner),
  Form nuova spesa, Modifica spesa, Elenco mese, Cerca, Chiusura mese,
  **Statistiche**, Impostazioni.
- **Flusso foto**: input → editor su `<canvas>` (binarizzazione adattiva di
  Bradley per la scansione B/N; ritaglio automatico prospettico opzionale) →
  `analizza` → form precompilato → `salva`.
- **Flusso PDF**: stesso, ma il PDF va diretto ad `analizza` (blocco document).
- **Modifica**: tap su una riga dell'elenco/ricerca → form precompilato;
  sostituzione scontrino/pagamento con foto o PDF (con ri-scansione AI dello
  scontrino); **link agli allegati** su Drive (azione `allegati`); Elimina.
- **Statistiche**: totali per categoria con barre e %, periodo **Mese/Anno**
  selezionabile (default mese corrente); calcolate lato client dai risultati di `cerca`.
- **Impostazioni**: URL Web App + token (salvati in `localStorage`); mostra la
  versione app + link al CHANGELOG.
- **Avviso versione**: al ping, se la versione backend ≠ `APP.versione`, banner
  giallo con istruzioni (per non dimenticare di aggiornare il backend, §7).
- **Offline**: service worker network-first sulla pagina (aggiornamenti immediati),
  cache-first sul resto come fallback; `CACHE = "scontrini-v16"` bumpata a ogni release.
- **Anti-duplicato lato UI**: se `salva` risponde `{duplicato:true}`, `confirm()`
  e reinvio con `forzaDuplicato`.

## 7. Deployment

### Backend (Apps Script)
1. Progetto Apps Script standalone (owner = l'utente).
2. **Deploy → Web App**, "esegui come me", accesso "Chiunque". URL `.../exec`.
3. Script Properties: `ANTHROPIC_API_KEY`, `API_TOKEN` (e SPREADSHEET_ID creato dal setup).
4. ⚠️ **Punto dolente**: il codice si aggiorna **copiando a mano** il file
   nell'editor e creando una **nuova versione della distribuzione**. Non c'è CI.
   È la causa n.1 di stati disallineati; mitigata (non risolta) dal banner di
   avviso versione in-app. *(Vedi §10: adozione di `clasp` fortemente consigliata.)*

### Frontend (PWA)
- Repo GitHub **pubblico**: `github.com/demetriofarris/ClaudeScontrini`
  (la root del repo = i file della PWA).
- **GitHub Pages** serve la root: <https://demetriofarris.github.io/ClaudeScontrini/>
- Deploy = `git push`; il workflow automatico "pages build and deployment" pubblica.
  (Un fallimento transitorio del deploy ha già lasciato una volta il sito su una
  versione vecchia: controllare sempre l'esito del run.)

## 8. Bug significativi già trovati e risolti (storia utile per capire i rischi)

- **v4.5.1** — Data scritta come **stringa** → `setValue("12/06/2026")`
  reinterpretato per locale del foglio (US → 6 dic): le spese del giorno 1–12
  finivano in un altro mese e sparivano dal totale. Fix: scrivere un oggetto `Date`.
- **v4.5.2 / v4.5.5** — l'AI leggeva l'**anno** sbagliato su stampe sbiadite
  (2023 invece di 2026). Fix: ancora temporale nel prompt + avviso "data anomala"
  in-app.
- **v4.5.5** — riga vuota sopra le intestazioni rompeva elenco/ricerca. Fix:
  auto-riparazione in `getFoglioSpese_`.
- **v4.6** — `cerca` aveva un **tetto di 50 risultati** → nei mesi pieni il
  **totale** mostrato era silenziosamente parziale. Fix: nessun tetto per le query
  solo-periodo.
- **v4.6** — nessuna protezione anti-duplicato: un retry salvava la spesa 2–3
  volte. Fix: controllo data+totale+negozio prima di scrivere i file.
- **v4.6** — numeri di riga volatili in modifica/eliminazione. Fix: impronta
  `rifData/rifTotale` verificata dal backend.

## 9. Storico versioni (sintesi)

`4.1` ambiente standalone + Claude Vision + PWA → `4.2` ricerca/elenco/chiusura →
`4.3` modifica spesa + modello configurabile → `4.4` elimina + PDF con AI →
`4.5.x` PDF bancomat, fix data/anno, ri-scansione → `4.6` anti-duplicato + avviso
versione + fix totale mese → **`4.7.0` statistiche in-app + link allegati + pulizia**.
Changelog completo: `CHANGELOG.md`.

## 10. Problemi noti / questioni aperte (NON ancora risolte)

1. **Deploy backend manuale** (copia-incolla). Consigliato adottare **`clasp`**
   (CLI ufficiale Apps Script) per `clasp push` e versionare il backend in git.
   → parzialmente affrontato: il backend è ora nel repo (`backend/`), ma il push
   verso Apps Script resta manuale.
2. **`chiudiMeseManuale` senza guardia sui 6 minuti**: inserisce un'immagine per
   spesa nel Doc; con 40–50 spese si rischia il timeout di Apps Script a metà, e
   **il Doc temporaneo resta orfano su Drive in caso di errore** (manca un
   try/finally che lo cestini). Da tenere d'occhio quando i mesi si riempiono.
3. **Timezone del progetto Apps Script**: data-ancora del prompt, scrittura date e
   raggruppamento mensile usano `Session.getScriptTimeZone()`. Da verificare che
   sia `Europe/Rome` (spese salvate vicino a mezzanotte potrebbero slittare).
4. **Modello AI**: gli errori di lettura anno erano di Haiku. Se ricapitano,
   `CLAUDE_MODEL = claude-opus-4-8` (costo ~1–2 €/mese ai volumi attuali).
5. **README fermo alla v4.1** (nomi cartelle/foglio vecchi).
6. **Sicurezza**: token condiviso in chiaro nel body/URL, accesso Web App
   "Chiunque con l'URL". Accettabile per uso personale monoutente? Da valutare.
7. **Sistema v3 ancora attivo in parallelo** (cattura gli stessi scontrini):
   dismissione da pianificare.
8. Facoltativi mai fatti: trigger temporale mensile per la chiusura;
   ritaglio automatico foto (accantonato, "non ci siamo" su foto reali).

## 11. Mappa file (nel repo)

| File | Cosa |
|---|---|
| `index.html` | PWA completa (HTML+CSS+JS inline), v4.7.0 |
| `sw.js` | service worker (cache `scontrini-v16`) |
| `manifest.json` | manifest PWA |
| `CHANGELOG.md` | storico versioni utente |
| `backend/gestione_scontrini.js` | backend Google Apps Script, v4.7.0 (~1756 righe) |
| `RECAP.md` | questo documento |
| `icon-192.png`, `icon-512.png` | icone PWA |

> Nota: la PWA online serve la v4.7.0; il backend v4.7.0 è nel repo ma la
> **distribuzione Apps Script attiva potrebbe essere ancora una versione
> precedente** finché non viene ricopiata (vedi §7 e il banner di avviso in-app).

---

## 12. Domande specifiche per il revisore

Dove vorrei un secondo parere in particolare:

1. **Modello dati "path invece di ID Drive"**: memorizzare `Cartella/nome.ext` nel
   foglio invece dell'ID Drive obbliga a un lookup per aprire un allegato. Meglio
   salvare l'ID (o l'URL) al momento del salvataggio? Trade-off con la leggibilità
   del foglio a mano?
2. **`chiudiMeseManuale`**: come renderla resistente al limite dei 6 minuti senza
   riscriverla da capo (es. batch/ripresa, o pre-generare thumbnail)? E il Doc
   orfano — basta un try/finally o serve un cleanup periodico?
3. **Sicurezza adeguata all'uso?** Token condiviso + Web App pubblica. Per un'app
   monoutente è ragionevole, o ci sono rischi concreti (es. URL che finisce nella
   history, replay) che vale la pena chiudere a basso costo?
4. **Anti-duplicato** (data+totale+negozio): euristica sufficiente o troppo
   aggressiva/permissiva? Casi limite (due caffè identici lo stesso giorno)?
5. **Verifica impronta riga** (`rifData/rifTotale`) per modifica/elimina: è una
   difesa robusta contro i numeri di riga volatili, o serve un identificatore
   stabile per riga (es. una colonna ID)?
6. **Prompt AI / affidabilità estrazione**: l'ancora temporale + le istruzioni
   sull'anno sono un buon approccio, o conviene un post-processing deterministico
   più forte (es. rifiutare date fuori da una finestra e richiedere conferma)?
7. **Struttura generale**: un unico `index.html` da ~1550 righe e un unico `.gs`
   da ~1756 — accettabile per un progetto personale, o vale la pena modularizzare?
8. **Deploy**: `clasp` è la strada giusta per eliminare il copia-incolla, o ci
   sono alternative migliori per un backend Apps Script?

Grazie per il secondo parere.
