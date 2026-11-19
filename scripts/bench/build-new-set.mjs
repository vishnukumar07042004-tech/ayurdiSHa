#!/usr/bin/env node
/**
 * NEW untouched merge benchmark for the precision-first engine (460 labelled questions).
 * Written and frozen BEFORE any precision-first tuning. Never tune on it — report only.
 *
 *   node scripts/bench/build-new-set.mjs        → tests/fixtures/merge-new-460.json
 *
 * Differences from the older corpora (A-1200, B dev/held-out, Fresh-403): new seed, new intent
 * templates, new noise model (new greetings and self-introductions, long rambling back-stories,
 * very short questions, letter-swap typos, missing spaces, Hinglish code-mix), and look-alike
 * sibling intents built as hard negatives: same subject + different ask, or same ask + different
 * subject (UK vs Germany, Kayachikitsa vs Shalya, PhD without MD vs after MD, QC job vs QC tests…).
 * Several phrasings per intent are hard positives that share almost no words with the others.
 *
 * One intent = one mentor answer fully serves every student who asked it. `fam` = siblings that
 * share a subject (used to count "near-miss" errors separately; never used for scoring credit).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = 20_261_024;

const T = {
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
const SUBS = {
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

/** [intent, fam, theme, sub, popularity (1: each phrasing repeated by another student 30 % of the time; 2: 75 % + 30 %), phrasings] */
const INTENTS = [
  /* ---------------- T01 Clinical ---------------- */
  ["clinic_licence", "clinic", "T01", "Setting up private practice", 2, [
    "Which licences and registrations are required before I open an Ayurveda clinic?",
    "Is registration under the Clinical Establishments Act needed for a one-doctor clinic?",
    "clinic kholne se pehle kaun kaun se licence lene padte hai?",
    "Clinic licence?",
    "What government permissions does a new BAMS doctor need to legally run a clinic?",
    "Do I have to register my dispensary with the municipal corporation and the state board?",
  ]],
  ["clinic_cost", "clinic", "T01", "Setting up private practice", 1, [
    "Roughly how much investment does a small Ayurveda clinic need?",
    "clinic setup me total kitna paisa lagta hai?",
    "Can I start my own clinic with a budget of 3 lakh?",
    "What is the expected cost of rent, furniture and medicines for a new clinic?",
    "Clinic cost?",
  ]],
  ["clinic_staff", "clinic", "T01", "Setting up private practice", 1, [
    "How many staff should I hire when I open my first clinic?",
    "Do I need a receptionist and a compounder from day one in a small clinic?",
    "clinic ke liye staff kitne rakhne chahiye?",
    "What staff does a new solo Ayurveda practice actually need?",
  ]],
  ["clinic_dispensing", "clinic", "T01", "Setting up private practice", 1, [
    "Can I dispense my own Ayurvedic medicines from my clinic or do I need a drug licence?",
    "Is a separate pharmacy licence needed to sell medicines inside my clinic?",
    "apne clinic se dawai bechne ke liye drug license chahiye kya?",
    "Is it allowed for a BAMS doctor to keep and sell medicines at the clinic counter?",
  ]],
  ["pk_course", "panchakarma", "T01", "Panchakarma & therapy services", 2, [
    "Where can I learn Panchakarma properly with hands-on practice?",
    "Which is the best Panchakarma certificate course for BAMS graduates?",
    "panchakarma ki practical training kahan se karu?",
    "Panchakarma training?",
    "Our college had almost no Panchakarma exposure — which institute teaches it well?",
  ]],
  ["pk_therapists", "panchakarma", "T01", "Panchakarma & therapy services", 1, [
    "How do I find trained therapists for my Panchakarma centre?",
    "Where can I hire skilled masseurs for Abhyanga and Shirodhara?",
    "panchakarma centre ke liye therapist kahan milenge?",
    "My Panchakarma therapists keep leaving — how do I recruit and keep good ones?",
  ]],
  ["pk_income", "panchakarma", "T01", "Panchakarma & therapy services", 1, [
    "How much can a small Panchakarma centre earn per month?",
    "Is a Panchakarma centre profitable in a small town?",
    "panchakarma centre se monthly kitni kamai ho sakti hai?",
    "What income can I expect from running Panchakarma therapies alongside OPD?",
  ]],
  ["rmo_job", "hospital", "T01", "Hospital employment", 2, [
    "How do I get an RMO job in a private hospital after BAMS?",
    "Which hospitals recruit BAMS graduates as duty medical officers?",
    "hospital me RMO ki job kaise milti hai?",
    "Where should I apply for resident medical officer posts as a BAMS doctor?",
    "Any tips to land a duty doctor job in a multispecialty hospital?",
  ]],
  ["rmo_legal", "hospital", "T01", "Hospital employment", 1, [
    "Is it legal for a BAMS RMO to handle emergencies in an allopathic hospital?",
    "Can I get into legal trouble working night duty in an ICU as a BAMS doctor?",
    "BAMS doctor ka allopathic hospital me emergency dekhna legal hai kya?",
    "What are the legal risks of working as a duty doctor in a modern hospital with a BAMS degree?",
  ]],
  ["specialty_derma", "specialty", "T01", "Choosing a clinical specialty", 1, [
    "Is skin and hair care a good niche for an Ayurveda practice?",
    "Should I specialise in dermatology cases in my Ayurveda clinic?",
    "skin problems ke liye ayurveda practice ka scope kaisa hai?",
    "How do I build a cosmetology and skin-focused Ayurveda practice?",
  ]],
  ["specialty_infertility", "specialty", "T01", "Choosing a clinical specialty", 1, [
    "Is infertility treatment a good specialty for an Ayurveda clinic?",
    "How can I start an Ayurveda infertility practice?",
    "infertility me ayurveda practice karna sahi rahega?",
    "Do Ayurveda doctors treating infertility get good results and patients?",
  ]],
  ["general_vs_niche", "specialty", "T01", "Choosing a clinical specialty", 1, [
    "Should I practise as a general physician or pick one specialty?",
    "Is it better to treat everything or focus on a niche in Ayurveda practice?",
    "general practice kare ya kisi ek speciality me focus kare?",
    "Generalist or specialist — which works better for a new Ayurveda doctor?",
  ]],
  ["allopathy_prescribe", "integrative", "T01", "Integrative referrals", 1, [
    "Can a BAMS doctor legally write allopathic prescriptions?",
    "Which states allow BAMS practitioners to prescribe modern medicines?",
    "kya BAMS wale allopathy ki dawai likh sakte hai?",
    "Is giving paracetamol or antibiotics allowed for BAMS doctors?",
  ]],
  ["emr_software", "records", "T01", "Records & clinical quality", 1, [
    "Which EMR software works well for an Ayurveda clinic?",
    "Is there a good app to maintain patient records for Ayurveda practice?",
    "clinic ke patient records ke liye kaunsa software use kare?",
    "Paper files or digital records — what should a new clinic use?",
  ]],

  /* ---------------- T02 Academics ---------------- */
  ["aiapget_strategy", "aiapget", "T02", "Choosing a PG branch", 2, [
    "What is the right strategy to prepare for AIAPGET?",
    "How should I plan my AIAPGET preparation from scratch?",
    "AIAPGET ki taiyari kaise shuru kare?",
    "MD entrance — where do I even begin?",
    "Give me a study plan to crack the PG entrance in one attempt",
    "aiapget prep tips?",
  ]],
  ["aiapget_books", "aiapget", "T02", "Choosing a PG branch", 1, [
    "Which books should I read for AIAPGET?",
    "Best reference books and MCQ books for the AIAPGET exam?",
    "AIAPGET ke liye kaunsi books padhe?",
    "AIAPGET books?",
    "Are online test series better than standard books for AIAPGET?",
  ]],
  ["aiapget_cutoff", "aiapget", "T02", "Choosing a PG branch", 1, [
    "What AIAPGET rank is needed for a government PG seat?",
    "How many marks are safe in AIAPGET to get a government college?",
    "AIAPGET me government seat ke liye kitni rank chahiye?",
    "Last year's AIAPGET cut-off for government colleges?",
  ]],
  ["aiapget_internship", "aiapget", "T02", "Choosing a PG branch", 1, [
    "Can I prepare for AIAPGET alongside internship duties?",
    "How do I manage internship postings and AIAPGET study together?",
    "internship ke saath AIAPGET ki padhai kaise manage kare?",
    "Is it realistic to crack AIAPGET while doing a full-time internship?",
  ]],
  ["neetpg_bams", "aiapget", "T02", "Choosing a PG branch", 1, [
    "Can a BAMS graduate appear for NEET-PG?",
    "Is NEET PG open to BAMS students for MD in modern medicine?",
    "kya BAMS ke baad NEET PG de sakte hai?",
    "Is there any way for BAMS doctors to write NEET-PG?",
  ]],
  ["pg_kaya", "pgbranch", "T02", "Choosing a PG branch", 1, [
    "What is the scope of MD in Kayachikitsa?",
    "Is Kayachikitsa a good PG branch for private practice?",
    "kayachikitsa me MD karne ka scope kya hai?",
    "Career after MD Kayachikitsa — clinic or teaching?",
  ]],
  ["pg_shalya", "pgbranch", "T02", "Choosing a PG branch", 1, [
    "What is the scope of MS in Shalya Tantra?",
    "Can MS Shalya graduates perform surgeries independently?",
    "shalya me MS karne ka scope kaisa hai?",
    "Is Shalya a good PG branch if I enjoy surgery?",
  ]],
  ["pg_which_branch", "pgbranch", "T02", "Choosing a PG branch", 2, [
    "How do I choose the right PG branch after BAMS?",
    "Which MD branch should I pick for a good career?",
    "PG me kaunsa branch lu? bahut confusion hai",
    "Which branch?",
    "Clinical or non-clinical subject for MD — how to decide?",
  ]],
  ["pg_private_fees", "pgbranch", "T02", "Choosing a PG branch", 1, [
    "What are the fees for MD Ayurveda in private colleges?",
    "How much does a management quota PG seat cost?",
    "private college me MD ki fees kitni hoti hai?",
    "Private PG fees?",
  ]],
  ["phd_without_md", "phd", "T02", "PhD pathway", 1, [
    "Can I do a PhD directly after BAMS without MD?",
    "Is PhD possible for BAMS graduates who have not done postgraduation?",
    "bina MD ke PhD kar sakte hai kya?",
    "PhD straight after BAMS — allowed?",
  ]],
  ["phd_after_md", "phd", "T02", "PhD pathway", 1, [
    "How do I get PhD admission after completing MD Ayurveda?",
    "What is the admission process for a PhD once I finish my MD?",
    "MD complete hone ke baad PhD me admission kaise le?",
    "Which universities offer PhD for MD Ayurveda holders?",
  ]],
  ["phd_abroad", "phd", "T02", "PhD pathway", 1, [
    "Can I do a PhD abroad after BAMS?",
    "Which foreign universities accept BAMS graduates for a PhD?",
    "videsh me PhD karna ho to kya karna padega?",
    "Is a funded PhD in Europe possible with an Ayurveda degree?",
  ]],
  ["faculty_eligibility", "faculty", "T02", "Faculty recruitment & eligibility", 1, [
    "What qualification is required to become an assistant professor in an Ayurveda college?",
    "Is MD compulsory to become a lecturer in an Ayurveda college?",
    "ayurveda college me teacher banne ke liye kya qualification chahiye?",
    "Eligibility for teaching jobs in BAMS colleges?",
  ]],
  ["faculty_salary", "faculty", "T02", "Faculty recruitment & eligibility", 1, [
    "What salary does an assistant professor get in an Ayurveda college?",
    "How much do private Ayurveda colleges pay their lecturers?",
    "ayurveda college me professor ki salary kitni hoti hai?",
    "Is teaching in an Ayurveda college well paid?",
  ]],

  /* ---------------- T03 Research ---------------- */
  ["research_ug_start", "research", "T03", "Framing a research question", 1, [
    "How can I start research as an undergraduate BAMS student?",
    "I am in 2nd prof — how do I get into research this early?",
    "UG me research kaise shuru kare?",
    "Can a BAMS student do research before PG?",
  ]],
  ["publish_first", "publish", "T03", "Thesis & publication", 2, [
    "How do I publish my first research paper?",
    "Steps to get a case report published in a journal?",
    "pehla paper publish kaise kare?",
    "I wrote an article on a case — how do I get it into a journal?",
  ]],
  ["predatory_journals", "publish", "T03", "Thesis & publication", 1, [
    "How do I identify predatory or fake journals?",
    "A journal is asking me for money to publish within a week — is it genuine?",
    "fake journal kaise pehchane?",
    "Which journals should I avoid when publishing Ayurveda papers?",
  ]],
  ["ethics_approval", "ethics", "T03", "Ethics & approvals", 1, [
    "Do I need ethics committee approval for a single case study?",
    "How do I get institutional ethics committee clearance for my study?",
    "case study ke liye ethics approval zaroori hai kya?",
    "IEC approval process for a small clinical study?",
  ]],
  ["ctri_registration", "ethics", "T03", "Ethics & approvals", 1, [
    "Is CTRI registration needed for an Ayurveda clinical trial?",
    "How do I register my trial on the Clinical Trials Registry of India?",
    "CTRI me trial register kaise kare?",
    "When is CTRI registration mandatory?",
  ]],
  ["sample_size", "biostat", "T03", "Biostatistics", 1, [
    "How do I calculate the sample size for my study?",
    "What sample size is enough for a pilot Ayurveda trial?",
    "sample size kaise nikale?",
    "Sample size?",
  ]],
  ["stats_software", "biostat", "T03", "Biostatistics", 1, [
    "Which software should I learn for statistics — SPSS, R or Excel?",
    "Is SPSS enough for thesis data analysis?",
    "statistics ke liye kaunsa software seekhu?",
    "Free tools for analysing research data?",
  ]],
  ["research_grants", "grants", "T03", "Grants & funding", 1, [
    "Where can I get funding for an Ayurveda research project?",
    "Does CCRAS or ICMR give grants to young Ayurveda researchers?",
    "research ke liye grant kahan se milega?",
    "How to apply for an extramural research grant from the Ministry of AYUSH?",
  ]],

  /* ---------------- T04 Entrepreneurship ---------------- */
  ["startup_funding", "startup-money", "T04", "Funding & finance", 1, [
    "How do I raise money for my Ayurveda startup?",
    "Do angel investors fund Ayurveda wellness startups?",
    "startup ke liye funding kaise milegi?",
    "Bank loan or investors — how should I fund my Ayurveda venture?",
  ]],
  ["startup_incubator", "startup-support", "T04", "Incubation support", 1, [
    "How do I apply to an incubator for my Ayurveda startup?",
    "Which incubation centres support AYUSH startups?",
    "AYUSH incubator me apply kaise kare?",
    "Is AIIA's incubation centre open to recent BAMS graduates?",
  ]],
  ["trademark_brand", "ip", "T04", "Team & intellectual property", 1, [
    "How do I trademark my Ayurveda brand name?",
    "What is the process to register a trademark for my product line?",
    "brand name ka trademark kaise karwaye?",
    "Trademark registration cost and time for a small brand?",
  ]],
  ["patent_formulation", "ip", "T04", "Team & intellectual property", 1, [
    "Can I patent my own Ayurvedic formulation?",
    "Is a classical formulation patentable if I modify it?",
    "apne formulation ka patent kaise kare?",
    "Patent for a new herbal combination — is it possible?",
  ]],
  ["sell_online", "d2c", "T04", "Business model", 1, [
    "How do I sell my Ayurveda products online on Amazon?",
    "Is a D2C website or a marketplace better for selling herbal products?",
    "online ayurveda products kaise beche?",
    "What do I need to list Ayurvedic products on e-commerce sites?",
  ]],

  /* ---------------- T05 Manufacturing ---------------- */
  ["mfg_licence", "mfg", "T05", "GMP and licensing", 1, [
    "What licence do I need to start an Ayurvedic manufacturing unit?",
    "How do I get a manufacturing licence and GMP certificate for Ayurvedic medicines?",
    "ayurvedic dawai banane ki factory ke liye license kaise milega?",
    "Requirements for a GMP-compliant Ayurveda pharmacy unit?",
  ]],
  ["loan_licence", "mfg", "T05", "GMP and licensing", 1, [
    "Can I launch my own brand through third-party manufacturing?",
    "How does loan licence manufacturing work for Ayurvedic products?",
    "third party manufacturing se apna brand kaise launch kare?",
    "Is contract manufacturing a good way to start my own product without a factory?",
  ]],
  ["qc_job", "qc", "T05", "QA / QC and testing", 1, [
    "How can a BAMS graduate get a QC job in an Ayurvedic pharma company?",
    "Do Ayurveda companies hire BAMS doctors in quality control?",
    "pharma company me QC ki job kaise milegi?",
    "Is a career in quality assurance good for BAMS graduates?",
  ]],
  ["qc_tests", "qc", "T05", "QA / QC and testing", 1, [
    "Which quality tests are required for Ayurvedic tablets before sale?",
    "Is heavy metal testing compulsory for Ayurvedic products?",
    "ayurvedic product ke liye kaunse lab test zaroori hai?",
    "What QC tests should a small Ayurveda manufacturer run?",
  ]],
  ["pv_career", "pv", "T05", "Pharmacovigilance", 1, [
    "Is pharmacovigilance a good career for BAMS graduates?",
    "How do I get into drug safety jobs after BAMS?",
    "pharmacovigilance me career kaise banaye?",
    "Which course helps a BAMS doctor enter pharmacovigilance?",
  ]],

  /* ---------------- T06 Brand ---------------- */
  ["instagram_grow", "social", "T06", "Digital presence", 2, [
    "How do I grow my Instagram as an Ayurveda doctor?",
    "What should I post on social media to attract patients?",
    "instagram pe followers kaise badhaye doctor ke liye?",
    "Tips to build an online presence for my new practice?",
  ]],
  ["youtube_channel", "social", "T06", "Digital presence", 1, [
    "Should I start a YouTube channel about Ayurveda?",
    "How do doctors make money from YouTube health videos?",
    "ayurveda pe youtube channel shuru karu kya?",
    "What kind of YouTube videos work for an Ayurveda doctor?",
  ]],
  ["ad_claims", "ads", "T06", "Advertising & claims compliance", 1, [
    "What claims am I legally allowed to make in Ayurveda advertisements?",
    "Can I advertise that my medicine cures diabetes?",
    "ayurveda ke ad me kya claim kar sakte hai?",
    "Which rules govern advertising of Ayurvedic drugs?",
  ]],

  /* ---------------- T07 Export ---------------- */
  ["export_start", "export", "T07", "Getting started in export", 1, [
    "How do I start exporting Ayurvedic products?",
    "First steps to begin an Ayurveda export business?",
    "ayurvedic products export kaise shuru kare?",
    "Export business?",
  ]],
  ["export_usa", "export-market", "T07", "Market entry & partners", 1, [
    "What are the FDA rules for exporting Ayurvedic products to the USA?",
    "Can Ayurvedic supplements be sold in America?",
    "USA me ayurvedic product bhejne ke rules kya hai?",
    "How do I enter the US market with herbal supplements?",
  ]],
  ["export_eu", "export-market", "T07", "Market entry & partners", 1, [
    "What are the rules for exporting Ayurvedic products to the European Union?",
    "Can I sell Ayurvedic medicines in Germany or France?",
    "Europe me ayurvedic products export karne ke rules?",
    "Is EU traditional herbal registration needed to sell in Europe?",
  ]],
  ["export_docs", "export", "T07", "Documentation & shipping terms", 1, [
    "Which documents are needed to export herbal products?",
    "Do I need an IEC code to start exporting?",
    "export ke liye kaun se documents chahiye?",
    "Paperwork for shipping Ayurvedic medicines abroad?",
  ]],

  /* ---------------- T08 Abroad ---------------- */
  ["abroad_uk", "abroad", "T08", "Country-wise recognition", 1, [
    "Can I practise Ayurveda in the UK with a BAMS degree?",
    "Is BAMS recognised in the United Kingdom?",
    "UK me ayurveda practice kar sakte hai kya?",
    "UK practice?",
  ]],
  ["abroad_germany", "abroad", "T08", "Country-wise recognition", 1, [
    "Can BAMS doctors work in Germany?",
    "Is Ayurveda practice allowed in Germany for Indian graduates?",
    "germany me ayurveda doctor ka scope kya hai?",
    "What is needed to practise Ayurveda in Germany as a Heilpraktiker?",
  ]],
  ["abroad_usa", "abroad", "T08", "Country-wise recognition", 1, [
    "Can I practise Ayurveda in the USA after BAMS?",
    "Is a BAMS degree valid in America?",
    "america me ayurveda practice kaise kare?",
    "What is the scope for BAMS doctors in the US?",
  ]],
  ["abroad_dubai", "abroad-licence", "T08", "Licensing & registration", 1, [
    "How do I get a DHA licence to practise Ayurveda in Dubai?",
    "What exam is needed for Ayurveda practice in the UAE?",
    "dubai me ayurveda doctor ka license kaise milega?",
    "Is there a licensing exam for Ayurveda doctors in Abu Dhabi?",
  ]],
  ["abroad_which_country", "abroad", "T08", "Country-wise recognition", 2, [
    "Which country is best for an Ayurveda doctor to settle in?",
    "In which countries is Ayurveda practice legally recognised?",
    "kaunse desh me ayurveda doctor ki demand hai?",
    "Best country for BAMS graduates?",
  ]],
  ["abroad_visa", "abroad-visa", "T08", "Visa and employment routes", 1, [
    "What work visa can a BAMS doctor get to work abroad?",
    "Do foreign wellness centres sponsor work visas for Ayurveda doctors?",
    "abroad job ke liye visa kaise milega?",
    "Which visa route works for Ayurveda therapists going overseas?",
  ]],

  /* ---------------- T09 MVT ---------------- */
  ["resort_job", "resort", "T09", "Careers in wellness resorts", 1, [
    "How do I get a job as an Ayurveda doctor in a wellness resort?",
    "Do luxury resorts like Ananda hire BAMS doctors?",
    "wellness resort me job kaise milegi?",
    "Resort job?",
  ]],
  ["resort_salary", "resort", "T09", "Careers in wellness resorts", 1, [
    "What salary do Ayurveda doctors get in wellness resorts?",
    "How much do luxury spas pay a BAMS consultant?",
    "resort me ayurveda doctor ki salary kitni hoti hai?",
    "Is resort pay better than clinic income for a BAMS doctor?",
  ]],
  ["mvt_package", "mvt", "T09", "Designing packages", 1, [
    "How do I design an Ayurveda treatment package for foreign patients?",
    "What should a 14-day Panchakarma package for international guests include?",
    "videshi patients ke liye package kaise banaye?",
    "How to price wellness packages for medical tourists?",
  ]],
  ["nabh_wellness", "accreditation", "T09", "Accreditation and standards", 1, [
    "How do I get NABH accreditation for an Ayurveda wellness centre?",
    "Is NABH certification necessary to attract medical tourists?",
    "NABH accreditation kaise milega wellness centre ke liye?",
    "What standards does NABH check in an Ayurveda hospital?",
  ]],

  /* ---------------- T10 Policy & government ---------------- */
  ["govt_job_list", "govt", "T10", "Government service routes", 2, [
    "What government jobs are available after BAMS?",
    "Which sarkari jobs can a BAMS graduate apply for?",
    "BAMS ke baad government job ke options kya hai?",
    "Govt jobs for BAMS?",
    "Apart from medical officer, which public sector posts take Ayurveda graduates?",
  ]],
  ["psc_mo_prep", "govt-exam", "T10", "Government service routes", 2, [
    "How should I prepare for the state PSC Ayurveda medical officer exam?",
    "Strategy to crack the AMO exam conducted by the public service commission?",
    "PSC medical officer exam ki taiyari kaise kare?",
    "How do I clear the state government Ayurveda MO recruitment test?",
  ]],
  ["psc_mo_syllabus", "govt-exam", "T10", "Government service routes", 1, [
    "What is the syllabus of the state PSC Ayurveda medical officer exam?",
    "Which subjects come in the AMO recruitment paper?",
    "PSC AMO exam ka syllabus kya hai?",
    "Exam pattern of the Ayurveda medical officer exam?",
  ]],
  ["upsc_bams", "upsc", "T10", "Government service routes", 1, [
    "Can I attempt UPSC civil services after BAMS?",
    "Is IAS a good option for a BAMS doctor?",
    "BAMS ke baad UPSC de sakte hai kya?",
    "Which optional is good for a BAMS graduate in UPSC?",
  ]],
  ["nam_contract", "nam", "T10", "National AYUSH Mission delivery", 1, [
    "How do I get a contractual medical officer job under the National AYUSH Mission?",
    "Are NAM contract posts a good start after BAMS?",
    "NAM me contract job kaise milegi?",
    "Where are National AYUSH Mission vacancies announced?",
  ]],
  ["who_career", "intl-org", "T10", "International organisations", 1, [
    "Can a BAMS graduate work with WHO?",
    "How do I get into international health organisations after BAMS?",
    "WHO me job kaise milegi ayurveda doctor ko?",
    "What qualifications does WHO look for in traditional medicine experts?",
  ]],
  ["mph_worth", "public-health", "T10", "Public health projects", 1, [
    "Is an MPH worth doing after BAMS?",
    "Should I do a Master of Public Health or MD Ayurveda?",
    "BAMS ke baad MPH karna sahi hai kya?",
    "What jobs can I get after MPH with a BAMS background?",
  ]],
  ["ccras_ro", "research-council", "T10", "Research councils", 1, [
    "How do I become a research officer in CCRAS?",
    "What is the eligibility for CCRAS research officer posts?",
    "CCRAS me research officer kaise bane?",
    "Is the CCRAS research officer exam tough?",
  ]],

  /* ---------------- Not sure ---------------- */
  ["after_bams", "after-bams", "NS", "", 2, [
    "What are my career options after BAMS?",
    "BAMS ke baad kya karu? kuch samajh nahi aa raha",
    "I am totally confused about what to do after graduation, please show me the paths",
    "बीएएमएस के बाद करियर विकल्प क्या हैं?",
    "Options after BAMS?",
  ]],
  ["bams_regret", "bams-worth", "NS", "", 1, [
    "Did I make a mistake choosing BAMS instead of MBBS?",
    "Is BAMS respected as much as MBBS in society?",
    "BAMS lekar galti to nahi ki?",
    "Will BAMS doctors ever earn like MBBS doctors?",
  ]],
  ["nonclinical_switch", "non-clinical", "NS", "", 1, [
    "What non-clinical careers can a BAMS graduate choose?",
    "Can I move into medical writing or healthcare management after BAMS?",
    "clinic ke alawa BAMS ke liye non clinical jobs kya hai?",
    "I don't want to practise — what else can I do with BAMS?",
  ]],
];

