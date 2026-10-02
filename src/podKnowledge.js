/**
 * Career knowledge pages for AYURDISHA national themes.
 * Sources: Ministry of Ayush, CCRAS, NCISM, WHO, APEDA, published policy docs.
 * Income figures are indicative ranges — verify locally; they vary by state and setting.
 */

import { mergePodEnrichment } from "./podKnowledgeEnrichments.js";

const POD_KNOWLEDGE_BASE = [
  {
    id: "T01",
    code: "T01",
    title: "Clinical Practice & Integrative Care",
    heroImage: "/assets/sections/pod-clinical.webp",
    tagline: "Hospital posts, private clinics, Panchakarma centres, and integrative referrals after BAMS.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "BAMS graduates may practise Ayurveda under state registration rules; clinical roles span government AYUSH hospitals, private clinics, Panchakarma therapy units, and wellness centres.",
          "Integrative care means working alongside allopathic teams where permitted — referrals, co-located OPD, and therapy services rather than replacing mainstream emergency care.",
          "Career depth grows with PG (MD Ayurveda), hospital experience, and niche skills (Panchakarma, Ksharasutra, Marma, geriatric care).",
          "Ministry of Ayush publishes CGHS benchmark rates for Ayurveda procedures — useful reference for what insurers and institutions recognise.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Medical Officer (Ayurveda) in state health services and NHM-linked AYUSH dispensaries.",
          "Consultant / RMO in private Ayurveda hospitals and multi-specialty chains with AYUSH wings.",
          "Panchakarma therapist-supervisor or clinic owner (often after apprenticeship or PG).",
          "Corporate wellness programmes and insurance-empanelled Ayurveda OPD.",
          "Tele-consult platforms (subject to state telemedicine and registration rules).",
          "Integrative roles in yoga retreats and medical value travel centres (often wellness-focused).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "State-wise registration and clinic licensing rules differ — check your State AYUSH council before opening practice.",
          "Patient trust and referral networks take time; many graduates underestimate the first 12–18 months of clinic build-up.",
          "Integrative settings require clear scope-of-practice boundaries and documentation.",
          "Startup costs for Panchakarma infrastructure (equipment, trained staff, hygiene systems) can be high relative to early revenue.",
          "Advertising and claims must follow Drugs & Magic Remedies Act and ASCI / platform policies — no guaranteed cures.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Government Medical Officer (Ayurveda): typically approx. ₹56,000–₹1,10,000/month gross (7th CPC pay levels; varies by state, grade, and allowances).",
          "Private hospital employment: often approx. ₹25,000–₹60,000/month for fresh graduates; senior consultants higher with revenue share.",
          "Own clinic: net income highly variable — many report ₹30,000–₹1,50,000+/month after 2–3 years; early months may barely cover rent and staff.",
          "Budget for clinic setup: modest OPD from approx. ₹3–8 lakh; Panchakarma unit often ₹15–40 lakh+ depending on scale and city.",
          "Always treat these as ranges; verify with local practitioners and latest state pay commissions.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — home", url: "https://ayush.gov.in" },
      { label: "NCISM — education & registration framework", url: "https://ncismindia.org" },
      { label: "CCRAS — clinical & public health research", url: "https://ccras.nic.in" },
      { label: "Ayush in India (Ministry publication portal)", url: "https://ayush.gov.in" },
      { label: "WHO — Traditional, Complementary & Integrative Medicine", url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine" },
    ],
  },
  {
    id: "T02",
    code: "T02",
    title: "Academics, Teaching & Higher Education",
    heroImage: "/assets/sections/pod-academics.webp",
    tagline: "PG branches, PhD pathways, faculty posts, and academic leadership in AYUSH institutions.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "After BAMS, MD/MS Ayurveda is the main academic-clinical ladder; PhD follows for research faculty and senior academic roles.",
          "NCISM regulates UG/PG standards, seat matrix, and faculty eligibility norms for Ayurveda colleges.",
          "Rashtriya Ayurveda Vidyapeeth (RAV) and university departments offer fellowships, certificate programmes, and faculty development.",
          "Teaching careers combine clinic hours, lectureship, exam work, and increasingly NAAC / NABH-linked quality roles.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "MD/MS postgraduate trainee → Assistant Professor track in government or private Ayurveda colleges.",
          "Demonstrator / Tutor / Lecturer posts (often requires PG; NET/equivalent where notified).",
          "PhD scholar → Research Associate / Scientist roles at CCRAS institutes and deemed universities.",
          "Curriculum developer, examiner, and workshop faculty for NCISM-aligned programmes.",
          "Academic administrator: HOD, Principal, IQAC coordinator (senior track).",
          "Guest faculty and online certificate courses (RAV, university MOOCs).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "Limited PG seats nationally — entrance competition (AIAPGET / state quotas) is intense.",
          "Faculty posts may require PG plus NET/SET or equivalent per latest UGC–NCISM notifications.",
          "Private college salaries can lag government scales; bond and service rules vary.",
          "Balancing thesis, clinic, and teaching in PG years requires planning.",
          "PhD duration and funding uncertainty if not tied to a funded project.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "MD/MS stipend (institutional): often approx. ₹35,000–₹55,000/month where paid; many states follow government resident doctor scales.",
          "Assistant Professor (Ayurveda): approx. ₹57,000–₹90,000/month entry (UGC 7th CPC + AGP; varies by state university vs central).",
          "Private college lecturer: commonly approx. ₹35,000–₹70,000/month for fresh PG — negotiate clinic share separately.",
          "Budget: PG course fees vary widely (approx. ₹2–15 lakh total depending on college and quota); coaching for entrance adds ₹50,000–₹2 lakh.",
          "PhD often lower cash stipend unless on CSIR/ICMR/CCRAS project — plan living costs accordingly.",
        ],
      },
    ],
    references: [
      { label: "NCISM — National Commission for Indian System of Medicine", url: "https://ncismindia.org" },
      { label: "Ministry of Ayush — MD course & CGN guidelines", url: "https://ayush.gov.in" },
      { label: "Rashtriya Ayurveda Vidyapeeth (RAV)", url: "https://ayush.gov.in" },
      { label: "CCRAS — research careers & recruitment", url: "https://ccras.nic.in" },
      { label: "UGC — academic career norms (reference)", url: "https://www.ugc.gov.in" },
    ],
  },
  {
    id: "T03",
    code: "T03",
    title: "Research, Evidence & Publication",
    heroImage: "/assets/sections/pod-research.webp",
    tagline: "Framing questions, ethics, grants, and publishing credible Ayurveda evidence.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "CCRAS is the apex Ayurveda research body under Ministry of Ayush — drug standardization, clinical trials, literary research, and public health studies.",
          "Research careers exist in CCRAS regional institutes (CARI/RARI/NARI), university PhD centres, ICMR-adjacent work, and international TCIM collaborations.",
          "WHO Global Traditional Medicine Centre (Jamnagar) signals growing demand for rigorous, policy-relevant traditional medicine evidence.",
          "Good research starts with a clear question, ethics approval, and realistic sample / funding — not only thesis completion.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Junior / Senior Research Fellow on CCRAS, DBT, ICMR, or university projects.",
          "Research Associate and Scientist posts at CCRAS institutes (walk-in and direct recruitment).",
          "PhD → postdoctoral fellowships; some move to WHO GTMC partner networks.",
          "Medical writer / biostatistics support for Ayush clinical studies (contract roles).",
          "Journal peer review, editorial assistant, and evidence synthesis consultancies.",
          "SPARK and short-term research internships advertised on CCRAS portal.",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "Grant funding is competitive; many projects are project-based contracts, not permanent early on.",
          "Ethics committee approvals and CTRI registration add months before first patient enrolled.",
          "Publishing in indexed journals requires methodology training — biostatistics gap is common after BAMS.",
          "Salaries during PhD/JRF may be modest relative to clinical practice.",
          "Balancing clinical duty with research output in college settings.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "JRF (UGC–CSIR scales): approx. ₹31,000–₹35,000/month + HRA for NET-qualified fellows (check current fellowship notification).",
          "SRF / project staff at CCRAS: approx. ₹35,000–₹55,000/month depending on post and project (see recruitment ads).",
          "Research Associate (I): often approx. ₹47,000–₹60,000/month on Ayurveda/pharma projects — verify per advertisement.",
          "Budget: PhD fees + conference travel approx. ₹1–3 lakh over degree; short courses in research methods ₹10,000–₹50,000.",
          "Long-term academic research track can match faculty pay; pure contract research is less stable.",
        ],
      },
    ],
    references: [
      { label: "CCRAS — Central Council for Research in Ayurvedic Sciences", url: "https://ccras.nic.in" },
      { label: "WHO Global Traditional Medicine Centre", url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre" },
      { label: "WHO — Traditional Medicine health topic", url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine" },
      { label: "Clinical Trials Registry — India (CTRI)", url: "https://ctri.nic.in" },
      { label: "Ministry of Ayush — research & schemes", url: "https://ayush.gov.in" },
    ],
  },
  {
    id: "T04",
    code: "T04",
    title: "Entrepreneurship & Start-ups",
    heroImage: "/assets/sections/pod-entrepreneurship.webp",
    tagline: "Validating ideas, incubation, funding, and building Ayush-aligned ventures.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "Ayush entrepreneurship spans clinics-with-brand, D2C herbals, SaaS for practitioners, wellness apps, and B2B supply — each with different regulation.",
          "Ministry of Ayush promotes start-ups through challenge programmes, incubators, and policy support for Ayush industry verticals.",
          "Validation before scale: license pathway (AYUSH drug vs food vs cosmetic), GMP if manufacturing, and truthful marketing claims.",
          "Many founders combine clinical credibility with co-founders in ops, finance, or tech.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Founder of Ayurveda clinic chain, tele-Ayurveda, or niche therapy studio.",
          "Co-founder / medical advisor in Ayush FMCG or supplement start-ups (regulatory care essential).",
          "Incubation fellow at Atal Incubation, university Ayush cells, or sector accelerators.",
          "Ayush start-up challenge grantee (Ministry / state missions).",
          "B2B: sourcing, formulation consulting, export-readiness for small manufacturers.",
          "Operations roles in funded Ayush wellness brands (growth, supply chain, compliance).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "Regulatory classification errors (drug vs nutraceutical vs cosmetic) can shut down a product line.",
          "Cash flow: retail and D2C need working capital; clinic chains need fit-out before revenue.",
          "Investor familiarity with Ayush varies — pitch with compliance and evidence, not only tradition narratives.",
          "IP and traditional knowledge protection (TKDL, patent ethics) need legal advice for herbals.",
          "Team gaps: clinical founders often underestimate marketing, GST, and inventory costs.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Early start-up founder salary: often ₹0–₹40,000/month reinvested for 12–24 months; grant stipends vary by programme.",
          "Funded Ayush start-up (seed): team salaries approx. ₹40,000–₹1,00,000/month depending on city and round.",
          "Successful D2C Ayush brand founders: highly variable; many fail, survivors scale on margins typical of FMCG (net often single-digit to low teens % until scale).",
          "Budget: MVP / pilot approx. ₹5–20 lakh; licensed manufacturing tie-up adds deposit and MOQ costs.",
          "Incubation may offer subsidised desk + mentorship — still budget ₹3–6 months living expenses.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — entrepreneurs & industry vertical", url: "https://ayush.gov.in" },
      { label: "Startup India portal", url: "https://www.startupindia.gov.in" },
      { label: "APEDA — processed food & organic export ecosystem", url: "https://apeda.gov.in" },
      { label: "WHO GTMC — innovation & evidence", url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre" },
      { label: "Traditional Knowledge Digital Library (CSIR)", url: "https://www.tkdl.res.in" },
    ],
  },
  {
    id: "T05",
    code: "T05",
    title: "Manufacturing, Quality & GMP",
    heroImage: "/assets/sections/pod-gmp.webp",
    tagline: "Formulation R&D, GMP units, QA/QC, licensing, and pharmacovigilance in Ayush pharma.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "Ayush manufacturing is regulated under Drugs & Cosmetics Act frameworks for Ayurvedic, Siddha, and Unani medicines — GMP, licensing, and batch records are non-negotiable.",
          "Roles span R&D pharmacist, production executive, QA/QC analyst, regulatory affairs, and PV officer in licensed manufacturing units.",
          "Ministry of Ayush emphasises quality standards, pharmacopoeia compliance, and export-ready documentation.",
          "Career stability is often higher in established brands than in unlicensed or contract grey markets.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Production / manufacturing pharmacist in licensed Ayush units.",
          "QA/QC chemist — raw material, in-process, and finished product testing.",
          "Regulatory affairs: state FDA / Ayush drug licensing filings and renewal.",
          "R&D formulation assistant (classical and proprietary formulations).",
          "Pharmacovigilance associate for ADR reporting and PvPI liaison.",
          "Third-party audit, GMP consulting, and validation documentation (experienced track).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "BAMS alone may not suffice for some QA/R&D posts — B.Pharm or M.Pharm Ayush specialisation often preferred.",
          "Factory roles in tier-2 locations; shift work and strict SOP culture.",
          "Regulatory changes and pharmacopoeia updates require continuous learning.",
          "Small unorganised units may offer quick jobs but weak compliance exposure — risky for long-term CV.",
          "Export markets demand extra certifications (WHO-GMP, organic, heavy-metal limits).",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Fresh QA/QC or production executive: approx. ₹18,000–₹35,000/month in regional units; ₹30,000–₹55,000 in large national brands.",
          "Regulatory affairs (2–5 years exp.): approx. ₹40,000–₹80,000/month.",
          "Plant head / QA head: approx. ₹80,000–₹2,00,000+/month in mid-size companies.",
          "Budget: add-on diplomas in pharmaceutical QA/GMP approx. ₹50,000–₹2 lakh.",
          "Salaries vary sharply by company size and city; verify on Naukri/LinkedIn for your state.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — medicine quality & production vertical", url: "https://ayush.gov.in" },
      { label: "Pharmacopoeia Commission for Indian Medicine & Homoeopathy (PCIM&H)", url: "https://pcimh.gov.in" },
      { label: "Indian Pharmacopoeia Commission (reference standards)", url: "https://ipc.gov.in" },
      { label: "PvPI — Pharmacovigilance Programme of India", url: "https://www.ipc.gov.in/PvPI/pvpi.html" },
      { label: "FSSAI — for Ayush Aahara (food category) regulations portal", url: "https://www.fssai.gov.in" },
    ],
  },
  {
    id: "T06",
    code: "T06",
    title: "Brand Building & Communication",
    heroImage: "/assets/sections/pod-brand.webp",
    tagline: "Positioning, digital presence, scientific communication, and compliant Ayush marketing.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "Ayush brands must balance storytelling with legal claims limits — Drugs & Magic Remedies Act, ASCI guidelines, and platform ad policies apply.",
          "Roles suit clinicians who write well, science communicators, and digital marketers willing to learn Ayush regulation.",
          "Scientific communication builds trust: patient education, doctor-facing content, and evidence summaries.",
          "Personal brand for practitioners (ethical Instagram/YouTube) overlaps with clinic growth but needs registration and disclaimers.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Content lead / medical writer for Ayush companies and wellness brands.",
          "Social media manager with compliance review workflow.",
          "Community educator for NGOs and National Ayush Mission health camps.",
          "Scientific affairs — translating research into label and brochure language.",
          "PR agency roles on Ayush accounts; crisis handling for claim disputes.",
          "Independent health creator with clinical backup (high risk if non-compliant).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "One viral claim can trigger regulatory notice or platform ban.",
          "Clients may push superlative language — learn to push back with compliant copy.",
          "Measuring ROI on Ayurveda content is slower than performance marketing niches.",
          "Competing with non-qualified influencers who ignore rules.",
          "Need portfolio: start with patient FAQs, college magazine, or internship with Ayush brand.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Junior medical writer / content executive: approx. ₹25,000–₹45,000/month.",
          "Digital marketing specialist (Ayush vertical): approx. ₹30,000–₹60,000/month.",
          "Freelance clinician-creator: highly variable — ₹0 to ₹1,00,000+/month from mixed clinic + brand deals; most earn modest side income.",
          "Budget: short courses in medical writing / digital marketing approx. ₹20,000–₹1 lakh.",
          "Agency career path can scale to ₹8–15 LPA with experience in metro cities.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — information, education & communication", url: "https://ayush.gov.in" },
      { label: "ASCI — advertising self-regulation (India)", url: "https://asci.org.in" },
      { label: "WHO — TCIM public communication resources", url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine" },
      { label: "Press Information Bureau — Ayush releases", url: "https://pib.gov.in" },
      { label: "Drugs & Magic Remedies Act (India Code reference)", url: "https://www.indiacode.nic.in" },
    ],
  },
  {
    id: "T07",
    code: "T07",
    title: "Export & Global Trade",
    heroImage: "/assets/sections/pod-export.webp",
    tagline: "Documentation, certifications, market entry, and shipping Ayush products worldwide.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "Ayush exports include herbal raw materials, finished formulations, wellness products, and services — each country has distinct import rules.",
          "APEDA promotes agricultural and processed food exports; Ayush finished drugs often route through state licensing plus importer requirements.",
          "Ministry of Ayush has issued advisories on export documentation — personal-use prescription export differs from commercial consignments.",
          "Success needs QC documentation, stable supply, and a freight-forwarder / CHA partner early.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Export executive in Ayush pharma or herb trading house.",
          "Regulatory documentation specialist (COA, GMP, free sale certificate).",
          "Quality and traceability lead for organic / NPOP-certified herb supply chains.",
          "Business development for EU, Middle East, ASEAN markets.",
          "APEDA-linked buyer–seller meets and trade fair delegations.",
          "Consultant for MSME units entering first export order.",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "Country-specific registration (e.g. EU traditional herbal registration, US dietary supplement pathway) is slow and costly.",
          "Heavy-metal, pesticide, and microbial specs differ by market — batch failures are expensive.",
          "Currency, payment risk, and Incoterms literacy required.",
          "No NOC shortcuts for commercial export — verify latest Ayush / CDSCO circulars.",
          "Small batches often uneconomical until MOQ and logistics optimised.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Export documentation executive: approx. ₹22,000–₹40,000/month.",
          "Export manager (3+ years): approx. ₹50,000–₹1,20,000/month + incentives on shipments.",
          "Founder-exporter MSME: margins vary; first-year profit often reinvested in certifications (approx. ₹5–25 lakh setup).",
          "Budget: trade fair participation, samples, and cert testing approx. ₹2–10 lakh annually for serious entry.",
          "APEDA schemes occasionally subsidise participation — watch apeda.gov.in notices.",
        ],
      },
    ],
    references: [
      { label: "APEDA — export promotion", url: "https://apeda.gov.in" },
      { label: "Ministry of Ayush — export advisories & publications", url: "https://ayush.gov.in" },
      { label: "Directorate General of Foreign Trade (DGFT)", url: "https://www.dgft.gov.in" },
      { label: "WHO — herbal medicines & international standards", url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine" },
      { label: "Export Inspection Council (EIC) — quality certification", url: "https://www.eicindia.gov.in" },
    ],
  },
  {
    id: "T08",
    code: "T08",
    title: "Practice Abroad & Practitioner Mobility",
    heroImage: "/assets/sections/pod-abroad.webp",
    tagline: "Country recognition, visas, bridging qualifications, and wellness roles overseas.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "BAMS is not automatically a medical licence abroad — each country defines who may diagnose, prescribe, or offer Ayurveda as complementary therapy.",
          "Common pathways: wellness therapist / Ayurveda consultant in spas and retreats, further degrees abroad, research roles, or registration in countries with explicit Ayush recognition.",
          "WHO GTMC and bilateral Ayush diplomacy improve visibility but do not replace local law.",
          "Mobility planning should start 2–4 years before intended move — language, exams, and credential evaluation.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Ayurveda therapist or wellness consultant in UAE, Europe, Southeast Asia resorts (often wellness scope, not full physician).",
          "Academic or research fellowships at universities with integrative medicine departments.",
          "Product development and training roles for global Ayush brands.",
          "Ayurveda instructor for yoga/Ayurveda schools (part-time while studying).",
          "Tele-education and content roles for diaspora markets (check local telehealth law).",
          "Indian embassy / cultural centre wellness events (short-term).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "Visa category must match job — tourist visa work is illegal and common pitfall.",
          "Credential evaluation fees and rejected equivalency applications.",
          "Scope limits: many jobs are massage/therapy tier, not MD-equivalent pay or status.",
          "Licensing exams in countries with formal Ayurveda registration (where available).",
          "Malpractice insurance and local language for patient communication.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Wellness resort therapist abroad: approx. USD 1,500–3,500/month (varies widely by country and role; tax and housing differ).",
          "Senior consultant / spa director with experience: higher; often requires proven brand or local qualification.",
          "Budget: credential evaluation, exams, relocation approx. ₹5–20 lakh one-time.",
          "Some employers offer housing; verify contract before emigrating.",
          "Income in home currency terms may beat early India clinic years OR not — model after-tax and remittance costs.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — international cooperation", url: "https://ayush.gov.in" },
      { label: "WHO Global Traditional Medicine Centre (India)", url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre" },
      { label: "WHO — Traditional Medicine strategy 2025–2034", url: "https://www.who.int/publications/i/item/9789240106489" },
      { label: "NCISM — qualification framework (home country)", url: "https://ncismindia.org" },
      { label: "MEA — emigration resources (India)", url: "https://www.mea.gov.in" },
    ],
  },
  {
    id: "T09",
    code: "T09",
    title: "Medical Value Travel & Wellness",
    heroImage: "/assets/sections/pod-wellness.webp",
    tagline: "MVT ecosystem, accreditation, packages, and careers in wellness hospitality.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "Medical Value Travel (MVT) combines treatment, wellness, and tourism — India promotes Ayush alongside conventional care through policy and accreditation frameworks.",
          "Roles bridge clinical Ayurveda, guest experience, care coordinators, and international patient desks.",
          "NABH and other accreditation schemes exist for hospitals and wellness centres serving international patients.",
          "Package design includes logistics, translators, follow-up, and clear clinical boundaries.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "Resident medical officer at NABH-accredited Ayurveda hospital with international desk.",
          "Wellness programme doctor at resort chains (Kerala, Rishikesh, Goa hubs).",
          "MVT coordinator — intake, visa letters, scheduling Panchakarma programmes.",
          "Quality manager for international patient services.",
          "Marketing liaison with embassies and facilitators (ethical referral only).",
          "Tele-follow-up clinician for post-package care (where permitted).",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "International patient expectations on English, hygiene, and timelines.",
          "Seasonality — monsoon/off-season staffing swings.",
          "Ethical marketing vs aggressive facilitators overpromising cures.",
          "Jet-lag and Panchakarma scheduling — medico-legal consent documentation.",
          "Competition from Thailand, Sri Lanka, and domestic premium brands.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "Wellness resort doctor (mid-level): approx. ₹40,000–₹80,000/month + accommodation in some packages.",
          "International desk senior coordinator: approx. ₹35,000–₹70,000/month.",
          "Premium centres in Kerala/Goa may pay higher; tier-3 wellness jobs lower.",
          "Tips and performance bonuses vary; not guaranteed.",
          "Budget for hospitality English, BLS, and guest-relations training approx. ₹30,000–₹1 lakh.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — medical value travel initiatives", url: "https://ayush.gov.in" },
      { label: "Ministry of Tourism — India tourism policy context", url: "https://tourism.gov.in" },
      { label: "NABH — accreditation standards", url: "https://nabh.co" },
      { label: "WHO — TCIM integration in health systems", url: "https://www.who.int/health-topics/traditional-complementary-and-integrative-medicine" },
      { label: "APEDA / wellness export events (trade context)", url: "https://apeda.gov.in" },
    ],
  },
  {
    id: "T10",
    code: "T10",
    title: "Policy, Public Health & Global Agencies",
    heroImage: "/assets/sections/pod-policy.webp",
    tagline: "Government service, National Ayush Mission, research councils, and global health roles.",
    sections: [
      {
        title: "Overview",
        bullets: [
          "Policy track includes state AYUSH medical officer posts, national mission implementation, think-tank research, and multilateral bodies (WHO, UNICEF where relevant).",
          "National Ayush Mission (NAM) funds dispensaries, AYUSH hospitals, and public health outreach — implementation jobs at state and district level.",
          "CCRAS and other councils hire for public health research and programme evaluation.",
          "Combines public administration skills with Ayush domain knowledge.",
        ],
      },
      {
        title: "Job opportunities",
        bullets: [
          "AYUSH Medical Officer via state PSC / direct recruitment.",
          "District AYUSH officer and NAM programme manager (state health society).",
          "Consultant on Ministry of Ayush projects (contractual — young professional schemes advertised).",
          "Research officer on public health Ayush studies (CCRAS, ICMR partners).",
          "WHO GTMC internships / consultancies (competitive, project-based).",
          "NGO roles: community health, tribal health, NCD prevention with Ayush components.",
        ],
      },
      {
        title: "Challenges for new entrants",
        bullets: [
          "Government posts have long recruitment cycles and reservation/category rules.",
          "Contract roles may renew unpredictably.",
          "Policy impact is slow — patience for bureaucratic process.",
          "Global agency roles usually need PG, publications, or public health degree.",
          "Transfers and rural postings in state service.",
        ],
      },
      {
        title: "Income & budget",
        bullets: [
          "State AYUSH Medical Officer (entry): approx. ₹56,000–₹1,10,000/month gross under state health service scales (wide state variation).",
          "National mission consultant (contract): approx. ₹40,000–₹80,000/month depending on level and funding agency.",
          "WHO / UN consultancies: USD/day rates for senior experts; early-career fellowships stipend-based.",
          "Budget for UPSC/state PSC prep optional; public health MPH approx. ₹2–10 lakh if pursued.",
          "Pension and job security often better in permanent government track vs private clinic early years.",
        ],
      },
    ],
    references: [
      { label: "Ministry of Ayush — schemes & National Ayush Mission", url: "https://ayush.gov.in" },
      { label: "CCRAS — public health research", url: "https://ccras.nic.in" },
      { label: "WHO Global Traditional Medicine Centre", url: "https://www.who.int/initiatives/who-global-traditional-medicine-centre" },
      { label: "National Health Mission — Ayush integration context", url: "https://nhm.gov.in" },
      { label: "UPSC / state PSC portals (for MO recruitment)", url: "https://upsc.gov.in" },
    ],
  },
];

export const POD_KNOWLEDGE = POD_KNOWLEDGE_BASE.map(mergePodEnrichment);

export const KNOWLEDGE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "opportunities", label: "Opportunities" },
  { id: "challenges", label: "Challenges" },
  { id: "income", label: "Income" },
  { id: "journals", label: "Journals & sources" },
];

const SECTION_TAB = {
  Overview: "overview",
  "Job opportunities": "opportunities",
  "Challenges for new entrants": "challenges",
  "Income & budget": "income",
};

export function getSectionForTab(pod, tabId) {
  if (tabId === "overview" || tabId === "journals") return null;
  const title = Object.entries(SECTION_TAB).find(([, id]) => id === tabId)?.[0];
  return pod.sections.find(s => s.title === title) || null;
}

export function getPodByCode(code) {
  return POD_KNOWLEDGE.find(p => p.code === code) || null;
}

export function getPodByTitle(title) {
  return POD_KNOWLEDGE.find(p => p.title === title) || null;
}

export default POD_KNOWLEDGE;
