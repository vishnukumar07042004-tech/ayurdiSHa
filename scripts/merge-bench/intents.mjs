/**
 * Ground-truth intents for the merge benchmark. One intent = "one mentor answer satisfies every
 * student who asked it". `fam` groups intents whose answers overlap (a merge inside a family is
 * a soft error; across families it is a wrong answer). `w` = relative popularity at the event.
 * `alt` = other [theme, sub-area] a student with this intent plausibly picks on the Ask Desk.
 * Slots in {BRACES} are filled from SLOTS with student-style variants.
 */

export const T = {
  T01: "Clinical Practice & Integrative Care",
  T02: "Academics, Teaching & Higher Education",
  T03: "Research, Evidence & Publication",
  T04: "Entrepreneurship & Start-ups",
  T05: "Manufacturing, Quality & GMP",
  T06: "Brand Building & Communication",
  T07: "Export & Global Trade",
  T08: "Practice Abroad & Practitioner Mobility",
  T09: "Medical Value Travel & Wellness",
  T10: "Policy, Public Health & Global Agencies",
  NS: "Not sure — help me classify",
};

/** Mirrors TRACKS in src/App.jsx. */
export const SUBS = {
  T01: ["Choosing a clinical specialty", "Hospital employment", "Setting up private practice", "Panchakarma & therapy services", "Integrative referrals", "Records & clinical quality"],
  T02: ["Choosing a PG branch", "PhD pathway", "Faculty recruitment & eligibility", "Teaching skills", "Curriculum & assessment", "Academic leadership"],
  T03: ["Framing a research question", "Study design", "Ethics & approvals", "Biostatistics", "Grants & funding", "Thesis & publication"],
  T04: ["Validating the idea", "Business model", "Product & prototype", "Incubation support", "Funding & finance", "Team & intellectual property"],
  T05: ["R&D and formulation", "Production & scale-up", "QA / QC and testing", "GMP and licensing", "Regulatory affairs", "Pharmacovigilance"],
  T06: ["Positioning a practice or product", "Digital presence", "Scientific communication", "Advertising & claims compliance", "Community education"],
  T07: ["Getting started in export", "Documentation & shipping terms", "Certification and quality marks", "Market entry & partners", "Pricing & distribution"],
  T08: ["Country-wise recognition", "Licensing & registration", "Visa and employment routes", "Bridging qualifications", "Wellness centre roles abroad"],
  T09: ["How the MVT ecosystem works", "Accreditation and standards", "Designing packages", "Handling international patients", "Careers in wellness resorts"],
  T10: ["Government service routes", "National AYUSH Mission delivery", "Research councils", "Public health projects", "International organisations", "Policy research & advocacy"],
  NS: [""],
};

export const SLOTS = {
  PG: ["PG", "PG", "MD", "MD", "MD/MS", "post graduation", "postgraduation", "PG course", "MD Ayurveda", "masters"],
  EXAM: ["AIAPGET", "AIAPGET", "AIAPGET", "aiapget", "AIAPGET exam", "PG entrance", "PG entrance exam", "AI-APGET", "AIAPGET entrance"],
  CLINIC: ["clinic", "clinic", "clinic", "own clinic", "dispensary", "practice"],
  PRACTICE: ["practice", "practice", "private practice", "clinic", "my own clinic", "clinical practice", "practise"],
  PK: ["Panchakarma", "Panchakarma", "panchakarma", "panchkarma", "Pancha Karma", "panchakarm"],
  GOVT: ["government", "government", "govt", "Govt.", "sarkari", "central government", "state government"],
  JOB: ["job", "job", "naukri"],
  JOBS: ["jobs", "jobs", "vacancies", "job openings", "naukri"],
  START: ["start", "start", "open", "set up", "begin", "establish"],
  ABROAD: ["abroad", "abroad", "outside India", "overseas", "in foreign countries"],
  BAMS: ["BAMS", "BAMS", "bams", "B.A.M.S."],
};

const I = (id, fam, theme, sub, w, t, alt = []) => ({ id, fam, theme, sub, w, t, alt });