/** One-off questions nobody else asks. */
const SINGLES = [
  ["T01", "Records & clinical quality", "How long should I keep old prescriptions in my clinic records?"],
  ["T01", "Integrative referrals", "How do I explain to a cancer patient that Ayurveda is supportive care?"],
  ["T01", "Setting up private practice", "Should my clinic be open on Sundays?"],
  ["T01", "Panchakarma & therapy services", "What oil is best for Shirodhara in winter?"],
  ["T02", "Teaching skills", "How do I make Padartha Vigyan lectures interesting for first-year students?"],
  ["T02", "Curriculum & assessment", "Why did NCISM change the BAMS internship rules?"],
  ["T02", "Academic leadership", "What does a dean of an Ayurveda college actually do day to day?"],
  ["T02", "PhD pathway", "Can I change my PhD guide halfway through?"],
  ["T03", "Study design", "Is a crossover design suitable for a Rasayana study?"],
  ["T03", "Framing a research question", "How do I turn a Charaka Samhita reference into a research question?"],
  ["T03", "Thesis & publication", "How do I respond to a reviewer who rejected my paper?"],
  ["T04", "Validating the idea", "How do I test demand for an Ayurveda meal-kit idea?"],
  ["T04", "Product & prototype", "How to make a small batch of herbal soap for testing?"],
  ["T04", "Team & intellectual property", "How should I split equity with a non-doctor co-founder?"],
  ["T05", "R&D and formulation", "How do I improve the shelf life of an Avaleha?"],
  ["T05", "Production & scale-up", "What machine grinds 200 kg of churna a day?"],
  ["T05", "Regulatory affairs", "What does a regulatory affairs executive do in an AYUSH company?"],
  ["T06", "Scientific communication", "How do I present a poster at a conference?"],
  ["T06", "Community education", "How can I run Ayurveda awareness sessions in schools?"],
  ["T06", "Positioning a practice or product", "What tagline should my Ayurveda clinic use?"],
  ["T07", "Pricing & distribution", "How do I find a distributor in Malaysia?"],
  ["T07", "Certification and quality marks", "Is halal certification useful for Ayurvedic exports?"],
  ["T08", "Bridging qualifications", "Is there a bridge course for BAMS doctors in Australia?"],
  ["T08", "Wellness centre roles abroad", "What does an Ayurveda therapist do in a spa in the Maldives?"],
  ["T09", "Handling international patients", "How do I handle diet rules for a vegan guest during Panchakarma?"],
  ["T09", "How the MVT ecosystem works", "Which agencies bring medical tourists to Kerala?"],
  ["T10", "Policy research & advocacy", "How can young doctors give input on AYUSH policy?"],
  ["T10", "Public health projects", "Can Ayurveda help the national anaemia mission?"],
  ["NS", "", "How do I handle family pressure to get married before PG?"],
  ["NS", "", "Is a yoga instructor certificate useful along with BAMS?"],
  ["NS", "", "How do I stop feeling burnt out during internship?"],
];

