// ============================================================================
// GESTIONE SCONTRINI - VERSIONE 4.9.1 (PROGETTO STANDALONE PARALLELO)
// + POLISH v4.9.1: PDF — titolo "REPORT RICEVUTE" + nome (Script Property
//   INTESTATARIO, default "Demetrio Farris"), separatore migliaia negli importi
//   (formatEuro "€ 1.234,56"), riga di stacco sotto ogni voce, header più basso
// + FIX v4.9: _cella non lancia più "elemento di testo vuoto" sulle celle vuote
//   (bloccava la generazione del PDF di chiusura mese in v4.8)
// + NEW v4.9: colonna "ID" univoco (UUID) per riga → modifica/eliminazione
//   risolte per ID (robuste a riordini/eliminazioni), non più solo per numero
//   di riga. Migrazione righe esistenti: eseguire assegnaIDMancanti() una volta.
// + NEW v4.9: LockService sulle scritture (salva/aggiorna/elimina) contro
//   operazioni concorrenti.
// + RESTYLE v4.8: PDF di chiusura mese ridisegnato "aziendale" — palette sobria
//   (un solo accento navy, niente blu/verde acceso), tabella riepilogativa nuova,
//   titolo "NOTA SPESE" + mese esteso, niente emoji, piè di pagina; immagini
//   degli scontrini invariate (leggibilità preservata). Helper _cella/_stileCella.
// + NEW v4.7: statistiche — cercaSpese accetta periodo "yyyy" (anno intero) oltre
//   a "yyyy-MM"; restituisce anche il flag haAllegati per riga
// + NEW v4.7: azione doPost "allegati" (URL Drive di foto/PDF di una spesa)
// + PULIZIA v4.7: rimosse funzioni obsolete/rischiose (correggiColonnaDate,
//   testScansione, testLandscape, testAlertAnomalieData)
// + FIX v4.6: l'elenco del mese restituisce TUTTE le spese (il tetto di 50
//   falsava il totale nei mesi pieni; resta solo per le ricerche testuali)
// + FIX v4.6: max_tokens AI 2048→4096 (trascrizioni lunghe troncavano il JSON)
// + NEW v4.6: anti-duplicato su salva (stessa data+totale+negozio → la PWA
//   chiede conferma; param forzaDuplicato per procedere)
// + NEW v4.6: verifica riga su aggiorna/elimina (param rifData/rifTotale: se la
//   riga non corrisponde più alla spesa selezionata, errore invece di agire
//   sulla riga sbagliata)
// + FIX v4.5.5: prompt AI più severo sull'anno della data (uno scontrino sbiadito
//   veniva letto "2023" e la spesa finiva in un anno passato, invisibile nel mese)
// + FIX v4.5.5: auto-riparazione riga vuota sopra le intestazioni (rompeva elenco
//   e ricerche); salvaSpesa ora dà errore chiaro se le intestazioni mancano,
//   invece di salvare una riga vuota in silenzio
// + NEW v4.5.4: aggiornaSpesa accetta anche 'testo' (Testo_scontrino) così la
//   ri-scansione dello scontrino in modifica tiene allineata la trascrizione
// + NEW v4.5.3: in modifica lo scontrino può essere sostituito con un PDF (param
//   pdf → colonna PDF, azzera la colonna Foto e viceversa)
// + FIX v4.5.2: il prompt AI ora riceve la data odierna come ancora (evita anni
//   errati tipo 2025 invece di 2026, che facevano sparire la spesa dal mese)
// + NEW v4.5.2: organizzaDriveInCartellaUnica() raccoglie foglio+cartelle sotto
//   un'unica cartella "ClaudeScontrini" (moveTo, ID invariati)
// + NEW v4.5.2: creaFoglioNuovoVuoto() crea un foglio pulito (solo intestazioni)
//   nella cartella ClaudeScontrini e ci punta SPREADSHEET_ID
// + FIX v4.5.1: la Data delle spese salvate/modificate ora è un oggetto Date, non
//   una stringa (evita la reinterpretazione per locale che spostava le spese del
//   giorno 1–12 in un altro mese, facendole sparire dal totale del mese)
// + NEW v4.5: pagamento/bancomat allegabile anche come PDF (param pdfBancomat)
// + NEW v4.4: analisi AI anche per i PDF (Claude blocco "document"), non solo foto
// + NEW v4.4: azione doPost "elimina" (cancella riga + cestina i file collegati)
// + NEW v4.3: azione doPost "aggiorna" (modifica spesa); modello AI configurabile
// + NEW v4.2: azione doPost "cerca" (ricerca spese per testo e/o periodo)
// + NEW v4.2: azione doPost "chiudi_mese" con link diretto al PDF generato
// + NEW v4.2: azione doPost "riepiloghi" (elenco PDF mensili esistenti)
// + CHANGE v4.2: chiudiMeseManuale restituisce {messaggio, pdfUrl}
// Progetto NUOVO e separato dal sistema v3.x: lavora su un foglio e cartelle
// Drive dedicati e non tocca in alcun modo i dati esistenti.
//
// + NEW v4.1: script standalone — il foglio è referenziato per ID (Script
//   Property SPREADSHEET_ID), cartelle Drive dedicate con prefisso ScontriniV4
// + NEW v4.1: setupNuovoAmbiente() crea foglio + intestazioni + cartelle
// + NEW: estrazione dati con Claude Vision (foto → dati in un solo passaggio)
// + NEW: rimossi OCR via Google Docs e OpenAI (niente più servizio avanzato Drive)
// + NEW: endpoint doPost per la PWA (analizza / salva / ping)
// + NEW: autenticazione con token su doGet e doPost (Script Property API_TOKEN)
// + NEW: LockService contro esecuzioni concorrenti
// + FIX: parsing importi con separatore migliaia ("€ 1.234,56")
// + FIX: numerazione PDF allegati allineata all'ordinamento per data
// + FIX: alert data accetta mese corrente E precedente (meno falsi positivi)
// + FIX: lettura foglio in batch + guardia sui 6 minuti di runtime
// + FIX: chiusura mese idempotente (sovrascrive i file del periodo)
// + FIX: guard su mese senza spese
// + FIX: ID cartelle in cache nelle Script Properties (niente ricerche per nome)
// + RIMOSSO: fallback PDF→Slides (non funzionante: Drive non converte PDF in Slides)
//
// PRIMO AVVIO:
//   1. Esegui setupNuovoAmbiente() → crea foglio e cartelle, salva SPREADSHEET_ID
//   2. Aggiungi nelle Script Properties: ANTHROPIC_API_KEY e API_TOKEN
// ============================================================================

// CONFIGURAZIONE
const CONFIG = {
  FOGLIO_SPESE: "Foglio1",
  CARTELLA_IMMAGINI: "ScontriniV4_Images",
  CARTELLA_FILES: "ScontriniV4_Files",
  ROOT_FOLDER: "NoteSpese_V4",
  SOTTOCARTELLA_PDF: "PDF_Allegati",
  // Modello di default: Haiku 4.5 (~5x più economico di Opus a scansione).
  // Sovrascrivibile senza toccare il codice: Script Property CLAUDE_MODEL
  // (es. "claude-opus-4-8" se la qualità di estrazione non basta).
  CLAUDE_MODEL: "claude-haiku-4-5",
  // 4096: le trascrizioni lunghe (es. estratti Telepass multipagina) troncavano
  // il JSON strutturato a 2048 → parse fallito → "estrazione fallita"
  CLAUDE_MAX_TOKENS: 4096,
  THUMB_WIDTH_AI: 1200,    // risoluzione immagine inviata a Claude
  THUMB_WIDTH_PDF: 400,    // risoluzione thumbnail inserite nel PDF riepilogo
  MAX_RUNTIME_MS: 4.5 * 60 * 1000, // guardia sul limite 6 min di Apps Script
  // Stima costo API (USD per 1M token) — listino claude-haiku-4-5.
  // Serve per la card "Credito API": è una STIMA dai token, non l'importo
  // fatturato da Anthropic (non esposto via API key). Il credito residuo è
  // persistente (Script Property CREDITO_RESIDUO), ricaricabile dalla UI.
  PREZZO_INPUT_1M: 1.0,
  PREZZO_OUTPUT_1M: 5.0
};