export const INTENTS = [
  /* T02 · PG / AIAPGET — the busiest corner of the hall */
  I("pg_or_practice", "pg-vs-practice", "T02", "Choosing a PG branch", 40, [
    "Should I do {PG} or start {PRACTICE} after {BAMS}?",
    "What should I do after {BAMS} — {PG} or {PRACTICE}?",
    "Is {PG} better than starting my own {CLINIC}?",
    "{PG} first or {PRACTICE} first after internship?",
    "Is it worth doing {PG} or should I directly start {PRACTICE}?",
    "{BAMS} ke baad {PG} karu ya {PRACTICE} shuru karu?",
    "Confused between {PG} and starting {PRACTICE} after {BAMS}",
    "Which is better after {BAMS}: {PG} or {PRACTICE}?",
  ], [["T01", "Choosing a clinical specialty"], ["NS", ""]]),
  I("pg_branch", "pg-branch", "T02", "Choosing a PG branch", 30, [
    "Which {PG} branch has the best scope?",
    "Which {PG} subject should I choose?",
    "How to choose a {PG} specialization after {BAMS}?",
    "Best {PG} branch for a good career?",
    "Kayachikitsa or Panchakarma — which {PG} branch is better?",
    "Which {PG} branch is good for clinical practice?",
    "{PG} me kaunsa branch lena chahiye?",
    "How do I decide my {PG} branch?",
  ], [["T01", "Choosing a clinical specialty"]]),
  I("aiapget_prep", "aiapget", "T02", "Choosing a PG branch", 60, [
    "How to prepare for {EXAM}?",
    "How should I prepare for {EXAM} during internship?",
    "{EXAM} preparation strategy for final year students",
    "What is the best strategy to crack {EXAM}?",
    "{EXAM} ki taiyari kaise kare?",
    "How many hours should I study daily for {EXAM} preparation?",
    "How to start {EXAM} preparation along with internship?",
    "Tips to crack {EXAM} in first attempt",
    "How do I plan my {EXAM} preparation?",
  ], [["NS", ""]]),
  I("aiapget_books", "aiapget", "T02", "Choosing a PG branch", 20, [
    "Best books for {EXAM} preparation?",
    "Which books should I read for {EXAM}?",
    "Recommended books and study material for {EXAM}",
    "{EXAM} ke liye best books kaunsi hai?",
    "Standard textbooks to refer for {EXAM}?",
    "Which books and notes are enough for {EXAM}?",
  ]),
  I("aiapget_cutoff", "aiapget", "T02", "Choosing a PG branch", 12, [
    "What rank in {EXAM} is needed for a government college seat?",
    "{EXAM} cutoff for government PG seats?",
    "What score is safe in {EXAM} for a good college?",
    "Expected {EXAM} cut off for Kayachikitsa in a govt college",
    "How much rank is needed in {EXAM} for a {GOVT} college?",
  ]),
  I("pg_worth", "pg-vs-practice", "T02", "Choosing a PG branch", 14, [
    "Is {PG} necessary for a good career after {BAMS}?",
    "Can I have a successful career without {PG}?",
    "Is doing {PG} really worth it?",
    "Is {PG} compulsory to become a good Ayurveda doctor?",
    "Kya {PG} karna zaroori hai?",
  ], [["NS", ""]]),
  I("phd_admission", "phd", "T02", "PhD pathway", 12, [
    "How do I get admission for PhD in Ayurveda?",
    "What is the eligibility for a PhD after {PG}?",
    "Is PhD possible directly after {BAMS} without {PG}?",
    "PhD admission process in Ayurveda universities",
    "How to apply for a PhD in Ayurveda?",
  ], [["T03", "Framing a research question"]]),
  I("phd_fellowship", "phd", "T02", "PhD pathway", 6, [
    "Are there fellowships or stipends for PhD in Ayurveda?",
    "PhD fellowship options for Ayurveda scholars",
    "Do PhD students in Ayurveda get any stipend?",
    "How to get a funded PhD seat?",
  ], [["T03", "Grants & funding"]]),
  I("faculty_elig", "faculty", "T02", "Faculty recruitment & eligibility", 12, [
    "What is the eligibility to become a lecturer in an Ayurveda college?",
    "How can I become a faculty member in an Ayurveda college?",
    "Is {PG} compulsory to become an assistant professor?",
    "Teaching job in Ayurveda college — what qualifications are required?",
    "How to get a teaching post in a BAMS college?",
  ]),
  I("faculty_salary", "faculty", "T02", "Faculty recruitment & eligibility", 5, [
    "What is the salary of an assistant professor in Ayurveda colleges?",
    "How much do Ayurveda lecturers earn?",
    "Faculty pay scale in private vs government Ayurveda colleges",
  ]),
  I("teaching_skills", "teaching", "T02", "Teaching skills", 5, [
    "How can I improve my teaching skills?",
    "How to become a good teacher of Samhita?",
    "Tips to teach Ayurveda students effectively",
    "How to make lectures interesting for students?",
  ]),
  I("curriculum", "curriculum", "T02", "Curriculum & assessment", 5, [
    "What changes has NCISM made in the new BAMS curriculum?",
    "How will the new NCISM curriculum affect students?",
    "Is the new BAMS syllabus better than the old one?",
    "Explain the competency based curriculum of NCISM",
  ]),
  I("leadership", "leadership", "T02", "Academic leadership", 3, [
    "How to become a principal of an Ayurveda college?",
    "What does it take to become HOD in an Ayurveda college?",
    "Path to academic leadership roles like dean or principal",
  ]),

  /* T01 · Clinical practice */
  I("specialty", "specialty", "T01", "Choosing a clinical specialty", 15, [
    "Which clinical specialty has the best scope in Ayurveda?",
    "How do I choose between Kayachikitsa, Shalya and Prasuti for clinical work?",
    "Which specialty should I choose for clinical practice?",
    "Best clinical specialization for a BAMS doctor?",
    "How to decide my clinical speciality?",
  ], [["T02", "Choosing a PG branch"]]),
  I("hosp_job", "hospital-job", "T01", "Hospital employment", 18, [
    "How to get a job in a private Ayurveda hospital?",
    "How can a fresher {BAMS} doctor get a hospital {JOB}?",
    "Which hospitals hire {BAMS} doctors?",
    "Hospital {JOBS} for {BAMS} graduates",
    "Can {BAMS} doctors work in multispeciality hospitals?",
    "{BAMS} ke baad hospital me {JOB} kaise milegi?",
  ]),
  I("hosp_salary", "hospital-job", "T01", "Hospital employment", 10, [
    "What is the salary of a {BAMS} doctor in a hospital?",
    "How much salary does a fresher {BAMS} doctor get?",
    "Starting salary for {BAMS} in private hospitals",
    "Is the salary of a {BAMS} doctor in hospitals good?",
    "{BAMS} doctor ki salary kitni hoti hai?",
  ], [["NS", ""]]),
  I("clinic_licence", "clinic-setup", "T01", "Setting up private practice", 30, [
    "What licences do I need to {START} a {CLINIC}?",
    "Which licence is required to {START} an Ayurveda {CLINIC}?",
    "{CLINIC} registration process for {BAMS} doctors",
    "What legal registrations are needed to {START} my own {CLINIC}?",
    "Do I need a licence to {START} a {CLINIC} in my state?",
    "Clinical establishment registration for an Ayurveda {CLINIC}",
    "{CLINIC} kholne ke liye kaunsa licence chahiye?",
  ], [["T04", "Business model"]]),
  I("clinic_cost", "clinic-setup", "T01", "Setting up private practice", 16, [
    "How much money is needed to {START} a small {CLINIC}?",
    "What is the investment required to {START} an Ayurveda {CLINIC}?",
    "What is the total cost of setting up a {CLINIC}?",
    "Can I {START} a {CLINIC} with low investment?",
    "{CLINIC} {START} karne me kitna kharcha aayega?",
  ], [["T04", "Funding & finance"]]),
  I("clinic_patients", "clinic-growth", "T01", "Setting up private practice", 14, [
    "How do I get my first patients in a new {CLINIC}?",
    "How to attract patients to a new Ayurveda {CLINIC}?",
    "How to build a patient base after starting {PRACTICE}?",
    "My {CLINIC} has very few patients, how can I increase them?",
    "How to grow patient numbers in {PRACTICE}?",
  ], [["T06", "Positioning a practice or product"]]),
  I("clinic_location", "clinic-setup", "T01", "Setting up private practice", 6, [
    "Should I {START} my {CLINIC} in a city or a village?",
    "Rural or urban area — where is it better to {START} a {CLINIC}?",
    "How to choose the right location for an Ayurveda {CLINIC}?",
  ]),
  I("pk_centre", "pk-centre", "T01", "Panchakarma & therapy services", 28, [
    "How to {START} a {PK} centre?",
    "How can I {START} my own {PK} center after {BAMS}?",
    "What is needed to {START} a {PK} therapy centre?",
    "{PK} centre {START} karne ke liye kya chahiye?",
    "Steps to set up a {PK} unit",
    "Investment and equipment needed for a {PK} centre",
    "Is starting a {PK} centre profitable?",
  ], [["T04", "Business model"], ["T01", "Setting up private practice"]]),
  I("pk_training", "pk-training", "T01", "Panchakarma & therapy services", 12, [
    "Where can I do a {PK} training course?",
    "Best {PK} certificate course after {BAMS}",
    "{PK} training course duration and fees?",
    "Is a separate certificate needed to practise {PK}?",
    "How to get hands-on {PK} training?",
    "{PK} ka course kahan se kare?",
  ]),
  I("pk_staff", "pk-centre", "T01", "Panchakarma & therapy services", 5, [
    "How do I hire and train therapists for {PK}?",
    "Where to find trained {PK} therapists?",
    "How many therapists are needed to run a {PK} centre?",
  ]),
  I("crosspathy", "integrative", "T01", "Integrative referrals", 10, [
    "Can {BAMS} doctors prescribe allopathic medicines?",
    "Is it legal for {BAMS} doctors to practise allopathy?",
    "Can I use modern medicines in my Ayurveda {PRACTICE}?",
    "{BAMS} doctor allopathy medicine likh sakta hai kya?",
    "Rules about {BAMS} doctors prescribing allopathy",
  ], [["NS", ""]]),
  I("referrals", "integrative", "T01", "Integrative referrals", 4, [
    "How to build referral links with allopathic doctors?",
    "How can Ayurveda and modern doctors work together on referrals?",
    "Integrative care: how to refer patients between systems?",
  ]),
  I("records", "records", "T01", "Records & clinical quality", 5, [
    "Which software is good for maintaining patient records?",
    "How to maintain clinical records properly in an Ayurveda {CLINIC}?",
    "Best EMR software for Ayurveda doctors",
    "Do I need to keep patient records digitally?",
  ]),
  I("nabh_clinic", "records", "T01", "Records & clinical quality", 4, [
    "How to get NABH accreditation for an Ayurveda {CLINIC}?",
    "Is NABH certification needed for small clinics?",
    "NABH standards for Ayurveda hospitals",
  ]),

  /* T03 · Research */
  I("thesis_topic", "research-topic", "T03", "Framing a research question", 14, [
    "How do I choose a thesis topic in Ayurveda?",
    "How to select a good research topic for my {PG} thesis?",
    "How do I frame a research question for my thesis?",
    "Thesis topic selection tips",
    "Thesis ke liye topic kaise choose kare?",
    "What makes a good research question in Ayurveda?",
  ], [["T03", "Thesis & publication"]]),
  I("ug_research", "research-start", "T03", "Framing a research question", 8, [
    "How can I start research as an undergraduate {BAMS} student?",
    "Can {BAMS} students do research during college?",
    "How to get involved in research during internship?",
    "How to start research work as a student?",
  ]),
  I("trial_design", "research-design", "T03", "Study design", 7, [
    "How to design a clinical trial for an Ayurveda formulation?",
    "Which study design is best for Ayurveda research?",
    "RCT vs observational study for Ayurveda — which to choose?",
    "How to plan a randomized controlled trial in Ayurveda?",
  ]),
  I("ethics", "research-ethics", "T03", "Ethics & approvals", 6, [
    "How do I get ethics committee approval for my study?",
    "Is CTRI registration mandatory for thesis research?",
    "Process for institutional ethics committee clearance",
    "When do I need ethical approval for research?",
  ]),
  I("biostat", "biostat", "T03", "Biostatistics", 6, [
    "How do I learn biostatistics for research?",
    "Which software is best for statistics — SPSS or R?",
    "How to calculate sample size for my study?",
    "Best resources to learn biostatistics",
  ]),
  I("grants", "grants", "T03", "Grants & funding", 6, [
    "How to get research grants for Ayurveda projects?",
    "Which agencies fund Ayurveda research — CCRAS, ICMR?",
    "Research funding options for students",
    "How to apply for a research grant as a young researcher?",
  ]),
  I("publish", "publish", "T03", "Thesis & publication", 14, [
    "How do I publish a research paper in a good journal?",
    "How to get my thesis published?",
    "Which journals accept Ayurveda research papers?",
    "Steps to publish my first research article",
    "Paper publish kaise kare?",
    "How to publish in a PubMed-indexed journal?",
  ]),
  I("case_report", "publish", "T03", "Thesis & publication", 6, [
    "How do I write and publish a case report?",
    "Format for writing a clinical case report",
    "Can I publish a single case study from my clinic?",
  ]),
  I("predatory", "publish", "T03", "Thesis & publication", 4, [
    "How to identify predatory journals?",
    "How do I avoid fake journals when publishing?",
    "Is it okay to publish in paid journals?",
  ]),

  /* T04 · Entrepreneurship */
  I("validate", "validate", "T04", "Validating the idea", 8, [
    "How do I validate my Ayurveda product idea?",
    "How to test if my herbal product has a market?",
    "How to check if my startup idea is viable?",
    "Market research for an Ayurveda wellness idea",
  ]),
  I("bizmodel", "bizmodel", "T04", "Business model", 6, [
    "What business model works for an Ayurveda wellness startup?",
    "How do Ayurveda startups make money?",
    "Subscription or one-time sale — which business model suits herbal products?",
    "How to build a sustainable business model in Ayurveda?",
  ]),
  I("prototype", "prototype", "T04", "Product & prototype", 5, [
    "How to make a prototype of a herbal cosmetic product?",
    "Steps to develop my first Ayurveda product",
    "Where can I get small batch manufacturing for a product prototype?",
  ]),
  I("incubation", "incubation", "T04", "Incubation support", 6, [
    "Which incubators support Ayurveda startups?",
    "How to get incubation support from AIIA or other institutes?",
    "Are there AYUSH startup incubation centres?",
    "How to apply to an incubator for my startup?",
  ]),
  I("startup_funding", "startup-funding", "T04", "Funding & finance", 10, [
    "How do I get funding for my Ayurveda startup?",
    "How to find investors for a health startup?",
    "How to pitch my startup to investors?",
    "Angel investors for Ayurveda startups",
    "Startup ke liye funding kaise milegi?",
  ]),
  I("startup_schemes", "startup-funding", "T04", "Funding & finance", 7, [
    "Which government schemes support Ayurveda startups?",
    "Can I get a MUDRA loan to start an Ayurveda business?",
    "Startup India benefits for AYUSH entrepreneurs",
    "{GOVT} loans or grants for starting a wellness business",
  ]),
  I("patent", "ip", "T04", "Team & intellectual property", 6, [
    "How do I patent my Ayurveda formulation?",
    "Can classical Ayurveda formulations be patented?",
    "Process to file a patent for a herbal product",
    "How to protect my product idea legally?",
  ]),
  I("cofounder", "team", "T04", "Team & intellectual property", 3, [
    "How do I find a co-founder for my startup?",
    "How to build a team for an early-stage Ayurveda startup?",
    "Should my co-founder be from a business background?",
  ]),

  /* T05 · Manufacturing */
  I("rnd_career", "industry-career", "T05", "R&D and formulation", 7, [
    "How to get a job in R&D of an Ayurveda pharma company?",
    "Career in formulation development after {BAMS}",
    "What skills are needed for R&D in Ayurvedic pharmaceuticals?",
    "Which companies hire {BAMS} graduates for R&D?",
  ]),
  I("scaleup", "scaleup", "T05", "Production & scale-up", 4, [
    "How to scale up production of churna or tablets?",
    "Challenges in scaling Ayurveda medicine manufacturing",
    "How to move from small batch to large-scale production?",
  ]),
  I("qaqc", "industry-career", "T05", "QA / QC and testing", 6, [
    "Can {BAMS} graduates get QA QC jobs in pharma?",
    "Career in quality control of Ayurvedic medicines",
    "What does a QA/QC officer do in an Ayurveda company?",
    "How to get into quality assurance in the Ayurveda industry?",
  ]),
  I("mfg_licence", "mfg-licence", "T05", "GMP and licensing", 7, [
    "How to get a drug manufacturing licence for Ayurveda products?",
    "What licence is needed to manufacture Ayurvedic medicines?",
    "Licence process for an Ayurveda pharmacy unit",
    "Manufacturing licence ke liye kya process hai?",
  ], [["T05", "Regulatory affairs"]]),
  I("gmp", "mfg-licence", "T05", "GMP and licensing", 5, [
    "Is GMP certification mandatory for Ayurveda manufacturers?",
    "What are the Schedule T GMP requirements?",
    "How to get GMP certified?",
  ]),
  I("regaffairs", "industry-career", "T05", "Regulatory affairs", 5, [
    "How to build a career in regulatory affairs?",
    "Is regulatory affairs a good career for {BAMS}?",
    "Courses for regulatory affairs in the AYUSH sector",
  ]),
  I("pv", "industry-career", "T05", "Pharmacovigilance", 5, [
    "Is pharmacovigilance a good career option for {BAMS}?",
    "How to get a pharmacovigilance job?",
    "Which course is needed for pharmacovigilance?",
    "Pharmacovigilance me career kaise banaye?",
  ]),

  /* T06 · Brand */
  I("brand_clinic", "brand", "T06", "Positioning a practice or product", 6, [
    "How do I build a brand for my {CLINIC}?",
    "How to position my Ayurveda practice differently from others?",
    "Branding tips for a new Ayurveda doctor",
    "How to make my {CLINIC} stand out?",
  ]),
  I("social", "digital", "T06", "Digital presence", 10, [
    "How to use Instagram to grow my Ayurveda practice?",
    "Should doctors make YouTube videos?",
    "Social media tips for Ayurveda doctors",
    "How to build an online presence as a {BAMS} doctor?",
    "Instagram pe patients kaise laye?",
  ]),
  I("website", "digital", "T06", "Digital presence", 4, [
    "Do I need a website for my {CLINIC}?",
    "How to get my {CLINIC} listed on Google Maps?",
    "How to make a simple website for an Ayurveda practice?",
  ]),
  I("scicomm", "scicomm", "T06", "Scientific communication", 5, [
    "How to present a paper at a conference?",
    "How do I improve my scientific presentation skills?",
    "How to explain Ayurveda science to the public in simple words?",
  ]),
  I("advert", "advert", "T06", "Advertising & claims compliance", 6, [
    "Are Ayurveda doctors allowed to advertise?",
    "What are the rules for advertising Ayurvedic medicines?",
    "Can I advertise my {CLINIC} on social media legally?",
    "Drugs and Magic Remedies Act — what claims are not allowed?",
  ]),
  I("community", "community", "T06", "Community education", 4, [
    "How to organise a free health camp?",
    "How to run Ayurveda awareness programmes in villages?",
    "Community health education ideas for Ayurveda doctors",
  ]),

  /* T07 · Export */
  I("export_start", "export", "T07", "Getting started in export", 8, [
    "How do I start an Ayurveda export business?",
    "Steps to begin exporting Ayurvedic products",
    "Can a {BAMS} doctor start an export business?",
    "Export business kaise shuru kare?",
  ]),
  I("export_docs", "export-docs", "T07", "Documentation & shipping terms", 5, [
    "What documents are needed to export Ayurveda products?",
    "How to get an IEC code for export?",
    "Explain FOB and CIF terms for exporters",
  ]),
  I("export_cert", "export-cert", "T07", "Certification and quality marks", 5, [
    "Which certifications are required to export herbal products?",
    "Do I need FDA approval to export Ayurveda products to the USA?",
    "Organic certification for export of herbs",
  ]),
  I("export_markets", "export-markets", "T07", "Market entry & partners", 6, [
    "Which countries have the highest demand for Ayurveda products?",
    "How to find distributors abroad for Ayurvedic products?",
    "Best markets for exporting Ayurveda supplements",
  ]),
  I("export_pricing", "export-markets", "T07", "Pricing & distribution", 3, [
    "How to price Ayurveda products for export markets?",
    "Distribution channels for export of Ayurvedic products",
  ]),

  /* T08 · Abroad */
  I("abroad_countries", "abroad-recog", "T08", "Country-wise recognition", 26, [
    "Which countries recognise the {BAMS} degree?",
    "In which countries can I practise Ayurveda {ABROAD}?",
    "Is {BAMS} valid in foreign countries?",
    "List of countries where {BAMS} doctors can work",
    "{BAMS} degree kis country me valid hai?",
    "Is {BAMS} recognised {ABROAD}?",
    "Can I work {ABROAD} as an Ayurveda doctor?",
  ], [["T08", "Licensing & registration"], ["NS", ""]]),
  I("abroad_usa", "abroad-recog", "T08", "Country-wise recognition", 10, [
    "Can {BAMS} graduates practise in the USA?",
    "How to become an Ayurveda practitioner in America?",
    "Is {BAMS} recognised in the US?",
    "Scope of Ayurveda in the USA for {BAMS} doctors",
  ]),
  I("abroad_uk", "abroad-recog", "T08", "Country-wise recognition", 7, [
    "Can I practise Ayurveda in the UK?",
    "Is {BAMS} recognised in Europe or the UK?",
    "Scope for {BAMS} doctors in Germany",
  ]),
  I("abroad_licence", "abroad-licence", "T08", "Licensing & registration", 8, [
    "How do I get a licence to practise Ayurveda {ABROAD}?",
    "Registration process for Ayurveda practitioners {ABROAD}",
    "Which exams must I pass to practise {ABROAD}?",
    "Licensing requirements for Ayurveda doctors in other countries",
  ]),
  I("abroad_gulf", "abroad-jobs", "T08", "Visa and employment routes", 9, [
    "Are there {JOBS} for {BAMS} doctors in Dubai or the Gulf?",
    "How to get a work visa as an Ayurveda doctor?",
    "Gulf countries me {BAMS} ki {JOB} kaise milegi?",
    "Employment visa options for Ayurveda practitioners",
    "How to apply for Ayurveda {JOBS} in UAE?",
  ]),
  I("abroad_study", "abroad-study", "T08", "Bridging qualifications", 8, [
    "Can I do a master's in public health {ABROAD} after {BAMS}?",
    "Which courses {ABROAD} can I take after {BAMS}?",
    "Is MPH {ABROAD} a good option after {BAMS}?",
    "Bridging courses to practise {ABROAD}",
  ]),
  I("abroad_spa", "abroad-jobs", "T08", "Wellness centre roles abroad", 5, [
    "How to get a job in a wellness spa {ABROAD}?",
    "Ayurveda therapist roles in international wellness centres",
    "Wellness centre {JOBS} in Europe for {BAMS}",
  ]),

  /* T09 · MVT */
  I("mvt", "mvt", "T09", "How the MVT ecosystem works", 6, [
    "What is medical value travel and how can {BAMS} doctors benefit?",
    "Scope of medical tourism in Ayurveda",
    "How does wellness tourism work in India?",
    "Career opportunities in medical value travel",
  ]),
  I("mvt_accred", "mvt-accred", "T09", "Accreditation and standards", 4, [
    "Which accreditation is needed for a wellness centre?",
    "NABH standards for Ayurveda wellness centres",
    "How to get a wellness centre accredited for foreign patients?",
  ]),
  I("mvt_packages", "mvt-packages", "T09", "Designing packages", 5, [
    "How to design {PK} packages for foreign tourists?",
    "What should a wellness package for international patients include?",
    "How to price Ayurveda treatment packages for medical tourists?",
  ]),
  I("mvt_patients", "mvt-patients", "T09", "Handling international patients", 4, [
    "How to communicate with foreign patients?",
    "Tips for handling international patients in an Ayurveda centre",
    "What documentation is needed for international patients?",
  ]),
  I("resort_jobs", "resort-jobs", "T09", "Careers in wellness resorts", 8, [
    "How to get a job in a Kerala wellness resort?",
    "Salary of Ayurveda doctors in wellness resorts",
    "Are resort {JOBS} good for {BAMS} freshers?",
    "Wellness resort me doctor ki {JOB} kaise milegi?",
  ]),

  /* T10 · Policy & government */
  I("govt_jobs", "govt-jobs", "T10", "Government service routes", 45, [
    "{GOVT} {JOB} options after {BAMS}?",
    "What {GOVT} {JOBS} can I get after {BAMS}?",
    "How to get a {GOVT} {JOB} as an Ayurveda doctor?",
    "{BAMS} ke baad {GOVT} {JOB} kaise milegi?",
    "Which {GOVT} posts are available for {BAMS} graduates?",
    "What {GOVT} {JOB} opportunities exist for {BAMS} doctors?",
    "{GOVT} sector me {BAMS} ke liye kya options hai?",
    "Can {BAMS} doctors get {GOVT} {JOBS}?",
  ], [["NS", ""], ["T01", "Hospital employment"]]),
  I("psc_prep", "govt-exam", "T10", "Government service routes", 14, [
    "How to prepare for the state PSC Ayurveda medical officer exam?",
    "{GOVT} medical officer exam preparation tips",
    "Which books for the Ayurveda medical officer exam?",
    "How to crack the AMO exam?",
    "PSC exam ki taiyari kaise kare for Ayurveda MO post?",
  ]),
  I("upsc", "govt-exam", "T10", "Government service routes", 6, [
    "Can I appear for UPSC civil services after {BAMS}?",
    "Is IAS a good option for {BAMS} graduates?",
    "How to prepare for UPSC along with {BAMS} internship?",
  ]),
  I("nam_jobs", "govt-jobs", "T10", "National AYUSH Mission delivery", 8, [
    "What {JOBS} are available under the National AYUSH Mission?",
    "How to get a contract {JOB} under NAM?",
    "Role of {BAMS} doctors in National AYUSH Mission programmes",
    "NAM me {JOB} kaise milegi?",
  ], [["T10", "Government service routes"]]),
  I("ccras", "ccras", "T10", "Research councils", 6, [
    "How can I join CCRAS as a research officer?",
    "Eligibility for research officer posts in CCRAS",
    "Careers in AYUSH research councils",
  ]),
  I("public_health", "public-health", "T10", "Public health projects", 7, [
    "How do I build a career in public health after {BAMS}?",
    "Is MPH a good option after {BAMS} in India?",
    "Public health {JOBS} for Ayurveda graduates",
  ]),
  I("who", "intl-orgs", "T10", "International organisations", 5, [
    "How can Ayurveda doctors work with WHO?",
    "{JOBS} in international health organisations for {BAMS}",
    "How to get an internship at WHO or UN agencies?",
  ]),
  I("policy", "policy", "T10", "Policy research & advocacy", 3, [
    "How to get into health policy research?",
    "Career in AYUSH policy making",
  ]),

  /* Not sure — generic career worries */
  I("after_bams", "after-bams", "NS", "", 30, [
    "What should I do after {BAMS}?",
    "What are the career options after {BAMS}?",
    "{BAMS} ke baad kya kare?",
    "Career options after {BAMS} other than {PRACTICE}?",
    "I am confused about my career after {BAMS}",
    "What are the best options after completing {BAMS}?",
    "बीएएमएस के बाद क्या करें?",
    "Scope after {BAMS}?",
  ], [["T02", "Choosing a PG branch"], ["T01", "Choosing a clinical specialty"]]),
  I("bams_future", "after-bams", "NS", "", 10, [
    "Is {BAMS} a good career choice today?",
    "What is the future of Ayurveda doctors in India?",
    "Is there scope for {BAMS} doctors in the coming years?",
    "Kya {BAMS} ka future accha hai?",
  ], [["T02", "Choosing a PG branch"]]),
];

