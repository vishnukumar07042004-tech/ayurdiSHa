#!/usr/bin/env node
/**
 * NEW-2 untouched merge benchmark (~500 labelled questions), written and frozen on 25 Oct 2026
 * BEFORE the second round of precision-first fixes (syllabus ask, shared-subject requirement).
 * New-460 had been inspected by then, so NEW-2 is the clean report set. Never tune on it.
 *
 *   node scripts/bench/build-new2-set.mjs        → tests/fixtures/merge-new2-500.json
 *
 * New intents and wording (no template shared with A-1200, B, Fresh-403 or New-460), new seed, new
 * greetings / self-introductions / back-stories / sign-offs. Look-alike sibling intents (same
 * `fam`) are hard negatives: RMO salary vs RMO hours, Australia vs Canada, PSC cut-off vs PSC books,
 * MD Panchakarma vs MD Dravyaguna, clinic fee vs clinic set-up cost, CTRI vs consent form…
 * One intent = one mentor answer fully serves every student who asked it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = 20_261_025;

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

/** [intent, fam, theme, sub, popularity (1 or 2), phrasings] */
const INTENTS = [
  ["town_clinic_viability", "clinic_place", "T01", "Setting up private practice", 1, [
    "Is it viable to start an Ayurveda practice in a small town?",
    "Will an Ayurveda clinic actually run in a tier-3 town?",
    "chhote shehar me ayurveda clinic chalega kya?",
    "Small town clinic — will patients come?",
  ]],
  ["clinic_rent_or_buy", "clinic_place", "T01", "Setting up private practice", 1, [
    "Should I rent a space or buy a place for my first clinic?",
    "Rent or buy premises for a new Ayurveda clinic?",
    "clinic ke liye jagah kiraye pe lu ya khareed lu?",
    "Is it smarter to lease clinic space in the beginning instead of buying?",
  ]],
  ["consultation_fee", "clinic_money", "T01", "Setting up private practice", 2, [
    "How much consultation fee should a new BAMS doctor charge?",
    "What should I charge per consultation when I start practice?",
    "naye clinic me consultation fees kitni rakhe?",
    "Consultation fee for a fresh Ayurveda practitioner?",
  ]],
  ["clinic_setup_cost", "clinic_money", "T01", "Setting up private practice", 2, [
    "What is the total investment needed to set up a small Ayurveda clinic?",
    "How many lakhs does it take to start a clinic?",
    "clinic setup karne me kitna kharcha aata hai?",
    "Budget required to open an Ayurveda clinic?",
  ]],
  ["crosspathy_drugs", "crosspathy", "T01", "Integrative referrals", 2, [
    "Are BAMS doctors allowed to give allopathic drugs?",
    "Is crosspathy legal for Ayurveda doctors?",
    "kya BAMS doctor english dawai likh sakta hai?",
    "Can I prescribe modern medicine with a BAMS degree?",
  ]],
  ["minor_surgery_rights", "crosspathy", "T01", "Integrative referrals", 1, [
    "Can a BAMS doctor perform minor surgeries like suturing?",
    "Are BAMS graduates allowed to do minor surgical procedures?",
    "kya BAMS doctor legally stitches laga sakta hai?",
    "Minor surgery rights for BAMS doctors?",
  ]],
  ["pk_equipment", "panchakarma", "T01", "Panchakarma & therapy services", 1, [
    "What equipment do I need for a Panchakarma room?",
    "List of instruments needed to set up Panchakarma therapy?",
    "panchakarma unit ke liye kya kya equipment chahiye?",
    "Apart from a droni and steam box, what equipment does a Panchakarma setup need?",
  ]],
  ["pk_training", "panchakarma", "T01", "Panchakarma & therapy services", 2, [
    "Which is the best short course to learn Panchakarma after BAMS?",
    "Where can I get hands-on Panchakarma training?",
    "panchakarma ka certificate course kahan se kare?",
    "Good institutes for practical Panchakarma training?",
  ]],
  ["rmo_hours", "rmo", "T01", "Hospital employment", 1, [
    "What are the working hours of an RMO in a corporate hospital?",
    "How many night duties does a hospital RMO usually do?",
    "RMO job me duty kitne ghante ki hoti hai?",
    "Typical duty schedule of a BAMS RMO?",
  ]],
  ["rmo_salary", "rmo", "T01", "Hospital employment", 2, [
    "What salary does an RMO get in a corporate hospital?",
    "RMO ki salary kitni hoti hai?",
    "How much do hospitals pay BAMS duty doctors per month?",
    "Starting pay of an RMO?",
  ]],
  ["aiapget_test_series", "aiapget", "T02", "Choosing a PG branch", 2, [
    "Which online test series is good for AIAPGET?",
    "Best mock test platform for AIAPGET?",
    "AIAPGET ke liye konsa test series le?",
    "AIAPGET test series recommendations?",
  ]],
  ["aiapget_counselling", "aiapget", "T02", "Choosing a PG branch", 1, [
    "How does AIAPGET counselling work for state quota seats?",
    "AIAPGET counselling process — AACCC or state?",
    "aiapget counselling kaise hoti hai?",
    "Explain the AIAPGET counselling rounds.",
  ]],
  ["aiapget_drop_year", "aiapget", "T02", "Choosing a PG branch", 2, [
    "Should I take a drop year for AIAPGET or join a job?",
    "Drop a year for AIAPGET or start working?",
    "AIAPGET ke liye drop lu ya job karu?",
    "Is taking a gap year to prepare for the PG entrance worth it?",
  ]],
  ["md_or_ms", "pg_choice", "T02", "Choosing a PG branch", 1, [
    "Should I choose an MD or an MS branch?",
    "MD vs MS in Ayurveda — which is better?",
    "MD karu ya MS?",
    "Clinical MD or surgical MS — how do I decide?",
  ]],
  ["md_panchakarma_scope", "pg_branch", "T02", "Choosing a PG branch", 2, [
    "What is the scope of MD Panchakarma?",
    "Is MD Panchakarma a good choice?",
    "MD panchakarma ka scope kaisa hai?",
    "Career after MD in Panchakarma?",
  ]],
  ["md_dravyaguna_scope", "pg_branch", "T02", "Choosing a PG branch", 1, [
    "What is the scope of MD Dravyaguna?",
    "Is Dravyaguna a good PG branch?",
    "dravyaguna me PG karne ka scope?",
    "Career after MD Dravyaguna?",
  ]],
  ["mph_abroad", "pg_abroad", "T02", "Choosing a PG branch", 1, [
    "Can I do a master's in public health abroad after BAMS?",
    "MPH abroad after BAMS — is it possible?",
    "BAMS ke baad videsh se MPH kar sakte hai?",
    "Which countries accept BAMS graduates for an MPH?",
  ]],
  ["lecturer_eligibility", "faculty", "T02", "Faculty recruitment & eligibility", 2, [
    "What are the NCISM norms for becoming a lecturer?",
    "Minimum qualification for an Ayurveda lecturer as per NCISM?",
    "NCISM ke hisab se assistant professor banne ki eligibility kya hai?",
    "Is MD mandatory to teach in an Ayurveda college?",
  ]],
  ["better_teacher", "faculty", "T02", "Teaching skills", 1, [
    "How do I become a better classroom teacher in an Ayurveda college?",
    "Tips for a new lecturer to teach effectively?",
    "nayi lecturer hu, padhana kaise improve karu?",
    "How do I make my lectures interesting for BAMS students?",
  ]],
  ["phd_fellowship", "phd", "T02", "PhD pathway", 1, [
    "Is there any stipend or fellowship for an Ayurveda PhD?",
    "Do PhD scholars in Ayurveda get a fellowship?",
    "ayurveda PhD me stipend milta hai kya?",
    "PhD funding options in Ayurveda?",
  ]],
  ["phd_admission", "phd", "T02", "PhD pathway", 1, [
    "Which entrance exam is needed for a PhD in Ayurveda?",
    "How do I get admission to an Ayurveda PhD?",
    "PhD admission process in Ayurveda universities?",
    "ayurveda me PhD ke liye entrance kaunsa hai?",
  ]],
  ["journal_indexing", "publish", "T03", "Thesis & publication", 1, [
    "How do I check if a journal is indexed in PubMed or Scopus?",
    "How to verify a journal's indexing?",
    "journal scopus indexed hai ya nahi kaise check kare?",
    "Ways to confirm journal indexing before submitting a paper?",
  ]],
  ["publication_fee", "publish", "T03", "Thesis & publication", 2, [
    "Do I have to pay to publish my article?",
    "Are there free journals for Ayurveda papers without any processing charge?",
    "paper publish karne ke paise lagte hai kya?",
    "How do I avoid article processing charges when publishing?",
  ]],
  ["sample_size", "stats", "T03", "Biostatistics", 2, [
    "How do I calculate sample size for a clinical study?",
    "Sample size calculation for my MD thesis?",
    "sample size kaise nikale?",
    "Which formula should I use for sample size in a trial?",
  ]],
  ["stat_test_choice", "stats", "T03", "Biostatistics", 1, [
    "Which statistical test should I use to compare two groups?",
    "t-test or Mann-Whitney for my thesis data?",
    "do group compare karne ke liye konsa test lagaye?",
    "How do I choose the right statistical test?",
  ]],
  ["ctri_registration", "ethics", "T03", "Ethics & approvals", 1, [
    "How do I register a clinical trial on CTRI?",
    "CTRI registration process?",
    "CTRI pe trial register kaise kare?",
    "Steps to get a CTRI number for my study?",
  ]],
  ["consent_form", "ethics", "T03", "Ethics & approvals", 1, [
    "How do I write an informed consent form for my study?",
    "Format of an informed consent document for an Ayurveda trial?",
    "research ke liye consent form kaise banaye?",
    "Informed consent template for a clinical study?",
  ]],
  ["ccras_student_grant", "funding", "T03", "Grants & funding", 1, [
    "Does CCRAS give research grants to students?",
    "Student research funding from CCRAS?",
    "CCRAS se student research grant milta hai?",
    "How do I apply for a CCRAS research grant as a student?",
  ]],
  ["llp_or_pvtltd", "startup_legal", "T04", "Business model", 1, [
    "Should I register my startup as an LLP or a private limited company?",
    "LLP vs Pvt Ltd for an Ayurveda startup?",
    "startup ke liye LLP banau ya private limited?",
    "Which company structure is best for a small Ayurveda business?",
  ]],
  ["dpiit_recognition", "startup_legal", "T04", "Incubation support", 1, [
    "How do I get DPIIT recognition for my startup?",
    "Startup India registration — process and benefits?",
    "DPIIT startup recognition kaise milega?",
    "Steps to register under Startup India?",
  ]],
  ["product_pricing", "product", "T04", "Product & prototype", 1, [
    "How do I price my herbal skincare product?",
    "Pricing strategy for a new Ayurvedic product?",
    "apne ayurvedic product ki price kaise decide kare?",
    "How much margin should I keep on my Ayurveda product?",
  ]],
  ["third_party_mfg", "product", "T04", "Product & prototype", 2, [
    "Can I get my formulation made by a third-party manufacturer?",
    "How does third-party manufacturing work for Ayurvedic products?",
    "third party se apna product banwa sakte hai kya?",
    "Contract manufacturing for my own Ayurveda brand?",
  ]],
  ["angel_pitch", "funding_startup", "T04", "Funding & finance", 1, [
    "How do I pitch my Ayurveda startup to angel investors?",
    "Tips for pitching to investors?",
    "investors ko pitch kaise kare?",
    "What do angel investors look for in a health startup?",
  ]],
  ["schedule_t", "gmp", "T05", "GMP and licensing", 1, [
    "What are the Schedule T requirements for an Ayurvedic factory?",
    "Schedule T GMP checklist?",
    "schedule T ke rules kya hai?",
    "GMP norms under Schedule T for Ayurveda units?",
  ]],
  ["mfg_licence", "gmp", "T05", "GMP and licensing", 2, [
    "How do I get a manufacturing licence for Ayurvedic medicines?",
    "Process for an Ayurveda drug manufacturing licence?",
    "ayurvedic dawai banane ka licence kaise milta hai?",
    "Form 25-D licence application steps?",
  ]],
  ["heavy_metal_tests", "qc", "T05", "QA / QC and testing", 1, [
    "Which heavy metal tests are mandatory for Ayurvedic products?",
    "Heavy metal limits for Ayurvedic medicines?",
    "heavy metal testing zaroori hai kya?",
    "Lead and mercury testing requirements for Ayurveda drugs?",
  ]],
  ["shelf_life", "qc", "T05", "QA / QC and testing", 1, [
    "How is the shelf life of an Ayurvedic formulation decided?",
    "Expiry date rules for churna and tablets?",
    "ayurvedic medicine ki expiry kaise tay hoti hai?",
    "Shelf life of Ayurvedic dosage forms?",
  ]],
  ["pharma_rnd_job", "pharma_job", "T05", "R&D and formulation", 2, [
    "How do I get into R&D at an Ayurveda pharma company?",
    "R&D jobs in Ayurvedic pharma — how to apply?",
    "pharma company me R&D job kaise mile?",
    "Skills needed to land an Ayurveda R&D role?",
  ]],
  ["medical_advisor_role", "pharma_job", "T05", "Regulatory affairs", 1, [
    "What does a medical advisor do in an Ayurveda company?",
    "Medical advisor role in Ayurvedic pharma — what is it like?",
    "pharma me medical advisor ka kaam kya hota hai?",
    "Is medical advisor a good career for BAMS?",
  ]],
  ["youtube_channel", "socialmedia", "T06", "Digital presence", 2, [
    "Should I start a YouTube channel as an Ayurveda doctor?",
    "Is YouTube good for building a practice?",
    "doctor ke liye youtube channel shuru karna sahi hai?",
    "Tips to start an Ayurveda YouTube channel?",
  ]],
  ["doctor_advertising", "claims", "T06", "Advertising & claims compliance", 1, [
    "Can doctors advertise their clinic on social media?",
    "Is advertising my practice allowed under NCISM rules?",
    "kya clinic ka advertisement de sakte hai?",
    "Ethics rules on doctors advertising?",
  ]],
  ["clinic_website", "branding", "T06", "Positioning a practice or product", 1, [
    "Do I need a website for my clinic?",
    "Is a clinic website worth it?",
    "clinic ki website banani chahiye?",
    "Does a new clinic need its own website?",
  ]],
  ["iec_code", "export_docs", "T07", "Getting started in export", 1, [
    "How do I get an IEC code to export Ayurvedic products?",
    "IEC registration for exporting herbs?",
    "export ke liye IEC code kaise banaye?",
    "Is an IEC needed to export Ayurveda medicines?",
  ]],
  ["export_usa", "export_country", "T07", "Market entry & partners", 1, [
    "What are the FDA rules for exporting Ayurvedic supplements to the USA?",
    "Can I sell Ayurvedic products in America?",
    "USA me ayurvedic product bechne ke rules?",
    "FDA requirements for Ayurveda products in the US?",
  ]],
  ["export_eu", "export_country", "T07", "Market entry & partners", 1, [
    "What are the rules for exporting Ayurvedic products to Europe?",
    "Can Ayurvedic products be sold in the EU?",
    "europe me ayurvedic product export kaise kare?",
    "EU regulations for herbal products from India?",
  ]],
  ["practise_australia", "abroad_country", "T08", "Country-wise recognition", 2, [
    "Can I practise Ayurveda in Australia?",
    "Is BAMS recognised in Australia?",
    "australia me ayurveda practice kar sakte hai?",
    "How do I work as an Ayurveda practitioner in Australia?",
  ]],
  ["practise_canada", "abroad_country", "T08", "Country-wise recognition", 1, [
    "Can I practise Ayurveda in Canada?",
    "Is BAMS valid in Canada?",
    "canada me BAMS doctor practice kar sakta hai?",
    "How do I work as an Ayurveda practitioner in Canada?",
  ]],
  ["ielts_needed", "abroad_lang", "T08", "Visa and employment routes", 1, [
    "Do I need IELTS to work abroad as an Ayurveda doctor?",
    "Is IELTS required for Ayurveda jobs overseas?",
    "abroad jane ke liye IELTS zaroori hai?",
    "English test needed for Ayurveda practice abroad?",
  ]],
  ["gulf_jobs", "abroad_country", "T08", "Wellness centre roles abroad", 1, [
    "Are there Ayurveda jobs in the Gulf?",
    "gulf me BAMS ke liye job hai kya?",
    "Ayurveda doctor jobs in Middle East countries?",
  ]],
  ["resort_job", "resort", "T09", "Careers in wellness resorts", 2, [
    "How do I get a doctor job in an Ayurveda resort in Kerala?",
    "Kerala wellness resort doctor vacancies — how to apply?",
    "resort me ayurveda doctor ki job kaise mile?",
    "Applying to Ayurveda resorts as a physician?",
  ]],
  ["resort_salary", "resort", "T09", "Careers in wellness resorts", 1, [
    "How much do Ayurveda resorts pay their doctors?",
    "Salary of a resident doctor in a wellness resort?",
    "resort doctor ki salary kitni hoti hai?",
    "Pay scale at Ayurveda wellness resorts?",
  ]],
  ["nabh_accreditation", "accreditation", "T09", "Accreditation and standards", 1, [
    "How does NABH accreditation work for Ayurveda hospitals?",
    "NABH AYUSH accreditation process?",
    "ayurveda hospital ke liye NABH certificate kaise milega?",
    "Requirements for NABH accreditation of an Ayurveda centre?",
  ]],
  ["nhm_ayush_mo", "govt_job", "T10", "Government service routes", 2, [
    "How do I get a contractual AYUSH MO post under NHM?",
    "NHM AYUSH medical officer recruitment process?",
    "NHM me ayush MO kaise bane?",
    "Applying for NHM AYUSH doctor vacancies?",
  ]],
  ["upsc_cms", "govt_exam", "T10", "Government service routes", 1, [
    "Can BAMS graduates sit for the UPSC CMS exam?",
    "Is UPSC Combined Medical Services open to BAMS?",
    "kya BAMS wale UPSC CMS de sakte hai?",
    "UPSC CMS eligibility for Ayurveda doctors?",
  ]],
  ["upsc_civil", "govt_exam", "T10", "Government service routes", 2, [
    "Can I prepare for UPSC civil services after BAMS?",
    "Can a BAMS doctor become an IAS officer?",
    "BAMS ke baad IAS ki taiyari kar sakte hai?",
    "Civil services as a career after BAMS?",
  ]],
  ["who_internship", "intl_org", "T10", "International organisations", 1, [
    "How do I apply for a WHO internship?",
    "WHO internship for Ayurveda graduates?",
    "WHO me internship kaise milti hai?",
    "Eligibility for the WHO internship programme?",
  ]],
  ["psc_mo_cutoff", "psc", "T10", "Government service routes", 1, [
    "What was last year's cut-off in the state PSC Ayurveda MO exam?",
    "PSC AMO exam cut-off marks?",
    "psc ayurveda medical officer ka cutoff kitna jata hai?",
    "Expected cut-off for the state Ayurveda MO exam?",
  ]],
  ["psc_mo_books", "psc", "T10", "Government service routes", 2, [
    "Which books should I read for the state PSC Ayurveda MO exam?",
    "Book list for the PSC AMO exam?",
    "PSC MO exam ke liye konsi books padhe?",
    "Best study material for the Ayurveda medical officer exam?",
  ]],
  ["career_options", "general", "NS", "", 2, [
    "I am confused about my career after BAMS, what are my options?",
    "What career options do I have after BAMS?",
    "BAMS ke baad kya kya option hai?",
    "List of career paths after BAMS?",
  ]],
  ["non_clinical", "general", "NS", "", 1, [
    "What non-clinical jobs can a BAMS graduate do?",
    "I don't want to see patients — what else can I do with BAMS?",
    "bina patient dekhe BAMS ke baad kya kaam kar sakte hai?",
    "Non-clinical career options for Ayurveda doctors?",
  ]],
  ["intern_stipend", "internship", "NS", "", 1, [
    "How much stipend do BAMS interns get?",
    "BAMS internship stipend in private colleges?",
    "internship me stipend kitna milta hai?",
    "Do BAMS interns get paid?",
  ]],
  ["intern_abroad", "internship", "NS", "", 1, [
    "Can I do part of my BAMS internship abroad?",
    "Is an international elective allowed during BAMS internship?",
    "kya BAMS internship videsh me kar sakte hai?",
    "Foreign internship options for BAMS students?",
  ]],
];

