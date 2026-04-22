require("dotenv").config();

const crypto = require("crypto");
const {
  REST,
  Routes,
  ApplicationCommandType,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const commands = [
  {
    name: "Pubblica Match",
    type: ApplicationCommandType.Message,
  },
  {
    name: "Prepara Parte 2",
    type: ApplicationCommandType.Message,
  },
  {
    name: "Pubblica PNG",
    type: ApplicationCommandType.Message,
  },

  new SlashCommandBuilder()
    .setName("leaderboard-presenze")
    .setDescription("Genera la leaderboard grafica delle presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("tipo")
        .setDescription("Periodo della classifica")
        .setRequired(false)
        .addChoices(
          { name: "Oggi", value: "oggi" },
          { name: "Settimana", value: "settimana" },
          { name: "Mese", value: "mese" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-leaderboard-presenze")
    .setDescription("Imposta il canale della leaderboard presenze persistente")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale leaderboard")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("tipo")
        .setDescription("Vista predefinita")
        .setRequired(false)
        .addChoices(
          { name: "Oggi", value: "oggi" },
          { name: "Settimana", value: "settimana" },
          { name: "Mese", value: "mese" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("pubblica-leaderboard-presenze")
    .setDescription("Pubblica o aggiorna il messaggio fisso della leaderboard presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("tipo")
        .setDescription("Vista da usare per l'aggiornamento")
        .setRequired(false)
        .addChoices(
          { name: "Oggi", value: "oggi" },
          { name: "Settimana", value: "settimana" },
          { name: "Mese", value: "mese" }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-parte1")
    .setDescription("Imposta il canale di destinazione per la parte 1")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per la parte 1")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-parte2")
    .setDescription("Imposta il canale di destinazione per la parte 2")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per la parte 2")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-png")
    .setDescription("Imposta il canale di destinazione per i match in PNG")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per le immagini match")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-sorgente-parte1")
    .setDescription("Imposta il canale sorgente da cui leggere automaticamente le parti 1")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale sorgente parte 1")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-sorgente-parte2")
    .setDescription("Imposta il canale sorgente da cui leggere automaticamente le parti 2")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale sorgente parte 2")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("import-match-storici")
    .setDescription("Legge tutta la cronologia di due canali match e importa le scrim nel web")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale_parte1")
        .setDescription("Canale sorgente che contiene le parti 1")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("canale_parte2")
        .setDescription("Canale sorgente che contiene le parti 2")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canali-schedule")
    .setDescription("Imposta 1 o 2 canali per lo schedule settimanale")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale1")
        .setDescription("Primo canale schedule")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("canale2")
        .setDescription("Secondo canale schedule")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-annuncio-schedule")
    .setDescription("Imposta il canale dove pubblicare l'annuncio di uscita schedule")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per l'annuncio schedule")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-ruoli-schedule")
    .setDescription("Imposta i ruoli da taggare quando esce lo schedule")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option =>
      option
        .setName("ruolo_obbligatorio")
        .setDescription("Ruolo obbligatorio da taggare sempre")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("ruolo_opzionale")
        .setDescription("Ruolo opzionale da taggare solo se ha membri")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-presenze")
    .setDescription("Imposta il canale dove pubblicare le presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per le presenze")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-canale-promemoria-presenze")
    .setDescription("Imposta il canale dove inviare il promemoria giornaliero presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName("canale")
        .setDescription("Canale testuale per il promemoria presenze")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-utente-promemoria-presenze")
    .setDescription("Imposta l'utente da taggare ogni giorno per il promemoria presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option =>
      option
        .setName("utente")
        .setDescription("Utente da taggare")
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-ruoli-presenze")
    .setDescription("Imposta 1 o 2 ruoli da monitorare per il roster presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option =>
      option
        .setName("ruolo1")
        .setDescription("Primo ruolo da monitorare")
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName("ruolo2")
        .setDescription("Secondo ruolo da monitorare")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("set-url-pannello-presenze")
    .setDescription("Imposta l'URL pubblico del pannello web presenze")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("url")
        .setDescription("URL base del pannello, ad esempio https://dominio.it")
        .setRequired(true)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("presenze-sync")
    .setDescription("Sincronizza il roster presenze dai ruoli configurati")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),

  new SlashCommandBuilder()
    .setName("pubblica-presenze-oggi")
    .setDescription("Pubblica la scheda presenze nel canale configurato")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("data")
        .setDescription("Data nel formato YYYY-MM-DD. Se omessa usa oggi")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("presenze-oggi")
    .setDescription("Mostra il riepilogo presenze del giorno")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("data")
        .setDescription("Data nel formato YYYY-MM-DD. Se omessa usa oggi")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("presenza-set")
    .setDescription("Aggiorna una singola fascia oraria per un membro")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option =>
      option
        .setName("utente")
        .setDescription("Membro da aggiornare")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("fascia")
        .setDescription("Fascia oraria")
        .setRequired(true)
        .addChoices(
          { name: "21-22", value: "21-22" },
          { name: "22-23", value: "22-23" },
          { name: "23-00", value: "23-00" }
        )
    )
    .addBooleanOption(option =>
      option
        .setName("disponibile")
        .setDescription("Segna presente o assente")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("data")
        .setDescription("Data nel formato YYYY-MM-DD. Se omessa usa oggi")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("presenza-set-giornata")
    .setDescription("Aggiorna tutte e 3 le fasce orarie per un membro")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option =>
      option
        .setName("utente")
        .setDescription("Membro da aggiornare")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName("dalle_21")
        .setDescription("Disponibile 21-22")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName("dalle_22")
        .setDescription("Disponibile 22-23")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName("dalle_23")
        .setDescription("Disponibile 23-00")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("data")
        .setDescription("Data nel formato YYYY-MM-DD. Se omessa usa oggi")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("presenze-recap")
    .setDescription("Mostra il recap completo delle presenze del giorno")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("data")
        .setDescription("Data nel formato YYYY-MM-DD. Se omessa usa oggi")
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName("mostra-config")
    .setDescription("Mostra la configurazione attuale del bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

function getCommands() {
  return commands;
}

function getCommandsHash() {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(commands))
    .digest("hex");
}

async function deployCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  return {
    hash: getCommandsHash(),
    count: commands.length,
  };
}

async function ensureCommandsDeployed({
  readHash,
  writeHash,
  force = false,
} = {}) {
  const currentHash = getCommandsHash();
  const deployedHash = typeof readHash === "function" ? readHash() : "";

  if (!force && deployedHash === currentHash) {
    console.log("ℹ️ Comandi Discord già allineati, deploy saltato");
    return {
      deployed: false,
      hash: currentHash,
      count: commands.length,
    };
  }

  const result = await deployCommands();

  if (typeof writeHash === "function") {
    writeHash(result.hash);
  }

  console.log(`✅ Comandi registrati correttamente (${result.count})`);

  return {
    deployed: true,
    hash: result.hash,
    count: result.count,
  };
}

module.exports = {
  getCommands,
  getCommandsHash,
  deployCommands,
  ensureCommandsDeployed,
};