function _prop(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

// Foglio spese del NUOVO ambiente (referenziato per ID: script standalone)
function getFoglioSpese_() {
  const id = _prop("SPREADSHEET_ID");
  if (!id) throw new Error("SPREADSHEET_ID mancante nelle Script Properties: esegui prima setupNuovoAmbiente()");
  const sh = SpreadsheetApp.openById(id).getSheetByName(CONFIG.FOGLIO_SPESE);
  if (!sh) throw new Error(`Foglio '${CONFIG.FOGLIO_SPESE}' non trovato nello spreadsheet ${id}`);

  // Auto-riparazione: se sopra le intestazioni è comparsa una riga vuota (es.
  // inserita per sbaglio dal foglio), tutte le letture per nome colonna si
  // rompono e l'elenco risulta vuoto. Se riga 1 è vuota e riga 2 contiene le
  // intestazioni, la riga vuota viene rimossa.
  try {
    if (sh.getLastRow() >= 2){
      const lastCol = Math.max(1, sh.getLastColumn());
      const r1 = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      if (r1.join("") === ""){
        const r2 = sh.getRange(2, 1, 1, lastCol).getValues()[0].map(_norm);
        if (r2.indexOf("data") !== -1 && r2.indexOf("totale") !== -1){
          sh.deleteRow(1);
          Logger.log("🔧 Rimossa riga vuota sopra le intestazioni");
        }
      }
    }
  } catch(e){ Logger.log("⚠️ Controllo intestazioni: " + e.message); }

  return sh;
}


// ============================================================================
// SETUP AMBIENTE PARALLELO (eseguire UNA volta dal nuovo progetto)
// ============================================================================

const HEADERS_V4 = [
  "Data", "Totale", "Negozio", "Categoria",
  "Foto", "FotoBancomat", "PDF", "Testo_scontrino",
  "Ospiti_Interni", "Ospiti_Esterni", "Note", "Alert_Data", "ID"
];

function setupNuovoAmbiente() {
  const props = PropertiesService.getScriptProperties();

  if (props.getProperty("SPREADSHEET_ID")) {
    const id = props.getProperty("SPREADSHEET_ID");
    Logger.log("ℹ️ Ambiente già configurato. Foglio: https://docs.google.com/spreadsheets/d/" + id);
    Logger.log("Per ripartire da zero, elimina la proprietà SPREADSHEET_ID e riesegui.");
    return;
  }

  // Foglio nuovo, separato da quello in produzione
  const ss = SpreadsheetApp.create("Gestione Scontrini V4");
  const sh = ss.getSheets()[0];
  sh.setName(CONFIG.FOGLIO_SPESE);
  sh.getRange(1, 1, 1, HEADERS_V4.length).setValues([HEADERS_V4]).setFontWeight("bold");
  sh.setFrozenRows(1);
  props.setProperty("SPREADSHEET_ID", ss.getId());

  // Cartelle Drive dedicate (nomi diversi da quelle del sistema v3.x)
  getOrCreateFolder(CONFIG.CARTELLA_IMMAGINI);
  getOrCreateFolder(CONFIG.CARTELLA_FILES);
  getOrCreateFolder(CONFIG.ROOT_FOLDER);

  Logger.log("✅ Ambiente creato.");
  Logger.log("📊 Foglio: " + ss.getUrl());
  Logger.log("📁 Cartelle Drive: " + CONFIG.CARTELLA_IMMAGINI + ", " + CONFIG.CARTELLA_FILES + ", " + CONFIG.ROOT_FOLDER);
  Logger.log("➡️ Ora aggiungi nelle Script Properties: ANTHROPIC_API_KEY e API_TOKEN");
}


// Crea un foglio spese NUOVO e VUOTO (solo intestazioni), lo mette nella cartella
// ClaudeScontrini e aggiorna SPREADSHEET_ID per puntarci. I fogli precedenti NON
// vengono toccati né cancellati: il vecchio ID viene solo registrato nel log.
// Eseguire dall'editor quando si vuole ripartire con un foglio pulito.
function creaFoglioNuovoVuoto(){
  const props = PropertiesService.getScriptProperties();
  const vecchio = props.getProperty("SPREADSHEET_ID");
  if (vecchio) Logger.log("ℹ️ SPREADSHEET_ID precedente (NON toccato, annotalo per sicurezza): " + vecchio);

  const ss = SpreadsheetApp.create("ClaudeScontrini - Spese");
  const sh = ss.getSheets()[0];
  sh.setName(CONFIG.FOGLIO_SPESE);
  sh.getRange(1, 1, 1, HEADERS_V4.length).setValues([HEADERS_V4]).setFontWeight("bold");
  sh.setFrozenRows(1);

  props.setProperty("SPREADSHEET_ID", ss.getId());

  // mette il nuovo foglio nella cartella unica ClaudeScontrini
  try {
    const it = DriveApp.getFoldersByName("ClaudeScontrini");
    const root = it.hasNext() ? it.next() : DriveApp.createFolder("ClaudeScontrini");
    DriveApp.getFileById(ss.getId()).moveTo(root);
  } catch(e){ Logger.log("⚠️ Spostamento nella cartella ClaudeScontrini fallito: " + e.message); }

  Logger.log("✅ Nuovo foglio vuoto creato e collegato (SPREADSHEET_ID aggiornato).");
  Logger.log("📊 " + ss.getUrl());
  Logger.log("➡️ Esegui anche organizzaDriveInCartellaUnica() per raccogliere le cartelle.");
}


// Raccoglie il foglio spese e le cartelle dell'app sotto un'unica cartella
// "ClaudeScontrini". moveTo NON cambia gli ID, quindi tutto il resto del codice
// continua a trovare foglio e cartelle come prima. Eseguire UNA volta dall'editor.
function organizzaDriveInCartellaUnica(){
  const NOME_ROOT = "ClaudeScontrini";
  const it = DriveApp.getFoldersByName(NOME_ROOT);
  const root = it.hasNext() ? it.next() : DriveApp.createFolder(NOME_ROOT);

  const spostati = [];

  const idFoglio = _prop("SPREADSHEET_ID");
  if (idFoglio){
    try { DriveApp.getFileById(idFoglio).moveTo(root); spostati.push("foglio spese"); }
    catch(e){ Logger.log("⚠️ Foglio non spostato: " + e.message); }
  }

  [CONFIG.CARTELLA_IMMAGINI, CONFIG.CARTELLA_FILES, CONFIG.ROOT_FOLDER].forEach(nome => {
    const f = getFolderCached(nome);
    if (f && f.getId() !== root.getId()){
      try { f.moveTo(root); spostati.push(nome); }
      catch(e){ Logger.log("⚠️ " + nome + " non spostata: " + e.message); }
    }
  });

  Logger.log("✅ Spostati in '" + NOME_ROOT + "': " + (spostati.join(", ") || "niente"));
  Logger.log("📁 " + root.getUrl());
  Logger.log("ℹ️ Il progetto Apps Script va eventualmente trascinato a mano nella cartella.");
}


// ============================================================================
// THUMBNAIL E BLOB
// ============================================================================

// Riconosce il formato immagine dai magic bytes (getBytes() restituisce byte
// con segno: serve il mask & 0xFF). Restituisce null se non è un formato noto.
function _sniffImageMime(bytes){
  if (bytes.length > 3 && (bytes[0] & 0xFF) === 0xFF && (bytes[1] & 0xFF) === 0xD8) return "image/jpeg";
  if (bytes.length > 8 && (bytes[0] & 0xFF) === 0x89 && (bytes[1] & 0xFF) === 0x50) return "image/png";
  if (bytes.length > 12 && (bytes[8] & 0xFF) === 0x57 && (bytes[9] & 0xFF) === 0x45 && (bytes[10] & 0xFF) === 0x42) return "image/webp";
  if (bytes.length > 3 && (bytes[0] & 0xFF) === 0x47 && (bytes[1] & 0xFF) === 0x49) return "image/gif";
  return null;
}

// True se i byte iniziano con la firma "%PDF" (un PDF va inviato a Claude come
// blocco "document", non "image")
function _isPdf(bytes){
  return bytes.length > 4 && (bytes[0] & 0xFF) === 0x25 && (bytes[1] & 0xFF) === 0x50
      && (bytes[2] & 0xFF) === 0x44 && (bytes[3] & 0xFF) === 0x46;
}

// Thumbnail Drive (funziona sia per immagini che per la prima pagina dei PDF)
function getThumbnailBlob(fileId, width) {
  try {
    const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) return null;
    const blob = resp.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length < 2000) return null;  // thumbnail vuoto/placeholder
    // Il formato reale può essere JPEG o PNG a discrezione di Drive:
    // il content-type va dedotto dai byte, non imposto
    const mime = _sniffImageMime(bytes);
    if (mime) blob.setContentType(mime);
    return blob;
  } catch (e) {
    Logger.log("⚠️ Thumbnail fallito per " + fileId + ": " + e.message);
    return null;
  }
}

// Blob per l'inserimento nel PDF riepilogo (peso ridotto)
function getBlobElaborato(driveFile) {
  if (!driveFile) return null;
  try {
    const mimeType = driveFile.getMimeType();
    const thumb = getThumbnailBlob(driveFile.getId(), CONFIG.THUMB_WIDTH_PDF);
    if (thumb) {
      thumb.setName(driveFile.getName().replace(/\.pdf$/i, ".png"));
      return thumb;
    }
    if (mimeType === "application/pdf" || mimeType === MimeType.PDF) {
      Logger.log("❌ Thumbnail PDF non disponibile per " + driveFile.getName());
      return null;  // il PDF resta comunque elencato e copiato negli allegati
    }
    Logger.log("⚠️ Uso blob originale per: " + driveFile.getName());
    return driveFile.getBlob();
  } catch (e) {
    Logger.log("⚠️ Errore getBlobElaborato: " + driveFile.getName() + " → " + e.message);
    return null;
  }
}

// Blob ad alta risoluzione per l'analisi AI
function getBlobPerAI(driveFile) {
  if (!driveFile) return null;
  const thumb = getThumbnailBlob(driveFile.getId(), CONFIG.THUMB_WIDTH_AI);
  if (thumb) return thumb;
  const mimeType = driveFile.getMimeType();
  if (mimeType === "application/pdf" || mimeType === MimeType.PDF) return null;
  return driveFile.getBlob();
}


// ============================================================================
// LANDSCAPE
// ============================================================================

// A4 orizzontale con i metodi nativi di DocumentApp: niente API REST esterna
// (la versione precedente via docs.googleapis.com falliva silenziosamente se
// l'API Docs non era abilitata → PDF verticale con immagini tagliate).
// Riceve l'oggetto Document già aperto: riaprirlo per ID nella stessa
// esecuzione creerebbe due handle in conflitto.
function impostaLandscape(doc) {
  const body = doc.getBody();
  body.setPageWidth(841.89).setPageHeight(595.28);
  body.setMarginTop(30).setMarginBottom(30).setMarginLeft(30).setMarginRight(30);
}


// ===================== STILE PDF (sobrio / aziendale) ====================
// Palette neutra con UN solo accento (navy). Niente blu/verde acceso.
const PDF_STY = {
  NAVY:   "#1F3A5F",   // accento: intestazioni tabella, filetti, etichette forti
  TESTO:  "#1A1A1A",   // testo principale
  GRIGIO: "#5F6B7A",   // testo secondario
  BORDO:  "#AEB6C2",   // bordo tabella (hairline)
  ZEBRA:  "#F5F7FA",   // riga alternata (grigio quasi impercettibile)
  TOTALE: "#E6EBF2",   // fascia riga/box totale
  SERIF:  "Georgia",   // titoli (letterhead)
  SANS:   "Arial"      // testo e tabelle
};
const MESI_IT = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                 "luglio","agosto","settembre","ottobre","novembre","dicembre"];

// "2026-06" → "Giugno 2026"
function _periodoEsteso(periodo){
  const m = String(periodo).match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodo;
  const nome = MESI_IT[parseInt(m[2],10)-1] || "";
  return (nome.charAt(0).toUpperCase()+nome.slice(1)) + " " + m[1];
}

// Scrive un paragrafo stilizzato in una cella riusando il paragrafo vuoto di
// default alla prima chiamata (così non restano righe vuote sopra il testo).
function _cella(cell, text, o){
  o = o || {};
  const s = (text == null) ? "" : String(text);
  // riusa il paragrafo vuoto di default della cella (niente riga vuota sopra)
  const p = (cell.getNumChildren() >= 1 && cell.getChild(0).getType() === DocumentApp.ElementType.PARAGRAPH)
          ? cell.getChild(0).asParagraph()
          : cell.appendParagraph(s || " ");
  // ATTENZIONE: setText("")/appendParagraph("") lanciano "elemento di testo
  // vuoto". Per le celle vuote si stila solo lo sfondo (via _stileCella) e si
  // lascia il paragrafo vuoto, senza toccare testo/colore.
  if (s === "") return p;
  p.setText(s);
  p.setFontFamily(o.font || PDF_STY.SANS).setFontSize(o.size || 9)
   .setBold(!!o.bold).setItalic(!!o.italic);
  if (o.align) p.setAlignment(o.align);
  if (o.spaceAfter != null) p.setSpacingAfter(o.spaceAfter);
  p.editAsText().setForegroundColor(o.color || PDF_STY.TESTO);
  return p;
}

// Padding / sfondo / larghezza / allineamento verticale di una cella.
function _stileCella(cell, o){
  o = o || {};
  cell.setPaddingTop(o.pt != null ? o.pt : 5).setPaddingBottom(o.pb != null ? o.pb : 5)
      .setPaddingLeft(o.pl != null ? o.pl : 8).setPaddingRight(o.pr != null ? o.pr : 8);
  if (o.bg) cell.setBackgroundColor(o.bg);
  if (o.width != null) cell.setWidth(o.width);
  if (o.valign) cell.setVerticalAlignment(o.valign);
}


// ===================== UTILITY =============================================
function _norm(s){ return (s||"").toString().trim().toLowerCase().replace(/\s+/g," "); }

function _findCol(headers, aliases){
  const n=headers.map(_norm);
  for(const a of aliases){
    const i=n.indexOf(_norm(a));
    if(i!==-1) return i+1;
  }
  return 0;
}

