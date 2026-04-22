export type Role = "Slayer" | "Anchor" | "Support" | "Captain" | "Sub" | "Coach" | "Manager" | "Flex";
export type Status = "Attivo" | "Riserva" | "Infortunato" | "Inattivo";

export interface Player {
  id: string;
  gamertag: string;
  firstName: string;
  role: Role;
  weapons: string[];
  status: Status;
  kd: number;
  winRate: number;
  flag: string;
}

export const TEAM_ROSTER: Player[] = [
  { id: "p1", gamertag: "Vipër", firstName: "Lorenzo", role: "Slayer", weapons: ["Fennec", "Switchblade X9"], status: "Attivo", kd: 1.84, winRate: 68.5, flag: "IT" },
  { id: "p2", gamertag: "NyxZ", firstName: "Matteo", role: "Captain", weapons: ["Krig 6", "CBR4"], status: "Attivo", kd: 1.52, winRate: 72.1, flag: "IT" },
  { id: "p3", gamertag: "Saetta", firstName: "Alessandro", role: "Anchor", weapons: ["Holger 26", "SKS"], status: "Attivo", kd: 1.35, winRate: 65.0, flag: "IT" },
  { id: "p4", gamertag: "Krono", firstName: "Gabriele", role: "Support", weapons: ["M13", "Kilo 141"], status: "Attivo", kd: 1.28, winRate: 64.2, flag: "IT" },
  { id: "p5", gamertag: "Dust07", firstName: "Riccardo", role: "Flex", weapons: ["DR-H", "QQ9"], status: "Attivo", kd: 1.45, winRate: 66.8, flag: "IT" },
  { id: "p6", gamertag: "Vanta", firstName: "Marco", role: "Sub", weapons: ["Locus", "DL Q33"], status: "Riserva", kd: 1.95, winRate: 61.0, flag: "IT" },
  { id: "p7", gamertag: "Reload", firstName: "Davide", role: "Slayer", weapons: ["MAC-10", "Fennec"], status: "Infortunato", kd: 1.66, winRate: 59.4, flag: "IT" },
  { id: "p8", gamertag: "Echo", firstName: "Simone", role: "Anchor", weapons: ["AK117", "Oden"], status: "Attivo", kd: 1.41, winRate: 63.5, flag: "IT" },
  { id: "p9", gamertag: "Zeta", firstName: "Andrea", role: "Coach", weapons: [], status: "Attivo", kd: 0, winRate: 0, flag: "IT" },
  { id: "p10", gamertag: "Nexus", firstName: "Luca", role: "Manager", weapons: [], status: "Attivo", kd: 0, winRate: 0, flag: "IT" }
];

export interface Loadout {
  id: string;
  name: string;
  weapon: string;
  class: "AR" | "SMG" | "Sniper" | "LMG" | "Shotgun";
  attachments: string[];
  perks: string[];
  operatorSkill: string;
  map: string;
  authorId: string;
  tags: string[];
  featured?: boolean;
  stats?: {
    damage: number;
    range: number;
    accuracy: number;
    mobility: number;
    control: number;
  };
  privateNotes?: string;
  isPrivate?: boolean;
}

export const LOADOUTS: Loadout[] = [
  {
    id: "l1",
    name: "Vipër's Fennec Rush",
    weapon: "Fennec",
    class: "SMG",
    attachments: ["Monolithic Suppressor", "MIP Extended Light Barrel", "YKM Combat Stock", "Ranger Foregrip", "Extended Mag A"],
    perks: ["Lightweight", "Quick Fix", "Hardline"],
    operatorSkill: "Purifier",
    map: "Crash",
    authorId: "p1",
    tags: ["Aggressive", "Entry Fragger", "Close Range"],
    featured: true,
    stats: { damage: 45, range: 40, accuracy: 55, mobility: 95, control: 40 },
    privateNotes: "Use this to breach A-site on Crash. Pre-aim top red.",
    isPrivate: true
  },
  {
    id: "l2",
    name: "Anchor Hold AR",
    weapon: "AK117",
    class: "AR",
    attachments: ["OWC Marksman", "No Stock", "OWC Laser - Tactical", "Strike Foregrip", "40 Round Extended Mag"],
    perks: ["Flak Jacket", "Toughness", "Dead Silence"],
    operatorSkill: "Transform Shield",
    map: "Standoff",
    authorId: "p3",
    tags: ["Anchor", "Objective", "Mid Range"],
    featured: true,
    stats: { damage: 60, range: 65, accuracy: 70, mobility: 65, control: 75 }
  },
  {
    id: "l3",
    name: "Vanta Sniper Line",
    weapon: "Locus",
    class: "Sniper",
    attachments: ["YKM Lightweight Short", "OWC Skeleton Stock", "OWC Laser - Tactical", "Stippled Grip Tape", "FMJ"],
    perks: ["Agile", "Toughness", "High Alert"],
    operatorSkill: "Annihilator",
    map: "Crossfire",
    authorId: "p6",
    tags: ["Sniper", "Long Range", "Support"],
    featured: true,
    stats: { damage: 95, range: 90, accuracy: 60, mobility: 45, control: 30 },
    privateNotes: "Hold mid-street from defense spawn. Rotate to B if smoke pops.",
    isPrivate: true
  },
  {
    id: "l4",
    name: "Flex Flex-Krig",
    weapon: "Krig 6",
    class: "AR",
    attachments: ["Agency Tracker", "Taskforce Barrel", "Agile Stock", "Firm Grip Tape", "Large Extended Mag B"],
    perks: ["Skulker", "Cold-Blooded", "Dead Silence"],
    operatorSkill: "Kinetic Armor",
    map: "Summit",
    authorId: "p2",
    tags: ["Flex", "Versatile", "Captain"],
    stats: { damage: 65, range: 60, accuracy: 75, mobility: 70, control: 65 }
  },
  {
    id: "l5",
    name: "CQB Shredder",
    weapon: "MAC-10",
    class: "SMG",
    attachments: ["Agency Suppressor", "6.2\" Cavalry Lancer", "SAS Combat Stock", "Striker Foregrip", "STANAG 53 Rnd Drum"],
    perks: ["Lightweight", "Vulture", "Hardline"],
    operatorSkill: "Gravity Spikes",
    map: "Firing Range",
    authorId: "p7",
    tags: ["Slayer", "Mobility", "Flank"]
  }
];

