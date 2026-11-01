// English copy for the request board on /data-partners/refer and each
// request's own page. Joined onto the locale tree as `t.referBoard` by
// _data/eleventyComputed.js, so scripts/check-locales.mjs holds es and pt to
// this exact tree. No em dashes. {amount}, {min}, {max}, {count} and {title}
// are filled in by the templates and assets/refer-board.js.

export default {
  board: {
    all: "All",
    filterLabel: "Industry",
    search: "Search requests",
    countOne: "{count} open request",
    countOther: "{count} open requests",
    empty: "No requests match your search.",
    showAll: "Show all requests",
    earnUpTo: "You earn up to",
    includesBonus: "Includes {amount} bonus",
    companyEarns: "Company earns",
    range: "{min}–{max}",
    open: "See the request",
  },

  listing: {
    metaTitle: "{title}: refer a company and earn up to {amount}",
    back: "All requests",
    earnUpTo: "You earn up to",
    includesBonus: "Includes a {amount} listing bonus",
    companyEarns: "Company earns",
    assurance:
      "Houston scopes the data, signs an NDA and runs the export, removing or protecting personal information.",
    tabsLabel: "On this page",
    tabs: {
      overview: "Overview",
      fit: "Fit",
      license: "License",
      questions: "Questions",
      how: "How it works",
    },
    about: "About",
    facts: {
      location: "Location",
      size: "Company size",
      history: "Track record",
      kinds: "Kinds of companies",
    },
    fitTitle: "Is it a fit?",
    lookingFor: "What we're looking for",
    notAFit: "Not a fit",
    whoKnows: "Who knows companies like this",
    referOne: "Refer one",
    licenseTitle: "What the license covers",
    niceToHave: "Nice to have, adds to what the company earns",
    tools: "Tools we work with",
    questionsTitle: "Questions we'll ask the company",
    questionsLead:
      "If the company can answer these, it is likely a good referral.",
    howTitle: "How referrals work",
    onListing: "On this request",
    upTo: "Up to {amount}",
    termsLink: "Read all the terms",
    sidebar: {
      referral: "Referral amount",
      referralNote: "Set for this request",
      bonusKinds: {
        fast_signing: "Fast-signing bonus",
        listing: "Listing bonus",
      },
      lockedIn: "Locked in when you refer",
      bonusLine:
        "Paid to you and to the company if it signs its data license within a day of approval.",
      cta: "Refer a company",
      ctaNote: "Takes about a minute. No contact needed.",
      yours: "Is this your company?",
      yoursCta: "License your data",
    },
    formTitle: "Refer a company for this request.",
    formLead: "Share the company and a few details. We handle the outreach.",
  },
};
