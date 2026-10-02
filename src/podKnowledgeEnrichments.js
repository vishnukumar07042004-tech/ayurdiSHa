/**
 * Journal-style enrichments for POD_KNOWLEDGE themes.
 * Merged in podKnowledge.js — official URLs verified Aug 2025.
 */

import { TAB_CONTENT } from "./podKnowledgeTabContent.js";

export const JOURNAL_IMG = {
  T01: "/assets/sections/journal-clinical.webp",
  T02: "/assets/sections/journal-academics.webp",
  T03: "/assets/sections/journal-research.webp",
  T04: "/assets/sections/journal-entrepreneurship.webp",
  T05: "/assets/sections/journal-gmp.webp",
  T06: "/assets/sections/journal-brand.webp",
  T07: "/assets/sections/journal-export.webp",
  T08: "/assets/sections/journal-abroad.webp",
  T09: "/assets/sections/journal-wellness.webp",
  T10: "/assets/sections/journal-policy.webp",
};

export const POD_ENRICHMENTS = {
  T01: {
    overviewProse: [
      "Clinical practice remains the most visible path after BAMS — but the word \"clinical\" hides enormous variety. Some graduates anchor in district AYUSH hospitals under state health services; others build niche Panchakarma studios or join integrative OPD wings where Ayurveda sits beside mainstream medicine.",
      "The regulatory floor is state registration through your State Board of Indian Medicine / AYUSH council. NCISM sets education standards nationally; your licence to practise is still interpreted locally. Before investing in clinic fit-out, read the latest state rules on display, record-keeping, and tele-consult.",
      "Integrative care is growing, not as a replacement for emergency medicine but as chronic-disease support, rehabilitation, and lifestyle medicine. WHO's traditional medicine strategy and India's Ayush infrastructure both point to more structured referral pathways — if you document outcomes and stay inside scope.",
    ],
    pullQuote: {
      text: "A BAMS degree opens the door; registration, mentorship, and patient trust determine how wide it swings.",
      attribution: "AYURDISHA career brief",
    },
    statCallout: {
      stat: "7th CPC",
      label: "Government Medical Officer (Ayurveda) pay bands often start near Level 7 — state allowances vary.",
      caveat: "Verify with latest state health service notifications; not all posts are permanent from day one.",
    },
    journalCards: [
      {
        title: "Ministry of Ayush — policies, schemes, and CGHS Ayurveda benchmarks",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T01,
        imagePosition: "0% 45%",
        imageSize: "210%",
        imageAlt: "Sunlit clinic window with a tulsi plant beside an Ayurveda mentor's consultation desk",
        url: "https://ayush.gov.in",
        snippet: "Official portal for National Ayush Mission updates, education notices, and integrative care policy.",
        time: "Portal · updated regularly",
      },
      {
        title: "NCISM — qualifications, registration framework, and PG norms",
        source: "NCISM",
        sourceLogo: "NCISM",
        image: JOURNAL_IMG.T01,
        imagePosition: "38% 25%",
        imageSize: "210%",
        imageAlt: "Ayurveda physician mentor guiding a BAMS intern through handwritten case notes",
        url: "https://ncismindia.org",
        snippet: "National Commission for Indian System of Medicine — UG/PG standards and professional registration context.",
        time: "Regulatory · 2024–25",
      },
      {
        title: "CCRAS — clinical research and public-health Ayurveda programmes",
        source: "CCRAS",
        sourceLogo: "CCRAS",
        image: JOURNAL_IMG.T01,
        imagePosition: "55% 90%",
        imageSize: "210%",
        imageAlt: "Case-notes folder, stethoscope and copper tumbler on a clinic desk",
        url: "https://ccras.nic.in",
        snippet: "Recruitment, SPARK internships, and evidence summaries relevant to hospital-linked Ayurveda careers.",
        time: "Research council",
      },
      {
        title: "WHO — Traditional, Complementary & Integrative Medicine",
        source: "WHO",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T01,
        imagePosition: "100% 25%",
        imageSize: "210%",
        imageAlt: "Clinic shelves of herb jars and folded therapy towels",
        url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine",
        snippet: "Global framing for integrative care — useful when explaining Ayurveda's role to hospital administrators.",
        time: "Global health",
      },
    ],
    sourceRows: [
      {
        headline: "State registration and scope of Ayurveda practice",
        sources: ["NCISM", "State AYUSH councils", "Ministry of Ayush"],
        urls: [
          { label: "NCISM", url: "https://ncismindia.org" },
          { label: "Ministry of Ayush", url: "https://ayush.gov.in" },
        ],
      },
      {
        headline: "CGHS Ayurveda procedure rates and insurance recognition",
        sources: ["Ministry of Ayush", "CGHS circulars"],
        urls: [{ label: "Ayush CGHS vertical", url: "https://ayush.gov.in" }],
      },
      {
        headline: "Integrative medicine evidence and safety",
        sources: ["WHO TCIM", "CCRAS clinical trials"],
        urls: [
          { label: "WHO TCIM", url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine" },
          { label: "CCRAS", url: "https://ccras.nic.in" },
        ],
      },
    ],
    extraBullets: {
      Overview: [
        "Document clinical outcomes (even simple diaries) — integrative hospitals increasingly ask for data, not only anecdotes.",
        "Panchakarma units need trained therapists, SOPs, and biomedical waste handling — budget these before marketing packages.",
      ],
      "Job opportunities": [
        "AYUSH wellness centres under National Ayush Mission — district postings with public-health exposure.",
        "Insurance-TPA empanelled Ayurveda OPD — growing in tier-1 cities with structured billing.",
      ],
    },
  },

  T02: {
    overviewProse: [
      "Academic careers in Ayurveda are less about a single job title and more about a ladder: PG residency, demonstrator posts, NET/SET where notified, and eventually research-led professorships. NCISM's seat matrix and faculty norms change — always download the latest PG regulations before planning your timeline.",
      "Teaching is not only lectures. Examiners, workshop faculty for NCISM-aligned programmes, and IQAC/NABH documentation roles are steady side income streams for mid-career faculty. Rashtriya Ayurveda Vidyapeeth (RAV) and university departments offer fellowships that keep you clinically sharp while you build a CV.",
      "If you love teaching but dislike bureaucracy, guest faculty and certificate programmes can bridge years while you wait for permanent posts — but track UGC–NCISM eligibility so you do not miss a recruitment window.",
    ],
    pullQuote: {
      text: "PG seats are the bottleneck; faculty posts are the long game — plan both on a five-year horizon.",
      attribution: "Academics track brief",
    },
    statCallout: {
      stat: "AIAPGET / state",
      label: "PG entrance remains highly competitive nationally — seat matrix published by NCISM annually.",
      caveat: "Check current year bulletin; some states run separate quota rules.",
    },
    journalCards: [
      {
        title: "NCISM notifications — PG regulations and faculty eligibility",
        source: "NCISM",
        sourceLogo: "NCISM",
        image: JOURNAL_IMG.T02,
        imagePosition: "0% 30%",
        imageSize: "210%",
        imageAlt: "Tall shelves of cloth-bound books in an Ayurveda college library",
        url: "https://ncismindia.org",
        snippet: "Authoritative source for MD/MS Ayurveda structure and college recognition lists.",
        time: "Regulatory",
      },
      {
        title: "Ministry of Ayush — MD Ayurveda and continuing education",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T02,
        imagePosition: "25% 50%",
        imageSize: "210%",
        imageAlt: "Senior Ayurveda professor explaining a palm-leaf manuscript passage",
        url: "https://ayush.gov.in",
        snippet: "Policy updates on postgraduate medical education in Indian systems of medicine.",
        time: "Education vertical",
      },
      {
        title: "UGC — academic pay and API norms (reference)",
        source: "UGC",
        sourceLogo: "UGC",
        image: JOURNAL_IMG.T02,
        imagePosition: "75% 50%",
        imageSize: "210%",
        imageAlt: "Postgraduate students taking notes at a library reading table",
        url: "https://www.ugc.gov.in",
        snippet: "Cross-check faculty pay scales and research metrics with your university's HR cell.",
        time: "Reference",
      },
      {
        title: "CCRAS — research recruitment and PhD-linked projects",
        source: "CCRAS",
        sourceLogo: "CCRAS",
        image: JOURNAL_IMG.T02,
        imagePosition: "50% 5%",
        imageSize: "210%",
        imageAlt: "Arched library window framing a neem tree in afternoon light",
        url: "https://ccras.nic.in",
        snippet: "Scientist and research associate posts for PGs moving toward evidence-heavy academic tracks.",
        time: "Recruitment ads",
      },
    ],
    sourceRows: [
      {
        headline: "PG seat matrix and college recognition",
        sources: ["NCISM", "Ministry of Ayush"],
        urls: [
          { label: "NCISM", url: "https://ncismindia.org" },
          { label: "Ayush education", url: "https://ayush.gov.in" },
        ],
      },
      {
        headline: "Faculty recruitment and NET/SET requirements",
        sources: ["UGC", "NCISM", "State universities"],
        urls: [{ label: "UGC", url: "https://www.ugc.gov.in" }],
      },
    ],
    extraBullets: {
      "Challenges for new entrants": [
        "Bond periods in government colleges can delay private practice — read offer letters carefully.",
        "NAAC/NABH documentation workload falls on junior faculty early; negotiate clinic time upfront.",
      ],
    },
  },

  T03: {
    overviewProse: [
      "Research in Ayurveda is no longer only literary commentary — CCRAS runs drug standardization, clinical trials, and public-health studies with CTRI registration expectations. WHO's Global Traditional Medicine Centre in Jamnagar puts India on the map for policy-relevant evidence, not just heritage narratives.",
      "A credible research career starts with a answerable question, ethics approval, and pre-specified outcomes. Many BAMS graduates jump to herbal trials without biostatistics training; invest in short courses early — they pay off in grant applications and publication acceptance.",
      "Publication is a skill stack: study design, CONSORT-style reporting, open-data ethics, and journal selection. CCRAS portals advertise SPARK internships — useful résumé lines before you commit to a PhD.",
    ],
    pullQuote: {
      text: "Evidence builds careers when the question is clear and the methods are defensible — not when the sample size is convenient.",
      attribution: "Research track brief",
    },
    statCallout: {
      stat: "CTRI",
      label: "Clinical trials in India should register on CTRI before first patient enrolment.",
      caveat: "Ethics committee approval timelines vary 2–6 months by institution.",
    },
    journalCards: [
      {
        title: "CCRAS — apex Ayurveda research body under Ministry of Ayush",
        source: "CCRAS",
        sourceLogo: "CCRAS",
        image: JOURNAL_IMG.T03,
        imagePosition: "0% 100%",
        imageSize: "210%",
        imageAlt: "Flasks of herbal extracts and dried roots on a research lab bench",
        url: "https://ccras.nic.in",
        snippet: "Institutes, SPARK programme, recruitment, and drug research verticals.",
        time: "Research council",
      },
      {
        title: "WHO Global Traditional Medicine Centre — Jamnagar",
        source: "WHO GTMC",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T03,
        imagePosition: "35% 30%",
        imageSize: "210%",
        imageAlt: "Research mentor and young scientist reviewing study data on a tablet",
        url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre",
        snippet: "International collaborations and evidence priorities for traditional medicine.",
        time: "2023 launch",
      },
      {
        title: "Clinical Trials Registry — India (CTRI)",
        source: "ICMR / CTRI",
        sourceLogo: "CTRI",
        image: JOURNAL_IMG.T03,
        imagePosition: "85% 90%",
        imageSize: "210%",
        imageAlt: "Microscope and rack of herbal test samples in an Ayurveda lab",
        url: "https://ctri.nic.in",
        snippet: "Mandatory registration portal for interventional studies — plan before protocol finalization.",
        time: "Registry",
      },
      {
        title: "WHO Traditional Medicine strategy 2025–2034",
        source: "WHO",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T03,
        imagePosition: "100% 40%",
        imageSize: "210%",
        imageAlt: "Bright lab window lined with medicinal plants",
        url: "https://www.who.int/publications/i/item/9789240106489",
        snippet: "Macro policy context for integrative and traditional medicine research funding globally.",
        time: "Publication",
      },
    ],
    sourceRows: [
      {
        headline: "Ayurveda clinical trial guidelines and pharmacovigilance",
        sources: ["CCRAS", "Ministry of Ayush", "PvPI"],
        urls: [
          { label: "CCRAS", url: "https://ccras.nic.in" },
          { label: "Ayush research", url: "https://ayush.gov.in" },
        ],
      },
      {
        headline: "Research fellowships and grant schemes",
        sources: ["UGC–CSIR JRF", "DBT", "CCRAS projects"],
        urls: [{ label: "CCRAS careers", url: "https://ccras.nic.in" }],
      },
    ],
    extraBullets: {
      "Job opportunities": [
        "Systematic review and meta-analysis consultancies — demand rising for Ayush insurance dossiers.",
        "Clinical research coordinator roles in hospital ethics committees (CRC) after GCP training.",
      ],
    },
  },

  T04: {
    overviewProse: [
      "Ayush entrepreneurship spans regulated medicines, wellness services, and tech — each with different licences, capital needs, and failure modes. Ministry of Ayush start-up challenges and Startup India give visibility, but investors still ask for compliance first, growth second.",
      "Validation means talking to paying customers before scaling manufacturing. A pretty Instagram reel is not product-market fit. Co-founders in operations, finance, or regulatory affairs reduce the classic \"doctor-founder\" blind spot.",
      "IP and traditional knowledge (TKDL) matter for herbals. Patent ethics and FTO searches are not optional if you plan export or venture funding.",
    ],
    pullQuote: {
      text: "The fastest way to lose a start-up is to mis-classify your product under Drugs & Cosmetics vs FSSAI vs cosmetic rules.",
      attribution: "Entrepreneurship brief",
    },
    statCallout: {
      stat: "₹5–20L",
      label: "Typical MVP / pilot budget band cited by early Ayush founders — highly variable by category.",
      caveat: "Manufacturing tie-ups need MOQ deposits; clinic chains need fit-out before revenue.",
    },
    journalCards: [
      {
        title: "Ministry of Ayush — industry, start-ups, and innovation vertical",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T04,
        imagePosition: "0% 10%",
        imageSize: "210%",
        imageAlt: "Planning wall of coloured sticky notes in a founders' studio",
        url: "https://ayush.gov.in",
        snippet: "Challenge programmes, policy notes, and Ayush industry promotion.",
        time: "Policy",
      },
      {
        title: "Startup India — registration, tax benefits, and incubators",
        source: "DPIIT",
        sourceLogo: "SI",
        image: JOURNAL_IMG.T04,
        imagePosition: "40% 30%",
        imageSize: "210%",
        imageAlt: "Mentor and young Ayurveda founder discussing a business plan",
        url: "https://www.startupindia.gov.in",
        snippet: "Central hub for recognition, funding schemes, and state startup policies.",
        time: "Portal",
      },
      {
        title: "Traditional Knowledge Digital Library (TKDL)",
        source: "CSIR–TKDL",
        sourceLogo: "TKDL",
        image: JOURNAL_IMG.T04,
        imagePosition: "40% 100%",
        imageSize: "210%",
        imageAlt: "Pencil sketch of a start-up plan beside an open laptop",
        url: "https://www.tkdl.res.in",
        snippet: "Prior art database — consult before filing herbals patents or export formulations.",
        time: "IP reference",
      },
      {
        title: "WHO GTMC — innovation and evidence for traditional products",
        source: "WHO",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T04,
        imagePosition: "100% 60%",
        imageSize: "210%",
        imageAlt: "Co-founder studying the plan next to unlabeled product sample bottles",
        url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre",
        snippet: "Global lens on scaling traditional medicine products responsibly.",
        time: "International",
      },
    ],
    sourceRows: [
      {
        headline: "Ayush drug licensing vs FSSAI / cosmetic pathways",
        sources: ["Ministry of Ayush", "State FDA", "FSSAI"],
        urls: [
          { label: "Ayush", url: "https://ayush.gov.in" },
          { label: "FSSAI", url: "https://www.fssai.gov.in" },
        ],
      },
      {
        headline: "Incubation and seed funding programmes",
        sources: ["Startup India", "Atal Innovation", "State Ayush missions"],
        urls: [{ label: "Startup India", url: "https://www.startupindia.gov.in" }],
      },
    ],
    extraBullets: {
      "Income & budget": [
        "Revenue-share clinic partnerships can fund ops while you build a brand — negotiate medico-legal liability clearly.",
      ],
    },
  },

  T05: {
    overviewProse: [
      "Manufacturing quality is the backbone of trustworthy Ayurveda on shelf. Licensed units operate under Drugs & Cosmetics rules with GMP schedules, batch records, and pharmacovigilance hooks to PvPI. Ministry of Ayush and PCIM&H pharmacopoeia updates are living documents — QC teams subscribe to notifications.",
      "BAMS graduates enter as production executives, QA analysts, or regulatory assistants; many upskill with pharmaceutical diplomas. Factory discipline (SOP adherence, deviation reporting) matters more than theoretical Dravyaguna recall on day one.",
      "Export-ready units add WHO-GMP, heavy-metal testing, and stability data. Career upside tracks compliance mastery and audit leadership.",
    ],
    pullQuote: {
      text: "In GMP, the batch record is the product — if it is not written, it did not happen.",
      attribution: "Manufacturing brief",
    },
    statCallout: {
      stat: "GMP",
      label: "Ayurvedic manufacturing units require valid state drug licences and periodic inspections.",
      caveat: "Unlicensed 'job work' offers weak CV value and legal exposure.",
    },
    journalCards: [
      {
        title: "Pharmacopoeia Commission for Indian Medicine & Homoeopathy",
        source: "PCIM&H",
        sourceLogo: "PCIMH",
        image: JOURNAL_IMG.T05,
        imagePosition: "0% 90%",
        imageSize: "210%",
        imageAlt: "Precision balance and sample containers in a GMP quality-control room",
        url: "https://pcimh.gov.in",
        snippet: "Official standards for Ayurvedic, Siddha, and Unani formulations.",
        time: "Standards body",
      },
      {
        title: "Ministry of Ayush — medicine quality and production",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T05,
        imagePosition: "30% 30%",
        imageSize: "210%",
        imageAlt: "QA mentor inspecting a tray of herbal tablets under the light",
        url: "https://ayush.gov.in",
        snippet: "Policy on quality control, surveillance, and industry compliance.",
        time: "Regulatory",
      },
      {
        title: "Pharmacovigilance Programme of India (PvPI)",
        source: "IPC / PvPI",
        sourceLogo: "PvPI",
        image: JOURNAL_IMG.T05,
        imagePosition: "60% 55%",
        imageSize: "210%",
        imageAlt: "Trainee recording quality-control observations on a clipboard",
        url: "https://www.ipc.gov.in/PvPI/pvpi.html",
        snippet: "ADR reporting expectations for manufacturers and clinicians.",
        time: "Safety programme",
      },
      {
        title: "Indian Pharmacopoeia Commission — reference standards",
        source: "IPC",
        sourceLogo: "IPC",
        image: JOURNAL_IMG.T05,
        imagePosition: "100% 40%",
        imageSize: "210%",
        imageAlt: "Stainless-steel production vessels behind a GMP glass partition",
        url: "https://ipc.gov.in",
        snippet: "Testing methodologies and reference substances used in QC labs.",
        time: "Reference",
      },
    ],
    sourceRows: [
      {
        headline: "Ayush drug licensing and GMP inspection norms",
        sources: ["State FDA", "Ministry of Ayush", "PCIM&H"],
        urls: [
          { label: "PCIM&H", url: "https://pcimh.gov.in" },
          { label: "Ayush quality", url: "https://ayush.gov.in" },
        ],
      },
      {
        headline: "Pharmacovigilance and ADR reporting for manufacturers",
        sources: ["PvPI", "IPC"],
        urls: [{ label: "PvPI portal", url: "https://www.ipc.gov.in/PvPI/pvpi.html" }],
      },
    ],
    extraBullets: {
      "Job opportunities": [
        "Validation documentation (IQ/OQ/PQ) consultants — niche demand as units upgrade to WHO-GMP.",
      ],
    },
  },

  T06: {
    overviewProse: [
      "Ayush communication sits at the intersection of patient education, brand trust, and strict advertising law. Drugs & Magic Remedies Act and ASCI codes limit cure claims; platforms enforce health misinformation policies aggressively in 2025.",
      "Scientific communication — plain-language summaries of trials, honest outcome framing — differentiates ethical clinicians from influencer noise. Ministry of Ayush IEC vertical publishes campaign assets you can adapt for community work.",
      "Personal branding can feed clinic growth, but registration numbers, disclaimers, and scope limits must appear consistently. One regulatory notice can erase years of follower count.",
    ],
    pullQuote: {
      text: "Compliant copy is not boring copy — it is copy that survives tomorrow's platform policy update.",
      attribution: "Brand & comms brief",
    },
    statCallout: {
      stat: "ASCI",
      label: "Self-regulatory advertising codes apply to health and Ayush claims in India.",
      caveat: "Platform ad policies may be stricter than law — test creatives before scaling spend.",
    },
    journalCards: [
      {
        title: "ASCI — Advertising Standards Council of India",
        source: "ASCI",
        sourceLogo: "ASCI",
        image: JOURNAL_IMG.T06,
        imagePosition: "0% 20%",
        imageSize: "210%",
        imageAlt: "Ayurveda brand moodboard of leaf prints, fabric swatches and colour chips",
        url: "https://asci.org.in",
        snippet: "Codes and recent decisions on health and misleading claims — essential for marketers.",
        time: "Self-regulation",
      },
      {
        title: "Ministry of Ayush — information, education & communication",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T06,
        imagePosition: "35% 45%",
        imageSize: "210%",
        imageAlt: "Brand mentor presenting a plain kraft packaging prototype",
        url: "https://ayush.gov.in",
        snippet: "Campaign themes, public health messaging, and official Ayush Day materials.",
        time: "IEC vertical",
      },
      {
        title: "Press Information Bureau — Ayush releases",
        source: "PIB",
        sourceLogo: "PIB",
        image: JOURNAL_IMG.T06,
        imagePosition: "100% 90%",
        imageSize: "210%",
        imageAlt: "Table of blank packaging prototypes, jars, pouches and dried herbs",
        url: "https://pib.gov.in",
        snippet: "Authoritative press notes — cite these instead of resharing unsourced WhatsApp forwards.",
        time: "News desk",
      },
      {
        title: "WHO TCIM — public communication resources",
        source: "WHO",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T06,
        imagePosition: "100% 20%",
        imageSize: "210%",
        imageAlt: "Studio window and herbs beside the packaging review table",
        url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine",
        snippet: "Global messaging frameworks for integrative health literacy.",
        time: "Global",
      },
    ],
    sourceRows: [
      {
        headline: "Legal limits on therapeutic claims in advertising",
        sources: ["Drugs & Magic Remedies Act", "ASCI", "Ministry of Ayush"],
        urls: [
          { label: "India Code", url: "https://www.indiacode.nic.in" },
          { label: "ASCI", url: "https://asci.org.in" },
        ],
      },
      {
        headline: "Scientific communication and patient education templates",
        sources: ["Ministry of Ayush IEC", "WHO"],
        urls: [{ label: "Ayush IEC", url: "https://ayush.gov.in" }],
      },
    ],
    extraBullets: {
      Overview: [
        "Build a compliance checklist: claim review → medico sign-off → archive approved copy versions.",
      ],
    },
  },

  T07: {
    overviewProse: [
      "Export turns a domestic licence into a dossier problem: COAs, GMP certificates, free-sale documents, and market-specific registrations. APEDA supports agri and processed food exports; finished Ayush drugs need state licensing plus importer rules abroad.",
      "Successful exporters pair QC reliability with logistics literacy — Incoterms, payment terms, and rejection clauses. First orders often fail on heavy-metal or pesticide limits, not on formulation novelty.",
      "Ministry of Ayush export advisories distinguish personal prescription carriage from commercial consignments — do not conflate the two on social media advice.",
    ],
    pullQuote: {
      text: "Your first export order teaches more than any MBA elective — if you survive the documentation.",
      attribution: "Export brief",
    },
    statCallout: {
      stat: "APEDA",
      label: "Export promotion and buyer–seller meets for agri and processed foods including herbals.",
      caveat: "Finished Ayush drug export needs additional drug-regulatory certificates per destination.",
    },
    journalCards: [
      {
        title: "APEDA — Agricultural & Processed Food Products Export Development Authority",
        source: "APEDA",
        sourceLogo: "APEDA",
        image: JOURNAL_IMG.T07,
        imagePosition: "0% 80%",
        imageSize: "210%",
        imageAlt: "Stacked jute sacks of dried herbs ready for export",
        url: "https://apeda.gov.in",
        snippet: "Registration, trade fairs, and organic export schemes for herb and food categories.",
        time: "Export promotion",
      },
      {
        title: "Directorate General of Foreign Trade (DGFT)",
        source: "DGFT",
        sourceLogo: "DGFT",
        image: JOURNAL_IMG.T07,
        imagePosition: "45% 25%",
        imageSize: "210%",
        imageAlt: "Export mentor walking a trade trainee through shipping paperwork",
        url: "https://www.dgft.gov.in",
        snippet: "IEC codes, export policy notifications, and scrip schemes.",
        time: "Trade policy",
      },
      {
        title: "Ministry of Ayush — export advisories",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T07,
        imagePosition: "55% 95%",
        imageSize: "210%",
        imageAlt: "Shipping document folder, stamp and sealed herb sample on a counter",
        url: "https://ayush.gov.in",
        snippet: "Guidance on shipping Ayurvedic medicines and wellness products internationally.",
        time: "Advisories",
      },
      {
        title: "Export Inspection Council (EIC)",
        source: "EIC",
        sourceLogo: "EIC",
        image: JOURNAL_IMG.T07,
        imagePosition: "100% 45%",
        imageSize: "210%",
        imageAlt: "Loading bay with a shipping container in golden afternoon light",
        url: "https://www.eicindia.gov.in",
        snippet: "Quality certification for export consignments in applicable categories.",
        time: "Certification",
      },
    ],
    sourceRows: [
      {
        headline: "Export documentation for Ayush finished formulations",
        sources: ["Ministry of Ayush", "State licensing authority", "DGFT"],
        urls: [
          { label: "Ayush export", url: "https://ayush.gov.in" },
          { label: "DGFT", url: "https://www.dgft.gov.in" },
        ],
      },
      {
        headline: "Organic and NPOP certification for herb supply chains",
        sources: ["APEDA", "NPOP"],
        urls: [{ label: "APEDA organic", url: "https://apeda.gov.in" }],
      },
    ],
    extraBullets: {
      "Challenges for new entrants": [
        "EU traditional herbal registration timelines often exceed 18 months — model cash flow accordingly.",
      ],
    },
  },

  T08: {
    overviewProse: [
      "Practising abroad is a licensing puzzle, not a single exam. BAMS is well understood in India; overseas employers may classify you as wellness therapist, complementary practitioner, or research fellow — each with different visa and malpractice rules.",
      "WHO GTMC and Ministry of Ayush international cooperation improve visibility, but they do not grant foreign medical licences. Start with country-specific regulator websites and credential evaluation agencies 2–4 years before you plan to move.",
      "Wellness resort roles can be legitimate stepping stones if contracts define scope, housing, and renewal — read employment law basics for the destination emirate or EU state.",
    ],
    pullQuote: {
      text: "Mobility succeeds when visa category, job scope, and qualification recognition align — rarely on the first application.",
      attribution: "Practice abroad brief",
    },
    statCallout: {
      stat: "2–4 yr",
      label: "Realistic planning horizon for credential evaluation and language prep before emigration.",
      caveat: "Tourist-visa work is illegal in most destinations — reject those 'offers'.",
    },
    journalCards: [
      {
        title: "Ministry of Ayush — international cooperation",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T08,
        imagePosition: "0% 20%",
        imageSize: "210%",
        imageAlt: "Mentor's study bookshelf with a trailing money plant",
        url: "https://ayush.gov.in",
        snippet: "MOUs, diaspora events, and policy on cross-border Ayush practice.",
        time: "Bilateral",
      },
      {
        title: "WHO Global Traditional Medicine Centre",
        source: "WHO GTMC",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T08,
        imagePosition: "35% 45%",
        imageSize: "210%",
        imageAlt: "Ayurveda mentor turning a brass world globe with a graduate",
        url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre",
        snippet: "Global hub linking traditional medicine policy to workforce mobility discussions.",
        time: "Jamnagar",
      },
      {
        title: "WHO Traditional Medicine strategy 2025–2034",
        source: "WHO",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T08,
        imagePosition: "65% 25%",
        imageSize: "210%",
        imageAlt: "Young BAMS graduate preparing for overseas practice",
        url: "https://www.who.int/publications/i/item/9789240106489",
        snippet: "Framework for recognition and integration of traditional practitioners in health systems.",
        time: "Strategy doc",
      },
      {
        title: "Ministry of External Affairs — emigration resources",
        source: "MEA",
        sourceLogo: "MEA",
        image: JOURNAL_IMG.T08,
        imagePosition: "100% 70%",
        imageSize: "210%",
        imageAlt: "Packed leather travel bag by a sunlit window",
        url: "https://www.mea.gov.in",
        snippet: "Consular guidance and emigration act references for workers going overseas.",
        time: "Consular",
      },
    ],
    sourceRows: [
      {
        headline: "Country-wise Ayurveda recognition and visa routes",
        sources: ["Ministry of Ayush", "Destination regulators", "Embassies"],
        urls: [
          { label: "Ayush international", url: "https://ayush.gov.in" },
          { label: "MEA", url: "https://www.mea.gov.in" },
        ],
      },
      {
        headline: "Credential evaluation and bridging programmes",
        sources: ["NCISM", "Foreign universities"],
        urls: [{ label: "NCISM", url: "https://ncismindia.org" }],
      },
    ],
    extraBullets: {
      "Job opportunities": [
        "Ayurveda instructor roles in accredited yoga schools abroad — often part-time while studying local language.",
      ],
    },
  },

  T09: {
    overviewProse: [
      "Medical Value Travel packages combine clinical Ayurveda, hospitality, and logistics. India markets Ayush alongside conventional care; NABH accreditation signals baseline quality to facilitators and embassies.",
      "Careers span resident medical officers, international patient coordinators, and quality managers who speak both clinical SOP and guest experience. Seasonality hits Kerala and Rishikesh hubs — plan income smoothing.",
      "Ethical MVT avoids overpromising cures through facilitators. Consent forms, package inclusions, and follow-up tele-consult boundaries must be written before marketing to Europe or Gulf markets.",
    ],
    pullQuote: {
      text: "International patients buy certainty — schedules, English communication, and documented consent — as much as Panchakarma.",
      attribution: "MVT brief",
    },
    statCallout: {
      stat: "NABH",
      label: "Accreditation frameworks exist for hospitals and wellness centres serving medical travellers.",
      caveat: "Accreditation is voluntary but increasingly requested by facilitators.",
    },
    journalCards: [
      {
        title: "Ministry of Ayush — medical value travel initiatives",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T09,
        imagePosition: "0% 90%",
        imageSize: "210%",
        imageAlt: "Brass uruli of floating flowers and folded towels at a wellness retreat",
        url: "https://ayush.gov.in",
        snippet: "Policy push for Ayush-inclusive MVT packages and quality benchmarks.",
        time: "MVT vertical",
      },
      {
        title: "Ministry of Tourism — India tourism policy",
        source: "MoT",
        sourceLogo: "MoT",
        image: JOURNAL_IMG.T09,
        imagePosition: "25% 30%",
        imageSize: "210%",
        imageAlt: "Wellness-centre director mentoring graduates on a Kerala veranda",
        url: "https://tourism.gov.in",
        snippet: "National context for wellness tourism and hospitality standards.",
        time: "Policy",
      },
      {
        title: "NABH — accreditation standards",
        source: "NABH",
        sourceLogo: "NABH",
        image: JOURNAL_IMG.T09,
        imagePosition: "60% 40%",
        imageSize: "210%",
        imageAlt: "Young BAMS graduates planning a retreat layout together",
        url: "https://nabh.co",
        snippet: "Hospital and wellness centre accreditation checklists relevant to international patients.",
        time: "Accreditation",
      },
      {
        title: "WHO — TCIM in health systems",
        source: "WHO",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T09,
        imagePosition: "100% 35%",
        imageSize: "210%",
        imageAlt: "Backwater view with a tiled-roof therapy cottage among palms",
        url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine",
        snippet: "Integration standards useful when designing MVT clinical pathways.",
        time: "Global health",
      },
    ],
    sourceRows: [
      {
        headline: "Designing Ayush MVT packages with clinical boundaries",
        sources: ["Ministry of Ayush", "NABH", "MoT"],
        urls: [
          { label: "Ayush MVT", url: "https://ayush.gov.in" },
          { label: "NABH", url: "https://nabh.co" },
        ],
      },
      {
        headline: "International patient desk operations and visa support letters",
        sources: ["Hospitals", "MEA facilitators"],
        urls: [{ label: "Tourism policy", url: "https://tourism.gov.in" }],
      },
    ],
    extraBullets: {
      "Income & budget": [
        "Resort packages sometimes include accommodation — compare gross salary vs living cost in hub cities.",
      ],
    },
  },

  T10: {
    overviewProse: [
      "Policy and public health careers put Ayurveda inside district health societies, National Ayush Mission implementation, and multilateral research networks. The work is slower than clinic revenue but shapes population-level access.",
      "State AYUSH medical officer recruitment runs through PSC exams with long cycles. Contract consultants on Ministry or NHM projects offer entry points if you tolerate renewal uncertainty.",
      "WHO GTMC and NGO tribal-health programmes increasingly mention traditional medicine — PG, publications, or an MPH strengthen global agency applications.",
    ],
    pullQuote: {
      text: "Public health impact is measured in years and districts — not in next month's OPD count.",
      attribution: "Policy brief",
    },
    statCallout: {
      stat: "NAM",
      label: "National Ayush Mission funds dispensaries, hospitals, and AYUSH public-health outreach.",
      caveat: "Implementation roles sit with state health societies — follow state NHM portals for jobs.",
    },
    journalCards: [
      {
        title: "Ministry of Ayush — National Ayush Mission & schemes",
        source: "Ministry of Ayush",
        sourceLogo: "AYUSH",
        image: JOURNAL_IMG.T10,
        imagePosition: "0% 50%",
        imageSize: "210%",
        imageAlt: "Young Ayurveda professionals taking notes at a policy round-table",
        url: "https://ayush.gov.in",
        snippet: "Mission documents, funding norms, and programme evaluation reports.",
        time: "Scheme hub",
      },
      {
        title: "National Health Mission — Ayush integration",
        source: "NHM",
        sourceLogo: "NHM",
        image: JOURNAL_IMG.T10,
        imagePosition: "40% 30%",
        imageSize: "210%",
        imageAlt: "Public-health mentor leading a policy discussion",
        url: "https://nhm.gov.in",
        snippet: "District health society structures where AYUSH posts are deployed.",
        time: "Health mission",
      },
      {
        title: "CCRAS — public health research",
        source: "CCRAS",
        sourceLogo: "CCRAS",
        image: JOURNAL_IMG.T10,
        imagePosition: "85% 50%",
        imageSize: "210%",
        imageAlt: "Participants debating public-health priorities at the table",
        url: "https://ccras.nic.in",
        snippet: "Community studies and policy-relevant Ayurveda research recruitment.",
        time: "Research",
      },
      {
        title: "WHO Global Traditional Medicine Centre",
        source: "WHO GTMC",
        sourceLogo: "WHO",
        image: JOURNAL_IMG.T10,
        imagePosition: "50% 90%",
        imageSize: "210%",
        imageAlt: "Round conference table with folders, water glasses and marigolds",
        url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre",
        snippet: "Fellowships and consultancies at the intersection of policy and traditional medicine.",
        time: "Global agency",
      },
    ],
    sourceRows: [
      {
        headline: "State AYUSH medical officer recruitment and service rules",
        sources: ["State PSC", "UPSC", "Ministry of Ayush"],
        urls: [
          { label: "UPSC", url: "https://upsc.gov.in" },
          { label: "Ayush schemes", url: "https://ayush.gov.in" },
        ],
      },
      {
        headline: "District programme management under National Ayush Mission",
        sources: ["NHM", "State health societies"],
        urls: [{ label: "NHM", url: "https://nhm.gov.in" }],
      },
    ],
    extraBullets: {
      "Job opportunities": [
        "Young professional contracts on Ministry of Ayush projects — watch ayush.gov.in careers section.",
      ],
    },
  },
};

export function mergePodEnrichment(pod) {
  const e = POD_ENRICHMENTS[pod.code];
  const tabContent = TAB_CONTENT[pod.code] || null;

  const sections = pod.sections.map(sec => {
    const extra = e?.extraBullets?.[sec.title];
    const merged = extra?.length
      ? { ...sec, bullets: [...sec.bullets, ...extra] }
      : sec;
    return merged;
  });

  if (!e && !tabContent) return pod;

  return {
    ...pod,
    overviewProse: e?.overviewProse || tabContent?.overview?.prose || [],
    pullQuote: e?.pullQuote || null,
    statCallout: e?.statCallout || null,
    journalCards: e?.journalCards || [],
    sourceRows: e?.sourceRows || [],
    tabContent,
    sections,
  };
}
