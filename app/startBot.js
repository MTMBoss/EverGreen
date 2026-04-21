require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

const { initializeConfigStore } = require("../config/configStore");
const { initializeAttendance } = require("../attendance/attendanceService");
const { registerClientEvents } = require("./registerClientEvents");

initializeAttendance();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

registerClientEvents(client);

initializeConfigStore()
  .then(() => client.login(process.env.TOKEN))
  .catch(error => {
    console.error("❌ Errore inizializzazione config store:", error);
    process.exit(1);
  });
