#!/usr/bin/env node
/**
 * Fresh, independent merge benchmark (~400 questions) for the A-vs-B engine comparison.
 * Written from scratch — phrasings, noise model, seed and placement rules differ from both
 * tests/fixtures/merge-1200.json (engine A's tuning set) and tests/fixtures/merge-benchmark.json
 * (engine B's tuning set). Neither engine was tuned on this file.
 *
 *   node scripts/bench/build-fresh-dataset.mjs        → scripts/bench/fresh-400.json
 *
 * One intent = one mentor answer serves every student who asked it. `fam` groups intents a
 * broader answer could still serve (lenient scoring only). Many intents are deliberate
 * look-alikes of a neighbour (same words, different ask): licence vs cost vs location of a
 * clinic, AIAPGET strategy vs books vs cut-off, USA vs UK vs Gulf, job vs salary, …
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED = 917_3301;

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

/** [id, fam, theme, sub, popularity (1 = each phrasing once, 2 = popular phrasings asked twice), phrasings] */
const INTENTS = [
  /* ---- T01 Clinical ---- */
  ["clinic_registration", "clinic-legal", "T01", "Setting up private practice", 2, [
    "What registrations do I need before opening my own Ayurveda clinic?",
    "Which permissions from the municipality and state board are needed to run a clinic?",
    "clinic kholne ke liye kaun kaun se registration chahiye?",
    "Do I need a trade licence or only state council registration to start practice?",
    "Is Clinical Establishment Act registration compulsory for a small Ayurveda clinic?",
    "What paperwork is needed to legally start my own clinic in Maharashtra?",
    "What legal documents are needed to open a dispensary after internship?",
  ]],
  ["clinic_cost", "clinic-money", "T01", "Setting up private practice", 1, [
    "How much money is needed to start a small Ayurveda clinic?",
    "What is the approximate investment for opening a clinic in a tier 2 city?",
    "clinic start karne me kitna kharcha aata hai?",
    "Budget required to set up a basic OPD with a small pharmacy?",
    "Can I start a clinic with 2-3 lakh rupees?",
    "What is the setup cost of a new Ayurveda clinic including rent and equipment?",
  ]],
  ["clinic_first_patients", "clinic-growth", "T01", "Setting up private practice", 2, [
    "How do I get patients in the first year of my new clinic?",
    "My clinic is new and footfall is very low, what should I do?",
    "naye clinic me patient kaise laaye?",
    "How to build trust with local people when starting practice in a new town?",
    "Ways to increase patient flow in a newly opened Ayurveda clinic?",
    "Nobody knows me in the area, how do I get my first 100 patients?",
  ]],
  ["clinic_location", "clinic-location", "T01", "Setting up private practice", 1, [
    "Should I start my clinic in my hometown village or in a city?",
    "Rural or urban — where does an Ayurveda clinic do better?",
    "How do I select a good location for my clinic?",
    "gaon me clinic kholu ya city me?",
    "Is it better to open a clinic near a hospital or in a residential area?",
  ]],
  ["pk_training", "pk-training", "T01", "Panchakarma & therapy services", 1, [
    "Where can I do good hands-on Panchakarma training after BAMS?",
    "Which institutes offer a certificate course in Panchakarma?",
    "panchakarma ka practical training kaha se le?",
    "Is there any short Panchakarma course for BAMS graduates that is worth it?",
    "Best place to learn Panchakarma procedures properly? We barely did any in college",
    "Kerala me panchakarma course karna chahiye kya?",
  ]],
  ["pk_centre_setup", "pk-setup", "T01", "Panchakarma & therapy services", 1, [
    "What equipment and space do I need to start a Panchakarma centre?",
    "How to set up a Panchakarma therapy unit along with my clinic?",
    "Requirements for opening a small Panchakarma centre — droni, steam box, therapists?",
    "panchakarma centre start karne ke liye kya kya chahiye?",
    "How many rooms and staff are needed for a basic Panchakarma setup?",
  ]],
  ["specialty_choice", "specialty", "T01", "Choosing a clinical specialty", 1, [
    "Which clinical specialty in Ayurveda has the best future — skin, ortho or gynaec?",
    "Should I focus on a niche like infertility or practise as a general physician?",
    "Is it better to specialise in one disease area in practice?",
    "practice ke liye kaunsi speciality choose karu?",
    "Do Ayurveda doctors who specialise in one area earn more than general practitioners?",
  ]],
  ["hospital_job", "hospital-job", "T01", "Hospital employment", 2, [
    "How can a BAMS graduate get a job in a private multispeciality hospital?",
    "Do corporate hospitals like Apollo hire BAMS doctors?",
    "Which hospitals hire BAMS doctors as RMO or duty doctor?",
    "BAMS ke baad hospital me job kaise milegi?",
    "Is working as an RMO in an allopathic hospital a good start after BAMS?",
    "How to apply for duty doctor jobs in nursing homes?",
  ]],
  ["hospital_salary", "hospital-pay", "T01", "Hospital employment", 1, [
    "What salary does a BAMS RMO get in private hospitals?",
    "How much do hospitals pay BAMS duty doctors per month?",
    "BAMS doctor ki hospital me salary kitni hoti hai?",
    "Is 25k per month normal pay for a BAMS doctor in a hospital?",
    "Starting salary for BAMS freshers in corporate hospitals?",
  ]],
  ["allopathy_prescribe", "allopathy-legal", "T01", "Integrative referrals", 1, [
    "Can BAMS doctors legally prescribe allopathic medicines?",
    "Is it legal for me to give modern medicine in my clinic after BAMS?",
    "kya BAMS doctor allopathic dawai likh sakta hai?",
    "Which states allow BAMS practitioners to prescribe allopathy?",
    "Will I get into legal trouble if I prescribe antibiotics as a BAMS doctor?",
  ]],
  ["referral_collab", "referral", "T01", "Integrative referrals", 1, [
    "How do I build a referral relationship with allopathic doctors?",
    "How can Ayurveda and modern doctors work together on the same patient?",
    "Should I refer patients to MBBS doctors or will I lose them?",
    "How to start an integrative practice with a physiotherapist and an MBBS doctor?",
  ]],
  ["records_software", "records", "T01", "Records & clinical quality", 1, [
    "Which software is good for keeping patient records in an Ayurveda clinic?",
    "How should I maintain case records so they are useful for research later?",
    "Is there any EMR made for Ayurveda practitioners?",
    "clinic me patient record kaise maintain kare?",
  ]],

  /* ---- T02 Academics ---- */
  ["aiapget_strategy", "aiapget-prep", "T02", "Choosing a PG branch", 2, [
    "How should I plan my AIAPGET preparation in the last 6 months?",
    "AIAPGET crack karne ki strategy batao",
    "What is a realistic daily timetable for AIAPGET along with internship?",
    "How do toppers prepare for AIAPGET?",
    "Can I clear AIAPGET without coaching if I start now?",
    "aiapget prep kab se start karni chahiye?",
    "How to plan revision for the AIAPGET exam?",
  ]],
  ["aiapget_books", "aiapget-prep", "T02", "Choosing a PG branch", 2, [
    "What books do I need to read for AIAPGET?",
    "Best reference books and question banks for AIAPGET?",
    "AIAPGET ke liye kaunsi book padhe?",
    "Is any online test series good for AIAPGET?",
    "Recommended book list for the AIAPGET Samhita portion?",
    "Which MCQ app is best for AIAPGET practice?",
  ]],
  ["aiapget_cutoff", "aiapget-seat", "T02", "Choosing a PG branch", 1, [
    "What rank in AIAPGET is needed for a government MD seat?",
    "AIAPGET cutoff for Kayachikitsa in government colleges?",
    "How much score is safe in AIAPGET for a govt seat?",
    "aiapget me kitne marks chahiye government seat ke liye?",
    "What was last year's AIAPGET cut-off for general category?",
  ]],
  ["pg_branch_choice", "pg-branch", "T02", "Choosing a PG branch", 2, [
    "Which MD branch has the most scope — Kayachikitsa, Panchakarma or Shalya?",
    "How do I decide my PG specialization?",
    "Which PG branch is best for private practice?",
    "MD me kaunsa branch lena chahiye?",
    "Is Dravyaguna a good PG branch or will I regret it?",
    "Clinical vs non-clinical MD subjects — which should I take?",
  ]],
  ["private_pg_worth", "pg-seat", "T02", "Choosing a PG branch", 1, [
    "Should I take a private college MD seat with high fees or drop a year?",
    "Is paying 20 lakh for a private MD worth it?",
    "Drop a year for a government seat or join private PG now?",
    "private college se MD karna sahi hai kya?",
  ]],
  ["phd_after_md", "phd", "T02", "PhD pathway", 1, [
    "How to get admission into PhD after MD Ayurveda?",
    "Which universities offer PhD in Ayurveda and what is the entrance?",
    "Is a PhD worth it after MD for a teaching career?",
    "PhD admission process for Ayurveda — is UGC NET needed?",
    "MD ke baad PhD kaise kare?",
  ]],
  ["phd_without_md", "phd", "T02", "PhD pathway", 1, [
    "Can I do a PhD directly after BAMS without MD?",
    "Is there any PhD option for BAMS graduates without postgraduation?",
    "PhD after BAMS directly possible hai kya?",
    "Can I do a PhD abroad with only a BAMS degree?",
  ]],
  ["lecturer_eligibility", "faculty", "T02", "Faculty recruitment & eligibility", 1, [
    "What qualification is required to become an assistant professor in an Ayurveda college?",
    "Can I teach in a BAMS college without MD?",
    "Eligibility for Ayurveda lecturer jobs as per NCISM?",
    "lecturer banne ke liye kya qualification chahiye?",
    "Is NET required to become faculty in Ayurveda colleges?",
  ]],
  ["lecturer_salary", "faculty-pay", "T02", "Faculty recruitment & eligibility", 1, [
    "How much do assistant professors earn in private Ayurveda colleges?",
    "What is the salary of an Ayurveda lecturer in a government college?",
    "Is teaching in Ayurveda colleges well paid compared to practice?",
    "Ayurveda college me professor ki salary kitni hoti hai?",
  ]],
  ["teaching_skills", "teaching", "T02", "Teaching skills", 1, [
    "How can I become a better teacher for BAMS students?",
    "Tips for making Samhita classes interesting for students?",
    "How to improve my lecture delivery as a new faculty member?",
    "Any training programs for Ayurveda teachers on teaching methods?",
  ]],
  ["bams_exam_scoring", "bams-exams", "T02", "Curriculum & assessment", 1, [
    "How should I study Samhita so I remember it in university exams?",
    "Tips to pass first prof BAMS exams with good marks?",
    "How to score well in BAMS university exams?",
    "BAMS exam me ache marks kaise laye?",
  ]],

  /* ---- T03 Research ---- */
  ["thesis_topic", "thesis", "T03", "Framing a research question", 1, [
    "How do I pick a good MD thesis topic?",
    "How to choose a research topic for my dissertation in Kayachikitsa?",
    "thesis ka topic kaise select kare?",
    "What makes a thesis topic feasible in 2 years?",
    "Where do I find research gaps for an Ayurveda topic?",
  ]],
  ["publish_indexed", "publishing", "T03", "Thesis & publication", 1, [
    "How do I publish my first research paper in an indexed journal?",
    "Which Ayurveda journals are indexed in Scopus or PubMed?",
    "How to avoid predatory journals when publishing?",
    "scopus journal me paper publish kaise kare?",
    "Steps to convert my thesis into a publication?",
  ]],
  ["case_report", "publishing", "T03", "Thesis & publication", 1, [
    "How to write a case report on a patient I treated?",
    "Can a BAMS intern publish a case study?",
    "What is the format for writing an Ayurveda case report?",
    "case report likhne ka sahi tarika kya hai?",
  ]],
  ["ethics_approval", "ethics", "T03", "Ethics & approvals", 1, [
    "How do I get ethics committee approval for my clinical study?",
    "Do I have to register my trial on CTRI before starting?",
    "What documents does the IEC ask for?",
    "research ke liye ethics approval kaise milega?",
  ]],
  ["sample_size", "stats", "T03", "Biostatistics", 1, [
    "How do I calculate sample size for an Ayurveda clinical trial?",
    "thesis ke liye sample size kaise nikale?",
    "What sample size is enough for a pilot study?",
    "Is 30 patients enough for my MD dissertation?",
  ]],
  ["stats_test", "stats", "T03", "Biostatistics", 1, [
    "Which statistical test should I use for before-after data?",
    "Paired t test or Wilcoxon for my thesis data?",
    "Which software is easiest for thesis statistics — SPSS or Excel?",
    "How to analyse my thesis results statistically?",
  ]],
  ["research_grant", "grants", "T03", "Grants & funding", 1, [
    "How can I get funding for an Ayurveda research project?",
    "Does CCRAS or the Ministry of AYUSH give research grants to individuals?",
    "research ke liye fund kaha se milega?",
    "Are there any grants for MD scholars doing clinical research?",
    "How to write a proposal for an AYUSH extramural research grant?",
  ]],

  /* ---- T04 Entrepreneurship ---- */
  ["startup_funding", "startup-money", "T04", "Funding & finance", 2, [
    "How can I raise money for my Ayurveda startup?",
    "Are there government schemes that fund AYUSH startups?",
    "startup ke liye funding kaise milegi?",
    "Should I approach angel investors or take a bank loan for my wellness startup?",
    "Does Startup India give seed funding for Ayurveda products?",
  ]],
  ["incubation", "incubation", "T04", "Incubation support", 1, [
    "Which incubators help Ayurveda startups?",
    "How to apply to an AYUSH incubation centre?",
    "Is the AIIA incubation centre open for BAMS graduates?",
    "incubator me kaise apply kare?",
  ]],
  ["trademark", "ip", "T04", "Team & intellectual property", 1, [
    "How do I register a trademark for my herbal brand?",
    "trademark registration ka process kya hai?",
    "Should I trademark my clinic name?",
    "How long does trademark registration take in India?",
  ]],
  ["patent_formulation", "ip", "T04", "Team & intellectual property", 1, [
    "Can I patent my own herbal formulation?",
    "Is it possible to patent an Ayurvedic product based on classical texts?",
    "ayurvedic formula ka patent kaise file kare?",
    "Do I need a patent attorney to file a patent for my formulation?",
  ]],
  ["idea_validation", "validation", "T04", "Validating the idea", 1, [
    "How do I check if there is demand for my Ayurveda product idea?",
    "How to validate a wellness startup idea before investing?",
    "Is there a market for Ayurvedic skincare for teenagers? how do I test it?",
    "apna business idea validate kaise kare?",
  ]],
  ["online_selling", "d2c", "T04", "Business model", 1, [
    "Is selling Ayurvedic products on Amazon profitable?",
    "D2C website or marketplace — where should I sell my herbal products?",
    "How to start selling my own Ayurveda products online?",
    "online ayurvedic products bechne ka business kaise kare?",
  ]],

  /* ---- T05 Manufacturing ---- */
  ["mfg_licence", "mfg-licence", "T05", "GMP and licensing", 1, [
    "What licence do I need to manufacture Ayurvedic medicines?",
    "How to get an AYUSH drug manufacturing licence?",
    "manufacturing license ke liye kya documents chahiye?",
    "What is the process for a Form 24-D licence for Ayurvedic drugs?",
  ]],
  ["third_party_mfg", "contract-mfg", "T05", "Production & scale-up", 1, [
    "How does third-party manufacturing work for Ayurvedic products?",
    "Can I sell products under my brand made by a contract manufacturer?",
    "What is loan licence manufacturing in Ayurveda?",
    "third party manufacturing se apna brand kaise shuru kare?",
  ]],
  ["gmp_cert", "gmp", "T05", "GMP and licensing", 1, [
    "How do I get GMP certification for my Ayurveda unit?",
    "What are the Schedule T requirements for an Ayurvedic factory?",
    "GMP certificate kaise milta hai?",
    "Is WHO-GMP needed for my Ayurvedic manufacturing unit?",
  ]],
  ["qc_testing", "qc-test", "T05", "QA / QC and testing", 1, [
    "How is heavy metal testing done for Ayurvedic medicines?",
    "Which tests are needed for quality control of churna?",
    "How to do a shelf-life study for an Ayurvedic formulation?",
    "Where can I get my herbal products tested in a NABL lab?",
  ]],
  ["qc_job", "qc-job", "T05", "QA / QC and testing", 1, [
    "Can BAMS graduates get jobs in QA or QC departments of pharma companies?",
    "How to get a quality control job in an Ayurvedic pharmacy?",
    "QC department me BAMS ke liye job hai kya?",
    "Is a QA job at Himalaya or Dabur possible after BAMS?",
  ]],
  ["pv_career", "pv", "T05", "Pharmacovigilance", 1, [
    "How to start a career in pharmacovigilance after BAMS?",
    "Is pharmacovigilance a good career for Ayurveda graduates?",
    "pharmacovigilance course karna chahiye kya?",
    "Which certification helps to get a drug safety job?",
  ]],

  /* ---- T06 Brand ---- */
  ["social_media_growth", "digital", "T06", "Digital presence", 1, [
    "How should a BAMS doctor use Instagram to grow practice?",
    "Is making YouTube videos on Ayurveda useful for getting patients?",
    "How do I build my online presence as a new Ayurveda doctor?",
    "social media pe apni practice kaise promote kare?",
    "Should I create reels about diet tips to market my clinic?",
  ]],
  ["ad_rules", "ad-law", "T06", "Advertising & claims compliance", 1, [
    "What are the rules for advertising an Ayurveda clinic?",
    "Can I claim 'cures diabetes' in my product ads?",
    "Is it legal to advertise Ayurvedic medicines on social media?",
    "Drugs and Magic Remedies Act — what can't I say in ads?",
    "ads me kya claim kar sakte hai legally?",
  ]],
  ["health_writing", "writing", "T06", "Scientific communication", 1, [
    "How to start writing Ayurveda blogs or articles for the public?",
    "Can I become a health writer or content creator after BAMS?",
    "Ayurveda pe articles kaise likhe aur kahan publish kare?",
    "How do I get my Ayurveda articles published in magazines?",
  ]],
  ["health_camp", "camp", "T06", "Community education", 1, [
    "How to organise a free health camp in a village?",
    "What permissions are needed for conducting a health awareness camp?",
    "health camp kaise organise kare?",
    "Do free camps actually help a new practice?",
  ]],

  /* ---- T07 Export ---- */
  ["export_start", "export-start", "T07", "Getting started in export", 1, [
    "How do I get into exporting Ayurvedic products?",
    "What is an IEC code and how do I get one for export?",
    "ayurvedic products ka export business kaise start kare?",
    "First steps for exporting herbal powders from India?",
  ]],
  ["export_usa_rules", "export-rules", "T07", "Market entry & partners", 1, [
    "What rules apply to selling Ayurvedic products in the USA?",
    "Do I need FDA approval to export Ayurvedic supplements to America?",
    "USA me ayurvedic product bechne ke rules kya hai?",
    "Can Ayurvedic medicines be sold as dietary supplements in the US?",
  ]],
  ["export_eu_rules", "export-rules", "T07", "Market entry & partners", 1, [
    "How to export Ayurvedic products to Europe — is THMPD registration needed?",
    "What are the EU rules for herbal products from India?",
    "Germany me ayurvedic product export kar sakte hai?",
  ]],
  ["export_distributor", "export-partners", "T07", "Pricing & distribution", 1, [
    "How do I find overseas distributors for my Ayurveda brand?",
    "Where to meet foreign buyers for herbal products — trade fairs?",
    "videsh me distributor kaise dhoondhe?",
    "Is Amazon Global a good way to reach foreign customers?",
  ]],

  /* ---- T08 Abroad ---- */
  ["practice_usa", "abroad-usa", "T08", "Country-wise recognition", 2, [
    "Can I practise Ayurveda in the USA with BAMS?",
    "What is the scope for BAMS doctors in America?",
    "USA me BAMS ke baad practice kar sakte hai?",
    "Is a BAMS degree recognised in the US?",
    "How to work as an Ayurveda practitioner in the United States?",
  ]],
  ["practice_uk", "abroad-uk", "T08", "Country-wise recognition", 1, [
    "Can a BAMS graduate work as an Ayurveda doctor in the UK?",
    "Is BAMS recognised in England?",
    "UK me ayurveda practice ka scope kaisa hai?",
    "How do I register as an Ayurvedic practitioner in Britain?",
  ]],
  ["practice_gulf", "abroad-gulf", "T08", "Licensing & registration", 2, [
    "How to get a DHA licence for Ayurveda in Dubai?",
    "Job opportunities for BAMS doctors in UAE?",
    "Dubai me BAMS ke liye job kaise milegi?",
    "Which exam is needed to practise Ayurveda in the Gulf?",
  ]],
  ["masters_abroad", "abroad-study", "T08", "Bridging qualifications", 1, [
    "Can I do an MPH abroad after BAMS?",
    "Which master's courses abroad accept BAMS graduates?",
    "Is a master's in public health from the UK worth it after BAMS?",
    "BAMS ke baad videsh me masters kar sakte hai?",
  ]],
  ["work_visa", "abroad-visa", "T08", "Visa and employment routes", 1, [
    "Which visa do Ayurveda therapists use to work abroad?",
    "How do Ayurveda doctors get work visas for Europe?",
    "ayurveda doctor ko abroad work visa kaise milega?",
  ]],

  /* ---- T09 MVT ---- */
  ["resort_job", "resort", "T09", "Careers in wellness resorts", 1, [
    "How do I get a job as an Ayurveda doctor in a wellness resort?",
    "Do luxury resorts like Ananda hire BAMS doctors?",
    "resort me ayurveda doctor ki naukri kaise lagegi?",
    "Which wellness retreats in Kerala recruit BAMS freshers?",
  ]],
  ["resort_salary", "resort-pay", "T09", "Careers in wellness resorts", 1, [
    "What do Ayurveda doctors earn in wellness resorts?",
    "Is resort job salary better than hospital salary for BAMS?",
    "resort me doctor ki salary kitni hoti hai?",
  ]],
  ["mvt_package_design", "packages", "T09", "Designing packages", 1, [
    "How to design a 7-day Ayurveda detox package for foreign tourists?",
    "What should be included in a wellness package for international guests?",
    "foreigners ke liye Panchakarma package kaise design kare?",
    "How do I price a wellness retreat package?",
  ]],
  ["nabh", "accreditation", "T09", "Accreditation and standards", 1, [
    "How can an Ayurveda hospital get NABH accreditation?",
    "Is NABH needed to receive international patients?",
    "NABH certification ka process kya hai?",
    "What does accreditation cost for a small Ayurveda centre?",
  ]],

  /* ---- T10 Policy ---- */
  ["mo_exam_prep", "govt-exam", "T10", "Government service routes", 2, [
    "How to prepare for the AYUSH medical officer exam?",
    "Which books for the state PSC Ayurveda MO exam?",
    "AYUSH MO exam ki taiyari kaise kare?",
    "What is the syllabus of the Ayurveda medical officer recruitment exam?",
    "How to prepare for central government AYUSH medical officer posts?",
  ]],
  ["govt_job_options", "govt-jobs", "T10", "Government service routes", 2, [
    "What government jobs can I apply for after BAMS?",
    "sarkari naukri options for BAMS doctors?",
    "Which central government departments hire Ayurveda doctors?",
    "Are there railway or ESIC jobs for BAMS?",
    "Is there any govt job for BAMS without PG?",
  ]],
  ["nam_contract", "nam", "T10", "National AYUSH Mission delivery", 1, [
    "How to get a contract job under National AYUSH Mission?",
    "What is the role of an AYUSH doctor in NHM or NAM?",
    "NAM me job ki vacancy kab aati hai?",
    "Is a contractual NAM job worth it after internship?",
  ]],
  ["who_jobs", "intl-org", "T10", "International organisations", 1, [
    "Can BAMS doctors work with WHO?",
    "How to get an internship at WHO's traditional medicine centre?",
    "Jobs in UN organisations for Ayurveda graduates?",
    "WHO me kaam karne ke liye kya karna padega?",
  ]],
  ["upsc", "upsc", "T10", "Government service routes", 1, [
    "Can I write the UPSC civil services exam after BAMS?",
    "Is IAS a realistic option for a BAMS graduate?",
    "BAMS ke baad UPSC ki taiyari kare ya nahi?",
    "Will my BAMS background help in the UPSC optional?",
  ]],
  ["public_health_career", "public-health", "T10", "Public health projects", 1, [
    "How can BAMS graduates work in public health programs?",
    "Is a career in public health possible without MPH after BAMS?",
    "public health me career kaise banaye?",
    "Which NGOs hire Ayurveda doctors for public health projects?",
  ]],
  ["ccras_job", "research-council", "T10", "Research councils", 1, [
    "How to get a job in CCRAS as a research officer?",
    "What is the selection process for CCRAS research officer posts?",
    "CCRAS me job kaise milegi?",
    "Is a research officer job in the central councils good after MD?",
  ]],

  /* ---- Not sure ---- */
  ["what_after_bams", "after-bams", "NS", "", 2, [
    "What should I do after BAMS?",
    "BAMS ke baad aage kya kare?",
    "I am confused about my career after BAMS, what are my options?",
    "बीएएमएस के बाद क्या करें?",
    "After BAMS what are the best career paths?",
    "Career options after completing BAMS?",
  ]],
  ["bams_worth_it", "bams-worth", "NS", "", 1, [
    "Is BAMS a good career compared to MBBS?",
    "Did I make a mistake choosing BAMS over MBBS?",
    "Do BAMS doctors get respect and income like MBBS doctors?",
  ]],
];

