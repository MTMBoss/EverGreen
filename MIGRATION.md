# Migrazione del refactor EverGreen

## Obiettivo
Portare il codice live del bot dalla struttura attuale flat ai moduli in `src/`.

## Passi consigliati

### 1. Backup dei file root attuali
- `index.js`
- `scheduler.js`
- `configStore.js`

### 2. Sostituzione graduale
Opzione consigliata:
- mantenere `deploy-commands.js` com'è
- far puntare il nuovo entrypoint principale a `src/bot/index.js`
- spostare progressivamente le importazioni del root verso `src/`

### 3. Verifiche manuali
- comando contestuale `Pubblica Match`
- comando contestuale `Prepara Parte 2`
- slash command di configurazione canali
- generazione schedule del venerdì
- rimozione reaction giornaliera

### 4. Pulizia repo
- assicurarsi che `.env` e `config.json` non vengano committati
- aggiungere uno script di test reale
- aggiungere un controllo sintattico pre-deploy

## File nuovi
- `src/bot/index.js`
- `src/config/configStore.js`
- `src/scheduler/index.js`
- `src/services/publishService.js`
- `src/utils/matchParser.js`

## Limite operativo di questo turno
I tool GitHub esposti qui permettono creazione branch/file/commit/PR, ma non mi hanno consentito un update in-place affidabile dei file già esistenti del root senza ricostruire l'intero tree. Per questo ho preparato e pushato una versione rifattorizzata pronta all'integrazione, invece di riscrivere direttamente i file live del branch `main`.