function parseDateGeneric(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v)==="[object Date]" && !isNaN(v)) return v;
  const s = v.toString().trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m){ let year=+m[3]; if (year<100) year+=2000; return new Date(year, +m[2]-1, +m[1]); }
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Converte un importo in numero gestendo formato italiano e separatori migliaia:
// "€ 1.234,56" → 1234.56 | "12,34" → 12.34 | "1234.56" → 1234.56 | "1.234" → 1234
function parseImporto(raw){
  if (typeof raw === "number") return raw;
  let s = String(raw||"").replace(/€/g,"").replace(/\s/g,"").trim();
  if (!s) return 0;
  if (s.indexOf(",") !== -1){
    s = s.replace(/\./g,"").replace(",",".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)){
    s = s.replace(/\./g,"");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// "€ 1.234,56": punto migliaia + virgola decimali (formato IT).
// parseImporto e la PWA (parseEuro) tolgono comunque i punti migliaia, quindi
// il cambio è retro-compatibile con i valori già nel foglio.
function formatEuro(n){
  const num = (typeof n === "number" && !isNaN(n)) ? n : 0;
  const neg = num < 0;
  const parti = Math.abs(num).toFixed(2).split(".");
  const intero = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "€ " + (neg ? "-" : "") + intero + "," + parti[1];
}

// Cerca una cartella per nome usando la cache degli ID in Script Properties
// (evita match sbagliati con cartelle omonime condivise e ricerche lente)
function getFolderCached(name){
  const props = PropertiesService.getScriptProperties();
  const key = "FOLDER_ID_" + name;
  const id = props.getProperty(key);
  if (id){
    try { return DriveApp.getFolderById(id); } catch(e) { /* ID non più valido, rifai la ricerca */ }
  }
  const it = DriveApp.getFoldersByName(name);
  if (it.hasNext()){
    const f = it.next();
    props.setProperty(key, f.getId());
    return f;
  }
  return null;
}

function getOrCreateFolder(name){
  const found = getFolderCached(name);
  if (found) return found;
  const f = DriveApp.createFolder(name);
  PropertiesService.getScriptProperties().setProperty("FOLDER_ID_" + name, f.getId());
  return f;
}

function getOrCreateSubfolder(parent, name){
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function trovaFile(nome, folder1, folder2){
  if (!nome) return null;
  const fileName = String(nome).split("/").pop();
  if (folder1) {
    const files = folder1.getFilesByName(fileName);
    if (files.hasNext()) return files.next();
  }
  if (folder2) {
    const files = folder2.getFilesByName(fileName);
    if (files.hasNext()) return files.next();
  }
  return null;
}

// Cestina eventuali file omonimi prima di crearne uno nuovo (idempotenza)
function rimuoviFileOmonimi(folder, name){
  const it = folder.getFilesByName(name);
  while (it.hasNext()){
    try { it.next().setTrashed(true); } catch(e) {}
  }
}

// Serializza le operazioni di scrittura (salva/aggiorna/elimina) con un lock:
// evita append/sovrascritture concorrenti se arrivano due richieste ravvicinate.
function _conLockScrittura(fn){
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)){
    throw new Error("Un'altra operazione è in corso, riprova tra un istante");
  }
  try { return fn(); }
  finally { lock.releaseLock(); }
}

// Garantisce la colonna "ID" nel foglio (la crea in coda se manca).
// Restituisce le intestazioni aggiornate.
function _assicuraColonnaID_(sh){
  let headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (!_findCol(headers, ["ID"])){
    const nuovaCol = sh.getLastColumn() + 1;
    sh.getRange(1, nuovaCol).setValue("ID").setFontWeight("bold");
    headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  }
  return headers;
}

// Numero di riga della spesa con quell'ID univoco (0 se non trovata / no colonna).
function _trovaRigaPerID_(sh, headers, id){
  if (!id) return 0;
  const cID = _findCol(headers, ["ID"]);
  if (!cID) return 0;
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, cID, last - 1, 1).getValues();
  const target = String(id).trim();
  for (let i = 0; i < vals.length; i++){
    if (String(vals[i][0]).trim() === target) return i + 2;
  }
  return 0;
}

// Migrazione una-tantum (da eseguire a mano): assegna un UUID alle righe
// esistenti prive di ID. Da lanciare dopo aver caricato il codice v4.9.
function assegnaIDMancanti(){
  const sh = getFoglioSpese_();
  const headers = _assicuraColonnaID_(sh);
  const cID = _findCol(headers, ["ID"]);
  const last = sh.getLastRow();
  if (last < 2){ Logger.log("Nessuna riga da aggiornare"); return; }
  const rng = sh.getRange(2, cID, last - 1, 1);
  const vals = rng.getValues();
  let n = 0;
  for (let i = 0; i < vals.length; i++){
    if (String(vals[i][0]).trim() === ""){ vals[i][0] = Utilities.getUuid(); n++; }
  }
  rng.setValues(vals);
  Logger.log("✅ ID assegnati a " + n + " righe (su " + vals.length + ")");
}

// Cestina il file referenziato da un path "Cartella/nome.ext" cercandolo sia
// nella cartella immagini che in quella file (un allegato può essere una foto
// JPG o un PDF, in cartelle diverse)
function cestinaFileCollegato_(path){
  const nome = String(path || "").split("/").pop();
  if (!nome) return;
  [getFolderCached(CONFIG.CARTELLA_IMMAGINI), getFolderCached(CONFIG.CARTELLA_FILES)].forEach(f => {
    if (!f) return;
    const it = f.getFilesByName(nome);
    if (it.hasNext()){
      try { it.next().setTrashed(true); }
      catch(e){ Logger.log("⚠️ Cestino fallito per " + nome + ": " + e.message); }
    }
  });
}


// ===================== ESTRAZIONE CON CLAUDE VISION ========================

function estraiDatiConClaude(imageBlob){
  const apiKey = _prop("ANTHROPIC_API_KEY");
  if (!apiKey){
    Logger.log("❌ ANTHROPIC_API_KEY mancante nelle Script Properties");
    return null;
  }

  // Lo scontrino può arrivare come immagine o come PDF: a Claude vanno con
  // blocchi di tipo diverso ("image" vs "document"). Per le immagini il
  // media_type dichiarato DEVE corrispondere ai byte reali (dedotto dai magic
  // bytes, con fallback sul content-type del blob).
  const bytes = imageBlob.getBytes();
  const isPdf = _isPdf(bytes);
  let mediaType = null;
  if (!isPdf){
    mediaType = _sniffImageMime(bytes);
    if (!mediaType){
      const mimeOk = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      mediaType = (imageBlob.getContentType() || "image/jpeg").toLowerCase();
      if (mimeOk.indexOf(mediaType) === -1) mediaType = "image/jpeg";
    }
  }

  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: Utilities.base64Encode(bytes) } }
    : { type: "image",    source: { type: "base64", media_type: mediaType,        data: Utilities.base64Encode(bytes) } };

  // Ancora temporale: senza un riferimento il modello a volte sbaglia l'anno
  // (es. legge 2025 al posto di 2026), facendo finire la spesa in un altro anno
  const oggi = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

  const schema = {
    type: "object",
    properties: {
      data:      { type: "string", description: "Data dello scontrino in formato GG/MM/AAAA. Stringa vuota se non leggibile." },
      totale:    { type: "string", description: "Importo TOTALE pagato, formato '€ 12,34' con la virgola come separatore decimale. Stringa vuota se non leggibile." },
      negozio:   { type: "string", description: "Nome dell'esercizio commerciale. Stringa vuota se non leggibile." },
      categoria: { type: "string", enum: ["Ristoranti", "Trasporti", "Pernottamenti", "Altro"] },
      testo:     { type: "string", description: "Trascrizione integrale del testo leggibile dello scontrino." }
    },
    required: ["data", "totale", "negozio", "categoria", "testo"],
    additionalProperties: false
  };

  const payload = {
    model: _prop("CLAUDE_MODEL") || CONFIG.CLAUDE_MODEL,
    max_tokens: CONFIG.CLAUDE_MAX_TOKENS,
    output_config: { format: { type: "json_schema", schema: schema } },
    messages: [{
      role: "user",
      content: [
        fileBlock,
        {
          type: "text",
          text: "Questa è l'immagine o il PDF di uno scontrino o ricevuta (italiana, salvo eccezioni). " +
                "Estrai i dati richiesti dallo schema. Il totale è l'importo complessivamente pagato " +
                "(riga TOTALE / TOTALE COMPLESSIVO / IMPORTO PAGATO), non un subtotale. " +
                "Per la categoria: ristoranti/bar/caffè → Ristoranti; taxi/treni/bus/parcheggi/carburante → Trasporti; " +
                "hotel/B&B → Pernottamenti; tutto il resto → Altro. " +
                "Oggi è " + oggi + ": la data dello scontrino è quella di emissione/pagamento ed è di norma " +
                "vicina a oggi. Leggi l'anno con attenzione e, se non è chiaramente leggibile, usa l'anno corrente; " +
                "non inserire un anno passato se il documento sembra recente. Se l'anno che leggi dista più di un " +
                "anno da oggi, è quasi certamente un errore di lettura della stampa: usa l'anno più vicino a oggi " +
                "compatibile con giorno e mese. Per ricevute con più date " +
                "(prenotazione/ingresso/uscita) usa la data di emissione/pagamento. " +
                "Se un campo non è leggibile usa la stringa vuota."
        }
      ]
    }]
  };

  try {
    const resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200){
      Logger.log("❌ Claude API " + resp.getResponseCode() + ": " + resp.getContentText().substring(0, 300));
      return null;
    }

    const obj = JSON.parse(resp.getContentText());
    registraCostoChiamata_(obj.usage);   // accumula la stima di costo del mese
    const testo = (obj.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    if (!testo){
      Logger.log("❌ Risposta Claude senza contenuto testuale (stop_reason: " + obj.stop_reason + ")");
      return null;
    }
    return validaDatiEstratti(JSON.parse(testo));

  } catch(e) {
    Logger.log("❌ Errore chiamata Claude: " + e.message);
    return null;
  }
}

// ── Stima costo API / credito (card "Credito API") ───────────────────────
// NB: è tutta una STIMA basata sui token (token × prezzo di listino), NON
// l'importo fatturato da Anthropic (non esposto via API key). Il "credito
// residuo" è persistente: scende a ogni scansione e si ricarica dalla UI.
// Lo storico per mese resta in COSTO_<yyyy-MM>.

// Migrazione una tantum dal vecchio "budget mensile" al credito persistente:
// se CREDITO_RESIDUO non esiste ancora, parte dal valore di BUDGET_API_MENSILE
// (che l'utente aveva impostato come credito reale letto dalla Console).
function _assicuraCredito_(props){
  if (props.getProperty("CREDITO_RESIDUO") === null){
    const b = parseFloat(props.getProperty("BUDGET_API_MENSILE") || "0") || 0;
    props.setProperty("CREDITO_RESIDUO", b.toFixed(6));
    props.setProperty("CREDITO_RIFERIMENTO", (b > 0 ? b : 0).toFixed(6));
  }
}