/** One-off questions nobody else asks (they must stay alone or be harmless). */
const SINGLES = [
  ["T01", "Records & clinical quality", "How do I handle a patient complaint about a Panchakarma side effect?"],
  ["T01", "Choosing a clinical specialty", "Is Ayurvedic dermatology practice possible without MD?"],
  ["T01", "Hospital employment", "Can I work night shifts in an ICU as a BAMS doctor?"],
  ["T01", "Setting up private practice", "Should I keep a pharmacy inside my clinic or only prescribe?"],
  ["T01", "Panchakarma & therapy services", "How do I train therapists for Abhyanga in my centre?"],
  ["T02", "Academic leadership", "How does one become principal of an Ayurveda college?"],
  ["T02", "Curriculum & assessment", "Why is Sanskrit compulsory in the BAMS curriculum?"],
  ["T02", "Teaching skills", "How to use simulation models to teach Shalya?"],
  ["T02", "PhD pathway", "Is a part-time PhD possible while working in a hospital?"],
  ["T03", "Study design", "Should my study be a single-arm or a randomised design?"],
  ["T03", "Framing a research question", "How do I convert a classical shloka into a testable hypothesis?"],
  ["T03", "Thesis & publication", "How to reply to reviewer comments on a rejected paper?"],
  ["T03", "Grants & funding", "Can foreign universities fund an Indian Ayurveda study?"],
  ["T04", "Product & prototype", "How to make a herbal tea prototype on a small budget?"],
  ["T04", "Team & intellectual property", "How should I split equity with my co-founder?"],
  ["T04", "Business model", "Is a subscription box for Ayurvedic diet plans a viable business?"],
  ["T05", "R&D and formulation", "How do I convert a kwath into a tablet without losing potency?"],
  ["T05", "Regulatory affairs", "What is the role of a regulatory affairs officer in an AYUSH company?"],
  ["T05", "Production & scale-up", "What machinery is needed to make 500 kg of churna per day?"],
  ["T06", "Positioning a practice or product", "How do I make my clinic stand out from three others on the same street?"],
  ["T06", "Scientific communication", "How do I give a TEDx style talk on Ayurveda?"],
  ["T06", "Community education", "How to teach school children about dinacharya?"],
  ["T07", "Documentation & shipping terms", "What does FOB versus CIF mean for herbal shipments?"],
  ["T07", "Certification and quality marks", "Is the AYUSH Premium mark useful for export?"],
  ["T07", "Pricing & distribution", "How do currency changes affect my export price?"],
  ["T08", "Wellness centre roles abroad", "What does an Ayurveda therapist do in a spa in Switzerland?"],
  ["T08", "Bridging qualifications", "Is there a bridge course for BAMS doctors in Australia?"],
  ["T08", "Licensing & registration", "Do I need IELTS to register as a practitioner in New Zealand?"],
  ["T09", "Handling international patients", "How do I explain Panchakarma diet rules to a German patient?"],
  ["T09", "How the MVT ecosystem works", "Who are the main players in India's medical value travel chain?"],
  ["T10", "Policy research & advocacy", "How can I contribute to AYUSH policy drafting?"],
  ["T10", "Public health projects", "Can Ayurveda help in the national anaemia programme?"],
  ["T10", "International organisations", "How does India's GCTM centre with WHO in Jamnagar work?"],
  ["NS", "", "Is yoga certification useful along with BAMS?"],
  ["NS", "", "How do I deal with family pressure to marry before PG?"],
  ["NS", "", "Can I switch to a career in medical writing?"],
];