export interface Scrim {
  id: string;
  opponent: string;
  date: string; // ISO
  format: string; // e.g. "Best of 5"
  modes: string[];
  maps: string[];
  lineup: { role: string; playerId: string }[];
  status: "Confermato" | "Da Confermare" | "Annullato" | "Completato";
  notes?: string;
  score?: string; // "3 - 1"
  isPrivate?: boolean;
  privateStrategy?: string;
}

export const SCRIMS: Scrim[] = [
  {
    id: "s1",
    opponent: "Nova Esports ITA",
    date: "2026-10-15T21:00:00Z",
    format: "Best of 5",
    modes: ["Hardpoint", "Search & Destroy", "Control", "Hardpoint", "Search & Destroy"],
    maps: ["Standoff", "Crash", "Raid", "Summit", "Crossfire"],
    lineup: [
      { role: "Captain", playerId: "p2" },
      { role: "Slayer", playerId: "p1" },
      { role: "Anchor", playerId: "p3" },
      { role: "Support", playerId: "p4" },
      { role: "Flex", playerId: "p5" }
    ],
    status: "Confermato",
    notes: "Attenzione ai loro push su B. Giocano molto aggressivi.",
    isPrivate: true,
    privateStrategy: "Focus su P2 per l'Anchor. Il Flex deve ruotare prima su P3. Se perdiamo P1, reset completo e hold per P2."
  },
  {
    id: "s2",
    opponent: "Crimson Elite",
    date: "2026-10-16T22:00:00Z",
    format: "Best of 3",
    modes: ["Hardpoint", "Search & Destroy", "Control"],
    maps: ["Firing Range", "Standoff", "Takeoff"],
    lineup: [
      { role: "Captain", playerId: "p2" },
      { role: "Slayer", playerId: "p1" },
      { role: "Anchor", playerId: "p8" },
      { role: "Support", playerId: "p4" },
      { role: "Sniper", playerId: "p6" }
    ],
    status: "Da Confermare",
    notes: "In attesa di conferma host."
  },
  {
    id: "s3",
    opponent: "Team QLASH EU",
    date: "2026-10-12T21:30:00Z",
    format: "Best of 5",
    modes: ["Hardpoint", "Search & Destroy", "Control", "Hardpoint", "Search & Destroy"],
    maps: ["Summit", "Crossfire", "Standoff", "Raid", "Crash"],
    lineup: [
      { role: "Captain", playerId: "p2" },
      { role: "Slayer", playerId: "p1" },
      { role: "Anchor", playerId: "p3" },
      { role: "Support", playerId: "p4" },
      { role: "Flex", playerId: "p5" }
    ],
    status: "Completato",
    score: "3 - 2"
  }
];

export const ANNOUNCEMENTS = [
  { id: "a1", date: "2026-10-14T09:00:00Z", title: "Nuovo Orario Scrim", content: "A partire da settimana prossima le scrim ufficiali si terranno alle 21:30 e non più alle 21:00. Aggiornate le presenze.", authorId: "p10" },
  { id: "a2", date: "2026-10-12T15:30:00Z", title: "Vittoria QLASH EU", content: "Ottimo lavoro ragazzi per la win di ieri. NyxZ caricherà i VOD stasera per la review con il coach.", authorId: "p9" },
  { id: "a3", date: "2026-10-10T11:00:00Z", title: "Aggiornamento Loadout", content: "Ho aggiornato la sezione equipaggiamenti con i nuovi setup per il Fennec post-nerf. Testateli in pub.", authorId: "p2" },
  { id: "a4", date: "2026-10-05T18:00:00Z", title: "Benvenuto Vanta", content: "Diamo il benvenuto a Vanta nel roster come Sub Sniper. Si unirà a noi per le scrim di venerdì.", authorId: "p10" }
];

export const RULES = [
  {
    category: "1. Codice di Condotta",
    articles: [
      "1.1 Rispetto reciproco: Ogni membro del team deve mantenere un atteggiamento professionale.",
      "1.2 Divieto di toxic behavior in gioco o chat pubbliche.",
      "1.3 Rappresentanza del brand EverGreen sui social."
    ]
  },
  {
    category: "2. Presenze e Puntualità",
    articles: [
      "2.1 La compilazione del modulo presenze settimanale è obbligatoria entro la domenica sera.",
      "2.2 Ritardo massimo consentito per le scrim: 5 minuti.",
      "2.3 Assenze non giustificate portano a un warning ufficiale."
    ]
  },
  {
    category: "3. Comunicazione in Game",
    articles: [
      "3.1 Utilizzare solo callout standardizzati.",
      "3.2 Mantenere la comms clear durante i round di Search & Destroy.",
      "3.3 Ascoltare sempre le direttive dell'IGL (In-Game Leader)."
    ]
  },
  {
    category: "4. Scrim e Tornei",
    articles: [
      "4.1 Riscaldamento obbligatorio 30 min prima dell'inizio.",
      "4.2 Vietato trasmettere (streaming) le scrim senza consenso.",
      "4.3 VOD review obbligatoria il giorno successivo ai tornei."
    ]
  }
];