const GREETINGS = [
  "Pranaam sir, ", "Hello doctor, ", "Respected ma'am, ", "Namaste doctor ji, ", "Good afternoon everyone, ",
  "Hey mentors! ", "Sir/Madam, ", "My name is Aditya and I am in 2nd prof. ", "This is Sneha from Pune. ",
  "Myself Dr. Kiran, BAMS 2024 batch. ", "Hello, I'm Rahul, a final year student. ", "Respected AYURDISHA team, ",
  "Namaskaram. ", "Hi all, ",
];
const STORIES = [
  "I come from a farming family and nobody at home is a doctor, so I have no guidance at all. ",
  "I have been thinking about this for months and my seniors all say different things. ",
  "My internship ends in March and I am getting really anxious about the future. ",
  "Everyone in my batch seems to have a plan except me. ",
];
const SIGNOFFS = [
  " pls reply sir", " thanks a lot 🙏", " plz suggest", " waiting eagerly", " kindly guide me in detail",
  "???", " (please answer)", " tq",
];
const CONTEXTS = [
  "I want to do MD later.", "Thinking of going to the UK someday.", "My father has a small pharmacy.",
  "I am from a village in Odisha.", "I have a loan of 8 lakh.", "Interested in Panchakarma.",
  "I passed out in 2023.", "Currently working as an RMO.", "My elder brother is an MBBS doctor.",
  "I like teaching.", "I scored 58% in final year.", "",
];
const SMS = [[/\byou\b/gi, "u"], [/\bplease\b/gi, "plz"], [/\bwhat\b/gi, "wht"], [/\bshould\b/gi, "shld"], [/\bfor\b/gi, "4"], [/\bbecause\b/gi, "bcoz"]];

function sfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rnd = sfc32(SEED, SEED ^ 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f);
for (let i = 0; i < 30; i++) rnd();
const pick = arr => arr[Math.floor(rnd() * arr.length)];

function typo(text) {
  const words = text.split(" ");
  const idx = words.map((w, i) => (/^[A-Za-z]{5,}$/.test(w) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return text;
  const i = pick(idx);
  const w = words[i];
  const r = rnd();
  const k = 1 + Math.floor(rnd() * (w.length - 2));
  if (r < 0.4) words[i] = w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);
  else if (r < 0.7) words[i] = w.slice(0, k) + w.slice(k + 1);
  else if (i + 1 < words.length) { words[i] = w + words[i + 1]; words.splice(i + 1, 1); }
  return words.join(" ");
}

function noisy(q) {
  let s = q;
  if (rnd() < 0.22) s = typo(s);
  if (rnd() < 0.07) s = typo(s);
  if (rnd() < 0.1) SMS.forEach(([re, rep]) => { s = s.replace(re, rep); });
  if (rnd() < 0.1) s = pick(STORIES) + s;
  if (rnd() < 0.3) s = pick(GREETINGS) + s.charAt(0).toLowerCase() + s.slice(1);
  if (rnd() < 0.22) s = s.replace(/[?.]*$/, "") + pick(SIGNOFFS);
  const c = rnd();
  if (c < 0.22) s = s.toLowerCase();
  else if (c < 0.25) s = s.toUpperCase();
  if (rnd() < 0.08) s = s.replace(/[?.!,—:]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function place(themeKey, sub) {
  const r = rnd();
  if (r < 0.8 || themeKey === "NS") return [themeKey, sub];
  if (r < 0.92) return [themeKey, pick(SUBS[themeKey].filter(x => x !== sub))];
  if (r < 0.97) return ["NS", ""];
  const other = pick(Object.keys(SUBS).filter(k => k !== themeKey && k !== "NS"));
  return [other, pick(SUBS[other])];
}

const items = [];
INTENTS.forEach(([intent, fam, tk, sub, pop, qs]) => {
  const uses = [...qs];
  qs.forEach(q => { if (rnd() < (pop > 1 ? 0.75 : 0.3)) uses.push(q); });
  if (pop > 1) qs.forEach(q => { if (rnd() < 0.3) uses.push(q); });
  uses.forEach(q => {
    const [pt, ps] = place(tk, sub);
    items.push({ intent, fam, homeTheme: T[tk], theme: T[pt], subtheme: ps, question: noisy(q), context: rnd() < 0.35 ? pick(CONTEXTS) : "" });
  });
});
SINGLES.forEach(([tk, sub, q], i) => {
  items.push({ intent: `single_${i}`, fam: `single_${i}`, homeTheme: T[tk], theme: T[tk], subtheme: sub, question: noisy(q), context: rnd() < 0.35 ? pick(CONTEXTS) : "" });
});
for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
}
const t0 = Date.UTC(2026, 11, 10, 4, 0, 0);
const subs = items.map((x, i) => ({ id: `N${String(i + 1).padStart(4, "0")}`, createdAt: t0 + i * 31_000, ...x }));

/** Sibling intents that share a subject but need a different answer — must never be co-grouped. */
const famCount = new Map();
INTENTS.forEach(([intent, fam]) => famCount.set(fam, [...(famCount.get(fam) || []), intent]));
const hardNegativeIntents = [...famCount.values()].filter(v => v.length > 1);

const body = {
  description: "NEW labelled Ask Desk corpus for the precision-first merge engine. Synthetic, hand-written, frozen before tuning — report only, never tune.",
  generator: "scripts/bench/build-new-set.mjs", seed: SEED, frozen: "2026-10-24",
  count: subs.length, intents: INTENTS.length + SINGLES.length, hardNegativeIntents, subs,
};
const out = path.join(ROOT, "tests/fixtures/merge-new-460.json");
const text = JSON.stringify(body, null, 1);
fs.writeFileSync(out, text);
const sha = crypto.createHash("sha256").update(text).digest("hex");
const off = subs.filter(s => s.theme !== s.homeTheme).length;
console.log(`Wrote ${subs.length} questions (${INTENTS.length} intents + ${SINGLES.length} one-offs, ${hardNegativeIntents.length} look-alike families) → ${path.relative(process.cwd(), out)}; off-home theme ${off}; sha256 ${sha}`);
