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
    ctaHow: "How referrals work",
    card: {
      label: "You earn up to",
      per: "per company",
      terms: [
        "10% of what we agree to pay the company",
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
        line: "Share the company and a few details about it, in about a minute.",
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
        label: "Reward confirmed",
        line: "Your reward is confirmed and on its way.",
      },
      {
        label: "Reward paid",
        line: "Your reward has been paid out.",
      },
    ],
  },
  form: {
    you: "About you",
    yourName: "Your name",
    yourEmail: "Your email",
    yourPhone: "Your phone number (with country code)",
    yourPhonePlaceholder: "+1 555 123 4567",
    company: "The company",
    companyName: "Company name",
    website: "Company website",
    websitePlaceholder: "acme.com",
    size: "Number of employees",
    sizePlaceholder: "30",
    years: "Years in business",
    yearsPlaceholder: "12",
    industry: "Industry",
    industryPlaceholder: "Select industry",
    industryOther: "Other",
    country: "Country",
    countryPlaceholder: "Select country",
    countrySearch: "Search country",
    countryEmpty: "No results",
    consent:
      "We reach out to the company ourselves and keep you posted as it moves.",
    submit: "Send referral",
    privacy: "How we handle these details.",
    sending: "Sending…",
    needsJs: "Turn on JavaScript to send a referral.",
    saved: {
      title: "We have your referral.",
      line: "We review it and email you as it moves, from review to payout.",
    },
    errors: {
      send: "We couldn't send your referral. Check your connection and try again.",
      size: "Tell us roughly how many people work there.",
      years: "Enter the years in business as a whole number, like 12.",
      industry: "Pick the company's industry.",
      country: "Pick the country the company is based in.",
      yourName: "Your name is required.",
      yourEmail: "Enter a valid email address.",
      yourPhone: "Enter a phone number with its country code.",
      companyName: "Company name is required.",
      website: "Enter a valid website, like acme.com.",
      sameCompany:
        "You can't refer your own company. It can join as a data partner itself.",
    },
    again: "Refer another company",
  },
  terms: {
    title: "The terms that decide what you earn.",
    groups: [
      {
        title: "How you're paid",
        lines: [
          "You earn 10% of the amount we agree to pay the company for its data, whatever its size, up to {amount} on today's open requests. The company needs at least 20 full-time employees to qualify.",
          "Each request shows the most you can earn on it: 10% of the most that request pays the company.",
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
          "We reach out to the company ourselves to introduce Houston.",
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
        a: "You earn 10% of the amount we agree to pay the company for its data, whatever its size, up to {amount} on today's open requests. The company needs at least 20 full-time employees to qualify.",
      },
      {
        q: "When do I get paid?",
        a: "Once the company signs its data license we confirm your reward, and we pay it after their first delivery.",
      },
      {
        q: "How is the amount for each request set?",
        a: "Each request shows 10% of the most it pays the company, so you see the most you can earn. What you are paid is 10% of the amount we actually agree with the company.",
      },
      {
        q: "Do I need to know someone there?",
        a: "It helps, but you don't have to. Tell us the company and we reach out ourselves.",
      },
      {
        q: "What happens after I refer?",
        a: "We review the company and reach out to it. We email you as it moves: submitted, in progress, reward confirmed, paid.",
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
