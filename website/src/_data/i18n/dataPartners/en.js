// English copy for /data-partners. Joined onto the locale tree as
// `t.dataPartners` by _data/eleventyComputed.js, so scripts/check-locales.mjs
// holds es and pt to this exact tree. No em dashes; arrays zip by index with
// _data/dataPartners.js.

export default {
  meta: {
    title: "Houston Data Partners: earn from your company's operational data",
    description:
      "Houston licenses the records your teams create every day to vetted AI labs and pays you from $60K to over $1.2M. De-identified, kept separate, U.S. and allied buyers only.",
  },

  nav: {
    estimate: "Estimate",
    how: "How it works",
    payouts: "Payouts",
    privacy: "Privacy",
    faq: "FAQ",
    refer: "Refer a company",
    cta: "Book a call",
  },

  hero: {
    h1Lines: ["Earn from your", "company's data."],
    sub: "Houston licenses the records your teams create every day to vetted AI labs, and pays you from $60K to over $1.2M for them.",
    ctaEstimate: "Estimate your payout",
    ctaBook: "Book a call",
  },

  // The statement band right under the fold.
  statement:
    "AI models are only as good as what they learn from. The public internet is no longer enough. AI models now need data on how real companies operate.",

  why: {
    title: "The data AI needs is already on your servers.",
    phrases: [
      "Every ticket, process, deal and decision is a record of how real work gets done.",
      "Houston turns that work into data that trains and tests the next generation of AI.",
    ],
    areas: [
      {
        name: "Software and engineering",
        line: "Docs, bug trackers, roadmaps, engineering workflows and internal wikis.",
      },
      {
        name: "Finance and accounting",
        line: "Close checklists, reconciliations, approval chains and reporting.",
      },
      {
        name: "Customer support",
        line: "Ticket histories, help-center articles, QA reviews and escalation paths.",
      },
      {
        name: "Sales and CRM",
        line: "CRM history, playbooks, pipeline reviews and account lifecycles.",
      },
      {
        name: "Legal and contracts",
        line: "Contract workflows, policies, review steps and compliance procedures.",
      },
      {
        name: "Operations and logistics",
        line: "SOPs, fulfillment and logistics flows, inventory and internal processes.",
      },
    ],
  },

  requests: {
    title: "What AI labs are asking for.",
    lead: "A few of the open requests from AI labs right now. If one sounds like your company, your data is already in demand.",
    companyEarns: "Your company earns",
    all: "See all {count} requests",
    referTitle: "Know a company that fits?",
    referLine:
      "Introduce it to Houston and earn up to {amount} when it licenses its data.",
    referCta: "Refer a company",
  },

  how: {
    title: "From first look to payment.",
    lead: "Four steps, each one in writing, with almost nothing for your team to prepare.",
    steps: [
      {
        name: "Discovery and pricing",
        line: "We map what your teams have on record, then price it. The offer reflects what kind of data it is, how much there is and what buyers will pay.",
        alt: "Two inspectors reviewing a report on a tablet",
      },
      {
        name: "Contract",
        line: "You sign a license that spells everything out, including that your data is never resold or passed on until personal and identifying details are stripped.",
        alt: "A store worker checking stock on a tablet",
      },
      {
        name: "Delivery and acceptance",
        line: "Your data moves over a secure API or another method you approve. We then check that nothing is missing.",
        alt: "Cargo trucks lined up at a warehouse dock",
      },
      {
        name: "Payment",
        line: "Once your data is approved you invoice us, and full payment lands within 30 business days. Most payments fall between $90K and over $1.2M.",
        alt: "A field engineer working on a tablet among wind turbines",
      },
    ],
  },

  estimator: {
    title: "See what your data could earn.",
    lead: "Move the sliders. The range updates as you go.",
    employees: "Employees",
    years: "Years of data",
    yearsHint: "Most companies use their age in years.",
    region: "Headquarters",
    regions: ["U.S.", "Canada", "Europe", "Other"],
    result: "Estimated payout",
    to: "to",
    note: "A rough guide, not an offer. Your actual payout comes after we review where the data lives, how much there is, its quality and the access terms.",
    cta: "Get your real figure",
  },

  payouts: {
    title: "Your data, priced by what it's worth.",
    lead: "The rarer, richer and more useful your data, the higher the tier.",
    estimate: "Estimate yours",
    tiers: [
      {
        amount: "$60K to $300K",
        line: "A standard partnership for an established company.",
      },
      {
        amount: "$300K to $1.2M",
        line: "Big operational datasets, or a partnership that keeps running across several teams.",
      },
      {
        amount: "$1.2M+",
        line: "Proprietary data nobody else has, the kind frontier labs compete for.",
      },
    ],
  },

  privacy: {
    title: "You stay in control of your data.",
    lead: "Four guarantees go into writing before a single file leaves your company.",
    points: [
      {
        title: "U.S. and allied buyers only",
        line: "Only AI labs and companies headquartered in the U.S. or allied countries can license your data.",
      },
      {
        title: "Kept separate",
        line: "Your data runs in its own isolated pipeline, open only to the people cleared to work on it.",
      },
      {
        title: "De-identified first",
        line: "Names and identifying details are stripped or transformed before any third party sees a thing.",
      },
      {
        title: "Set retention periods",
        line: "Raw files are deleted on the schedule written into your contract.",
      },
    ],
  },

  faq: {
    title: "Questions, answered.",
    items: [
      {
        q: "What does my company get for its data?",
        a: "You are paid for the value of what you share. Along the way, the AI built for the use cases you contribute can come back to help your own work.",
      },
      {
        q: "Which companies qualify?",
        a: "Established businesses with at least 20 full-time employees and years of records behind them, such as internal messages, SOPs, project histories, CRM data and support tickets.",
      },
      {
        q: "What kind of data are you looking for?",
        a: "Anything that shows how your people really work: procedures, process docs, internal wikis, templates and frameworks. The best datasets show expert judgment and repeatable ways of getting things done.",
      },
      {
        q: "Is there a minimum amount of data?",
        a: "No. What matters is how far back your records go, how much of the business they cover and how good they are. Companies with several years across several systems tend to fit best.",
      },
      {
        q: "How is my company's data protected?",
        a: "Personal information is stripped where it applies. A small, cleared team works on it, on company-managed devices, under security training and controls. Each engagement runs in its own pipeline, data is held only as long as agreed, you see samples before anything is used, and you can ask for deletion.",
      },
      {
        q: "Who owns the data?",
        a: "You do. Buyers license it; ownership never changes hands.",
      },
      {
        q: "What happens to the data after it is shared?",
        a: "We prepare it for the use you agreed to. That can mean removing personal details or rewriting some records synthetically, so the workflow survives but the link to the original fades. You check samples first, and everything is deleted when the engagement ends or when you ask.",
      },
      {
        q: "Do we need to de-identify our data first?",
        a: "No. Removing and transforming sensitive information is our job.",
      },
      {
        q: "How is the payout decided?",
        a: "We look at how much data there is, how complex the work it captures is, its quality, the expertise inside it and how hard it would be to find elsewhere. Every deal is priced on its own.",
      },
      {
        q: "How do referral rewards work?",
        a: "Introduce a company that qualifies and you earn 10% of the amount we agree to pay it, up to {amount} on today's open requests, paid after its first data delivery. Send it through our referral page so it is credited to you.",
        link: "Refer a company",
      },
      {
        q: "What happens after a company is referred?",
        a: "We review the company, then it does a short AI interview to check the fit. If it qualifies, we move to terms, signing and onboarding, and it starts earning.",
      },
      {
        q: "Can companies anywhere in the world take part?",
        a: "Yes. Right now buyers want companies in the U.S., the U.K. and Canada most. Others are welcome and are matched to buyer demand as it comes.",
      },
      {
        q: "When does my company get paid?",
        a: "We have 30 days from delivery to review and approve your data. Once it is approved you invoice us, and we pay within 30 business days.",
      },
    ],
  },

  contact: {
    title: "Your data is already worth something.",
    lead: "Book a call with our team. We look at what you have and tell you what it could earn.",
    cta: "Book a call",
    peopleLabel: "The team you will talk to",
  },
};