// Accumula la stima di costo di una scansione: la somma sul contatore del mese
// (storico) E la scala dal credito residuo persistente. Silenzioso: non deve
// mai far fallire l'estrazione.
function registraCostoChiamata_(usage){
  try {
    if (!usage) return;
    const inTok  = Number(usage.input_tokens  || 0);
    const outTok = Number(usage.output_tokens || 0);
    const costo = inTok / 1e6 * CONFIG.PREZZO_INPUT_1M + outTok / 1e6 * CONFIG.PREZZO_OUTPUT_1M;
    if (!(costo > 0)) return;
    const props = PropertiesService.getScriptProperties();
    _assicuraCredito_(props);
    // storico consumo mensile (stima)
    const key = "COSTO_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
    const attuale = parseFloat(props.getProperty(key) || "0") || 0;
    props.setProperty(key, (attuale + costo).toFixed(6));
    // credito residuo persistente
    const residuo = parseFloat(props.getProperty("CREDITO_RESIDUO") || "0") || 0;
    props.setProperty("CREDITO_RESIDUO", (residuo - costo).toFixed(6));
  } catch(e){ Logger.log("⚠️ registraCostoChiamata_: " + e.message); }
}

// Stato per la card: credito residuo persistente, riferimento (barra) e
// consumo stimato del mese corrente.
function leggiUsoApi_(){
  const props = PropertiesService.getScriptProperties();
  _assicuraCredito_(props);
  const periodo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  const consumoMese = parseFloat(props.getProperty("COSTO_" + periodo) || "0") || 0;
  const creditoResiduo = parseFloat(props.getProperty("CREDITO_RESIDUO") || "0") || 0;
  let creditoRiferimento = parseFloat(props.getProperty("CREDITO_RIFERIMENTO") || "0") || 0;
  if (creditoRiferimento < creditoResiduo) creditoRiferimento = creditoResiduo; // coerenza barra
  return { periodo: periodo, consumoMese: consumoMese, creditoResiduo: creditoResiduo, creditoRiferimento: creditoRiferimento };
}

// Ricarica il credito: AGGIUNGE l'importo al residuo e riporta la barra a pieno.
function ricaricaCredito_(importo){
  importo = parseFloat(importo) || 0;
  const props = PropertiesService.getScriptProperties();
  _assicuraCredito_(props);
  if (importo > 0){
    const residuo = (parseFloat(props.getProperty("CREDITO_RESIDUO") || "0") || 0) + importo;
    props.setProperty("CREDITO_RESIDUO", residuo.toFixed(6));
    props.setProperty("CREDITO_RIFERIMENTO", residuo.toFixed(6)); // barra piena dopo la ricarica
  }
  return leggiUsoApi_();
}

// Normalizza/valida i campi prima di scriverli nel foglio
function validaDatiEstratti(dati){
  if (!dati || typeof dati !== "object") return null;

  let data = String(dati.data || "").trim();
  if (data && !/^\d{2}\/\d{2}\/\d{4}$/.test(data)){
    const d = parseDateGeneric(data);
    data = d ? Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy") : "";
  }

  let totale = String(dati.totale || "").trim();
  if (totale){
    const n = parseImporto(totale);
    totale = n > 0 ? formatEuro(n) : "";
  }

  const categorieValide = ["Ristoranti", "Trasporti", "Pernottamenti", "Altro"];
  const categoria = categorieValide.indexOf(dati.categoria) !== -1 ? dati.categoria : "Altro";

  return {
    data: data,
    totale: totale,
    negozio: String(dati.negozio || "").trim(),
    categoria: categoria,
    testo: String(dati.testo || "").trim()
  };
}


// ===================== SCANSIONE AUTOMATICA ================================

function controllaNuoviScontrini(){
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)){
    Logger.log("⏭️ Scansione già in esecuzione, esco");
    return;
  }
  try {
    _controllaNuoviScontrini();
  } finally {
    lock.releaseLock();
  }
}

function _controllaNuoviScontrini(){
  const inizio = Date.now();
  const sh = getFoglioSpese_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cFoto  = _findCol(headers, ["Foto"]);
  const cPDF   = _findCol(headers, ["PDF"]);
  const cTesto = _findCol(headers, ["Testo_scontrino", "Testo scontrino"]);
  if (!cTesto){
    Logger.log("⚠️ Colonna Testo_scontrino non trovata, esco");
    return;
  }

  const imgFolder = getFolderCached(CONFIG.CARTELLA_IMMAGINI);
  const filesFolder = getFolderCached(CONFIG.CARTELLA_FILES);

  // Lettura in batch (una sola chiamata invece di 3 per riga)
  const valori = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();

  let elaborati = 0;
  for (let i = 0; i < valori.length; i++){
    if (Date.now() - inizio > CONFIG.MAX_RUNTIME_MS){
      Logger.log("⏱️ Limite tempo raggiunto: riprendo le righe rimanenti al prossimo run");
      break;
    }

    const r = i + 2;
    const testo = valori[i][cTesto - 1];
    if (testo && String(testo).trim() !== "") continue;

    let fileRef = "";
    if (cFoto && valori[i][cFoto - 1] && String(valori[i][cFoto - 1]).trim() !== ""){
      fileRef = valori[i][cFoto - 1];
    }
    if (!fileRef && cPDF && valori[i][cPDF - 1] && String(valori[i][cPDF - 1]).trim() !== ""){
      fileRef = valori[i][cPDF - 1];
    }
    if (!fileRef) continue;

    try {
      const file = trovaFile(fileRef, imgFolder, filesFolder);
      if (!file){
        Logger.log(`⚠️ Riga ${r}: file non trovato (${fileRef})`);
        continue;
      }
      const blob = getBlobPerAI(file);
      if (!blob){
        Logger.log(`⚠️ Riga ${r}: impossibile ottenere immagine per AI (${file.getName()})`);
        continue;
      }
      const dati = estraiDatiConClaude(blob);
      if (!dati){
        Logger.log(`⚠️ Riga ${r}: estrazione fallita, riproverò al prossimo run`);
        continue;
      }

      sh.getRange(r, cTesto).setValue(dati.testo || "[elaborato " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") + "]");
      aggiornaRigaConDati(sh, r, dati, headers);
      if (dati.data && !verificaDataCoerente(dati.data)){
        Logger.log(`⚠️ Anomalia rilevata riga ${r}: data ${dati.data} fuori finestra attesa`);
        segnalaAnomaliaData(sh, r, dati, headers);
      }
      elaborati++;
    } catch(e) {
      Logger.log(`❌ Errore riga ${r}: ${e.message}`);
    }
  }
  Logger.log(`Elaborati: ${elaborati}`);
}

function aggiornaRigaConDati(sheet, row, dati, headers){
  const mappa = {
    data:      ["Data"],
    totale:    ["Totale"],
    negozio:   ["Negozio"],
    categoria: ["Categoria"]
  };
  for (const campo in mappa){
    if (!dati[campo]) continue;
    const c = _findCol(headers, mappa[campo]);
    if (c){
      sheet.getRange(row, c).setValue(dati[campo]);
    } else {
      Logger.log(`⚠️ Colonna '${mappa[campo][0]}' non trovata: valore non scritto (${dati[campo]})`);
    }
  }
}


// ===================== VERIFICA ANOMALIE DATE ============================

// Una data è coerente se cade nel mese corrente O nel mese precedente
// (gli scontrini di fine mese vengono spesso caricati a inizio mese successivo)
function verificaDataCoerente(dataInput) {
  const data = parseDateGeneric(dataInput);
  if (!data) return true;
  const oggi = new Date();
  const meseCorrente = oggi.getFullYear() * 12 + oggi.getMonth();
  const meseData = data.getFullYear() * 12 + data.getMonth();
  return meseData === meseCorrente || meseData === meseCorrente - 1;
}

function segnalaAnomaliaData(sheet, row, dati, headers) {
  let cAlert = _findCol(headers, ["Alert_Data", "Alert Data", "Anomalia_Data"]);
  if (!cAlert) {
    const ultimaCol = sheet.getLastColumn();
    sheet.getRange(1, ultimaCol + 1).setValue("Alert_Data");
    cAlert = ultimaCol + 1;
    headers.push("Alert_Data");
  }
  const oggi = new Date();
  const meseAnnoCorrente = Utilities.formatDate(oggi, Session.getScriptTimeZone(), "MM/yyyy");
  const messaggioAlert = `⚠️ Data ${dati.data} fuori dalla finestra attesa (${meseAnnoCorrente} o mese precedente)`;
  sheet.getRange(row, cAlert).setValue(messaggioAlert);
  sheet.getRange(row, cAlert).setBackground("#FFF3CD");
  try {
    const emailDestinatario = Session.getActiveUser().getEmail();
    if (!emailDestinatario) throw new Error("email utente non disponibile in questo contesto");
    const oggetto = "⚠️ ALERT: Data Anomala Rilevata - Nota Spese";
    const corpo = `
ALERT AUTOMATICO - GESTIONE SCONTRINI
======================================

È stata rilevata una data anomala nel foglio spese.

DETTAGLI ANOMALIA:
------------------
Riga foglio: ${row}
Data rilevata: ${dati.data}
Finestra attesa: ${meseAnnoCorrente} o mese precedente
Negozio: ${dati.negozio || "N/D"}
Importo: ${dati.totale || "N/D"}
Categoria: ${dati.categoria || "N/D"}

AZIONE RICHIESTA:
-----------------
Verifica la riga ${row} nel foglio "${CONFIG.FOGLIO_SPESE}" e correggi manualmente la data se necessario.

---
Questo è un messaggio automatico generato dallo script di gestione scontrini.
    `;
    MailApp.sendEmail(emailDestinatario, oggetto, corpo);
    Logger.log(`📧 Email alert inviata per riga ${row}: data ${dati.data} anomala`);
  } catch(e) {
    Logger.log(`⚠️ Impossibile inviare email alert: ${e.message}`);
  }
}