const GREETINGS = [
  "Good evening respected mentors, ", "hii sir ", "Namaskar. I'm a 3rd prof BAMS student from Pune. ",
  "Myself Ritika, BAMS intern. ", "Hello team, ", "Respected sir/ma'am, ", "Hi doctor, ", "Sir ji ",
  "I am a BAMS final year student from Nagpur. ", "Pranam. ", "Dear AYURDISHA mentors, ",
];
const SIGNOFFS = [
  " please reply asap", " thanks in advance", " 🙏", " plz guide", " kindly help me out",
  " waiting for your reply", "??", " (urgent)", " thank u sir",
];
const CONTEXTS = [
  "I am also preparing for AIAPGET.", "My father runs a medical store.", "I want to settle abroad eventually.",
  "We are 3 friends planning this together.", "I have an education loan to repay.", "I am from a small town in Bihar.",
  "currently doing internship", "I am interested in research.", "I have 2 years of clinic experience.",
  "My family wants me to do a government job.", "I passed BAMS in 2024.", "I got 62% in final year.",
];
const SMS = [[/\byou\b/gi, "u"], [/\bare\b/gi, "r"], [/\bplease\b/gi, "pls"], [/\bwhat\b/gi, "wat"], [/\bshould\b/gi, "shud"], [/\bwith\b/gi, "wid"]];
const NEAR_KEYS = { a: "s", s: "a", e: "r", r: "e", i: "o", o: "i", n: "m", m: "n", t: "y", u: "y", c: "v", l: "k", p: "o", d: "s", g: "h" };

function sfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rnd = sfc32(SEED, SEED ^ 0x9e3779b9, 0x2545f491, 0x51ed270b);
for (let i = 0; i < 20; i++) rnd();
const pick = arr => arr[Math.floor(rnd() * arr.length)];

function misspell(text) {
  const words = text.split(" ");
  const idx = words.map((w, i) => (/^[A-Za-z]{6,}$/.test(w) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return text;
  const i = pick(idx);
  const w = words[i];
  const r = rnd();
  if (r < 0.35) {
    const vowels = [...w].map((ch, k) => (k > 0 && /[aeiou]/i.test(ch) ? k : -1)).filter(k => k > 0);
    if (vowels.length) { const k = pick(vowels); words[i] = w.slice(0, k) + w.slice(k + 1); }
  } else if (r < 0.65) {
    const k = 1 + Math.floor(rnd() * (w.length - 1));
    words[i] = w.slice(0, k) + w[k] + w.slice(k);
  } else {
    const k = 1 + Math.floor(rnd() * (w.length - 1));
    const ch = w[k].toLowerCase();
    if (NEAR_KEYS[ch]) words[i] = w.slice(0, k) + NEAR_KEYS[ch] + w.slice(k + 1);
  }
  return words.join(" ");
}

function noisy(q) {
  let s = q;
  if (rnd() < 0.2) s = misspell(s);
  if (rnd() < 0.06) s = misspell(s);
  if (rnd() < 0.12) SMS.forEach(([re, rep]) => { s = s.replace(re, rep); });
  if (rnd() < 0.3) s = pick(GREETINGS) + s.charAt(0).toLowerCase() + s.slice(1);
  if (rnd() < 0.25) s = s.replace(/[?.]*$/, "") + pick(SIGNOFFS);
  const c = rnd();
  if (c < 0.25) s = s.toLowerCase();
  else if (c < 0.28) s = s.toUpperCase();
  if (rnd() < 0.1) s = s.replace(/[?.!,—:]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function place(themeKey, sub) {
  const r = rnd();
  if (r < 0.78 || themeKey === "NS") return [themeKey, sub];
  if (r < 0.92) return [themeKey, pick(SUBS[themeKey].filter(x => x !== sub))];
  if (r < 0.97) return ["NS", ""];
  const other = pick(Object.keys(SUBS).filter(k => k !== themeKey && k !== "NS"));
  return [other, pick(SUBS[other])];
}

const items = [];
INTENTS.forEach(([intent, fam, tk, sub, pop, qs]) => {
  const uses = [...qs];
  if (pop > 1) qs.forEach(q => { if (rnd() < 0.8) uses.push(q); });
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
const t0 = Date.UTC(2026, 11, 3, 5, 30, 0);
const subs = items.map((x, i) => ({ id: `F${String(i + 1).padStart(4, "0")}`, createdAt: t0 + i * 23_000, ...x }));
const out = path.join(here, "fresh-400.json");
fs.writeFileSync(out, JSON.stringify({
  description: "Fresh labelled Ask Desk corpus for the A-vs-B merge comparison. Synthetic, hand-written, never tuned on.",
  generator: "scripts/bench/build-fresh-dataset.mjs", seed: SEED, count: subs.length,
  intents: INTENTS.length + SINGLES.length, subs,
}, null, 1));
const off = subs.filter(s => s.theme !== s.homeTheme).length;
console.log(`Wrote ${subs.length} questions (${INTENTS.length} intents + ${SINGLES.length} one-offs) → ${path.relative(process.cwd(), out)}; off-home theme ${off}`);
