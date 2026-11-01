// Structure for the requests on /data-partners/refer: what each pays and how
// it is sorted. Text lives in _data/i18n/referListings/* (surfaced as
// `t.referListings`, keyed by slug). Every page reads the amounts already
// formatted for its locale (`fmt`), so no template does money math.

import locales from "./locales.js";
import refer from "./refer.js";

// Ordered by what a referral earns, highest first, as the board shows them.
// `category` is an id from _data/refer.js categories; `tools` are product
// names, the same in every language. The amounts are the reference program's;
// `paid` turns each into what Houston pays (refer.pay).
const reference = [
  {
    slug: "law-firm",
    category: "services",
    dealMinUsd: 50000,
    dealMaxUsd: 1250000,
    referralUsd: 75000,
    bonuses: [],
    tools: ["Relativity", "Everlaw", "iManage", "NetDocuments", "Clio"],
  },
  {
    slug: "accounting",
    category: "finance",
    dealMinUsd: 25000,
    dealMaxUsd: 865000,
    referralUsd: 70000,
    bonuses: [],
    tools: [
      "QuickBooks",
      "Xero",
      "Sage Intacct",
      "CCH",
      "UltraTax",
      "Lacerte",
      "Drake",
      "Bill.com",
    ],
  },
  {
    slug: "investment-firm",
    category: "finance",
    dealMinUsd: 50000,
    dealMaxUsd: 800000,
    referralUsd: 70000,
    bonuses: [],
    tools: [
      "Datasite",
      "Intralinks",
      "DealCloud",
      "Affinity",
      "Excel",
      "PowerPoint",
      "Addepar",
      "Orion",
    ],
  },
  {
    slug: "payments-fintech",
    category: "finance",
    dealMinUsd: 80000,
    dealMaxUsd: 900000,
    referralUsd: 70000,
    bonuses: [],
    tools: [],
  },
  {
    slug: "cybersecurity",
    category: "software",
    dealMinUsd: 20000,
    dealMaxUsd: 750000,
    referralUsd: 65000,
    bonuses: [],
    tools: [
      "Splunk",
      "Microsoft Sentinel",
      "Google SecOps",
      "CrowdStrike",
      "Defender",
      "SentinelOne",
      "Okta",
      "ServiceNow SecOps",
    ],
  },
  {
    slug: "telehealth",
    category: "healthcare",
    dealMinUsd: 100000,
    dealMaxUsd: 900000,
    referralUsd: 60000,
    bonuses: [],
    tools: ["Zoom for Healthcare", "Doxy.me", "In-house visit apps"],
  },
  {
    slug: "imaging-center",
    category: "healthcare",
    dealMinUsd: 80000,
    dealMaxUsd: 620000,
    referralUsd: 60000,
    bonuses: [],
    tools: ["PACS", "RIS", "DICOM", "GE MUSE", "Natus", "Nihon Kohden"],
  },
  {
    slug: "medical-practice",
    category: "healthcare",
    dealMinUsd: 80000,
    dealMaxUsd: 820000,
    referralUsd: 60000,
    bonuses: [],
    tools: [
      "Epic",
      "athenahealth",
      "eClinicalWorks",
      "NextGen",
      "Oracle Health",
      "Elation",
    ],
  },
  {
    slug: "semiconductor",
    category: "science",
    dealMinUsd: 100000,
    dealMaxUsd: 750000,
    referralUsd: 60000,
    bonuses: [],
    tools: [
      "MES",
      "SPC / yield systems",
      "LIMS",
      "Electronic lab notebooks",
      "Cadence",
      "Synopsys",
      "OSIsoft PI",
    ],
  },
  {
    slug: "manufacturing",
    category: "industrial",
    dealMinUsd: 100000,
    dealMaxUsd: 1500000,
    referralUsd: 55000,
    bonuses: [],
    tools: [
      "Mastercam",
      "Fusion CAM",
      "Esprit",
      "Maximo",
      "Fiix",
      "UpKeep",
      "MES",
      "OSIsoft PI",
    ],
  },
  {
    slug: "ai-product",
    category: "software",
    dealMinUsd: 20000,
    dealMaxUsd: 480000,
    referralUsd: 45000,
    bonuses: [],
    tools: [
      "Claude Code",
      "Codex",
      "OpenHands",
      "Cline",
      "OpenRouter",
      "Langfuse",
      "LangSmith",
    ],
  },
  {
    slug: "design-agency",
    category: "services",
    dealMinUsd: 20000,
    dealMaxUsd: 890000,
    referralUsd: 45000,
    bonuses: [],
    tools: [
      "Figma",
      "Adobe Creative Cloud",
      "GitHub",
      "Webflow",
      "Framer",
      "Three.js",
    ],
  },
  {
    slug: "construction",
    category: "industrial",
    dealMinUsd: 115000,
    dealMaxUsd: 1000000,
    referralUsd: 40000,
    bonuses: [],
    tools: [
      "Procore",
      "Autodesk Construction Cloud",
      "Revit",
      "AutoCAD",
      "Bluebeam",
      "Primavera P6",
      "DroneDeploy",
    ],
  },
  {
    slug: "game-studio",
    category: "media",
    dealMinUsd: 100000,
    dealMaxUsd: 1000000,
    referralUsd: 40000,
    bonuses: [],
    tools: [
      "Unity",
      "Unreal Engine",
      "Godot",
      "Perforce",
      "GitHub",
      "Jira",
      "Slack",
      "Discord",
    ],
  },
  {
    slug: "hardware",
    category: "industrial",
    dealMinUsd: 45000,
    dealMaxUsd: 1350000,
    referralUsd: 40000,
    bonuses: [],
    tools: [
      "SolidWorks PDM",
      "PTC Creo",
      "Siemens NX",
      "Autodesk Fusion",
      "Onshape",
      "Altium",
      "KiCad",
      "ANSYS",
    ],
  },
  {
    slug: "publisher",
    category: "media",
    dealMinUsd: 35000,
    dealMaxUsd: 370000,
    referralUsd: 40000,
    bonuses: [],
    tools: ["CMS", "LMS", "XML / EPUB pipelines"],
  },
  {
    slug: "saas-data",
    category: "software",
    dealMinUsd: 55000,
    dealMaxUsd: 350000,
    referralUsd: 40000,
    bonuses: [],
    tools: [
      "Snowflake",
      "BigQuery",
      "Databricks",
      "dbt",
      "Airflow",
      "Fivetran",
      "Looker",
      "Salesforce",
      "NetSuite",
      "Stripe",
    ],
  },
  {
    slug: "video-studio",
    category: "media",
    dealMinUsd: 95000,
    dealMaxUsd: 870000,
    referralUsd: 35000,
    bonuses: [],
    tools: [
      "Frame.io",
      "Adobe Premiere",
      "DaVinci Resolve",
      "Dropbox",
      "Amazon S3",
    ],
  },
  {
    slug: "call-center",
    category: "services",
    dealMinUsd: 20000,
    dealMaxUsd: 250000,
    referralUsd: 30000,
    bonuses: [],
    tools: ["Five9", "Genesys", "NICE", "Talkdesk", "Amazon Connect", "Twilio"],
  },
  {
    slug: "consulting",
    category: "services",
    dealMinUsd: 150000,
    dealMaxUsd: 300000,
    referralUsd: 30000,
    bonuses: [],
    tools: [
      "Microsoft 365",
      "SharePoint",
      "Google Workspace",
      "Box",
      "Dropbox",
    ],
  },
  {
    slug: "consumer-brand",
    category: "media",
    dealMinUsd: 30000,
    dealMaxUsd: 800000,
    referralUsd: 30000,
    bonuses: [],
    tools: [
      "Shopify",
      "Adobe Creative Cloud",
      "Figma",
      "Bynder",
      "Brandfolder",
      "Dropbox",
    ],
  },
  {
    slug: "research-lab",
    category: "science",
    dealMinUsd: 50000,
    dealMaxUsd: 875000,
    referralUsd: 25000,
    bonuses: [],
    tools: ["Benchling", "LabArchives", "Dotmatics", "LIMS", "Medidata Rave"],
  },
  {
    slug: "software-company",
    category: "software",
    dealMinUsd: 50000,
    dealMaxUsd: 500000,
    referralUsd: 25000,
    bonuses: [],
    tools: ["GitHub", "GitLab", "Bitbucket", "Jira", "Linear", "Confluence"],
  },
  {
    slug: "trading-firm",
    category: "finance",
    dealMinUsd: 25000,
    dealMaxUsd: 1150000,
    referralUsd: 15000,
    bonuses: [],
    tools: ["kdb+", "C++", "Rust", "FIX", "Python"],
  },
];