/** One-off questions nobody else asks (several share many words with an intent above). */
const SINGLES = [
  ["T01", "Setting up private practice", "Can I run my clinic from my home?"],
  ["T01", "Setting up private practice", "How do I collect patient feedback in a small clinic?"],
  ["T01", "Hospital employment", "Do corporate hospitals give RMOs health insurance?"],
  ["T01", "Panchakarma & therapy services", "How do I train a new Panchakarma therapist quickly?"],
  ["T01", "Records & clinical quality", "Which software is good for clinic billing?"],
  ["T01", "Choosing a clinical specialty", "Is Ayurvedic dermatology a growing field?"],
  ["T02", "Choosing a PG branch", "Can I change my PG college after admission?"],
  ["T02", "Choosing a PG branch", "Is the AIAPGET exam held online or offline?"],
  ["T02", "Curriculum & assessment", "Why is Sanskrit taught in the first year of BAMS?"],
  ["T02", "Academic leadership", "How does one become a principal of an Ayurveda college?"],
  ["T02", "PhD pathway", "Can I do a PhD part-time while working?"],
  ["T03", "Framing a research question", "How do I find a research gap in Rasashastra?"],
  ["T03", "Study design", "What is the difference between an RCT and an observational study?"],
  ["T03", "Thesis & publication", "How do I respond to reviewer comments on my paper?"],
  ["T03", "Biostatistics", "Is SPSS free for students?"],
  ["T04", "Validating the idea", "How do I test demand for an Ayurveda meal-kit idea?"],
  ["T04", "Team & intellectual property", "How do I split equity with a co-founder?"],
  ["T04", "Funding & finance", "Are there government loans for Ayurveda startups?"],
  ["T05", "Production & scale-up", "How do I scale a churna recipe from 1 kg to 100 kg?"],
  ["T05", "Pharmacovigilance", "How do I report an adverse drug reaction to an Ayurvedic medicine?"],
  ["T06", "Scientific communication", "How do I explain Ayurveda research to the public without overclaiming?"],
  ["T06", "Community education", "How do I run a free health camp in my village?"],
  ["T07", "Documentation & shipping terms", "What does FOB mean in export?"],
  ["T07", "Pricing & distribution", "How do I find a distributor in Singapore?"],
  ["T08", "Bridging qualifications", "Is a bridge course available for BAMS to become a nurse abroad?"],
  ["T08", "Licensing & registration", "Do I need to renew my state registration if I move abroad?"],
  ["T09", "Designing packages", "How do I design a 7-day detox package for foreign guests?"],
  ["T09", "Handling international patients", "How do I handle language barriers with foreign patients?"],
  ["T10", "National AYUSH Mission delivery", "How are AYUSH wellness centres funded?"],
  ["T10", "Research councils", "What does a research officer at CCRAS actually do daily?"],
  ["T10", "Public health projects", "Can Ayurveda doctors work on tribal health projects?"],
  ["T10", "Policy research & advocacy", "Which think tanks work on traditional medicine policy?"],
  ["NS", "", "How do I deal with exam anxiety during final prof?"],
  ["NS", "", "Is it okay to take a break year after BAMS for my mental health?"],
  ["NS", "", "Should I learn coding along with BAMS?"],
  ["NS", "", "How do I convince my parents that I don't want to do PG right now?"],
  ["NS", "", "What hobbies help a doctor avoid burnout?"],
  ["NS", "", "Can I get a bank loan for my higher studies after BAMS?"],
];

