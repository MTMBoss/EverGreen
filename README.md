# EverGreen

Bot Discord e pannello web per presenze, roster, calendario e gestione match.

## Setup dopo il clone

```powershell
git clone https://github.com/MTMBoss/EverGreen.git
cd EverGreen
npm ci
Copy-Item .env.example .env
```

Compila `.env` con i valori del bot Discord, del server e del database PostgreSQL.
Le variabili minime per l'avvio sono:

- `TOKEN`
- `CLIENT_ID`
- `GUILD_ID`
- `DATABASE_URL`
- `WEB_ADMIN_TOKEN`

Per usare l'API roster aggiungi anche `ROSTER_API_TOKEN`. Se non viene impostato,
l'API usa `WEB_ADMIN_TOKEN` come fallback.

Avvio:

```powershell
npm start
```

## Configurazione

`config.json` e' una configurazione locale legacy e non deve essere committata.
La configurazione runtime viene salvata nella tabella `app_config` del database.
Per creare un file locale di esempio:

```powershell
Copy-Item config.example.json config.json
```

## Pannello web

Il pannello admin usa `WEB_ADMIN_TOKEN` e include:

- `/dashboard` riepilogo operativo del giorno
- `/presenze` registro giornaliero con confronto tra reaction schedule e presenze reali
- `/calendario` vista mensile
- `/roster` gestione nomi in-game dei membri sincronizzati da Discord

## API roster

Su `main` sono disponibili:

- `GET /api/roster`
- `POST /api/roster/sync`

Autenticazione supportata:

- header `Authorization: Bearer <ROSTER_API_TOKEN>`
- header `X-Roster-Token: <ROSTER_API_TOKEN>`
- query `?token=<ROSTER_API_TOKEN>`