// ===================== CHIUSURA MESE =====================================
function chiudiMeseManuale(anno, mese){
  if (!anno || !mese){ const now=new Date(); anno=now.getFullYear(); mese=now.getMonth()+1; }

  const sh = getFoglioSpese_();
  const dati = sh.getDataRange().getValues();
  const headers = dati.shift();

  const iData          = _findCol(headers,["Data"])-1,
        iTot           = _findCol(headers,["Totale","Importo"])-1,
        iNeg           = _findCol(headers,["Negozio","Fornitore"])-1,
        iCat           = _findCol(headers,["Categoria"])-1,
        iFoto          = _findCol(headers,["Foto","Image"])-1,
        iFotoBancomat  = _findCol(headers,["FotoBancomat","Foto Bancomat"])-1,
        iPDF           = _findCol(headers,["PDF"])-1,
        iOspInt        = _findCol(headers,["Ospiti_Interni"])-1,
        iOspEst        = _findCol(headers,["Ospiti_Esterni"])-1,
        iNote          = _findCol(headers,["Note"])-1;

  if (iData<0 || iTot<0) {
    throw new Error("Colonne 'Data' e/o 'Totale' non trovate");
  }

  const periodo = `${anno}-${String(mese).padStart(2,"0")}`;

  const imgFolder = getFolderCached(CONFIG.CARTELLA_IMMAGINI);
  const filesFolder = getFolderCached(CONFIG.CARTELLA_FILES);

  const vociMese = [];
  let tot=0, righe=0;
  const sumByCat = {};

  dati.forEach((r)=>{
    const d = parseDateGeneric(r[iData]);
    if (!d) return;
    const ym = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM");
    if (ym !== periodo) return;

    const num = parseImporto(r[iTot]);

    tot += num;
    righe++;

    const cat     = iCat>=0    ? (r[iCat]||"Altro") : "Altro";
    const negozio = iNeg>=0    ? (r[iNeg]||"")       : "";
    const ospInt  = iOspInt>=0 ? String(r[iOspInt]||"").trim() : "";
    const ospEst  = iOspEst>=0 ? String(r[iOspEst]||"").trim() : "";
    const note    = iNote>=0   ? String(r[iNote]||"").trim()   : "";

    sumByCat[cat] = (sumByCat[cat]||0) + num;

    const dataVis = Utilities.formatDate(d, Session.getScriptTimeZone(), "dd/MM/yyyy");

    let fileImg = null;
    if (iFoto>=0 && r[iFoto]){
      fileImg = trovaFile(r[iFoto], imgFolder, filesFolder);
    }

    let fileBancomat = null;
    if (iFotoBancomat>=0 && r[iFotoBancomat]){
      fileBancomat = trovaFile(r[iFotoBancomat], imgFolder, filesFolder);
    }

    let pdfFile = null;
    if (iPDF>=0 && r[iPDF]){
      pdfFile = trovaFile(r[iPDF], imgFolder, filesFolder);
    }

    if (!fileImg && pdfFile) {
      fileImg = pdfFile;
    }

    vociMese.push({
      data: dataVis,
      dataObj: d,
      negozio: negozio,
      categoria: cat,
      importo: num,
      fileImg: fileImg,
      fileBancomat: fileBancomat,
      pdfFile: pdfFile,
      hasPDF: pdfFile !== null,
      ospInt: ospInt,
      ospEst: ospEst,
      note: note
    });
  });

  if (righe === 0){
    return { messaggio: `⚠️ Nessuna spesa trovata per il periodo ${periodo}: nessun riepilogo generato`, pdfUrl: null };
  }

  vociMese.sort((a, b) => a.dataObj - b.dataObj);

  // Le cartelle vengono create solo se ci sono spese nel periodo
  const root = getOrCreateFolder(CONFIG.ROOT_FOLDER);
  const periodoFolder = getOrCreateSubfolder(root, periodo);
  const pdfFolder = getOrCreateSubfolder(periodoFolder, CONFIG.SOTTOCARTELLA_PDF);

  // Indici assegnati DOPO l'ordinamento per data, così la numerazione degli
  // allegati coincide con quella della tabella e del dettaglio
  const pdfAllegati = [];
  vociMese.forEach((v, idx) => {
    if (!v.pdfFile) return;
    pdfAllegati.push({
      file: v.pdfFile,
      nomeFile: v.pdfFile.getName(),
      data: v.data,
      negozio: v.negozio,
      categoria: v.categoria,
      importo: v.importo,
      indice: idx + 1
    });
  });

  pdfAllegati.forEach((pdf) => {
    const nuovoNome = `${String(pdf.indice).padStart(2,'0')}_${pdf.negozio.replace(/[^a-zA-Z0-9]/g,'_').substring(0,30)}.pdf`;
    try {
      rimuoviFileOmonimi(pdfFolder, nuovoNome);
      pdf.file.makeCopy(nuovoNome, pdfFolder);
      pdf.nomeFile = nuovoNome;
    } catch(e) {
      pdf.nomeFile = pdf.file.getName();
    }
  });

  // ===================== CREA PDF RIEPILOGO =====================
  const doc = DocumentApp.create("Riepilogo_"+periodo);
  impostaLandscape(doc);

  const body = doc.getBody();
  const AR = DocumentApp.HorizontalAlignment.RIGHT;
  const AC = DocumentApp.HorizontalAlignment.CENTER;

  // ---- INTESTAZIONE (letterhead sobrio) ----
  const titolo = body.appendParagraph("REPORT RICEVUTE");
  titolo.setFontFamily(PDF_STY.SERIF).setFontSize(20).setBold(true).setSpacingAfter(1);
  titolo.editAsText().setForegroundColor(PDF_STY.NAVY);

  // Nome e cognome (senza etichetta) + mese. Configurabile via Script Property
  // INTESTATARIO senza toccare il codice.
  const nomeInt = _prop("INTESTATARIO") || "Demetrio Farris";
  const sottot = body.appendParagraph(nomeInt + "     ·     " + _periodoEsteso(periodo));
  sottot.setFontFamily(PDF_STY.SERIF).setFontSize(12).setSpacingAfter(6);
  sottot.editAsText().setForegroundColor(PDF_STY.GRIGIO);

  body.appendHorizontalRule();

  const info = body.appendParagraph(
    `Numero spese: ${righe}      Totale: ${formatEuro(tot)}      ` +
    `Documento generato il ${Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy")}`
  );
  info.setFontFamily(PDF_STY.SANS).setFontSize(9.5).setSpacingBefore(6).setSpacingAfter(16);
  info.editAsText().setForegroundColor(PDF_STY.TESTO);

  // ---- TABELLA RIEPILOGATIVA (riprogettata) ----
  const hSez = body.appendParagraph("RIEPILOGO SPESE");
  hSez.setFontFamily(PDF_STY.SANS).setFontSize(11).setBold(true).setSpacingAfter(8);
  hSez.editAsText().setForegroundColor(PDF_STY.NAVY);

  const tbl = body.appendTable();
  tbl.setBorderWidth(0.75).setBorderColor(PDF_STY.BORDO);

  // intestazione tabella (fascia navy, etichette maiuscole)
  const hr = tbl.appendTableRow();
  [["N.", AC, 30], ["DATA", null, 78], ["NEGOZIO", null, null],
   ["CATEGORIA", null, 115], ["IMPORTO", AR, 95]].forEach(([lab, al, w]) => {
    const c = hr.appendTableCell();
    _cella(c, lab, { bold: true, size: 8.5, color: "#FFFFFF", align: al });
    _stileCella(c, { bg: PDF_STY.NAVY, width: w, pt: 5, pb: 5 });
  });

  // righe (zebra leggerissima, importi allineati a destra)
  vociMese.forEach((v, idx) => {
    const row = tbl.appendTableRow();
    const bg = idx % 2 === 1 ? PDF_STY.ZEBRA : null;
    const cols = [
      { t: idx+1,               align: AC, color: PDF_STY.GRIGIO },
      { t: v.data },
      { t: v.negozio || "—" },
      { t: v.categoria,         color: PDF_STY.GRIGIO },
      { t: formatEuro(v.importo), align: AR }
    ];
    cols.forEach(col => {
      const c = row.appendTableCell();
      _cella(c, col.t, { size: 9, align: col.align, color: col.color });
      _stileCella(c, { bg: bg, pt: 5, pb: 5 });
    });
  });

  // riga TOTALE (fascia grigio chiara, nessun blocco verde)
  const rTot = tbl.appendTableRow();
  ["", "", "", "TOTALE", formatEuro(tot)].forEach((t, i) => {
    const c = rTot.appendTableCell();
    _cella(c, t, { bold: i >= 3, size: 9.5, align: AR, color: PDF_STY.NAVY });
    _stileCella(c, { bg: PDF_STY.TOTALE, pt: 7, pb: 7 });
  });

  // ===================== DETTAGLIO SPESE CON GIUSTIFICATIVI =====================
  body.appendPageBreak();

  const hDett = body.appendParagraph("DETTAGLIO SPESE CON GIUSTIFICATIVI");
  hDett.setFontFamily(PDF_STY.SANS).setFontSize(11).setBold(true).setSpacingAfter(8);
  hDett.editAsText().setForegroundColor(PDF_STY.NAVY);

  // Dimensioni ricavate dalla pagina reale: le immagini non vengono mai
  // tagliate, qualunque siano orientamento e margini effettivi
  const larghezzaUtile = body.getPageWidth() - body.getMarginLeft() - body.getMarginRight();
  const CELL_W = Math.floor(larghezzaUtile / 2);   // due celle affiancate (ricevuta | pagamento)
  const MAX_IMG_W = CELL_W - 16;                   // padding cella (6+6) + bordi
  const MAX_IMG_H = Math.floor(body.getPageHeight() - body.getMarginTop() - body.getMarginBottom() - 80); // 80pt per intestazione voce + etichetta

  vociMese.forEach((v, idx) => {
    if (idx > 0) body.appendPageBreak();   // uno scontrino per pagina (ricevuta | POS grandi)

    // Intestazione voce
    const intestazione = body.appendParagraph(`${idx+1}.   ${v.data}   —   ${v.negozio}`);
    intestazione.setFontFamily(PDF_STY.SANS).setBold(true).setFontSize(12)
      .setSpacingBefore(4).setSpacingAfter(1);
    intestazione.editAsText().setForegroundColor(PDF_STY.NAVY);

    const dettaglio = body.appendParagraph(`${v.categoria}    ·    ${formatEuro(v.importo)}`);
    dettaglio.setFontFamily(PDF_STY.SANS).setFontSize(10).setSpacingAfter(4);
    dettaglio.editAsText().setForegroundColor(PDF_STY.GRIGIO);

    // Ospiti interni (solo se presenti)
    if (v.ospInt) {
      const pOspInt = body.appendParagraph(`Ospiti interni: ${v.ospInt}`);
      pOspInt.setFontFamily(PDF_STY.SANS).setFontSize(9).setSpacingAfter(2);
      pOspInt.editAsText().setForegroundColor(PDF_STY.GRIGIO);
    }

    // Ospiti esterni (solo se presenti)
    if (v.ospEst) {
      const pOspEst = body.appendParagraph(`Ospiti esterni: ${v.ospEst}`);
      pOspEst.setFontFamily(PDF_STY.SANS).setFontSize(9).setSpacingAfter(2);
      pOspEst.editAsText().setForegroundColor(PDF_STY.GRIGIO);
    }

    // Note (solo se presenti)
    if (v.note) {
      const pNote = body.appendParagraph(`Note: ${v.note}`);
      pNote.setFontFamily(PDF_STY.SANS).setFontSize(9).setItalic(true).setSpacingAfter(6);
      pNote.editAsText().setForegroundColor(PDF_STY.GRIGIO);
    }

    // riga di stacco sottile sotto l'intestazione della voce
    const sepVoce = body.appendHorizontalRule();
    try { sepVoce.getParent().asParagraph().setSpacingBefore(2).setSpacingAfter(6); } catch(e){}

    if (v.fileImg || v.fileBancomat) {
      const tbl = body.appendTable();
      const row = tbl.appendTableRow();

      // Cella RICEVUTA
      const cellRic = row.appendTableCell();
      cellRic.setWidth(CELL_W);
      cellRic.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      cellRic.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);

      const labelRic = cellRic.appendParagraph("RICEVUTA");
      labelRic.setFontFamily(PDF_STY.SANS).setFontSize(8.5).setBold(true);
      labelRic.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      labelRic.setSpacingAfter(4);
      labelRic.editAsText().setForegroundColor(PDF_STY.NAVY);

      if (v.fileImg) {
        try {
          const blob = getBlobElaborato(v.fileImg);
          if (!blob) throw new Error("getBlobElaborato returned null for " + v.fileImg.getName());
          const img = cellRic.appendImage(blob);
          const w = img.getWidth(), h = img.getHeight();
          const scale = Math.min(MAX_IMG_W / w, MAX_IMG_H / h, 1);
          img.setWidth(Math.round(w * scale)).setHeight(Math.round(h * scale));
        } catch(e) {
          Logger.log("❌ Errore inserimento RICEVUTA riga " + (idx+1) + ": " + e.message);
          const errMsg = cellRic.appendParagraph("Errore caricamento");
          errMsg.setFontSize(8).setItalic(true);
          errMsg.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          errMsg.editAsText().setForegroundColor('#000000');
        }
      } else {
        const msg = cellRic.appendParagraph(v.hasPDF ? "Vedi PDF allegato" : "Nessuna immagine");
        msg.setFontSize(9).setItalic(true);
        msg.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        msg.editAsText().setForegroundColor('#000000');
      }

      // Cella PAGAMENTO
      const cellPag = row.appendTableCell();
      cellPag.setWidth(CELL_W);
      cellPag.setPaddingTop(4).setPaddingBottom(4).setPaddingLeft(6).setPaddingRight(6);
      cellPag.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);

      const labelPag = cellPag.appendParagraph("PAGAMENTO");
      labelPag.setFontFamily(PDF_STY.SANS).setFontSize(8.5).setBold(true);
      labelPag.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      labelPag.setSpacingAfter(4);
      labelPag.editAsText().setForegroundColor(PDF_STY.NAVY);

      if (v.fileBancomat) {
        try {
          const blob = getBlobElaborato(v.fileBancomat);
          if (!blob) throw new Error("getBlobElaborato returned null for " + v.fileBancomat.getName());
          const img = cellPag.appendImage(blob);
          const w = img.getWidth(), h = img.getHeight();
          const scale = Math.min(MAX_IMG_W / w, MAX_IMG_H / h, 1);
          img.setWidth(Math.round(w * scale)).setHeight(Math.round(h * scale));
        } catch(e) {
          Logger.log("❌ Errore inserimento PAGAMENTO riga " + (idx+1) + ": " + e.message);
          const errMsg = cellPag.appendParagraph("Errore caricamento");
          errMsg.setFontSize(8).setItalic(true);
          errMsg.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          errMsg.editAsText().setForegroundColor('#000000');
        }
      } else {
        const msg = cellPag.appendParagraph("Nessuna immagine");
        msg.setFontSize(9).setItalic(true);
        msg.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
        msg.editAsText().setForegroundColor('#000000');
      }

      tbl.setBorderWidth(0.5);
      tbl.setBorderColor(PDF_STY.BORDO);
    }
  });

  // ===================== RIEPILOGO PER CATEGORIA =====================
  body.appendPageBreak();

  const hCat = body.appendParagraph("RIEPILOGO PER CATEGORIA");
  hCat.setFontFamily(PDF_STY.SANS).setFontSize(11).setBold(true).setSpacingAfter(8);
  hCat.editAsText().setForegroundColor(PDF_STY.NAVY);

  if (Object.keys(sumByCat).length){
    const tblCat = body.appendTable();
    tblCat.setBorderWidth(0.75).setBorderColor(PDF_STY.BORDO);

    const hRowCat = tblCat.appendTableRow();
    [["CATEGORIA", null, null], ["IMPORTO", AR, 150]].forEach(([lab, al, w]) => {
      const c = hRowCat.appendTableCell();
      _cella(c, lab, { bold: true, size: 8.5, color: "#FFFFFF", align: al });
      _stileCella(c, { bg: PDF_STY.NAVY, width: w, pt: 6, pb: 6, pl: 10, pr: 10 });
    });

    Object.entries(sumByCat).sort((a,b)=>b[1]-a[1]).forEach(([cat,val], idx)=>{
      const dRow = tblCat.appendTableRow();
      const bg = idx%2===1 ? PDF_STY.ZEBRA : null;

      const c1 = dRow.appendTableCell();
      _cella(c1, cat, { size: 10 });
      _stileCella(c1, { bg: bg, pt: 6, pb: 6, pl: 10, pr: 10 });

      const c2 = dRow.appendTableCell();
      _cella(c2, formatEuro(val), { size: 10, align: AR });
      _stileCella(c2, { bg: bg, pt: 6, pb: 6, pl: 10, pr: 10 });
    });

    const tRowCat = tblCat.appendTableRow();
    const tc1 = tRowCat.appendTableCell();
    _cella(tc1, "TOTALE COMPLESSIVO", { bold: true, size: 10.5, color: PDF_STY.NAVY });
    _stileCella(tc1, { bg: PDF_STY.TOTALE, pt: 8, pb: 8, pl: 10, pr: 10 });

    const tc2 = tRowCat.appendTableCell();
    _cella(tc2, formatEuro(tot), { bold: true, size: 10.5, align: AR, color: PDF_STY.NAVY });
    _stileCella(tc2, { bg: PDF_STY.TOTALE, pt: 8, pb: 8, pl: 10, pr: 10 });
  }

  // ===================== INDICE DOCUMENTI PDF ALLEGATI =====================
  if (pdfAllegati.length > 0) {
    body.appendPageBreak();

    const hAll = body.appendParagraph("DOCUMENTI PDF ALLEGATI");
    hAll.setFontFamily(PDF_STY.SANS).setFontSize(11).setBold(true).setSpacingAfter(6);
    hAll.editAsText().setForegroundColor(PDF_STY.NAVY);

    const introAllegati = body.appendParagraph(
      `${pdfAllegati.length} documenti PDF nella cartella  ` +
      `${CONFIG.ROOT_FOLDER} / ${periodo} / ${CONFIG.SOTTOCARTELLA_PDF}/`
    );
    introAllegati.setFontFamily(PDF_STY.SANS).setFontSize(9.5).setSpacingAfter(14);
    introAllegati.editAsText().setForegroundColor(PDF_STY.GRIGIO);

    pdfAllegati.forEach((pdf) => {
      const voce = body.appendParagraph(
        `${pdf.indice}.   ${pdf.data}   —   ${pdf.negozio}   ·   ${pdf.categoria}   ·   ${formatEuro(pdf.importo)}   ·   ${pdf.nomeFile}`
      );
      voce.setFontFamily(PDF_STY.SANS).setFontSize(9.5).setSpacingAfter(5);
      voce.editAsText().setForegroundColor(PDF_STY.TESTO);
    });
  }

  // Piè di pagina discreto su ogni pagina
  try {
    const footer = doc.addFooter();
    const fp = footer.appendParagraph("Nota spese  ·  " + _periodoEsteso(periodo));
    fp.setFontFamily(PDF_STY.SANS).setFontSize(8).setAlignment(AC);
    fp.editAsText().setForegroundColor(PDF_STY.GRIGIO);
  } catch(e){ Logger.log("⚠️ Footer: " + e.message); }

  // Salva e converti in PDF (sovrascrivendo eventuali versioni precedenti)
  doc.saveAndClose();
  const pdfBlob = doc.getAs(MimeType.PDF);
  rimuoviFileOmonimi(periodoFolder, "Riepilogo_"+periodo+".pdf");
  const filePdf = periodoFolder.createFile(pdfBlob).setName("Riepilogo_"+periodo+".pdf");
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  // File TXT riepilogo
  let txtContent = `RIEPILOGO SPESE ${periodo}\n${"=".repeat(50)}\n\n`;
  txtContent += `Periodo: ${periodo}\nNumero spese: ${righe}\n`;
  txtContent += `Totale: ${formatEuro(tot)}\nPDF allegati: ${pdfAllegati.length}\n\n`;
  txtContent += `${"=".repeat(50)}\nDETTAGLIO SPESE (ordinato per data)\n${"=".repeat(50)}\n\n`;
  vociMese.forEach((v, idx) => {
    txtContent += `${idx+1}. ${v.data} - ${v.negozio}\n   ${v.categoria} • € ${v.importo.toFixed(2).replace(".",",")}\n`;
    if (v.ospInt) txtContent += `   Ospiti interni: ${v.ospInt}\n`;
    if (v.ospEst) txtContent += `   Ospiti esterni: ${v.ospEst}\n`;
    if (v.note)   txtContent += `   Note: ${v.note}\n`;
    txtContent += "\n";
  });
  txtContent += `\n${"=".repeat(50)}\nRIEPILOGO PER CATEGORIA\n${"=".repeat(50)}\n\n`;
  Object.entries(sumByCat).sort((a,b)=>b[1]-a[1]).forEach(([cat, val]) => {
    txtContent += `${cat}: ${formatEuro(val)}\n`;
  });
  txtContent += `\n${"=".repeat(50)}\nTOTALE: ${formatEuro(tot)}\n${"=".repeat(50)}`;
  rimuoviFileOmonimi(periodoFolder, `Report_${periodo}.txt`);
  periodoFolder.createFile(`Report_${periodo}.txt`, txtContent);

  return {
    messaggio: `✅ Chiusura ${periodo}: ${righe} spese, ${formatEuro(tot)}, ${pdfAllegati.length} PDF allegati`,
    pdfUrl: filePdf.getUrl()
  };
}


