// Structure only for the /enterprise page. Text lives in _data/i18n/enterprise/*
// (surfaced as `t.enterprise`). Arrays here zip by index with the i18n arrays,
// the same contract _data/landing.js keeps with the landing copy.

// Each logo carries its intrinsic size so the wall reserves its box before the
// lazy image arrives. Names are proper nouns, so they are not translated.
const logo = (file, name, w, h) => ({ file, name, w, h });

export default {
  // The URL segment under every locale root ("/enterprise/", "/es/enterprise/").
  path: "enterprise/",

  contact: {
    // Every "Book a discovery call" on the page opens this, in a new tab.
    booking: "https://calendly.com/gethouston/30min",
    people: ["felipe", "julian"],
  },

  // Zips with t.enterprise.hero.industries. Photos are 1080x810, one series
  // (a single object against a plain ground) with one grade (sources: assets/img/enterprise/README.md), all
  // below the fold, so all lazy.
  industries: [
    { id: "logistics" },
    { id: "real-estate" },
    { id: "retail" },
    { id: "banking" },
    { id: "insurance" },
    { id: "manufacturing" },
  ],

  // Zips with t.enterprise.problem.cards: the photo behind each reason, at
  // assets/img/enterprise/problem/<id>.webp (960x960, same series).
  problems: ["owns", "build", "connected", "followthrough"],

  // The hero reel: industries in pairs, looped. Each pair is the industry,
  // then a person in it working on a tablet, which is where an agent would
  // meet them. Each clip is a ~4 s, muted, graded cut with its first frame as
  // poster at <reelDir>/<id>.{mp4,webp} (Mixkit stock, free license; sources
  // and cuts: README in that folder).
  reelDir: "/assets/video/enterprise",
  reel: [
    "logistics-1",
    "factory-tablet",
    "retail-shelves",
    "grocery-tablet",
    "warehouse-dock",
    "inspectors-tablet",
    "energy-windfarm",
    "field-tablet",
  ],

  // The proof line's figure: agents at work. The i18n `trust.value` is this
  // number formatted per locale; the test keeps the two in step.
  agents: 10000,

  logos: [
    logo("14b-venture-capital", "14B Venture Capital", 175, 120),
    logo("30x-escuela-de-negocios", "30X Escuela de Negocios", 349, 120),
    logo("aluri", "Aluri", 437, 120),
    logo("asx", "ASX", 367, 120),
    logo("avid-holdings", "Avid Holdings", 520, 101),
    logo("boston-university", "Boston University", 168, 120),
    logo("celya", "CELYA", 393, 120),
    logo("cme-digital", "CME Digital", 520, 100),
    logo("cokrea", "Cokrea", 206, 120),
    logo("cun", "Corporación Unificada Nacional (CUN)", 401, 120),
    logo("crubyt", "Crubyt", 315, 120),
    logo("factcil", "Factcil", 504, 120),
    logo("galaico", "Galaico", 251, 120),
    logo("gam-consultores", "GAM Consultores", 135, 120),
    logo("global66", "Global66", 120, 120),
    logo("habi", "Habi", 126, 120),
    logo("harvard-college", "Harvard College", 102, 120),
    logo("ingenio-avaluos", "Ingenio Avalúos", 425, 120),
    logo("littio", "Littio", 120, 120),
    logo("logical-media-group", "Logical Media Group", 367, 120),
    logo("m2c", "M2C", 171, 120),
    logo("mceasy", "McEasy", 263, 120),
    logo("mco-global", "MCO Global", 315, 120),
    logo("measured-capital", "Measured Capital", 520, 61),
    logo("micropower-direct", "MicroPower Direct", 345, 120),
    logo("minze-health", "Minze Health", 409, 120),
    logo("mood", "Mood", 179, 120),
    logo("myontec", "Myontec", 115, 120),
    logo("new-ventures-group", "New Ventures Group", 168, 120),
    logo("nebula", "nëbula", 90, 120),
    logo("ontop", "Ontop", 171, 120),
    logo("opres-media", "Opres Media", 321, 120),
    logo("pezz", "Pezz", 252, 120),
    logo("politecnico-grancolombiano", "Politécnico Grancolombiano", 101, 120),
    logo("startup-grind", "Startup Grind", 120, 120),
    logo("studio-tercera", "Studio Tercera", 358, 120),
    logo("sunfarmer", "Sunfarmer", 520, 108),
    logo("taxflow", "TaxFlow", 102, 120),
    logo("tpaga", "Tpaga", 91, 120),
    logo("trackimo", "Trackimo", 520, 116),
    logo("troop", "TROOP", 520, 115),
    logo("true-blue", "True Blue", 163, 120),
    logo("tul", "TUL", 135, 120),
    logo("universidad-de-el-salvador", "Universidad de El Salvador", 120, 120),
    logo("university-of-alberta", "University of Alberta", 120, 120),
    logo("upsellerate", "UPSELLerate", 436, 120),
    logo("yalo", "Yalo", 120, 120),
  ],
};