const money = (lang, n, compact) =>
  new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : 0,
    ...(compact && { notation: "compact", roundingMode: "trunc" }),
  }).format(n);

const paid = (item) => ({
  ...item,
  dealMinUsd: refer.pay(item.dealMinUsd),
  dealMaxUsd: refer.pay(item.dealMaxUsd),
  referralUsd: refer.pay(item.referralUsd),
  bonuses: item.bonuses.map((b) => ({
    ...b,
    amountUsd: refer.pay(b.amountUsd),
  })),
});
const items = reference.map(paid);

const withAmounts = (item) => {
  const bonusUsd = item.bonuses.reduce((sum, b) => sum + b.amountUsd, 0);
  const earnUsd = item.referralUsd + bonusUsd;
  const fmt = Object.fromEntries(
    locales.order.map((code) => {
      const lang = locales[code].htmlLang;
      return [
        code,
        {
          earn: money(lang, earnUsd),
          referral: money(lang, item.referralUsd),
          bonus: money(lang, bonusUsd, true),
          bonuses: item.bonuses.map((b) => money(lang, b.amountUsd)),
          dealMin: money(lang, item.dealMinUsd, true),
          dealMax: money(lang, item.dealMaxUsd, true),
        },
      ];
    }),
  );
  // Zips with t.refer.companies.categories, for the category's name.
  const categoryIndex = refer.categories.indexOf(item.category);
  return { ...item, bonusUsd, earnUsd, categoryIndex, fmt };
};

export default {
  items: items.map(withAmounts),
  // The six requests /data-partners shows owners: the top request of each
  // industry, in the program's order, so the sample spans the board.
  featured: refer.categories
    .map((id) => items.find((item) => item.category === id))
    .filter(Boolean)
    .slice(0, 6)
    .map(withAmounts),
  // The board's industry tabs: every category with at least one request, in
  // the program's order.
  categories: refer.categories.filter((id) =>
    items.some((item) => item.category === id),
  ),
};