// ===================== RICERCA E RIEPILOGHI (per PWA) ====================

// Ricerca spese: query testuale (negozio/categoria/note) e/o periodo "YYYY-MM".
// Restituisce le più recenti per prime, max 50.
function cercaSpese(p){
  const sh = getFoglioSpese_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const dati = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  const iData = _findCol(headers, ["Data"]) - 1,
        iTot  = _findCol(headers, ["Totale"]) - 1,
        iNeg  = _findCol(headers, ["Negozio"]) - 1,
        iCat  = _findCol(headers, ["Categoria"]) - 1,
        iNote = _findCol(headers, ["Note"]) - 1,
        iOspInt = _findCol(headers, ["Ospiti_Interni"]) - 1,
        iOspEst = _findCol(headers, ["Ospiti_Esterni"]) - 1,
        iFoto = _findCol(headers, ["Foto"]) - 1,
        iFotoBc = _findCol(headers, ["FotoBancomat", "Foto Bancomat"]) - 1,
        iPDF  = _findCol(headers, ["PDF"]) - 1,
        iID   = _findCol(headers, ["ID"]) - 1;

  const q = _norm(p.query || "");
  const periodo = String(p.periodo || "").trim();
  // periodo "yyyy" = anno intero (statistiche), "yyyy-MM" = mese
  const perAnno = /^\d{4}$/.test(periodo);
  const fmtPeriodo = perAnno ? "yyyy" : "yyyy-MM";

  // L'elenco del mese (solo periodo) deve restituire TUTTE le spese, altrimenti
  // il totale mostrato dalla PWA risulterebbe silenziosamente parziale; il tetto
  // di 50 resta solo per le ricerche testuali.
  const maxRisultati = q ? 50 : 5000;
  const tz = Session.getScriptTimeZone();

  const out = [];
  for (let i = dati.length - 1; i >= 0 && out.length < maxRisultati; i--){
    const r = dati[i];
    const d = iData >= 0 ? parseDateGeneric(r[iData]) : null;

    if (periodo){
      if (!d) continue;
      if (Utilities.formatDate(d, tz, fmtPeriodo) !== periodo) continue;
    }
    if (q){
      const testoRiga = _norm([
        iNeg >= 0 ? r[iNeg] : "",
        iCat >= 0 ? r[iCat] : "",
        iNote >= 0 ? r[iNote] : ""
      ].join(" "));
      if (testoRiga.indexOf(q) === -1) continue;
    }

    const hasFile = (idx) => idx >= 0 && String(r[idx] || "").trim() !== "";

    out.push({
      riga: i + 2,
      id: iID >= 0 ? String(r[iID] || "") : "",
      data: d ? Utilities.formatDate(d, tz, "dd/MM/yyyy") : String(r[iData] || ""),
      totale: formatEuro(parseImporto(iTot >= 0 ? r[iTot] : 0)),
      negozio: iNeg >= 0 ? String(r[iNeg] || "") : "",
      categoria: iCat >= 0 ? String(r[iCat] || "") : "",
      ospitiInterni: iOspInt >= 0 ? String(r[iOspInt] || "") : "",
      ospitiEsterni: iOspEst >= 0 ? String(r[iOspEst] || "") : "",
      note: iNote >= 0 ? String(r[iNote] || "") : "",
      // flag economico (nessuna chiamata a Drive): gli URL veri si risolvono
      // solo su richiesta con l'azione "allegati"
      haAllegati: hasFile(iFoto) || hasFile(iFotoBc) || hasFile(iPDF)
    });
  }
  return out;
}

