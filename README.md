# EverGreen Discord Bot

Bot Discord.js v14 per gestione pubblicazione match e schedule settimanale training.

## Requisiti

- Node.js >= 18
- Un'app Discord con bot token valido
- Permessi `Manage Guild` per usare i comandi di configurazione

## Setup rapido

1. Installa dipendenze:
   ```bash
   npm install
   ```
2. Crea il file ambiente:
   ```bash
   cp .env.example .env
   ```
3. Compila almeno le variabili obbligatorie in `.env`:
   - `TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
4. Registra i comandi slash/context menu:
   ```bash
   npm run deploy
   ```
5. Avvia il bot:
   ```bash
   npm start
   ```


## Dove inserire TOKEN, CLIENT_ID, GUILD_ID

Per sicurezza questi valori **non vanno mai committati su GitHub**.

1. Copia il template:
   ```bash
   cp .env.example .env
   ```
2. Inserisci i valori reali nel file `.env` locale:
   ```env
   TOKEN=il_tuo_token_bot
   CLIENT_ID=application_id_discord
   GUILD_ID=id_server_discord
   ```

Il bot legge queste variabili da ambiente all'avvio e in fase di deploy comandi.

## Variabili ambiente

Vedi `.env.example` per l'elenco completo.

### Obbligatorie
- `TOKEN`: bot token Discord
- `CLIENT_ID`: application ID
- `GUILD_ID`: server ID dove deployare i comandi

### Opzionali
- `TARGET_CHANNEL_1`, `TARGET_CHANNEL_2`: fallback iniziali canali match
- `SCHEDULE_CHANNELS`: lista canali schedule separati da virgola
- `SCHEDULE_ANNOUNCE_CHANNEL`: canale annuncio schedule
- `REQUIRED_ROLE_ID`, `OPTIONAL_ROLE_ID`: ruoli per mention annuncio
- `SEPARATOR_PATH`: immagine separatore (default `./assets/separator.png`)
- `CONFIG_PATH`: percorso config runtime (default `./data/config.json`)
- `SCHEDULE_TIMEZONE`: timezone cron (default `Europe/Rome`)
- `SCHEDULE_CREATE_CRON`: cron creazione schedule (default `30 8 * * 5`)
- `SCHEDULE_REACTIONS_CLEANUP_CRON`: cron cleanup reactions (default `0 15 * * *`)

## Script npm

- `npm start` - avvio produzione
- `npm run dev` - avvio con watch (`node --watch`)
- `npm run deploy` - deploy comandi Discord
- `npm test` - test automatici (`node --test`)
- `npm run lint` - syntax check su `src`, `tests`, `scripts`

## Struttura progetto

```text
assets/
data/
scripts/
  deploy-commands.js
src/
  index.js
  bot/
    commands.js
    eventi/
  features/
    match/
    schedule/
  storage/
  utils/
tests/
```

## Note operative

- La configurazione persistente viene salvata in `data/config.json`.
- I comandi slash/context menu esistenti sono mantenuti invariati lato Discord.
- Scheduler, announcement e reaction cleanup sono separati in moduli distinti.
