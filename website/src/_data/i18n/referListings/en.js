// English copy for the requests on /data-partners/refer: one entry per
// request, keyed by its slug in _data/referListings.js. Joined onto the locale
// tree as `t.referListings` by _data/eleventyComputed.js, so
// scripts/check-locales.mjs holds es and pt to this exact tree. No em dashes.
// An empty `size` or `location` is left out of the page.

export default {
  "law-firm": {
    title: "Law Firm",
    summary: "License complete files from closed matters and completed deals.",
    size: "20–300 attorneys and staff",
    location: "United States preferred",
    dealNote: "Depends on matter size and completeness",
    about:
      "We're looking for law firms and in-house legal teams that keep complete matter files: pleadings and discovery productions from concluded litigation, and data rooms and contracts from completed transactions. Single matters with hundreds or thousands of documents are the most valuable. Everything is anonymized, and active matters are excluded.",
    history: "5+ years of closed matters",
    kinds:
      "Litigation boutiques, mid-size full-service firms, in-house legal departments, e-discovery providers",
    lookingFor: [
      "Complete files from closed matters or completed transactions",
      "Matters with 500+ documents",
      "Client consent, or documents that can be fully anonymized",
    ],
    notAFit: [
      "Active matters",
      "Privileged material clients won't release",
      "Single filings without the rest of the file",
    ],
    referrers:
      "Litigation associates, legal operations leads and e-discovery vendors.",
    covers: [
      "Pleadings, filings and discovery productions",
      "Contracts and deal documents",
      "Matter correspondence",
    ],
    niceToHave: [
      "Custodial email and chat from discovery",
      "E-discovery exports",
      "Contract repositories",
      "Transaction data rooms",
    ],
    questions: [
      "Do you keep complete discovery productions for closed matters?",
      "What is your largest matter by document count?",
      "Would clients accept anonymized licensing?",
      "Which practice areas?",
    ],
  },
  accounting: {
    title: "Accounting & Tax Firm",
    summary:
      "License tax returns, workpapers and bookkeeping records across many kinds of entities.",
    size: "20–200 employees",
    location: "United States",
    dealNote: "Depends on client count and seasons",
    about:
      "We're looking for accounting practices that prepare returns and keep books for a mix of U.S. entities: C corporations, S corporations, partnerships and nonprofits. Partnership returns with complete K-1 packages are in particular demand, as are procurement records such as purchase orders.",
    history: "Several filing seasons",
    kinds:
      "CPA firms, tax preparers, outsourced bookkeepers, fund administrators",
    lookingFor: [
      "Tax returns with workpapers across several entity types",
      "Several filing seasons",
      "Client documents that can be anonymized for licensing",
    ],
    notAFit: [
      "Blank forms and templates",
      "Returns filed outside the United States",
    ],
    referrers: "Accountants, fractional CFOs and bookkeeping firm owners.",
    covers: [
      "Returns and workpapers",
      "Bookkeeping records",
      "Source documents",
    ],
    niceToHave: [
      "Form 1065 K-1s with supplemental statements, Box 20 detail and capital accounts",
      "Purchase orders, invoices and receipts",
      "Client ledgers and bank statements",
    ],
    questions: [
      "Which entity types do you prepare returns for, and how many a year?",
      "Do you prepare partnership returns with K-1s?",
      "Can client documents be licensed once anonymized?",
      "Which tax and bookkeeping software do you use?",
    ],
  },
  "investment-firm": {
    title: "Investment Firm",
    summary:
      "License closed-deal records, credit files and portfolio reporting.",
    size: "20–200 employees",
    location: "Anywhere",
    dealNote: "Depends on deal count and completeness",
    about:
      "We're looking for firms on the deal side: private equity, private credit, boutique banks and due-diligence providers that keep complete records of closed deals, plus wealth and asset managers with client-level data. The most valuable material shows the full chain for one deal: the data room, the model and the memo.",
    history: "3+ years of closed deals",
    kinds:
      "Private equity and growth equity, private credit, boutique investment banks, quality-of-earnings providers, wealth managers and RIAs, asset managers, fund administrators",
    lookingFor: [
      "Records from closed deals: data rooms, CIMs, models and investment memos for the same deals",
      "The right to license deal and portfolio documents once anonymized",
      "3+ years of deal history",
    ],
    notAFit: [
      "Firms whose only records are their own operating finances",
      "Documents under NDAs that forbid licensing",
    ],
    referrers:
      "Former bankers and private equity associates, fund administrators, and finance-focused fractional CFOs.",
    covers: [
      "Deal data rooms and memos",
      "Models and credit files",
      "Portfolio and client reporting",
    ],
    niceToHave: [
      "Credit agreements with their term sheets",
      "Quarterly portfolio reporting over several cycles",
      "Banker deliverables with their sources",
      "Wealth management client records: holdings, statements, advisor notes, KYC files (de-identified)",
      "Fund holdings, benchmarks, pricing and ESG data",
    ],
    questions: [
      "How many closed deals do you keep full records for?",
      "Do you keep models and memos alongside the data rooms?",
      "Can deal documents be licensed once anonymized?",
      "Which strategies: buyout, credit, advisory, wealth?",
    ],
  },
  "payments-fintech": {
    title: "Payments & Fintech Company",
    summary:
      "License years of transaction, order, inventory or shipment tables from a payments or commerce business.",
    size: "",
    location: "",
    dealNote: "",
    about:
      "Payment processor, merchant acquirer, POS, e-commerce platform, logistics or market-data company with transaction, order, inventory or shipment tables. 3-5+ years of history, consistent schema, ideally refreshed on an ongoing basis.",
    history: "",
    kinds: "",
    lookingFor: [],
    notAFit: [],
    referrers: "",
    covers: [],
    niceToHave: [],
    questions: [],
  },
  cybersecurity: {
    title: "Cybersecurity Company",
    summary:
      "License security alerts, investigations and case write-ups, or security software.",
    size: "20–2,000 employees",
    location: "Anywhere",
    dealNote: "Depends on case volume and rights",
    about:
      "We're looking for security teams that keep the full trail from alert to resolution: SIEM and endpoint alerts, triage decisions, investigation notes and case write-ups. Security product companies with private code are also a fit.",
    history: "Several years of cases",
    kinds:
      "Managed security and MDR providers, enterprises with an in-house SOC, security product companies, penetration-testing firms",
    lookingFor: [
      "Alert-to-resolution records the company owns, or private security software",
      "The right to license them; customer data only with customer agreement",
    ],
    notAFit: [
      "Logs without case context",
      "Customer data the company can't share",
    ],
    referrers:
      "SOC analysts, managed-security founders and security engineers.",
    covers: [
      "Alerts and triage decisions",
      "Investigation notes and case write-ups",
      "Security code",
    ],
    niceToHave: [
      "SOAR and containment logs",
      "Detection rules",
      "Penetration test reports",
      "Repositories already scrubbed of secrets",
    ],
    questions: [
      "Do you keep case write-ups together with the alerts behind them?",
      "Is the data your own or your customers'?",
      "Which SIEM and EDR tools do you run?",
      "Do you have private security software?",
    ],
  },
  telehealth: {
    title: "Digital Health Company",
    summary:
      "License consented recordings of patient visits, with transcripts and notes.",
    size: "20–500 employees",
    location: "Anywhere",
    dealNote: "Depends on visit count and consent",
    about:
      "We're looking for digital-health companies that record patient–clinician conversations with consent and keep the audio, the transcripts and the notes produced from them. Multilingual visits and a broad specialty mix add value.",
    history: "An archive of recorded visits",
    kinds:
      "Telehealth providers, ambient AI scribes, nurse lines, virtual-care platforms",
    lookingFor: [
      "Recorded patient–clinician visits with consent that covers secondary use",
      "Transcripts, or audio clear enough to transcribe",
      "The ability to de-identify audio and text",
    ],
    notAFit: [
      "Role-played or scripted visits",
      "Recordings made without consent",
    ],
    referrers: "Digital-health founders and clinical operations leads.",
    covers: ["De-identified visit audio", "Transcripts", "Generated notes"],
    niceToHave: [
      "The clinical notes produced from each visit",
      "Visits in several languages",
      "A broad specialty mix",
      "The linked EHR note",
    ],
    questions: [
      "How many recorded visits do you hold?",
      "Does patient consent cover research or AI use?",
      "Do you keep the notes generated from visits?",
      "Which languages and specialties?",
    ],
  },
  "imaging-center": {
    title: "Imaging & Diagnostics Center",
    summary:
      "License de-identified imaging studies and diagnostic tests, together with their reports.",
    size: "20+ employees",
    location: "United States preferred",
    dealNote: "Depends on modality mix and study volume",
    about:
      "We're looking for practices that produce diagnostic studies and keep the reads: radiology and ultrasound, cardiology ECGs, dermatology and eye imaging, and neurology EEG and EMG. The most valuable studies come with the signed report and the patient's clinical record. Every study is de-identified before transfer.",
    history: "An archive searchable by diagnosis",
    kinds:
      "Outpatient imaging centers, teleradiology groups, cardiology, dermatology, ophthalmology and optometry, neurology and EEG labs, hospital radiology departments",
    lookingFor: [
      "DICOM studies paired with signed reports",
      "An archive searchable by diagnosis or finding",
      "Raw waveform files for ECG, EEG or EMG, not only images",
      "Studies that can be fully de-identified, including text burned into images",
    ],
    notAFit: [
      "Images without reports",
      "Studies under an exclusive contract with another buyer",
    ],
    referrers:
      "Radiologists, imaging-center operators, cardiology and neurology technologists, and PACS administrators.",
    covers: [
      "Imaging studies and raw waveforms",
      "Reports",
      "Linked clinical records, where available",
    ],
    niceToHave: [
      "The linked clinical record for each patient",
      "Normal studies as well as abnormal ones",
      "Ultrasound, chest X-ray, MRI and CT",
      "Dermatology photos and retinal scans with diagnoses",
      "Video, 3D scans and microscopy slides",
    ],
    questions: [
      "Which modalities do you run, and how many studies a year?",
      "Are reports linked to each study and patient?",
      "Can you export raw ECG or EEG waveforms?",
      "Is any of your data already licensed?",
    ],
  },
  "medical-practice": {
    title: "Medical Practice or Health System",
    summary:
      "License de-identified patient records with years of physician notes.",
    size: "20+ clinicians or 2,500+ patients",
    location: "United States preferred; other countries considered",
    dealNote: "Depends on patient count and note depth",
    about:
      "We're looking for physician practices and clinics that have kept patient records in an EHR for years, with real notes written by physicians. Primary care is the most requested, and specialty practices are in strong demand. Records are de-identified to HIPAA standards as part of the license.",
    history: "12+ months of visits per patient",
    kinds:
      "Primary care, multi-specialty groups, urgent care, behavioral health, women's health, specialty practices, and digital-health platforms with patient records",
    lookingFor: [
      "An EHR that holds free-text physician notes, not only structured fields",
      "At least 2,500 patients or 10 clinicians",
      "Longitudinal records: visit notes, problem lists, medications, allergies, vitals and lab results",
      "Records that can be de-identified to HIPAA Safe Harbor or Expert Determination",
    ],
    notAFit: [
      "Synthetic or sample charts",
      "Records without physician notes",
      "Data already licensed exclusively through a broker",
    ],
    referrers:
      "Practice managers and administrators, physician-owners, healthcare IT consultants and medical billing companies.",
    covers: [
      "De-identified charts: notes, diagnoses, medications, labs and vitals",
      "Imaging reports",
      "Coding and claims, where available",
    ],
    niceToHave: [
      "Oncology, cardiology, neurology, rheumatology, behavioral health, women's health or rare-disease patients",
      "CPT and E&M coding with the documentation behind it, plus claims",
      "Imaging reports linked to patients",
      "Wearable or app data linked to the same patients",
    ],
    questions: [
      "Which EHR do you use, and how many patients and years does it cover?",
      "Which specialties do you see?",
      "Who handles de-identification today, if anyone?",
      "Is any of your data already under a licensing agreement?",
    ],
  },
  semiconductor: {
    title: "Semiconductor & Materials Company",
    summary:
      "License the run records that tie each recipe to a measured result.",
    size: "20–2,000 employees",
    location: "Anywhere",
    dealNote: "Depends on run count and how well runs link to results",
    about:
      "We're looking for companies that make semiconductors, devices and advanced materials, and that keep careful records of what they built and how it performed. The most valuable data links each build's recipe or process settings to its measured result, with failed builds and repeat runs kept. Lab notebooks that explain why a build failed are especially useful. Labs and startups that have wound down qualify.",
    history: "Several years of runs",
    kinds:
      "Fabs and foundries, device makers (solar, photonics, quantum, power electronics), fabless chip designers, process and test equipment makers, materials and battery R&D labs",
    lookingFor: [
      "Run or build records the company owns, with recipe or process settings linked to measured performance",
      "1,000+ runs, builds, wafers or experiments",
      "Every build kept, failed ones included, with dates",
      "Data that hasn't been published",
    ],
    notAFit: [
      "Data owned by a customer or foundry partner",
      "Published papers and datasheets only",
      "Licensed third-party IP",
    ],
    referrers:
      "Process and device engineers, fab and lab managers, materials scientists, and founders of wound-down hardware startups.",
    covers: [
      "Run and build records with measurements",
      "Lab notebooks",
      "Process, yield and equipment data",
      "Design and test files, where available",
    ],
    niceToHave: [
      "Lab notebooks with notes on why builds failed",
      "The same recipe built again on different days",
      "Measurements under more than one condition",
      "Yield, metrology and equipment logs",
      "Chip or device designs with their verification and test results",
    ],
    questions: [
      "What run or lab records do you keep, and in which systems?",
      "Roughly how many runs or builds, over how many years?",
      "Do you keep failed builds and repeat runs?",
      "Do you own the data, and has any of it been published?",
    ],
  },
  manufacturing: {
    title: "Manufacturing & Industrial Company",
    summary:
      "License production, maintenance and inspection records from the shop floor.",
    size: "20–2,000 employees",
    location: "Anywhere",
    dealNote: "Depends on record types and history",
    about:
      "We're looking for plants, machine shops and industrial operators that keep detailed production and maintenance records: CAM programs, work orders, inspection reports, alarm logs and process data with measured results. Image-heavy archives, such as asset photos, drone surveys and scans tied to work records, are especially useful.",
    history: "Several years of work orders",
    kinds:
      "CNC job shops, contract manufacturers, foundries, utilities and energy operators, test labs",
    lookingFor: [
      "Production or maintenance records the company owns",
      "At least one of: CAM programs with setup sheets, work orders with inspection reports, or machine alarm logs and process data",
      "Several years of history",
    ],
    notAFit: [
      "Data restricted by customer contracts",
      "Marketing material only",
    ],
    referrers:
      "Plant managers, manufacturing and reliability engineers, and maintenance-software consultants.",
    covers: [
      "CAM programs and setup sheets",
      "Work orders and inspection reports",
      "Alarm logs and process data",
      "Asset imagery",
    ],
    niceToHave: [
      "Annotated CAM programs and G-code",
      "Asset photos, drone imagery and scans linked to work orders",
      "Quality and SPC data",
      "ERP and MES records",
      "Checklists and correction letters",
    ],
    questions: [
      "Which records do you keep: CAM programs, work orders, inspections, alarm logs?",
      "Which maintenance or MES system holds them, and for how many years?",
      "Do you have photos or drone imagery tied to assets?",
      "Do any customer contracts restrict this data?",
    ],
  },
  "ai-product": {
    title: "AI Product Company",
    summary: "License real usage data from an AI app, agent or developer tool.",
    size: "20–200 employees",
    location: "Anywhere",
    dealNote: "Depends on session volume and completeness",
    about:
      "We're looking for companies whose product people use through a language model: coding agents, AI chat and search apps, model routers and vertical assistants. We want complete sessions from real users, with every step the model took, where the company's terms allow sharing de-identified data.",
    history: "6+ months in production",
    kinds:
      "AI coding agents and IDE plugins, LLM routers and gateways, AI chat and search apps, AI assistants for health, fitness and work",
    lookingFor: [
      "A product in production for 6+ months with real users",
      "Complete session logs: prompts, responses and every tool call",
      "User terms that allow licensing de-identified usage data, or a way to get consent",
    ],
    notAFit: [
      "Synthetic or scripted traffic",
      "Logs that can't be stripped of personal information",
      "Truncated or partial traces",
    ],
    referrers:
      "AI founders, devtool investors, accelerator partners and open-source maintainers.",
    covers: [
      "Full multi-turn sessions with tool calls",
      "Model responses and user feedback",
      "Linked repositories or environments, where available",
    ],
    niceToHave: [
      "Coding sessions saved with the original repository or environment",
      "Sessions that use planning, to-do and clarifying-question steps",
      "Sessions that search the web beyond documentation",
      "User ratings or preference votes",
      "Sessions run on open-weight models",
    ],
    questions: [
      "How many real users and sessions do you have each month?",
      "Do your terms allow sharing de-identified logs for training?",
      "Do your logs capture every tool call and the environment state?",
      "Which models power your product?",
    ],
  },
  "design-agency": {
    title: "Design & Web Agency",
    summary: "License design systems, websites and the code behind them.",
    size: "20–200 employees",
    location: "Anywhere",
    dealNote: "Depends on archive size and rights",
    about:
      "We're looking for design and web studios that keep both the design files and the production code for the work they ship. Proprietary design systems, award-quality websites, and 3D or WebGL projects are in the highest demand, especially with briefs and revision history.",
    history: "3+ years of shipped work",
    kinds:
      "Product design studios, web and front-end agencies, branding agencies, 3D and WebGL studios, in-house design teams",
    lookingFor: [
      "Figma files and production code for the same projects",
      "A portfolio of shipped sites or products over 3+ years",
      "The right to license the work, either your own or cleared with clients",
    ],
    notAFit: [
      "Template or AI-generated sites",
      "Open-source design systems such as Material",
      "Client work you can't license",
    ],
    referrers:
      "Agency owners, design leads, front-end freelancers, and the Awwwards and Dribbble community.",
    covers: [
      "Design files",
      "Front-end code with history",
      "Briefs and revisions",
    ],
    niceToHave: [
      "Proprietary design systems and component libraries, with code",
      "Award-level websites",
      "Three.js, React Three Fiber or WebGL projects",
      "Browser games",
      "Briefs, iterations and client feedback",
      "Brand guidelines and presentation decks",
    ],
    questions: [
      "Do you keep Figma files and code for the same projects?",
      "How many shipped sites or design systems are in your archive?",
      "Can you license client work, or only your own?",
      "Do you have 3D, WebGL or game projects?",
    ],
  },
  construction: {
    title: "Construction Company",
    summary:
      "License project records, drawings and site imagery from completed projects.",
    size: "50–2,000 employees",
    location: "Anywhere",
    dealNote: "Depends on project count and imagery",
    about:
      "We're looking for builders and design firms that keep complete project records: drawings and specs, RFIs, submittals, change orders and daily logs, together with site photos, video and drone surveys. Inspection reports and punch lists tied to the same projects are especially useful.",
    history: "Completed projects with full closeout",
    kinds:
      "General contractors, specialty subcontractors, architecture and engineering firms, inspectors and property managers",
    lookingFor: [
      "Records from completed projects: drawings, specs, RFIs, submittals, change orders and daily logs",
      "Site photos, video or drone imagery tied to specific projects",
      "50+ employees",
    ],
    notAFit: [
      "Marketing photos only",
      "Small crews without project documentation",
    ],
    referrers:
      "Project managers, superintendents and construction-technology consultants.",
    covers: [
      "Project documents",
      "Site imagery",
      "Inspection and closeout records",
    ],
    niceToHave: [
      "BIM and Revit models",
      "Schedules and estimates",
      "Inspection reports, punch lists and correction letters",
      "Property inspection records",
    ],
    questions: [
      "How many completed projects do you hold records for?",
      "Which system holds them?",
      "Do you have site photos or drone surveys by project?",
      "Do any owner contracts restrict project data?",
    ],
  },
  "game-studio": {
    title: "Game Studio",
    summary:
      "License the company records, game code and gameplay footage behind the games you've shipped.",
    size: "20–500 employees",
    location: "Anywhere; international studios welcome",
    dealNote: "Larger studios with full company data have earned more",
    about:
      "We're looking for game studios and esports organizations with a real business behind them: a team that has shipped titles that earn revenue, and years of work in Slack or Discord, Jira, GitHub or Perforce, and shared drives. Game and engine code, gameplay recordings with keyboard and mouse input, and footage of the studio's own games are all in demand. Studios anywhere in the world qualify.",
    history: "At least one shipped title that earns revenue",
    kinds:
      "Indie and mid-size studios, mobile and browser game makers, esports organizations, QA and playtesting firms",
    lookingFor: [
      "At least one shipped title that earns revenue",
      "A team of 10+ people working together, not mainly short-term contractors",
      "Company records the studio owns: chat, tickets, code and shared drives",
    ],
    notAFit: [
      "Footage of other studios' games",
      "Asset-store or template code",
      "Crypto and play-to-earn token projects",
    ],
    referrers:
      "Game developers and producers, studio founders, QA leads and esports managers.",
    covers: [
      "Company chat, email and documents",
      "Game and engine code",
      "Gameplay recordings and input logs",
      "Analytics and playtest data",
    ],
    niceToHave: [
      "Game and engine code with commit history",
      "Gameplay video synced with keyboard, mouse or controller input",
      "Full-length gameplay videos and trailers of your own games",
      "Player analytics, playtest telemetry and support tickets",
      "Design documents and 3D assets",
    ],
    questions: [
      "How many titles have you shipped, and do they earn revenue?",
      "How many people work at the studio, and which tools does the team use?",
      "Do you own the game and engine code outright?",
      "Do you record gameplay or playtests with input logs?",
    ],
  },
  hardware: {
    title: "Hardware Engineering Company",
    summary:
      "License CAD assemblies, circuit designs and test results from real products.",
    size: "20–2,000 employees",
    location: "Anywhere",
    dealNote: "Depends on assembly count and completeness",
    about:
      "We're looking for engineering teams with native CAD vaults: complete assemblies with their feature history, circuit board designs, drawings and the test results that go with them. Automotive, aerospace, robotics and industrial equipment are the priority.",
    history: "Several product generations",
    kinds:
      "Automotive suppliers, aerospace, robotics, industrial equipment, product design consultancies, EV and drone makers",
    lookingFor: [
      "Full multi-part assemblies in native CAD with feature trees, not only exported meshes",
      "Designs the company owns, not customer IP",
      "Several products or product generations",
    ],
    notAFit: [
      "Single parts or parts catalogs",
      "Designs owned by your customers",
    ],
    referrers:
      "Mechanical and electrical engineers, PLM administrators, and robotics founders.",
    covers: [
      "CAD assemblies and drawings",
      "Circuit designs",
      "Simulation and test files",
    ],
    niceToHave: [
      "PCB designs and Gerber files",
      "Drawings and bills of materials",
      "Firmware",
      "FEA and CFD simulation files",
      "Measured test results for designs",
    ],
    questions: [
      "Which CAD system, and roughly how many assemblies?",
      "Do you own the designs, or do customers?",
      "Do you keep simulation or test results?",
      "Which industries are your products in?",
    ],
  },
  publisher: {
    title: "Publisher or Education Company",
    summary:
      "License long-form content you hold the rights to: journals, textbooks, courses and video.",
    size: "20–500 employees",
    location: "Anywhere; multilingual content welcome",
    dealNote: "Depends on catalog size and rights",
    about:
      "We're looking for publishers and course creators who own the training rights to substantial long-form content. The most valuable is recent material that isn't open access, across science, medicine, law, finance and the humanities, along with educational video and lecture recordings.",
    history: "An established catalog",
    kinds:
      "Academic and professional publishers, textbook and courseware companies, e-learning platforms, medical education, magazines and literary publishers",
    lookingFor: [
      "Content the company holds the rights to license for AI training",
      "Long-form text, courses or video, not short articles alone",
      "Hundreds of titles or hours",
    ],
    notAFit: [
      "Content distributed under someone else's license",
      "Content that is already open access",
    ],
    referrers: "Editors, rights and licensing managers, and course creators.",
    covers: ["Full texts", "Course material", "Video with transcripts"],
    niceToHave: [
      "Recent research papers that aren't open access",
      "STEM textbooks and lecture recordings",
      "Medical and science educational video with transcripts",
      "Fiction, essays and teaching writing",
      "Content in several languages",
    ],
    questions: [
      "What do you hold the training rights to?",
      "How many titles, courses or hours?",
      "Which subjects and languages?",
      "Is any of it already licensed for AI training?",
    ],
  },
  "saas-data": {
    title: "SaaS & Subscription Company",
    summary: "License your product databases, warehouse and analytics code.",
    size: "50–1,000 employees, with a data team",
    location: "Anywhere",
    dealNote: "Depends on data volume and stack depth",
    about:
      "We're looking for software and subscription businesses with a mature data stack: their own production databases, a cloud warehouse, and a modeling layer maintained by a data team, alongside a real general ledger, CRM, billing and support desk.",
    history: "3+ years of operating data",
    kinds: "B2B SaaS, consumer subscriptions, marketplaces, e-commerce",
    lookingFor: [
      "The company's own production databases and a cloud warehouse",
      "dbt or SQLMesh with 100+ models, or 50+ scheduled pipelines with run history",
      "A general ledger, CRM, billing and support desk in daily use",
      "50 GB or more of tabular data",
    ],
    notAFit: [
      "Agencies holding their clients' databases",
      "Empty or barely used CRMs",
    ],
    referrers:
      "Heads of data, analytics engineers, the dbt community and fractional data teams.",
    covers: [
      "Database and warehouse tables",
      "Modeling and pipeline code with run history",
      "Finance, CRM, billing and support records",
    ],
    niceToHave: [
      "Ingestion configs and query logs",
      "A semantic layer or LookML",
      "Dashboards built on the warehouse",
    ],
    questions: [
      "Which warehouse do you use, and how many dbt models or pipelines?",
      "Do you run your own general ledger and CRM?",
      "Roughly how much data, in GB?",
      "How long has the data team been in place?",
    ],
  },
  "video-studio": {
    title: "Video Production Studio",
    summary:
      "License original video you shot and own, from short clips to full-length programs.",
    size: "20–500 employees",
    location: "Anywhere; multilingual content welcome",
    dealNote: "Depends on hours and rights",
    about:
      "We're looking for studios and creators that own their footage outright: talks, sports, sketches, explainers, music videos and educational series. Long-form video of 30 minutes or more is in the shortest supply, and raw footage kept alongside the final edit is a plus.",
    history: "An archive of produced work",
    kinds:
      "Production houses, sports media, creator networks, e-learning and medical education, post-production houses",
    lookingFor: [
      "Original footage the company owns, with appearance releases",
      "100+ hours of video",
      "A clear record of where each video came from",
    ],
    notAFit: [
      "Downloaded or third-party clips",
      "Content under non-commercial or no-derivatives licenses",
    ],
    referrers: "Video producers, creator managers and sports-media staff.",
    covers: ["Finished videos", "Raw footage", "Scripts and transcripts"],
    niceToHave: [
      "Videos of 30 minutes or longer",
      "Vertical short-form video",
      "Raw footage paired with the final edit",
      "Content in several languages",
      "Scripts and transcripts",
    ],
    questions: [
      "How many hours of video do you own outright?",
      "What lengths and formats?",
      "Do you hold appearance releases?",
      "Do you keep raw footage as well as edits?",
    ],
  },
  "call-center": {
    title: "Call Center or BPO",
    summary:
      "License recorded customer conversations, ideally in more than one language.",
    size: "50–5,000 agents",
    location:
      "India, France and francophone markets, Latin America, U.S. Hispanic markets, Japan",
    dealNote: "Depends on hours and languages",
    about:
      "We're looking for contact centers and voice businesses with consented recordings of real conversations. The most useful calls have each speaker on a separate channel. Bilingual calls that switch between English and Hindi, French, Spanish or Japanese are also in demand.",
    history: "An archive of recorded calls",
    kinds:
      "BPOs, bilingual support centers, telesales, voice-agent operators, meeting and podcast platforms",
    lookingFor: [
      "Recorded calls with consent that covers reuse",
      "1,000+ hours of recordings",
      "Each speaker on a separate channel",
    ],
    notAFit: ["Scripted read speech", "Recordings made without consent"],
    referrers:
      "Contact-center operations leads, BPO owners and customer-experience consultants.",
    covers: ["Call audio by channel", "Transcripts and call metadata"],
    niceToHave: [
      "Calls that mix English with Hindi, French, Spanish or Japanese",
      "Transcripts",
      "Three-way calls",
      "Long recordings of a single speaker",
    ],
    questions: [
      "How many hours of recorded calls, and in which languages?",
      "Are speakers recorded on separate channels?",
      "Does caller consent cover reuse of recordings?",
      "Do you keep transcripts?",
    ],
  },
  consulting: {
    title: "Consulting & Advisory Firm",
    summary: "License client deliverables, models and the drafts behind them.",
    size: "20–500 employees",
    location: "Anywhere; English-language work preferred",
    dealNote: "Depends on volume and document depth",
    about:
      "We're looking for professional-services firms whose work product is long, careful documents: reports, financial models, decks and memos. Drafts and source material kept next to the final deliverable are especially valuable. Deliverables are anonymized so clients can't be identified.",
    history: "5+ years of engagements",
    kinds:
      "Strategy and management consulting, financial due diligence, transaction advisory, market and economic research, engineering consultancies",
    lookingFor: [
      "Client deliverables in their original Word, PowerPoint, Excel or PDF files",
      "5+ years of engagements",
      "The right to license deliverables once anonymized",
    ],
    notAFit: [
      "Firms with only marketing collateral and templates",
      "Short or image-only files",
    ],
    referrers:
      "Former consultants, boutique founders, and due-diligence partners.",
    covers: [
      "Final deliverables",
      "Drafts, workpapers and sources",
      "Models and decks",
    ],
    niceToHave: [
      "Drafts and workpapers kept alongside final versions",
      "The source material behind each deliverable",
      "Reports of 60+ pages",
      "Financial models",
      "Decks with complex charts and diagrams",
    ],
    questions: [
      "How many engagements and files do you hold?",
      "Do you keep drafts alongside final versions?",
      "Can deliverables be licensed once anonymized?",
      "Which practice areas do they cover?",
    ],
  },
  "consumer-brand": {
    title: "Consumer Brand or Photo Studio",
    summary: "License original product, apparel and campaign imagery you own.",
    size: "20–500 employees",
    location: "Anywhere",
    dealNote: "Depends on archive size and rights",
    about:
      "We're looking for brands and studios with large archives of original, high-resolution images they own, grouped by product or campaign: several angles of each product, full apparel looks, and ads with their layered source files.",
    history: "An archive of shoots and campaigns",
    kinds:
      "Direct-to-consumer and apparel brands, product photography studios, ad and creative agencies, software companies with UI archives",
    lookingFor: [
      "Original high-resolution images the company owns, with model and usage releases",
      "Images grouped by product or campaign",
      "Thousands of images",
    ],
    notAFit: ["Stock or licensed imagery", "Images without usage rights"],
    referrers: "Creative directors, e-commerce managers and photographers.",
    covers: [
      "Original images",
      "Layered source files",
      "Product and campaign metadata",
    ],
    niceToHave: [
      "Apparel outfit sets",
      "Ads and posters with layered PSD, AI or Figma sources",
      "UI screenshots with their designs",
      "Charts and infographics",
    ],
    questions: [
      "How many original images do you own, with releases?",
      "Are images organized by product or campaign?",
      "Do you keep layered source files?",
      "Has any of it been licensed before?",
    ],
  },
  "research-lab": {
    title: "Biotech & Life Sciences Lab",
    summary:
      "License the experiment records, lab notebooks and trial data you own.",
    size: "20–1,000 employees",
    location: "Anywhere",
    dealNote: "Depends on volume and depth of records",
    about:
      "We're looking for life-sciences R&D organizations whose experiments are written down: lab notebooks, structured run records with measured results, and clinical trial documentation. Biotechs that have wound down and labs with years of archived work are a strong fit. Failed experiments are as valuable as successful ones.",
    history: "Several years of experiment archives",
    kinds:
      "Biotech and biopharma, CROs, genomics and diagnostics labs, consumer genomics companies, academic spin-outs",
    lookingFor: [
      "Electronic lab notebooks or structured experiment records the organization owns",
      "1,000+ runs with their inputs and measured outcomes, failed runs included",
      "Data that hasn't been published",
    ],
    notAFit: [
      "Device or AI-software companies whose data is mainly software logs",
      "Data that has already been published",
      "Data owned by a sponsor or partner",
    ],
    referrers:
      "Founders of wound-down biotechs, CRO staff, lab directors, and materials or process engineers.",
    covers: [
      "Lab notebooks and run records",
      "Measured results and analysis files",
      "Trial documentation, de-identified",
    ],
    niceToHave: [
      "Clinical study reports with patient-level data, tables and analysis plans",
      "Genomic data collected with research consent",
      "In-house assay and analysis tools",
      "Scientists' write-ups of their experiments",
    ],
    questions: [
      "What experimental records do you keep, and in which system?",
      "Roughly how many runs or experiments, over how many years?",
      "Do you own the data outright, including failed runs?",
      "Is any of it patient-level or genomic data, and under what consent?",
    ],
  },
  "software-company": {
    title: "Software Company",
    summary:
      "License the private code the engineering team has built, and the history behind it.",
    size: "20–500 employees",
    location: "Anywhere",
    dealNote: "More for large codebases or exclusive terms",
    about:
      "We're looking for software companies with a real engineering history: private repositories that many engineers have worked on for years, with tests that still run. Live products, retired products and codebases from acquisitions all qualify, as long as the code has never been public. Teams that also kept their tickets, design docs and postmortems are an especially strong fit.",
    history: "3+ years of commits",
    kinds:
      "B2B SaaS, fintech, marketplaces, developer tools, healthtech, and internal platform teams at non-software companies",
    lookingFor: [
      "Private repositories that have never been public, mirrored or open-sourced",
      "3+ years of commit history from at least 10 engineers",
      "50,000+ lines of code the company owns outright",
      "Code written by people, with tests that run",
    ],
    notAFit: [
      "Forks or copies of open-source projects",
      "Student, hackathon or side projects, or code mostly written by AI tools",
      "Client work an agency doesn't own",
      "Repositories with a single author",
    ],
    referrers:
      "CTOs and engineering leaders, founders of acquired or wound-down startups, and investors with portfolio companies that have closed.",
    covers: [
      "Git history with branches and diffs",
      "Pull requests and code reviews",
      "Test suites and CI configuration",
      "Linked tickets and engineering docs, where they exist",
    ],
    niceToHave: [
      "Thousands of pull requests with review discussion",
      "Tickets, design docs, runbooks and postmortems from the same team",
      "Code in C, C++, Rust, Swift, Kotlin, Ruby, COBOL or .NET",
      "Banking, insurance, healthcare, trading or blockchain software",
      "History that mostly predates 2025",
      "Openness to an exclusive license on part of the code",
    ],
    questions: [
      "How many private repositories do you have, and how many engineers have committed to them?",
      "When did development start, and roughly how many pull requests exist?",
      "Which languages make up most of the code?",
      "Has any of this code been public or licensed to anyone before?",
    ],
  },
  "trading-firm": {
    title: "Hedge Fund or Quant Firm",
    summary:
      "License proprietary market, risk and sports data, or the code that trades on it.",
    size: "20–500 employees",
    location: "Anywhere",
    dealNote: "Depends on history and exclusivity",
    about:
      "We're looking for trading firms and data providers with long proprietary time series, such as order-book, liquidity and risk data or sports odds and outcomes. Firms that own their trading infrastructure code also qualify.",
    history: "Multi-year time series",
    kinds:
      "Proprietary trading and HFT, quant funds, broker-dealers, market-data vendors, sportsbooks and sports-statistics providers",
    lookingFor: [
      "Multi-year proprietary time series, or trading infrastructure code, that the firm owns",
      "The right to license it for AI training",
    ],
    notAFit: [
      "Redistributed exchange feeds the firm doesn't own",
      "Data that is already public",
    ],
    referrers:
      "Quant developers, market-structure consultants and sports-betting operators.",
    covers: ["Time-series datasets", "Trading and research code"],
    niceToHave: [
      "Order management systems, FIX/ITCH/OUCH handlers, low-latency engines and backtesters",
      "Research notebooks and backtest results",
      "Sports odds and outcome histories",
    ],
    questions: [
      "Which time series do you own, and how far back?",
      "Can you license it for model training?",
      "Is your trading code free of third-party licenses?",
      "What formats is the data in?",
    ],
  },
};
