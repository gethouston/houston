// English copy for /data-partners/refer. Joined onto the locale tree as
// `t.refer` by _data/eleventyComputed.js, so scripts/check-locales.mjs holds
// es and pt to this exact tree. No em dashes; arrays zip by index with
// _data/refer.js. {amount} and {inbox} are filled in by the templates.

export default {
  meta: {
    title: "Refer a company to Houston Data Partners and earn up to {amount}",
    description:
      "Know a company with real business data? Introduce it to Houston. When it licenses its data, you earn up to {amount}, paid after its first delivery.",
  },
  nav: {
    how: "How it works",
    companies: "Requests",
    terms: "Terms",
    faq: "FAQ",
    cta: "Refer a company",
  },
  hero: {
    h1Lines: ["Know a company?", "Earn for the intro."],
    sub: "Introduce a company that holds real business data. When it licenses that data through Houston, you earn up to {amount}.",
    ctaRefer: "Refer a company",
    ctaHow: "How referrals work",
    card: {
      label: "You earn up to",
      per: "per company",
      terms: [
        "Full amount for companies with 30+ employees",
        "Confirmed when the company signs its data license",
        "Paid after their first delivery",
      ],
    },
  },
  how: {
    title: "From introduction to payout, in four steps.",
    lead: "You make the introduction. We do everything after it.",
    steps: [
      {
        title: "Find a fit",
        line: "Pick an open request and think of a company that matches.",
      },
      {
        title: "Refer them",
        line: "Share the company and one contact there, in about two minutes.",
      },
      {
        title: "We do the work",
        line: "We scope their data, agree a license and handle the export.",
      },
      {
        title: "You get paid",
        line: "Up to {amount} per company, after their first delivery.",
      },
    ],
  },
  companies: {
    title: "Open requests from AI labs.",
    lead: "Pick an industry and open a request to see exactly what the buyer wants and what you earn.",
    categories: [
      "Software",
      "Healthcare",
      "Science & R&D",
      "Industrial",
      "Finance",
      "Professional services",
      "Media & games",
      "Operating businesses",
    ],
    notListed:
      "Know a company that isn't on this list? You can still refer it, and earn when it licenses its data.",
    cta: "Refer a company",
  },
  refer: {
    title: "Refer a company.",
    lead: "Share the company and one contact there. We handle the outreach.",
  },
  track: {
    title: "After you refer",
    note: "We email you as your referral moves, from review to payout.",
    states: [
      {
        label: "Submitted",
        line: "We have your referral and are reviewing it.",
      },
      {
        label: "In progress",
        line: "We're working with them. We'll let you know how it lands.",
      },
      {
        label: "Bonus confirmed",
        line: "Your bonus is confirmed and on its way.",
      },
      {
        label: "Bonus paid",
        line: "Your bonus has been paid out.",
      },
    ],
  },
  form: {
    you: "About you",
    yourName: "Your name",
    yourEmail: "Your email",
    company: "The company",
    companyName: "Company name",
    website: "Company website",
    websitePlaceholder: "acme.com",
    size: "Number of employees",
    sizeChoose: "Choose a size",
    sizes: [
      "1 to 19",
      "20 to 49",
      "50 to 199",
      "200 to 499",
      "500 to 999",
      "1,000 to 4,999",
      "5,000+",
    ],
    listing: "Request",
    listingNone: "Not on the list",
    contact: "Your contact there",
    contactHint:
      "We email them the introduction, so we need a name and an address.",
    contactName: "Contact name",
    contactEmail: "Contact email",
    contactLinkedin: "Contact LinkedIn",
    linkedinPlaceholder: "linkedin.com/in/name",
    fit: "Why are they a good fit?",
    fitPlaceholder: "How you know them, what kind of data they hold",
    optional: "Optional",
    consent:
      "We may contact the person you name to introduce Houston. Only refer people who would welcome that.",
    submit: "Send referral",
    privacy: "How we handle these details.",
    consentCheck:
      "I have this person's OK to share their details with Houston.",
    sending: "Sending…",
    saved: {
      title: "We have your referral.",
      line: "We review it and email you as it moves, from review to payout.",
    },
    errors: {
      yourName: "Your name is required.",
      yourEmail: "Enter a valid email address.",
      companyName: "Company name is required.",
      website: "Enter a valid website, like acme.com.",
      size: "Choose a company size.",
      contactName: "Contact name is required.",
      contactEmail: "Enter a valid email address.",
      contactLinkedin: "Enter a valid link, like linkedin.com/in/name.",
      sameCompany:
        "You can't refer your own company. It can join as a data partner itself.",
      consent: "Confirm that this person is happy to hear from Houston.",
    },
    mail: {
      subject: "Referral: {company}",
      referrer: "Referred by",
    },
    done: {
      title: "Your referral is ready to send.",
      line: "We opened your email app with everything filled in. Send it and we take it from there.",
      fallback: "Nothing opened? Email the details to {inbox}.",
      again: "Refer another company",
    },
  },
  terms: {
    title: "The terms that decide what you earn.",
    groups: [
      {
        title: "How you're paid",
        lines: [
          "Up to {amount} per company. The company needs at least 20 full-time employees to qualify. From 30 employees you earn the full amount, and from 20 to 29 a share in proportion to its size.",
          "Bonuses on top are fixed when you refer and never change afterwards. A bonus with an end date must be referred before it ends.",
          "We confirm the amount once the company signs its data license. Nothing is owed until then.",
          "Paid after the company's first delivery.",
        ],
      },
      {
        title: "Who can refer",
        lines: [
          "Anyone can refer, except AI labs.",
          "You can't refer your own company. If it's yours, it can join as a data partner itself.",
          "The first valid referral for a company counts. A company that was already referred, or already works with Houston, doesn't qualify.",
          "You can have up to five referrals open at a time.",
        ],
      },
      {
        title: "Good to know",
        lines: [
          "We may contact the person you name to introduce Houston. Only refer people who would welcome that.",
          "Houston decides whether a company is a fit and may decline any referral.",
        ],
      },
    ],
  },
  faq: {
    title: "Common questions.",
    items: [
      {
        q: "How much can I earn?",
        a: "Up to {amount} per company. The company needs at least 20 full-time employees to qualify. From 30 employees you earn the full amount, and from 20 to 29 a share in proportion to its size. Some referrals add a bonus on top.",
      },
      {
        q: "When do I get paid?",
        a: "Once the company signs its data license we confirm your bonus, and we pay it after their first delivery.",
      },
      {
        q: "What is a bonus?",
        a: "Some referrals pay extra on top: a fixed amount when the company signs, or a fast-signing bonus when it signs within days of approval. The bonuses we confirm when you refer are the ones you get.",
      },
      {
        q: "Do I need to know someone there?",
        a: "Yes. Share a contact who can talk about the company's data, usually a founder, an executive or an operations lead.",
      },
      {
        q: "What happens after I refer?",
        a: "We review the company and reach out to your contact. We email you as it moves: submitted, in progress, bonus confirmed, paid.",
      },
      {
        q: "What if someone referred them first?",
        a: "The first valid referral counts, so a company can only be referred once. A company already working with Houston doesn't qualify.",
      },
      {
        q: "How many can I have open?",
        a: "Up to five referrals awaiting review at a time.",
      },
      {
        q: "What does Houston do with the data?",
        a: "Houston licenses real business data to AI labs, which use it to train and test AI systems. We confirm what data a company holds, sign an NDA, then agree a data license and a payment. Our team handles the export and removes or protects personal information as the license requires.",
      },
    ],
  },
  contact: {
    title: "Know a company that fits?",
    lead: "Refer it in about two minutes. We handle the outreach, the license and the export.",
    cta: "Refer a company",
    peopleLabel: "The team that handles the outreach",
  },
};