// URL Drive degli allegati di UNA spesa (risolti su richiesta: getUrl per riga
// sarebbe troppo lento sull'intero elenco). Etichette pronte per la PWA.
function allegatiSpesa(p){
  const sh = getFoglioSpese_();
  const riga = parseInt(p.riga);
  if (isNaN(riga) || riga < 2 || riga > sh.getLastRow()) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const imgFolder = getFolderCached(CONFIG.CARTELLA_IMMAGINI);
  const filesFolder = getFolderCached(CONFIG.CARTELLA_FILES);

  const out = [];
  [
    [["Foto"], "📄 Scontrino"],
    [["PDF"], "📎 PDF scontrino"],
    [["FotoBancomat", "Foto Bancomat"], "💳 Pagamento"]
  ].forEach(([aliases, etichetta]) => {
    const c = _findCol(headers, aliases);
    if (!c) return;
    const path = String(sh.getRange(riga, c).getValue() || "").trim();
    if (!path) return;
    const f = trovaFile(path, imgFolder, filesFolder);
    if (f){
      try { out.push({ etichetta: etichetta, url: f.getUrl() }); } catch(e){}
    }
  });
  return out;
}

// Elenco dei riepiloghi mensili già generati (PDF in NoteSpese_V4/AAAA-MM/)
function listaRiepiloghi(){
  const root = getFolderCached(CONFIG.ROOT_FOLDER);
  if (!root) return [];
  const out = [];
  const folders = root.getFolders();
  while (folders.hasNext()){
    const f = folders.next();
    if (!/^\d{4}-\d{2}$/.test(f.getName())) continue;
    const files = f.getFilesByName("Riepilogo_" + f.getName() + ".pdf");
    if (files.hasNext()){
      out.push({ periodo: f.getName(), url: files.next().getUrl() });
    }
  }
  out.sort((a, b) => a.periodo < b.periodo ? 1 : -1);
  return out;
}


// ===================== SALVATAGGIO SPESA (da PWA) ========================

// Restituisce il numero di riga di una spesa esistente con stessa data, stesso
// totale e stesso negozio (0 se non c'è): quasi sempre è un doppio invio.
function _cercaDuplicato_(sh, headers, p){
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const iData = _findCol(headers, ["Data"]) - 1,
        iTot  = _findCol(headers, ["Totale"]) - 1,
        iNeg  = _findCol(headers, ["Negozio"]) - 1;
  if (iData < 0 || iTot < 0 || iNeg < 0) return 0;

  const dNuova = parseDateGeneric(p.data);
  const totNuovo = parseImporto(p.totale);
  const negNuovo = _norm(p.negozio);
  if (!dNuova || !totNuovo || !negNuovo) return 0;  // dati incompleti: non giudico
  const tz = Session.getScriptTimeZone();
  const chiaveData = Utilities.formatDate(dNuova, tz, "yyyy-MM-dd");

  const dati = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  for (let i = dati.length - 1; i >= 0; i--){
    const d = parseDateGeneric(dati[i][iData]);
    if (!d || Utilities.formatDate(d, tz, "yyyy-MM-dd") !== chiaveData) continue;
    if (Math.abs(parseImporto(dati[i][iTot]) - totNuovo) > 0.005) continue;
    if (_norm(dati[i][iNeg]) !== negNuovo) continue;
    return i + 2;
  }
  return 0;
}

function salvaSpesa(p){
  const sh = getFoglioSpese_();
  const headers = _assicuraColonnaID_(sh);  // garantisce la colonna ID

  // Meglio un errore chiaro che una riga salvata vuota: se le intestazioni non
  // sono leggibili, tutti i setCol scarterebbero i valori in silenzio
  if (!_findCol(headers, ["Data"]) || !_findCol(headers, ["Totale"])){
    throw new Error("Intestazioni non trovate nella riga 1 del foglio spese: apri il foglio e verifica");
  }

  // Anti-duplicato PRIMA di scrivere i file su Drive (un salvataggio respinto
  // non deve lasciare foto/PDF orfani). La PWA può forzare con forzaDuplicato.
  if (!p.forzaDuplicato){
    const rigaDup = _cercaDuplicato_(sh, headers, p);
    if (rigaDup) return { duplicato: true, riga: rigaDup };
  }

  const row = new Array(headers.length).fill("");
  const setCol = (aliases, val) => {
    const c = _findCol(headers, aliases);
    if (c) row[c-1] = val;
    else if (val) Logger.log(`⚠️ salvaSpesa: colonna '${aliases[0]}' non trovata, valore scartato`);
  };

  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");

  if (p.foto){
    const imgFolder = getOrCreateFolder(CONFIG.CARTELLA_IMMAGINI);
    const nome = "SC_" + ts + ".jpg";
    imgFolder.createFile(Utilities.newBlob(Utilities.base64Decode(p.foto), p.fotoMime || "image/jpeg", nome));
    setCol(["Foto"], CONFIG.CARTELLA_IMMAGINI + "/" + nome);
  }

  if (p.fotoBancomat){
    const imgFolder = getOrCreateFolder(CONFIG.CARTELLA_IMMAGINI);
    const nome = "BC_" + ts + ".jpg";
    imgFolder.createFile(Utilities.newBlob(Utilities.base64Decode(p.fotoBancomat), p.fotoBancomatMime || "image/jpeg", nome));
    setCol(["FotoBancomat", "Foto Bancomat"], CONFIG.CARTELLA_IMMAGINI + "/" + nome);
  }

  // pagamento allegato come PDF (salvato nella cartella file, non immagini)
  if (p.pdfBancomat){
    const filesFolder = getOrCreateFolder(CONFIG.CARTELLA_FILES);
    const nome = "BC_" + ts + ".pdf";
    filesFolder.createFile(Utilities.newBlob(Utilities.base64Decode(p.pdfBancomat), "application/pdf", nome));
    setCol(["FotoBancomat", "Foto Bancomat"], CONFIG.CARTELLA_FILES + "/" + nome);
  }

  if (p.pdf){
    const filesFolder = getOrCreateFolder(CONFIG.CARTELLA_FILES);
    const nome = "DOC_" + ts + ".pdf";
    filesFolder.createFile(Utilities.newBlob(Utilities.base64Decode(p.pdf), "application/pdf", nome));
    setCol(["PDF"], CONFIG.CARTELLA_FILES + "/" + nome);
  }

  // La data va scritta come oggetto Date, NON come stringa: setValue("12/06/2026")
  // verrebbe reinterpretato secondo il locale del foglio (in locale US → 6 dic),
  // facendo finire la spesa nel mese sbagliato e sparire dal totale del mese.
  // Con un Date il valore è univoco. Fallback alla stringa se non parsabile.
  const dataObj = parseDateGeneric(p.data);
  setCol(["Data"], dataObj || String(p.data || "").trim());
  setCol(["Totale"], String(p.totale || "").trim());
  setCol(["Negozio"], String(p.negozio || "").trim());
  setCol(["Categoria"], String(p.categoria || "").trim());
  setCol(["Ospiti_Interni"], String(p.ospitiInterni || "").trim());
  setCol(["Ospiti_Esterni"], String(p.ospitiEsterni || "").trim());
  setCol(["Note"], String(p.note || "").trim());
  setCol(["Testo_scontrino", "Testo scontrino"], String(p.testo || "").trim());
  setCol(["ID"], Utilities.getUuid());  // chiave stabile della riga

  sh.appendRow(row);
  return sh.getLastRow();
}


// ===================== MODIFICA SPESA ESISTENTE (da PWA) ==================

// I numeri di riga inviati dalla PWA possono diventare obsoleti (es. una riga
// eliminata nel frattempo li fa scalare): prima di modificare/eliminare si
// verifica che data e totale ORIGINALI della spesa selezionata coincidano
// ancora con la riga. Se la PWA non invia i riferimenti (client vecchio), il
// controllo è saltato per compatibilità.
function _verificaRiga_(sh, headers, riga, p){
  if (p.rifData === undefined && p.rifTotale === undefined) return;
  const cData = _findCol(headers, ["Data"]);
  const cTot = _findCol(headers, ["Totale"]);
  if (!cData || !cTot) return;
  const vals = sh.getRange(riga, 1, 1, sh.getLastColumn()).getValues()[0];

  const tz = Session.getScriptTimeZone();
  const dRiga = parseDateGeneric(vals[cData - 1]);
  const dRif = parseDateGeneric(p.rifData);
  const dataOk = (!dRiga || !dRif)
    ? true  // data illeggibile da un lato: non blocco
    : Utilities.formatDate(dRiga, tz, "yyyy-MM-dd") === Utilities.formatDate(dRif, tz, "yyyy-MM-dd");
  const totOk = Math.abs(parseImporto(vals[cTot - 1]) - parseImporto(p.rifTotale)) <= 0.005;

  if (!dataOk || !totOk){
    throw new Error("La spesa selezionata non corrisponde più a questa riga (l'elenco è cambiato): ricarica e riprova");
  }
}

