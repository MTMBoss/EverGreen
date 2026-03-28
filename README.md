# EverGreen

Bot Discord per pubblicazione match e gestione schedule settimanale.

## Stato attuale del repo

Il codice live attuale è ancora nei file root (`index.js`, `scheduler.js`, `configStore.js`).
In questo branch ho aggiunto una versione rifattorizzata e modulare sotto `src/` per facilitare il passaggio graduale senza rompere subito il bot in produzione.

## Refactor aggiunto in questo branch

- `src/utils/matchParser.js`: parsing centralizzato dei messaggi match.
- `src/services/publishService.js`: composizione e pubblicazione Parte 1 / Parte 2.
- `src/config/configStore.js`: normalizzazione e aggiornamento config.
- `src/scheduler/index.js`: scheduler separato e riutilizzabile.
- `src/bot/index.js`: entrypoint bot più pulito e leggibile.

## Problemi risolti a livello strutturale

- logica del parser rimossa da `index.js`
- logica di pubblicazione separata dal listener Discord
- config normalizzata in un solo punto
- scheduler separato dalla gestione interazioni
- base pronta per test e migrazione progressiva

## Variabili ambiente

Crea un file `.env` partendo da `.env.example`.

## Esecuzione attuale

Il progetto originale usa:

```bash
npm install
npm run deploy
npm start
```

## Migrazione consigliata

1. Validare i file nuovi sotto `src/`
2. Sostituire i file root con wrapper o import dai moduli in `src/`
3. Aggiungere uno script di test/lint reale
4. Ignorare `config.json` e `.env` nel repository

## Nota importante

Con gli strumenti GitHub disponibili qui riesco a creare branch, file, commit e PR in sicurezza. In questo turno non ho aggiornato direttamente i file root esistenti perché l'interfaccia esposta non mi dà un update in-place affidabile dei contenuti già presenti senza ricostruire l'intero tree del commit. Ho quindi pushato una rifattorizzazione concreta, pronta da integrare in un secondo passaggio pulito.