const GREETINGS = [
  "Good evening respected mentors, ", "Hello sir ji, ", "Namaskar doctor, ", "Dear Sir, ", "Hello AYURDISHA, ",
  "Myself Priya from Jaipur, final year. ", "I am Arjun, an intern at a government college. ", "Hi, this is Meera. ",
  "Respected Vaidya ji, ", "Pranam guruji. ", "Hello hello! ", "Good morning ma'am, ",
  "I am Farhan, BAMS 3rd year student from Lucknow. ", "Respected panel, ",
];
const STORIES = [
  "My parents spent a lot on my education and I feel pressure to start earning soon. ",
  "I failed one subject in third prof and I worry it affects my options. ",
  "I am the first doctor in my family and I don't know whom to ask. ",
  "All my friends are preparing for PG and I feel lost. ",
  "I have asked many seniors but everyone gives a different answer. ",
];
const SIGNOFFS = [" please help", " 🙏🙏", " thank you in advance", " pls", " urgent", " reply soon sir", "!!", " thanks"];
const CONTEXTS = [
  "I am from Bihar.", "I want to settle abroad eventually.", "My mother runs a beauty parlour.", "I have 2 years of RMO experience.",
  "I am interested in research.", "I scored 62% overall.", "My family wants me to get a government job.", "I graduated in 2024.",
  "I am interested in skin diseases.", "I already have a small online following.", "",
];
const SMS = [[/\bthe\b/gi, "d"], [/\bare\b/gi, "r"], [/\bhow\b/gi, "hw"], [/\bwhich\b/gi, "wich"], [/\bto\b/gi, "2"], [/\bplease\b/gi, "pls"]];

function sfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rnd = sfc32(SEED, SEED ^ 0x9e3779b9, 0x7f4a7c15, 0x94d049bb);
for (let i = 0; i < 40; i++) rnd();
const pick = arr => arr[Math.floor(rnd() * arr.length)];

function typo(text) {
  const words = text.split(" ");
  const idx = words.map((w, i) => (/^[A-Za-z]{5,}$/.test(w) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return text;
  const i = pick(idx);
  const w = words[i];
  const r = rnd();
  const k = 1 + Math.floor(rnd() * (w.length - 2));
  if (r < 0.35) words[i] = w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2);
  else if (r < 0.6) words[i] = w.slice(0, k) + w.slice(k + 1);
  else if (r < 0.8) words[i] = w.slice(0, k) + w[k] + w.slice(k);
  else if (i + 1 < words.length) { words[i] = w + words[i + 1]; words.splice(i + 1, 1); }
  return words.join(" ");
}

function noisy(q) {
  let s = q;
  if (rnd() < 0.25) s = typo(s);
  if (rnd() < 0.08) s = typo(s);
  if (rnd() < 0.08) SMS.forEach(([re, rep]) => { s = s.replace(re, rep); });
  if (rnd() < 0.12) s = pick(STORIES) + s;
  if (rnd() < 0.32) s = pick(GREETINGS) + s.charAt(0).toLowerCase() + s.slice(1);
  if (rnd() < 0.2) s = s.replace(/[?.]*$/, "") + pick(SIGNOFFS);
  const c = rnd();
  if (c < 0.2) s = s.toLowerCase();
  else if (c < 0.23) s = s.toUpperCase();
  if (rnd() < 0.07) s = s.replace(/[?.!,—:]/g, "");
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
  qs.forEach(q => { if (rnd() < (pop > 1 ? 0.9 : 0.45)) uses.push(q); });
  if (pop > 1) qs.forEach(q => { if (rnd() < 0.5) uses.push(q); });
  uses.forEach(q => {
    const [pt, ps] = place(tk, sub);
    items.push({ intent, fam, homeTheme: T[tk], theme: T[pt], subtheme: ps, question: noisy(q), context: rnd() < 0.3 ? pick(CONTEXTS) : "" });
  });
});
SINGLES.forEach(([tk, sub, q], i) => {
  items.push({ intent: `single2_${i}`, fam: `single2_${i}`, homeTheme: T[tk], theme: T[tk], subtheme: sub, question: noisy(q), context: rnd() < 0.3 ? pick(CONTEXTS) : "" });
});
for (let i = items.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [items[i], items[j]] = [items[j], items[i]];
}
const t0 = Date.UTC(2026, 11, 11, 4, 0, 0);
const subs = items.map((x, i) => ({ id: `M${String(i + 1).padStart(4, "0")}`, createdAt: t0 + i * 29_000, ...x }));

const famCount = new Map();
INTENTS.forEach(([intent, fam]) => famCount.set(fam, [...(famCount.get(fam) || []), intent]));
const hardNegativeIntents = [...famCount.values()].filter(v => v.length > 1);

const body = {
  description: "NEW-2 labelled Ask Desk corpus (precision-first merge). Synthetic, hand-written, frozen 25 Oct 2026 before the second round of fixes — report only, never tune.",
  generator: "scripts/bench/build-new2-set.mjs", seed: SEED, frozen: "2026-10-25",
  count: subs.length, intents: INTENTS.length + SINGLES.length, hardNegativeIntents, subs,
};
const out = path.join(ROOT, "tests/fixtures/merge-new2-500.json");
const text = JSON.stringify(body, null, 1);
fs.writeFileSync(out, text);
const sha = crypto.createHash("sha256").update(text).digest("hex");
const off = subs.filter(s => s.theme !== s.homeTheme).length;
console.log(`Wrote ${subs.length} questions (${INTENTS.length} intents + ${SINGLES.length} one-offs, ${hardNegativeIntents.length} look-alike families) → ${path.relative(process.cwd(), out)}; off-home theme ${off}; sha256 ${sha}`);