function aggiornaSpesa(p){
  const sh = getFoglioSpese_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // Se la spesa ha un ID univoco è la chiave primaria: la riga si risolve per
  // ID (robusto a riordini/eliminazioni). Solo per le righe legacy senza ID si
  // usa il numero di riga con verifica dell'impronta data+totale.
  let riga;
  if (p.id){
    riga = _trovaRigaPerID_(sh, headers, p.id);
    if (!riga) throw new Error("Spesa non trovata (potrebbe essere stata eliminata): ricarica e riprova");
  } else {
    riga = parseInt(p.riga);
    if (isNaN(riga) || riga < 2 || riga > sh.getLastRow()){
      throw new Error("Riga non valida: " + p.riga);
    }
    _verificaRiga_(sh, headers, riga, p);
  }

  const setCella = (aliases, val) => {
    const c = _findCol(headers, aliases);
    if (c) sh.getRange(riga, c).setValue(val);
  };

  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");

  // sostituzione con FOTO: nuovo file nella cartella immagini, il vecchio nel cestino
  const sostituisciFoto = (aliases, b64, mime, prefisso) => {
    if (!b64) return;
    const c = _findCol(headers, aliases);
    if (!c) return;
    const imgFolder = getOrCreateFolder(CONFIG.CARTELLA_IMMAGINI);
    const vecchioPath = String(sh.getRange(riga, c).getValue() || "");
    const nome = prefisso + "_" + ts + ".jpg";
    imgFolder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime || "image/jpeg", nome));
    sh.getRange(riga, c).setValue(CONFIG.CARTELLA_IMMAGINI + "/" + nome);
    cestinaFileCollegato_(vecchioPath);  // il vecchio può essere foto o PDF
  };

  // sostituzione con PDF: nuovo file nella cartella file, il vecchio nel cestino
  const sostituisciPdf = (aliases, b64, prefisso) => {
    if (!b64) return;
    const c = _findCol(headers, aliases);
    if (!c) return;
    const filesFolder = getOrCreateFolder(CONFIG.CARTELLA_FILES);
    const vecchioPath = String(sh.getRange(riga, c).getValue() || "");
    const nome = prefisso + "_" + ts + ".pdf";
    filesFolder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), "application/pdf", nome));
    sh.getRange(riga, c).setValue(CONFIG.CARTELLA_FILES + "/" + nome);
    cestinaFileCollegato_(vecchioPath);
  };

  // svuota una colonna cestinando il file che vi era referenziato
  const svuotaColonna = (aliases) => {
    const c = _findCol(headers, aliases);
    if (!c) return;
    const vecchioPath = String(sh.getRange(riga, c).getValue() || "");
    if (!vecchioPath) return;
    sh.getRange(riga, c).setValue("");
    cestinaFileCollegato_(vecchioPath);
  };

  // SCONTRINO: la foto va nella colonna Foto, il PDF nella colonna PDF. Cambiando
  // tipo si azzera l'altra colonna, così non restano due versioni dello scontrino.
  if (p.foto){ sostituisciFoto(["Foto"], p.foto, p.fotoMime, "SC"); svuotaColonna(["PDF"]); }
  if (p.pdf){ sostituisciPdf(["PDF"], p.pdf, "DOC"); svuotaColonna(["Foto"]); }

  // PAGAMENTO (bancomat): foto o PDF, stessa colonna FotoBancomat
  sostituisciFoto(["FotoBancomat", "Foto Bancomat"], p.fotoBancomat, p.fotoBancomatMime, "BC");
  sostituisciPdf(["FotoBancomat", "Foto Bancomat"], p.pdfBancomat, "BC");

  // Data come oggetto Date, non stringa (vedi nota in salvaSpesa: altrimenti il
  // locale del foglio può spostarla di mese)
  if (p.data !== undefined && p.data !== null){
    const dataObj = parseDateGeneric(p.data);
    setCella(["Data"], dataObj || String(p.data).trim());
  }

  // campi testuali: si aggiornano solo quelli presenti nella richiesta (così la
  // PWA può inviare solo i campi cambiati). 'testo' arriva solo quando si
  // ri-scansiona lo scontrino dall'editor, per tenere allineata la trascrizione.
  [
    [["Totale"], p.totale],
    [["Negozio"], p.negozio],
    [["Categoria"], p.categoria],
    [["Ospiti_Interni"], p.ospitiInterni],
    [["Ospiti_Esterni"], p.ospitiEsterni],
    [["Note"], p.note],
    [["Testo_scontrino", "Testo scontrino"], p.testo]
  ].forEach(([aliases, val]) => {
    if (val !== undefined && val !== null) setCella(aliases, String(val).trim());
  });

  return riga;
}


// ===================== ELIMINA SPESA (da PWA) ============================

// Cancella la riga dal foglio e cestina i file collegati (foto, bancomat, PDF).
// ATTENZIONE: deleteRow fa scalare di 1 il numero di tutte le righe successive,
// quindi la PWA deve ricaricare l'elenco dopo l'eliminazione (i "riga" in cache
// diventano obsoleti).
function eliminaSpesa(p){
  const sh = getFoglioSpese_();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  // Riga risolta per ID quando presente (chiave stabile); fallback legacy sul
  // numero di riga con verifica dell'impronta.
  let riga;
  if (p.id){
    riga = _trovaRigaPerID_(sh, headers, p.id);
    if (!riga) throw new Error("Spesa non trovata (potrebbe essere già stata eliminata): ricarica e riprova");
  } else {
    riga = parseInt(p.riga);
    if (isNaN(riga) || riga < 2 || riga > sh.getLastRow()){
      throw new Error("Riga non valida: " + p.riga);
    }
    _verificaRiga_(sh, headers, riga, p);
  }

  [["Foto"], ["FotoBancomat", "Foto Bancomat"], ["PDF"]].forEach(aliases => {
    const c = _findCol(headers, aliases);
    if (!c) return;
    cestinaFileCollegato_(String(sh.getRange(riga, c).getValue() || "").trim());
  });

  sh.deleteRow(riga);
  return true;
}


// ===================== FUNZIONI DI TEST ==================================

function testChiusuraMeseCorrente() {
  const oggi = new Date();
  const risultato = chiudiMeseManuale(oggi.getFullYear(), oggi.getMonth() + 1);
  Logger.log(risultato.messaggio + (risultato.pdfUrl ? "\nPDF: " + risultato.pdfUrl : ""));
}

// Prende il primo file (immagine o PDF) trovato nelle cartelle e lo manda a Claude
function testClaudeVision() {
  Logger.log("🧪 Test estrazione Claude Vision");
  let file = null;
  const imgFolder = getFolderCached(CONFIG.CARTELLA_IMMAGINI);
  if (imgFolder){
    const files = imgFolder.getFiles();
    if (files.hasNext()) file = files.next();
  }
  if (!file){
    const filesFolder = getFolderCached(CONFIG.CARTELLA_FILES);
    if (filesFolder){
      const files = filesFolder.getFiles();
      if (files.hasNext()) file = files.next();
    }
  }
  if (!file){ Logger.log("❌ Nessun file trovato nelle cartelle"); return; }
  Logger.log("📄 File di test: " + file.getName());
  const blob = getBlobPerAI(file);
  if (!blob){ Logger.log("❌ getBlobPerAI ha restituito null"); return; }
  const dati = estraiDatiConClaude(blob);
  Logger.log(dati ? JSON.stringify(dati, null, 2) : "❌ Estrazione fallita");
}


// ===================== AUTENTICAZIONE ENDPOINT ===========================

function verificaToken_(token){
  const atteso = _prop("API_TOKEN");
  if (!atteso){
    Logger.log("⚠️ API_TOKEN non impostato nelle Script Properties: endpoint SENZA autenticazione");
    return true;
  }
  return String(token || "") === atteso;
}


// ===================== ENDPOINT WEB APP (doGet) ===========================
function doGet(e){
  try{
    if (!verificaToken_(e?.parameter?.token)){
      return ContentService.createTextOutput("Accesso negato");
    }

    const a = e?.parameter?.action;

    if (a === "chiudi_mese"){
      const t = new Date();
      let m = t.getMonth() + 1, y = t.getFullYear();
      m--;
      if (m === 0) { m = 12; y--; }
      const r = chiudiMeseManuale(y, m);
      return ContentService.createTextOutput(r.messaggio + (r.pdfUrl ? "\nPDF: " + r.pdfUrl : ""));
    }

    if (a === "chiudi_mese_manual"){
      const y = parseInt(String(e.parameter.anno||"").trim());
      const m = parseInt(String(e.parameter.mese||"").trim());
      if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
        return ContentService.createTextOutput("Parametri non validi");
      }
      try {
        const r = chiudiMeseManuale(y, m);
        return ContentService.createTextOutput(r.messaggio + (r.pdfUrl ? "\nPDF: " + r.pdfUrl : ""));
      } catch(err) {
        return ContentService.createTextOutput(`Errore: ${err.message}`);
      }
    }

    if (a === "controlla_ocr" || a === "scansiona"){
      controllaNuoviScontrini();
      return ContentService.createTextOutput("Scansione AI completata");
    }

    return ContentService.createTextOutput("Azione non valida");

  }catch(err){
    return ContentService.createTextOutput(`Errore: ${err.message}`);
  }
}


// ===================== ENDPOINT API PER LA PWA (doPost) ==================
// Riceve JSON: { action, token, ...campi }
// Azioni:
//   ping     → verifica connessione e token
//   analizza → { foto: base64, fotoMime } OPPURE { pdf: base64 } → dati estratti
//              da Claude Vision (immagine o PDF)
//   salva    → { foto?, fotoBancomat?, pdfBancomat?, pdf?, data, totale, negozio,
//                categoria, ospitiInterni?, ospitiEsterni?, note?, testo? } → nuova riga
//   aggiorna → { id? o riga, ...campi (foto?/fotoBancomat?/pdfBancomat?) } → aggiorna
//   elimina  → { id? o riga } → cancella la riga e cestina i file collegati
//   cerca    → { query?, periodo? "yyyy-MM" o "yyyy" } → spese (+ haAllegati)
//   allegati → { riga } → URL Drive di foto/PDF di quella spesa
function doPost(e){
  const out = (obj) => ContentService.createTextOutput(JSON.stringify(obj))
                                     .setMimeType(ContentService.MimeType.JSON);
  try{
    const body = JSON.parse(e.postData.contents);

    if (!verificaToken_(body.token)){
      return out({ ok: false, errore: "Token non valido" });
    }

    if (body.action === "ping"){
      return out({ ok: true, versione: "4.11.0" });
    }

    if (body.action === "usage"){
      return out({ ok: true, usage: leggiUsoApi_() });
    }

    if (body.action === "ricarica"){
      return out({ ok: true, usage: ricaricaCredito_(body.importo) });
    }

    if (body.action === "cerca"){
      return out({ ok: true, spese: cercaSpese(body) });
    }

    if (body.action === "riepiloghi"){
      return out({ ok: true, riepiloghi: listaRiepiloghi() });
    }

    if (body.action === "allegati"){
      return out({ ok: true, allegati: allegatiSpesa(body) });
    }

    if (body.action === "chiudi_mese"){
      const y = parseInt(body.anno), m = parseInt(body.mese);
      if (isNaN(y) || isNaN(m) || m < 1 || m > 12){
        return out({ ok: false, errore: "Mese/anno non validi" });
      }
      const r = chiudiMeseManuale(y, m);
      return out({ ok: true, messaggio: r.messaggio, pdfUrl: r.pdfUrl });
    }

    if (body.action === "analizza"){
      let blob;
      if (body.pdf){
        blob = Utilities.newBlob(Utilities.base64Decode(body.pdf), "application/pdf", "scontrino.pdf");
      } else if (body.foto){
        blob = Utilities.newBlob(Utilities.base64Decode(body.foto), body.fotoMime || "image/jpeg", "scontrino.jpg");
      } else {
        return out({ ok: false, errore: "Nessun file ricevuto" });
      }
      const dati = estraiDatiConClaude(blob);
      if (!dati) return out({ ok: false, errore: "Estrazione AI fallita, compila i campi manualmente" });
      return out({ ok: true, dati: dati });
    }

    // Le scritture sono serializzate con un lock (niente append/aggiornamenti
    // concorrenti se arrivano due richieste ravvicinate).
    if (body.action === "salva"){
      const esito = _conLockScrittura(() => salvaSpesa(body));
      if (esito && esito.duplicato){
        return out({ ok: false, duplicato: true,
                     errore: "Spesa identica già presente (riga " + esito.riga + ")" });
      }
      return out({ ok: true, riga: esito });
    }

    if (body.action === "aggiorna"){
      const riga = _conLockScrittura(() => aggiornaSpesa(body));
      return out({ ok: true, riga: riga });
    }

    if (body.action === "elimina"){
      _conLockScrittura(() => eliminaSpesa(body));
      return out({ ok: true });
    }

    return out({ ok: false, errore: "Azione non valida" });

  }catch(err){
    return out({ ok: false, errore: err.message });
  }
}