/** Long-tail one-off questions: each is its own intent and should stay a single. */
export const SINGLES = [
  ["T02", "Choosing a PG branch", "Can I change my PG branch after the first year?"],
  ["T02", "Choosing a PG branch", "Is PG in Dravyaguna useful for a pharma career?"],
  ["T02", "PhD pathway", "Can I do a PhD part-time while working in a clinic?"],
  ["T02", "Teaching skills", "How do I handle a noisy classroom as a new lecturer?"],
  ["T01", "Choosing a clinical specialty", "Is Ayurvedic dermatology a growing field?"],
  ["T01", "Setting up private practice", "Can two BAMS friends run one clinic as partners legally?"],
  ["T01", "Setting up private practice", "How should I decide my consultation fee?"],
  ["T01", "Hospital employment", "Do hospitals give night duty to BAMS interns?"],
  ["T01", "Panchakarma & therapy services", "Which oils should a Panchakarma unit stock first?"],
  ["T01", "Integrative referrals", "How to discuss Ayurveda with a patient's oncologist?"],
  ["T03", "Study design", "Can I use a crossover design for a Rasayana study?"],
  ["T03", "Ethics & approvals", "Do I need consent forms in regional languages?"],
  ["T03", "Biostatistics", "What is a p-value in simple words?"],
  ["T03", "Thesis & publication", "How long does peer review usually take?"],
  ["T04", "Business model", "Is a franchise model good for Ayurveda clinics?"],
  ["T04", "Product & prototype", "How do I choose packaging for herbal tea?"],
  ["T04", "Team & intellectual property", "Can I trademark a Sanskrit brand name?"],
  ["T05", "Production & scale-up", "How is Bhasma quality checked in large batches?"],
  ["T05", "Regulatory affairs", "What is the role of the AYUSH vertical in CDSCO?"],
  ["T06", "Digital presence", "Is it ethical to post patient testimonials?"],
  ["T06", "Scientific communication", "How do I write a good conference abstract?"],
  ["T07", "Documentation & shipping terms", "How are herbal raw materials classified in HS codes?"],
  ["T07", "Market entry & partners", "Is Amazon global selling good for Ayurveda brands?"],
  ["T08", "Bridging qualifications", "Is a naturopathy licence in Canada possible with BAMS?"],
  ["T08", "Wellness centre roles abroad", "Do spas in the Maldives hire Ayurveda doctors?"],
  ["T09", "Designing packages", "How long should a Rasayana retreat package be?"],
  ["T09", "Handling international patients", "How to handle dietary restrictions of Western patients?"],
  ["T10", "Public health projects", "How can Ayurveda help in anaemia control programmes?"],
  ["T10", "International organisations", "Does WHO have a traditional medicine fellowship?"],
  ["NS", "", "I failed one subject in final year, will it affect my career?"],
  ["NS", "", "How to manage stress during internship?"],
  ["NS", "", "Is yoga certification useful for an Ayurveda doctor?"],
];

export const PREFIXES = ["Sir, ", "Respected mentor, ", "Hello sir, ", "I am a final year BAMS student. ", "I am an intern. ", "Namaste. ", "Dear mentor, ", "Ma'am, "];
export const SUFFIXES = [" Please guide.", " Kindly suggest.", " plz help", " Thank you.", "??", " Please advise me."];
export const CONTEXTS = [
  "I am in final year BAMS.", "Currently doing internship in Kerala.", "I am from a small town in Odisha.",
  "My family wants me to do PG.", "I want to settle in my hometown.", "I have an education loan to repay.",
  "I am interested in research and teaching.", "My father has a clinic.", "I scored average marks in university exams.",
  "I want to work abroad in future.", "I am from Maharashtra.", "I passed BAMS in 2025.",
  "I like clinical work more than theory.", "I am from a rural area and family support is limited.",
  "I want financial stability soon.", "My parents are doctors.", "I am preparing for government exams also.",
  "I am interested in Panchakarma.",
];
