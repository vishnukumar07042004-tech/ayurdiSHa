/**
 * Builds tests/fixtures/merge-benchmark.json — a labelled, realistic Ask Desk corpus for the
 * merge benchmark. Every phrasing below is hand-written; a seeded noise pass then adds the
 * things real submissions have (lower-case, missing "?", "sir / pls", typos, optional context,
 * verbatim hall-prompt chips, the odd mis-filed sub-area). Same seed → same file.
 *
 *   node scripts/build-merge-benchmark.mjs
 *
 * Labels: `intent` = what one mentor answer would serve; `family` = intents a single broader
 * answer could still serve (lenient scoring). A leading "~" marks a hard positive (same intent,
 * deliberately different wording). `hardNegOf` lists look-alike intents that must not merge.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASK_PROMPTS } from "../src/content/askPrompts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tests/fixtures/merge-benchmark.json");

const CLIN = "Clinical Practice & Integrative Care";
const ACAD = "Academics, Teaching & Higher Education";
const RES = "Research, Evidence & Publication";
const ENT = "Entrepreneurship & Start-ups";
const MFG = "Manufacturing, Quality & GMP";
const BRAND = "Brand Building & Communication";
const EXP = "Export & Global Trade";
const ABR = "Practice Abroad & Practitioner Mobility";
const MVT = "Medical Value Travel & Wellness";
const POL = "Policy, Public Health & Global Agencies";
const UNSURE = "Not sure — help me classify";

/* ------------------------------------------------------------------ */
/* Intents                                                             */
/* ------------------------------------------------------------------ */

const INTENTS = [
  /* ---------- T02 Academics — Choosing a PG branch (heaviest) ---------- */
  { intent: "aiapget-preparation-strategy", theme: ACAD, sub: "Choosing a PG branch", family: "aiapget-prep", alt: ["Curriculum & assessment"],
    hardNegOf: ["aiapget-attempt-limit", "neet-pg-for-bams", "ayush-medical-officer-exam"],
    qs: [
      "How should I prepare for AIAPGET?",
      "What is the best strategy to crack AIAPGET in the first attempt?",
      "AIAPGET preparation tips for final year BAMS students",
      "aiapget ki taiyari kaise kare? kuch tips do sir",
      "How to prepare for PG entrance exam after BAMS?",
      ["Sir I want to clear AIAPGET with a good rank, how should I plan my preparation?", "Final year, want a government seat in Kayachikitsa"],
      "Can you share a study plan for AIAPGET 2027?",
      "how to crack ai apget",
      "What is the right approach for AIAPGET — subject wise reading or mixed MCQ practice?",
      "How many hours daily should I study to crack AIAPGET?",
      "~Roadmap to get a government PG seat through the all India entrance",
      "~I keep forgetting what I read. How do I revise properly for the PG entrance?",
      "Preperation strategy for all india ayush PG entrance test",
      "Which subjects to focus more for AIAPGET? Samhita is huge",
      "How to score 300+ in AIAPGET?",
      "~MD entrance — where do I even begin?",
      "मुझे AIAPGET की तैयारी कैसे करनी चाहिए?",
      "What mistakes should I avoid while preparing for AIAPGET?",
      "PG entrance ke liye best preparation strategy kya hai?",
      "how to study for aiapget effectively, i get distracted a lot",
      "~What is the smartest way to cover the whole BAMS syllabus again for the MD exam?",
      "Tips for AIAPGET mock tests and time management in the exam hall",
      "How did toppers prepare for AIAPGET? Please guide",
      ["I scored low in last AIAPGET. How should I change my preparation this time?", "Got 4500 rank last year"],
    ] },
  { intent: "aiapget-start-timing", theme: ACAD, sub: "Choosing a PG branch", family: "aiapget-prep", alt: ["Curriculum & assessment"],
    qs: [
      "When should I start preparing for AIAPGET — final year or during internship?",
      "Is it too early to start AIAPGET preparation in 3rd prof?",
      "Is 6 months enough to prepare for AIAPGET?",
      "Right time to start PG entrance preparation?",
      "Should I start aiapget prep from 2nd year itself?",
      "kab se AIAPGET ki taiyari start karni chahiye?",
      "~I am in final prof. Am I already late for the MD entrance?",
      "How many months of preparation is needed for AIAPGET?",
    ] },
  { intent: "aiapget-with-internship", theme: ACAD, sub: "Choosing a PG branch", family: "aiapget-prep",
    qs: [
      "How to balance internship duties and AIAPGET preparation?",
      "~Internship postings take the whole day, how do I find time to study for PG entrance?",
      "Can I prepare for AIAPGET while doing rural internship posting?",
      "intership + aiapget together is it possible? how to manage",
      "~My internship hospital is very demanding. How do others manage PG prep alongside?",
      "Should I take leave from internship to prepare for AIAPGET?",
    ] },
  { intent: "aiapget-books-resources", theme: ACAD, sub: "Choosing a PG branch", family: "aiapget-prep", alt: ["Curriculum & assessment"],
    qs: [
      "Which books are best for AIAPGET?",
      "Best reference books and test series for AIAPGET preparation?",
      "Which app or online test series is good for aiapget?",
      "Should I read textbooks or only MCQ books for PG entrance?",
      "Suggest good YouTube channels or online platforms for AIAPGET",
      "aiapget ke liye kaunsi book padhu?",
      "Is reading Samhita in original Sanskrit needed for AIAPGET or are guides enough?",
      "Which MCQ book covers the AIAPGET syllabus best?",
      "Are previous year question papers of AIAPGET enough?",
      "~Good study material for Dravyaguna and Rasashastra for the MD entrance?",
    ] },
  { intent: "aiapget-coaching-vs-self-study", theme: ACAD, sub: "Choosing a PG branch", family: "aiapget-prep",
    qs: [
      "Is coaching necessary for AIAPGET or can self study work?",
      "Which is the best coaching institute for AIAPGET?",
      "Online coaching vs offline coaching for PG entrance — which is better?",
      "Can I crack AIAPGET without joining any coaching?",
      "aiapget coaching join karu ya self study?",
      "Is it worth spending 60k on AIAPGET coaching classes?",
    ] },
  { intent: "pg-drop-year", theme: ACAD, sub: "Choosing a PG branch",
    qs: [
      "Should I take a drop year after internship only for AIAPGET?",
      "Is it ok to take a gap year to prepare for PG?",
      "Drop year for PG entrance — is it worth it or should I work side by side?",
      "~Parents are saying take one year break for aiapget. Good idea?",
      "Gap after BAMS for PG prep — will it affect my career?",
    ] },
  { intent: "pg-branch-choice-general", theme: ACAD, sub: "Choosing a PG branch", alt: ["Curriculum & assessment"],
    hardNegOf: ["pg-kayachikitsa-scope", "pg-shalya-scope"],
    qs: [
      "Which PG branch has the best scope after BAMS?",
      "How do I choose the right MD branch?",
      "Which MD/MS subject is best for future?",
      "Konsa PG branch lena chahiye? confused hu",
      "Clinical or non-clinical branch for MD — which should I pick?",
      "Which postgraduate specialisation has more job opportunities?",
      "How to decide PG specialization based on my interest?",
      "Best branch in Ayurveda MD for private practice?",
      "Which MD branch gives better earning?",
      "Is a non-clinical PG branch like Samhita or Sharir a bad choice?",
      "~Ranking of the 22 Ayurveda specialities by future scope?",
      "What factors should I consider while selecting my MD subject?",
      "Which speciality to choose in post graduation if I want to do practice later?",
      "What branch should I fill in counselling if I get a mid rank?",
    ] },
  { intent: "pg-kayachikitsa-scope", theme: ACAD, sub: "Choosing a PG branch", hardNegOf: ["pg-shalya-scope"],
    qs: [
      "What is the scope of MD in Kayachikitsa?",
      "Is Kayachikitsa a good PG branch for clinical practice?",
      "Career options after MD Kayachikitsa?",
      "kayachikitsa me PG karne ke baad kya scope hai?",
      "Is MD Kayachikitsa worth it in 2027 or is it saturated?",
    ] },
  { intent: "pg-shalya-scope", theme: ACAD, sub: "Choosing a PG branch", hardNegOf: ["pg-kayachikitsa-scope"],
    qs: [
      "What is the scope of MS in Shalya Tantra?",
      "Is Shalya a good PG branch if I like surgery?",
      "Can MS Shalya doctors do surgeries independently?",
      "Career after MS Shalya — private hospital or own setup?",
      "Shalya tantra PG worth it? surgery interest hai",
    ] },
  { intent: "pg-kayachikitsa-vs-panchakarma", theme: ACAD, sub: "Choosing a PG branch",
    qs: [
      "Kayachikitsa vs Panchakarma for PG — which is better?",
      "Confused between MD Panchakarma and MD Kayachikitsa",
      "Should I choose Panchakarma or Kayachikitsa if I want to open a clinic later?",
      "Panchakarma ya Kayachikitsa — PG ke liye kaunsa better?",
    ] },
  { intent: "pg-seat-cutoff-rank", theme: ACAD, sub: "Choosing a PG branch",
    qs: [
      "What AIAPGET rank is needed to get a government PG seat?",
      "What was the cutoff for MD Kayachikitsa in AIQ last year?",
      "Is a 3000 rank enough for a govt seat in AIAPGET?",
      "Expected AIAPGET cutoff for general category for government college?",
      "~With what score can I get a good college for MD?",
      "minimum marks for pg seat in govt ayurveda college",
      "How many PG seats are there and what rank gets a seat in state quota?",
    ] },
  { intent: "pg-counselling-process", theme: ACAD, sub: "Choosing a PG branch",
    qs: [
      "How does AACCC counselling for PG work?",
      "State quota vs all India quota counselling — how to fill choices?",
      "What documents are needed for PG counselling?",
      "Explain the AIAPGET counselling rounds and mop-up round",
      "pg counselling me choice filling kaise kare?",
    ] },
  { intent: "pg-private-college-fees", theme: ACAD, sub: "Choosing a PG branch",
    qs: [
      "What are the fees for MD in private Ayurveda colleges?",
      "Is it worth paying for a management quota PG seat?",
      "How much does PG cost in a deemed university?",
      "private college me MD ki fees kitni hoti hai?",
      "Are there stipends for PG students in private colleges?",
    ] },
  { intent: "neet-pg-for-bams", theme: ACAD, sub: "Choosing a PG branch", hardNegOf: ["aiapget-preparation-strategy"],
    qs: [
      "Can BAMS students appear for NEET-PG?",
      "Is there any way for BAMS graduates to do MD in allopathy?",
      "Can I give NEET PG after BAMS and do a modern medicine PG?",
      "Are BAMS doctors eligible for NEET-PG exam?",
    ] },
  { intent: "what-after-bams-general", theme: ACAD, sub: "Choosing a PG branch",
    qs: [
      "What should I do after BAMS?",
      "What are the career options after BAMS?",
      "bams ke baad kya kare?",
      "Sir what after BAMS? PG or job or practice?",
      "Which is better after BAMS — PG, government job or private practice?",
      "Career paths available for BAMS graduates in India?",
      "What to do after BAMS internship",
      "Options after BAMS apart from MD?",
      "~I am finishing my degree next year, what are my options?",
    ] },
  { intent: "pg-dravyaguna-pharma", theme: ACAD, sub: "Choosing a PG branch", qs: ["Is MD in Dravyaguna good for pharma industry jobs?"] },
  { intent: "aiapget-attempt-limit", theme: ACAD, sub: "Choosing a PG branch", hardNegOf: ["aiapget-preparation-strategy"], qs: ["How many attempts are allowed in AIAPGET?"] },
  { intent: "aiapget-negative-marking", theme: ACAD, sub: "Choosing a PG branch", qs: ["Is there negative marking in AIAPGET and how many questions come?"] },
  { intent: "pg-ayurveda-colleges-abroad", theme: ACAD, sub: "Choosing a PG branch", qs: ["Can I do PG in Ayurveda from Sri Lanka or Nepal?"] },
  { intent: "pg-kaumarbhritya-scope", theme: ACAD, sub: "Choosing a PG branch", qs: ["Is MD Kaumarbhritya good if I want to treat children?"] },
  { intent: "pg-diploma-vs-md", theme: ACAD, sub: "Choosing a PG branch", qs: ["Does a PG diploma help or should I wait for full MD?"] },

  /* ---------- T02 Academics — PhD / faculty / teaching ---------- */
  { intent: "phd-without-md", theme: ACAD, sub: "PhD pathway", family: "phd",
    qs: [
      "Is PhD possible without MD?",
      "Can I do PhD directly after BAMS?",
      "PhD in Ayurveda without post graduation — any route?",
      "Is there any university allowing PhD after BAMS without MD?",
      "bams ke baad direct phd ho sakti hai kya?",
      "~Can I join a doctoral programme in pharmacology or life sciences with only my bachelor degree?",
    ] },
  { intent: "phd-admission-process", theme: ACAD, sub: "PhD pathway", family: "phd",
    qs: [
      "How do I get into a PhD in Ayurveda?",
      "What is the admission process for PhD after MD Ayurveda?",
      "Which universities offer PhD in Ayurveda and how to apply?",
      "Is UGC NET required for Ayurveda PhD admission?",
      "PhD entrance exam for Ayurveda — how to prepare?",
      "How to find a good PhD guide in Ayurveda?",
      "Steps to apply for PhD at ITRA or NIA?",
    ] },
  { intent: "phd-fellowship-stipend", theme: ACAD, sub: "PhD pathway", family: "phd",
    qs: [
      "Do Ayurveda PhD scholars get a fellowship or stipend?",
      "PhD after MD — fellowship options?",
      "How much stipend is given during PhD in Ayurveda?",
      "Are there CSIR or ICMR fellowships for Ayurveda PhD?",
    ] },
  { intent: "faculty-eligibility", theme: ACAD, sub: "Faculty recruitment & eligibility", hardNegOf: ["faculty-salary"],
    qs: [
      "How can I become a lecturer in an Ayurveda college?",
      "What is the eligibility to become assistant professor in BAMS college?",
      "Is MD compulsory to teach in an Ayurveda college?",
      "How to get a teaching job in a government Ayurveda college?",
      "NCISM norms for faculty appointment — what do I need?",
      "Can I join as a lecturer right after MD? what experience is needed",
      "faculty job ke liye kya qualification chahiye?",
      "How are assistant professor posts filled in state Ayurveda colleges — exam or interview?",
    ] },
  { intent: "faculty-salary", theme: ACAD, sub: "Faculty recruitment & eligibility", hardNegOf: ["faculty-eligibility"],
    qs: [
      "What is the salary of an assistant professor in a private Ayurveda college?",
      "Do private Ayurveda colleges pay faculty well?",
      "Teaching job salary after MD Ayurveda — govt vs private?",
      "Is teaching in Ayurveda college a financially good career?",
    ] },
  { intent: "teaching-skills", theme: ACAD, sub: "Teaching skills",
    qs: [
      "How can a new lecturer improve teaching skills?",
      "How do I make Samhita classes interesting for students?",
      "Any training programmes on teaching methodology for Ayurveda faculty?",
    ] },
  { intent: "curriculum-ncism", theme: ACAD, sub: "Curriculum & assessment",
    qs: [
      "What changes has NCISM made in the new BAMS curriculum?",
      "How will the new competency based curriculum affect our exams?",
      "Is an exit exam like NExT coming for BAMS?",
    ] },
  { intent: "academic-leadership", theme: ACAD, sub: "Academic leadership",
    qs: [
      "How does one become HOD or principal in an Ayurveda college?",
      "What skills are needed to grow into academic leadership roles?",
    ] },

  /* ---------- T01 Clinical Practice ---------- */
  { intent: "opening-own-clinic-cost", theme: CLIN, sub: "Setting up private practice", hardNegOf: ["clinic-licence-registration", "clinic-abroad-setup"],
    qs: [
      "How much investment is needed to open my own Ayurveda clinic?",
      "What is the cost to start a small clinic after BAMS?",
      "Budget required for setting up an Ayurvedic clinic in a tier 2 city?",
      "clinic kholne me kitna kharcha aata hai?",
      "Can I start a clinic with 2-3 lakh rupees?",
      "How much money is needed to start a small clinic?",
      "Approximate setup cost for clinic — rent, furniture, medicines stock?",
      "~Is it financially possible to begin my own practice right after internship?",
      "Minimum capital to start Ayurveda practice in a rented shop",
      "Expenses involved in starting private practice in the first year?",
    ] },
  { intent: "clinic-licence-registration", theme: CLIN, sub: "Setting up private practice", alt: ["Records & clinical quality"], hardNegOf: ["opening-own-clinic-cost", "clinic-first-patients"],
    qs: [
      "What licences do I need to open an Ayurveda clinic?",
      "Which registrations are required to start a private clinic after BAMS?",
      "Licence needed to start a clinic in Kerala",
      "Clinic registration process in Maharashtra",
      "Do I need Clinical Establishment Act registration for a small clinic?",
      "Is state board registration enough to practise or do I need more permissions?",
      "clinic ke liye kaunsa license lena padta hai?",
      "~Biomedical waste, shop act, trade permission — what all paperwork for a new setup?",
      "Legal requirements for opening an Ayurvedic dispensary",
      "What liscence and documents are mandatory for setting up my own practice?",
    ] },
  { intent: "clinic-first-patients", theme: CLIN, sub: "Setting up private practice", hardNegOf: ["clinic-licence-registration"],
    qs: [
      "How do I get my first patients in a new clinic?",
      "How to build patient trust when starting practice as a young doctor?",
      "~My clinic is new and nobody is coming. What should I do?",
      "How long does it take for a new Ayurveda practice to become stable?",
      "Ways to increase patient footfall in a new clinic",
      "naye clinic me patients kaise laaye?",
      "How do young BAMS doctors build a loyal patient base?",
    ] },
  { intent: "clinic-location-choice", theme: CLIN, sub: "Setting up private practice",
    qs: [
      "Should I open my clinic in a village or a city?",
      "Is it better to start practice in my hometown or a metro city?",
      "How to choose a good location for an Ayurveda clinic?",
      "Rural practice vs urban practice for a fresh BAMS graduate",
      "gaon me clinic kholna sahi rahega ya shehar me?",
    ] },
  { intent: "clinic-without-pg", theme: CLIN, sub: "Setting up private practice", alt: ["Choosing a clinical specialty"],
    qs: [
      "Can I run a successful practice without doing MD?",
      "Is PG necessary for doing good private practice?",
      "Will patients trust a BAMS doctor without MD?",
      "Should I start practice directly after BAMS or do PG first?",
      "Without post graduation can I earn well in clinical practice?",
      "~Many seniors say a masters is a must before sitting in your own clinic. Is that true?",
    ] },
  { intent: "prescribing-allopathy-legal", theme: CLIN, sub: "Setting up private practice", alt: ["Integrative referrals"], hardNegOf: ["rmo-allopathy-hospital"],
    qs: [
      "Can BAMS doctors prescribe allopathic medicines?",
      "Is it legal for me to give allopathy medicines in my clinic?",
      "Which states allow BAMS to prescribe modern medicine?",
      "Can I use antibiotics and painkillers in my Ayurveda practice?",
      "kya BAMS doctor allopathic dawai likh sakta hai?",
      "Cross pathy prescribing — what is the law for BAMS?",
    ] },
  { intent: "hospital-job-salary", theme: CLIN, sub: "Hospital employment", hardNegOf: ["rmo-allopathy-hospital"],
    qs: [
      "What is the salary of a BAMS doctor in a private hospital?",
      "How much does a fresher BAMS RMO earn?",
      "Starting salary for BAMS in a corporate hospital?",
      "Private hospital job for BAMS — pay and working hours?",
      "Is 25k per month normal for a BAMS duty doctor?",
      "bams doctor ki private hospital me salary kitni hoti hai?",
      "How to negotiate a better salary in an Ayurveda hospital job?",
    ] },
  { intent: "rmo-allopathy-hospital", theme: CLIN, sub: "Hospital employment", hardNegOf: ["hospital-job-salary", "prescribing-allopathy-legal"],
    qs: [
      "Can BAMS doctors work as RMO in an allopathic hospital?",
      "Is it legal for BAMS to do night duty in a multispeciality hospital?",
      "Can I work in ICU as a duty doctor with BAMS degree?",
      "Which states allow BAMS doctors to work in modern medicine hospitals?",
      "Working as a CMO in a private allopathy hospital after BAMS — any legal risk?",
      "Allopathic hospital me BAMS ki job legal hai kya?",
      "Do allopathy hospitals hire BAMS graduates and is it safe?",
    ] },
  { intent: "hospital-first-vs-practice", theme: CLIN, sub: "Hospital employment", alt: ["Setting up private practice"],
    qs: [
      "Should I work in a hospital for some years before starting my own practice?",
      "Hospital job first or own clinic first after internship?",
      "~Is gaining experience under a senior physician better than opening a setup immediately?",
      "Job in an Ayurveda hospital vs private practice — which is better at the start?",
    ] },
  { intent: "panchakarma-centre-setup", theme: CLIN, sub: "Panchakarma & therapy services", alt: ["Setting up private practice"], hardNegOf: ["panchakarma-training-course"],
    qs: [
      "How to set up a Panchakarma therapy unit?",
      "What equipment and staff are needed to start a Panchakarma centre?",
      "How do I start a Panchakarma centre after BAMS?",
      "Cost of setting up a small panchkarma centre?",
      "Space requirement and layout for a Panchakarma room in my clinic",
      "panchakarma centre kholne ke liye kya kya chahiye?",
      "Can I start Panchakarma at my clinic with 2 therapists?",
      "Steps to open a Panchakarma and wellness unit in a small town",
    ] },
  { intent: "panchakarma-training-course", theme: CLIN, sub: "Panchakarma & therapy services", hardNegOf: ["panchakarma-centre-setup"],
    qs: [
      "Panchakarma training course duration?",
      "Which is the best certificate course for Panchakarma after BAMS?",
      "Where can I get hands-on Panchakarma training?",
      "Is a separate certificate needed to run Panchakarma therapy?",
      "Short-term Panchakarma courses at govt institutes like AIIA?",
      "panchkarma traning kahan se kare? kitne mahine ka course hai",
    ] },
  { intent: "specialty-choice-clinical", theme: CLIN, sub: "Choosing a clinical specialty",
    qs: [
      "Which clinical speciality should I focus on in practice — skin, joints or infertility?",
      "Is it good to specialise in one disease area in Ayurveda practice?",
      "Which conditions respond best to Ayurveda so I can build a niche practice?",
      "Should I become a specialist in skin diseases or stay a general Ayurveda physician?",
      "Niche practice ideas for BAMS doctors",
    ] },
  { intent: "integrative-referrals", theme: CLIN, sub: "Integrative referrals",
    qs: [
      "How can I build referral relationships with allopathic doctors?",
      "How do I collaborate with modern medicine doctors for integrative care?",
      "When should an Ayurveda doctor refer a patient to an allopath?",
      "Integrative practice models in India — how do they work?",
    ] },
  { intent: "clinical-records", theme: CLIN, sub: "Records & clinical quality",
    qs: [
      "How should I maintain patient records in my clinic?",
      "Which software is good for maintaining case sheets in Ayurveda practice?",
      "Is EMR necessary for a small Ayurveda clinic?",
      "How to document Prakriti assessment and follow-ups properly?",
    ] },
  { intent: "teleconsultation-legal", theme: CLIN, sub: "Setting up private practice", qs: ["Is teleconsultation legal for BAMS doctors?"] },
  { intent: "clinic-indemnity-insurance", theme: CLIN, sub: "Setting up private practice", qs: ["Do I need professional indemnity insurance for my clinic?"] },
  { intent: "marma-specialty", theme: CLIN, sub: "Choosing a clinical specialty", qs: ["How to start marma therapy as a specialty?"] },
  { intent: "patient-complaint-handling", theme: CLIN, sub: "Records & clinical quality", qs: ["How should I handle a patient complaint or a legal notice?"] },

  /* ---------- T03 Research ---------- */
  { intent: "research-career-without-md", theme: RES, sub: "Framing a research question",
    qs: [
      "Can I start doing research during my BAMS itself?",
      "How can UG students get involved in Ayurveda research?",
      "I want to become a researcher. Where do I start after BAMS?",
      "Research field me jana hai BAMS ke baad, kaise start kare?",
      "Is research a good career option for BAMS graduates?",
      "How do I find research internships or projects as an intern?",
    ] },
  { intent: "thesis-topic-selection", theme: RES, sub: "Framing a research question", alt: ["Thesis & publication"],
    qs: [
      "How do I frame a research question for my thesis?",
      "How to choose a thesis topic in Ayurveda research?",
      "Good MD thesis topics in Kayachikitsa?",
      "How do I pick a feasible dissertation topic?",
      "Thesis topic selection tips — clinical or literary study?",
      "~How to convert a clinical observation into something I can study for MD?",
      "thesis ka topic kaise choose kare?",
    ] },
  { intent: "study-design-trial", theme: RES, sub: "Study design",
    qs: [
      "How do I design a clinical trial for an Ayurvedic formulation?",
      "Which study design is suitable for testing Ayurveda treatment?",
      "How to do a randomised controlled trial in Ayurveda when treatment is individualised?",
      "Observational study vs RCT for my MD research?",
    ] },
  { intent: "ethics-committee", theme: RES, sub: "Ethics & approvals",
    qs: [
      "How do I get ethics committee approval for my research?",
      "Is CTRI registration needed for an Ayurveda clinical study?",
      "What documents does the IEC ask for a clinical study?",
      "Informed consent format for an Ayurveda trial?",
    ] },
  { intent: "biostatistics-learning", theme: RES, sub: "Biostatistics",
    qs: [
      "How do I learn biostatistics for research?",
      "Which software should I use for statistics in my thesis — SPSS or R?",
      "How to calculate sample size for an Ayurveda study?",
      "Best online course for biostatistics for Ayurveda students?",
      "statistics bahut tough lagta hai, research ke liye kaise seekhu?",
    ] },
  { intent: "research-grants", theme: RES, sub: "Grants & funding",
    qs: [
      "Are there research grants for BAMS students?",
      "How to apply for ICMR STS short-term studentship?",
      "Which funding agencies give grants for Ayurveda research projects?",
      "Is there any AYUSH ministry scheme to fund student research?",
      "How to write a grant proposal for an Ayurveda project?",
    ] },
  { intent: "publish-case-report", theme: RES, sub: "Thesis & publication", family: "publish", alt: ["Framing a research question"], hardNegOf: ["journal-selection"],
    qs: [
      "How do I publish a case report?",
      "How can I publish my first research paper as a BAMS student?",
      "Steps to write and publish a case study in a journal?",
      "Where can interns publish small case series?",
      "paper publish kaise karte hai? pehla paper likhna hai",
      "How to convert my internship case into a publication?",
      "What is the process of publishing an article in an Ayurveda journal?",
      "How to write a review article and get it published?",
    ] },
  { intent: "journal-selection", theme: RES, sub: "Thesis & publication", family: "publish", hardNegOf: ["publish-case-report"],
    qs: [
      "How do I choose a good indexed journal for my paper?",
      "How to avoid predatory journals?",
      "Which Ayurveda journals are Scopus or PubMed indexed?",
      "Is UGC CARE list important for publications?",
      "~Some journal asked me to pay 5000 for publishing in 3 days. Is it genuine?",
    ] },
  { intent: "ai-in-thesis", theme: RES, sub: "Thesis & publication", qs: ["How do I use AI tools like ChatGPT ethically in my thesis writing?"] },
  { intent: "conference-presentation", theme: RES, sub: "Thesis & publication", qs: ["How to present a paper at an international conference?"] },
  { intent: "literature-search", theme: RES, sub: "Framing a research question", qs: ["How do I do a literature search on PubMed for Ayurveda topics?"] },

  /* ---------- T10 Policy, public health, govt ---------- */
  { intent: "govt-jobs-after-bams", theme: POL, sub: "Government service routes", family: "govt-jobs", alt: ["National AYUSH Mission delivery"], hardNegOf: ["ayush-medical-officer-exam"],
    qs: [
      "What government jobs are available after BAMS?",
      "How to get a government job after BAMS?",
      "bams ke baad sarkari naukri kaise milegi?",
      "List of govt jobs for BAMS doctors",
      "Which government departments recruit BAMS graduates?",
      "Is government job better than private practice after BAMS?",
      "How can I join government service as an Ayurveda doctor?",
      "Central government job options for BAMS — ESIC, CGHS, railways?",
      "What are the chances of getting a permanent govt post with only BAMS?",
      "Sarkari job ke liye BAMS ke baad kya karna chahiye?",
      "Govt vacancies for BAMS freshers — where to check?",
      "~Public sector openings for Ayurveda graduates",
      "Is a govt job secure for BAMS doctors in future?",
      "Which exams should I write for government jobs after BAMS?",
    ] },
  { intent: "ayush-medical-officer-exam", theme: POL, sub: "Government service routes", hardNegOf: ["govt-jobs-after-bams", "aiapget-preparation-strategy"],
    qs: [
      "How to prepare for the state AYUSH medical officer exam?",
      "What is the syllabus of the Ayurveda medical officer recruitment exam?",
      "AMO exam preparation strategy for Rajasthan / UP PSC?",
      "How to crack the medical officer exam conducted by state PSC?",
      "Which books for AYUSH MO exam?",
      "PSC Ayurveda medical officer exam pattern and cut off?",
      "medical officer exam ki taiyari kaise kare?",
      "Is AIAPGET preparation enough for the state medical officer exam?",
      "How to clear the AYUSH MO interview?",
    ] },
  { intent: "upsc-civil-services", theme: POL, sub: "Government service routes",
    qs: [
      "Can BAMS graduates write UPSC civil services?",
      "Is it a good idea to prepare for IAS after BAMS?",
      "Which optional subject is good for a BAMS student in UPSC?",
      "UPSC CMS exam — are BAMS doctors eligible?",
      "BAMS ke baad IAS ki taiyari kar sakte hai?",
      "How do doctors balance UPSC preparation with a job?",
    ] },
  { intent: "defence-railway-jobs", theme: POL, sub: "Government service routes", family: "govt-jobs",
    qs: [
      "Are there Ayurveda doctor jobs in the army or defence?",
      "Do railways hire BAMS medical officers?",
      "Can BAMS doctors join CAPF or paramilitary medical services?",
    ] },
  { intent: "nam-job-roles", theme: POL, sub: "National AYUSH Mission delivery", family: "govt-jobs",
    qs: [
      "What jobs are available under National AYUSH Mission?",
      "Is a NAM contractual job a good start after BAMS?",
      "How are NAM medical officer posts recruited?",
      "Salary and job security in National Ayush Mission posts?",
      "NAM ke under kaunsi vacancies aati hai?",
    ] },
  { intent: "research-career-ccras", theme: POL, sub: "Research councils", alt: ["Government service routes"],
    qs: [
      "How to get a job in CCRAS?",
      "What is the eligibility for research officer post in CCRAS?",
      "Career as a research officer in the central research council for Ayurveda",
      "Does CCRAS hire BAMS graduates without MD?",
      "CCRAS recruitment exam preparation tips?",
      "What is the work and salary of a CCRAS research officer?",
      "ccras me job kaise lagti hai?",
      "Research council jobs for Ayurveda — CCRAS, ICMR projects?",
    ] },
  { intent: "mph-after-bams", theme: POL, sub: "Public health projects",
    qs: [
      "Is MPH a good option after BAMS?",
      "Can I do Master of Public Health after BAMS and what are jobs after it?",
      "Best colleges for MPH for Ayurveda graduates?",
      "Public health career after BAMS — is MPH worth it?",
      "MPH abroad or in India after BAMS?",
      "What do public health professionals with BAMS do?",
    ] },
  { intent: "public-health-ayush-programs", theme: POL, sub: "Public health projects",
    qs: [
      "How can Ayurveda doctors contribute to national public health programmes?",
      "Are there public health project jobs for BAMS in NGOs?",
      "Role of AYUSH doctors in community health programmes like NCD screening",
    ] },
  { intent: "who-international-orgs", theme: POL, sub: "International organisations",
    qs: [
      "Can Ayurveda doctors work with WHO?",
      "How to get into international organisations like WHO or UNICEF after BAMS?",
      "Jobs in the WHO traditional medicine centre for BAMS?",
      "What qualifications do global health agencies look for?",
    ] },
  { intent: "policy-research-career", theme: POL, sub: "Policy research & advocacy",
    qs: [
      "How can I build a career in health policy as a BAMS graduate?",
      "Are there policy research roles in the Ministry of AYUSH?",
      "Internships in think tanks for AYUSH policy?",
    ] },
  { intent: "ayush-in-pmjay", theme: POL, sub: "Policy research & advocacy", qs: ["How is Ayurveda included in national health insurance like PMJAY?"] },
  { intent: "district-ayush-officer", theme: POL, sub: "Government service routes", qs: ["How to become a district AYUSH officer?"] },

  /* ---------- T08 Practice abroad ---------- */
  { intent: "abroad-practice-ayurveda", theme: ABR, sub: "Country-wise recognition", family: "abroad-general", alt: ["Licensing & registration"],
    hardNegOf: ["usa-practice-ayurveda", "uk-practice-ayurveda", "clinic-abroad-setup"],
    qs: [
      "Can I work abroad as an Ayurveda doctor?",
      "Which countries recognise BAMS degree?",
      "Is it possible to practise Ayurveda outside India?",
      "In which foreign countries can BAMS doctors practise legally?",
      "videsh me ayurveda practice kar sakte hai kya?",
      "Scope of Ayurveda overseas for BAMS graduates?",
      "Which country is best for an Ayurveda career?",
      "BAMS degree valid in other countries?",
      "Opportunities for Ayurveda doctors internationally",
      "How can I settle abroad after BAMS?",
      "Is there demand for Ayurveda practitioners in foreign countries?",
      "Can I go abroad with BAMS degree and work as a doctor?",
    ] },
  { intent: "usa-practice-ayurveda", theme: ABR, sub: "Country-wise recognition", hardNegOf: ["uk-practice-ayurveda"],
    qs: [
      "Is BAMS recognised in the USA?",
      "How can I practise Ayurveda in America?",
      "Ayurveda career in the US — license and scope?",
      "Can BAMS graduates work as Ayurvedic practitioners in USA?",
      "What is NAMA certification and does it help for working in the US?",
      "USA me ayurveda doctor ban sakte hai kya?",
    ] },
  { intent: "uk-practice-ayurveda", theme: ABR, sub: "Country-wise recognition", hardNegOf: ["usa-practice-ayurveda"],
    qs: [
      "Can BAMS graduates practise in the UK?",
      "How to work as an Ayurveda practitioner in the United Kingdom?",
      "Is BAMS degree accepted in England?",
      "UK registration for Ayurveda practitioners — is there any?",
    ] },
  { intent: "europe-ayurveda", theme: ABR, sub: "Country-wise recognition", family: "abroad-general",
    qs: [
      "Scope of Ayurveda in Germany and Europe?",
      "Can I practise Ayurveda in Switzerland or Germany as Heilpraktiker?",
      "Which European country is good for Ayurveda doctors?",
    ] },
  { intent: "gulf-dubai-licence", theme: ABR, sub: "Licensing & registration", alt: ["Country-wise recognition", "Visa and employment routes"],
    qs: [
      "How to get DHA licence for Ayurveda in Dubai?",
      "Can BAMS doctors work in UAE?",
      "What is the process for Ayurveda practitioner licence in the Gulf?",
      "DHA / DOH exam for Ayurveda — eligibility and preparation?",
      "Ayurveda jobs in Dubai and Oman — licence needed?",
      "dubai me bams ke liye license kaise milega?",
    ] },
  { intent: "clinic-abroad-setup", theme: ABR, sub: "Licensing & registration", hardNegOf: ["abroad-practice-ayurveda"],
    qs: [
      "Can I open my own Ayurveda clinic abroad?",
      "What is needed to start an Ayurveda clinic in Canada?",
      "Opening a clinic outside India — licences and costs?",
      "How do Indian Ayurveda doctors set up their own practice in Australia?",
    ] },
  { intent: "abroad-visa-job-route", theme: ABR, sub: "Visa and employment routes",
    qs: [
      "What visa can BAMS doctors get to work abroad?",
      "How to find Ayurveda jobs abroad with a work visa?",
      "Do foreign Ayurveda centres sponsor work visas?",
      "Which countries give work permit to Ayurveda practitioners?",
    ] },
  { intent: "abroad-bridging-course", theme: ABR, sub: "Bridging qualifications",
    qs: [
      "Is there a bridging course for BAMS to practise abroad?",
      "Should I do an MSc abroad to work in healthcare there?",
      "Which extra qualifications help BAMS doctors get recognised in Australia?",
      "Can I do nursing or naturopathy courses abroad after BAMS?",
    ] },
  { intent: "abroad-wellness-spa-jobs", theme: ABR, sub: "Wellness centre roles abroad",
    qs: [
      "Are there Ayurveda therapist jobs in spas abroad?",
      "How to get a job in an Ayurveda wellness centre in Europe?",
      "Wellness resort jobs abroad for BAMS doctors — salary?",
      "Ayurveda consultant jobs in Maldives or Mauritius resorts?",
      "Is working in a foreign spa good for an Ayurveda doctor's career?",
    ] },
  { intent: "abroad-insurance", theme: ABR, sub: "Country-wise recognition", qs: ["Is Ayurveda treatment covered by insurance in other countries?"] },
  { intent: "degree-apostille", theme: ABR, sub: "Licensing & registration", qs: ["How do I get my BAMS degree apostilled for foreign verification?"] },

  /* ---------- T04 Entrepreneurship ---------- */
  { intent: "startup-idea-validation", theme: ENT, sub: "Validating the idea",
    qs: [
      "How do I validate an Ayurvedic skincare product idea?",
      "How to test if my herbal product has a market?",
      "Start-up idea: Panchakarma at home — is it viable?",
      "How to know if my Ayurveda startup idea will work?",
      "Before investing, how do I check demand for an Ayurveda wellness app?",
      "Market research methods for an Ayurveda product startup",
    ] },
  { intent: "startup-funding", theme: ENT, sub: "Funding & finance",
    qs: [
      "How do I get funding for an Ayurveda startup?",
      "Are there government grants for AYUSH startups?",
      "How to pitch my Ayurveda startup to investors?",
      "Startup India scheme benefits for Ayurveda businesses?",
      "Seed funding options for a BAMS student entrepreneur",
      "ayurveda startup ke liye funding kahan se milegi?",
    ] },
  { intent: "incubation-ayush", theme: ENT, sub: "Incubation support",
    qs: [
      "Which incubators support Ayurveda startups?",
      "How to apply to the AIIA incubation centre?",
      "What does an incubation centre provide to an early stage startup?",
      "Is there any AYUSH incubator for student founders?",
    ] },
  { intent: "herbal-product-business", theme: ENT, sub: "Business model",
    qs: [
      "How can I launch my own Ayurvedic product brand?",
      "Business model for selling herbal products online",
      "Should I do third-party manufacturing for my own Ayurveda brand?",
      "How do I start an Ayurveda products business with small capital?",
      "Is D2C a good model for Ayurveda skincare?",
    ] },
  { intent: "trademark-patent", theme: ENT, sub: "Team & intellectual property",
    qs: [
      "Can I patent my Ayurvedic formulation?",
      "How do I protect my product name with a trademark?",
      "Classical formulations can't be patented — then how do I protect my idea?",
      "Should I sign an NDA with my co-founder and manufacturer?",
    ] },
  { intent: "ayurveda-healthtech-app", theme: ENT, sub: "Product & prototype",
    qs: [
      "I want to build an Ayurveda app. How do I start?",
      "How can a BAMS doctor start a health-tech startup without coding skills?",
      "Prakriti assessment app idea — how to build a prototype?",
    ] },
  { intent: "find-cofounder", theme: ENT, sub: "Team & intellectual property", qs: ["How to find a co-founder for an Ayurveda startup?"] },
  { intent: "company-registration-type", theme: ENT, sub: "Business model", qs: ["Should I register my startup as LLP or private limited?"] },

  /* ---------- T05 Manufacturing ---------- */
  { intent: "manufacturing-licence", theme: MFG, sub: "GMP and licensing",
    qs: [
      "What licence is needed to manufacture Ayurvedic medicines?",
      "How to get a drug manufacturing licence for Ayurveda products?",
      "GMP requirements for a small Ayurveda pharmacy unit?",
      "Steps to start an Ayurvedic medicine manufacturing unit",
      "Can a BAMS doctor be the technical person for a manufacturing licence?",
      "Ayurveda dawai banane ka license kaise milta hai?",
      "Is loan licence or third-party manufacturing better for beginners?",
    ] },
  { intent: "pharma-industry-jobs", theme: MFG, sub: "R&D and formulation", hardNegOf: ["qa-qc-career"],
    qs: [
      "What jobs are there for BAMS in Ayurvedic pharma companies?",
      "How to get an R&D job at Dabur or Himalaya?",
      "Career in Ayurveda pharma industry after BAMS?",
      "Is an industry job better than clinical practice for BAMS?",
      "Which roles do Ayurveda companies hire BAMS graduates for?",
      "Pharma company me BAMS ke liye job kaise milegi?",
      "Formulation development jobs for Ayurveda graduates",
    ] },
  { intent: "qa-qc-career", theme: MFG, sub: "QA / QC and testing", hardNegOf: ["pharma-industry-jobs"],
    qs: [
      "What is the career scope in QA/QC for BAMS graduates?",
      "How to get a job in quality control of herbal drugs?",
      "Do I need an MSc to work in an Ayurveda testing lab?",
      "What skills are needed for QA jobs in Ayurveda manufacturing?",
    ] },
  { intent: "pharmacovigilance-career", theme: MFG, sub: "Pharmacovigilance",
    qs: [
      "Is pharmacovigilance a good career for BAMS?",
      "How to start a career in Ayurveda pharmacovigilance?",
      "Courses for drug safety and pharmacovigilance after BAMS",
    ] },
  { intent: "regulatory-affairs-role", theme: MFG, sub: "Regulatory affairs", qs: ["What does a regulatory affairs executive do in an Ayurveda company?"] },
  { intent: "scale-up-production", theme: MFG, sub: "Production & scale-up", qs: ["How do companies scale a classical formulation from lab batch to production?"] },

  /* ---------- T06 Brand ---------- */
  { intent: "social-media-clinic", theme: BRAND, sub: "Digital presence",
    qs: [
      "How should I use Instagram to promote my Ayurveda clinic?",
      "Is it okay for doctors to make reels and YouTube videos?",
      "How to build an online presence as a new Ayurveda doctor?",
      "Social media marketing tips for an Ayurvedic clinic",
      "Google My Business and website — are they useful for a small clinic?",
      "clinic ka social media kaise grow kare?",
      "Should I hire an agency for my clinic's digital marketing?",
    ] },
  { intent: "advertising-rules", theme: BRAND, sub: "Advertising & claims compliance",
    qs: [
      "Are doctors allowed to advertise their clinic?",
      "What claims can I legally make about Ayurvedic products in ads?",
      "Drugs and Magic Remedies Act — what should Ayurveda doctors avoid?",
      "Can I post patient testimonials and before-after photos?",
      "Is it legal to advertise 'cure' for diabetes in Ayurveda?",
    ] },
  { intent: "health-content-career", theme: BRAND, sub: "Scientific communication",
    qs: [
      "Can I make a career as an Ayurveda content creator?",
      "How to start medical writing jobs after BAMS?",
      "Is health blogging or YouTube a full-time career option for BAMS?",
    ] },
  { intent: "clinic-positioning", theme: BRAND, sub: "Positioning a practice or product", qs: ["How do I position my clinic differently from other Ayurveda clinics nearby?"] },
  { intent: "awareness-camps", theme: BRAND, sub: "Community education", qs: ["How to conduct health awareness camps in villages?"] },

  /* ---------- T07 Export ---------- */
  { intent: "export-start", theme: EXP, sub: "Getting started in export",
    qs: [
      "How do I start exporting Ayurvedic products?",
      "What registrations are needed to export herbal medicines?",
      "Export business for Ayurveda — where to begin?",
      "Can a BAMS graduate start an Ayurveda export company?",
      "IEC code and other steps to export Ayurveda products?",
      "ayurvedic products export kaise kare?",
    ] },
  { intent: "export-certification", theme: EXP, sub: "Certification and quality marks",
    qs: [
      "Which certifications are needed to sell Ayurveda products in Europe?",
      "What is the AYUSH premium mark and is it useful for export?",
      "Is US FDA registration needed for exporting herbal supplements?",
      "Organic and halal certification for Ayurveda exports?",
    ] },
  { intent: "foreign-distributors", theme: EXP, sub: "Market entry & partners", qs: ["How do I find foreign distributors for Ayurveda products?"] },
  { intent: "incoterms", theme: EXP, sub: "Documentation & shipping terms", qs: ["What is FOB vs CIF pricing in export?"] },

  /* ---------- T09 MVT & wellness ---------- */
  { intent: "wellness-resort-careers", theme: MVT, sub: "Careers in wellness resorts", alt: ["How the MVT ecosystem works"],
    qs: [
      "How to get a job in a Kerala Ayurveda resort?",
      "What is the salary for an Ayurveda doctor in a wellness resort?",
      "Career in luxury wellness resorts like Ananda or Kairali?",
      "Is a resort job good for a fresh BAMS graduate?",
      "Skills needed for an Ayurveda consultant job at a wellness retreat",
      "wellness resort me job kaise milti hai?",
      "Do five-star hotels hire Ayurveda doctors for their spas?",
    ] },
  { intent: "mvt-how-it-works", theme: MVT, sub: "How the MVT ecosystem works",
    qs: [
      "What is medical value travel and how can Ayurveda doctors be part of it?",
      "How does medical tourism work in Ayurveda?",
      "Career scope in Ayurveda medical tourism?",
      "Which Indian states are leading in Ayurveda wellness tourism?",
      "How do foreign patients find Ayurveda hospitals in India?",
    ] },
  { intent: "nabh-accreditation", theme: MVT, sub: "Accreditation and standards",
    qs: [
      "How to get NABH accreditation for an Ayurveda hospital?",
      "Is NABH needed to receive international patients?",
      "What standards apply to Ayurveda wellness centres?",
    ] },
  { intent: "wellness-package-design", theme: MVT, sub: "Designing packages",
    qs: [
      "How to design a 14-day Panchakarma package for foreigners?",
      "How to price wellness packages for international guests?",
      "What should be included in an Ayurveda detox retreat package?",
    ] },
  { intent: "foreign-patient-communication", theme: MVT, sub: "Handling international patients", qs: ["How to communicate with foreign patients who don't speak English?"] },

  /* ---------- Not sure ---------- */
  { intent: "career-options-confused", theme: UNSURE, sub: "",
    qs: [
      "I am confused about my career after BAMS. Please help.",
      "I don't know which field to choose after BAMS — PG, job or business",
      "Not sure what I want to do. How do I decide my career path?",
      "Feeling lost after internship, what should I do now?",
      "bams ke baad samajh nahi aa raha kya karu",
      "How do I find out which career suits me after BAMS?",
      "Everyone is giving different advice. How do I choose my path?",
      "I am interested in many things — research, clinic, startup. How to choose one?",
    ] },
  { intent: "bams-worth-it", theme: UNSURE, sub: "", qs: ["Is BAMS worth it? I am in first year and thinking of switching"] },
  { intent: "leave-bams-for-mbbs", theme: UNSURE, sub: "", qs: ["My family wants me to drop BAMS and try NEET again for MBBS. Should I?"] },
  { intent: "handling-stigma", theme: UNSURE, sub: "", qs: ["How to deal with people who say Ayurveda is not real medicine?"] },
];

/** Hall-prompt chips submitted verbatim (the Ask Desk pre-fills them) → intent. */
const CHIP_INTENT = {
  "What should I do after BAMS?": ["what-after-bams-general", 3],
  "PG / MD branch": ["pg-branch-choice-general", 2],
  "Start a clinic": ["clinic-licence-registration", 2],
  "Hospital vs practice": ["hospital-first-vs-practice", 2],
  "Research after BAMS": ["research-career-without-md", 3],
  "AYUSH / public health": ["govt-jobs-after-bams", 2],
};

/* ------------------------------------------------------------------ */
/* Seeded noise                                                        */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261211);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const PREFIX = ["Sir, ", "Respected sir, ", "Hello mentors, ", "Namaste, ", "Dear mentor, ", "Ma'am, ", "Good morning sir. "];
const SUFFIX = [" please guide", " pls help", " kindly suggest", " thank you", " plz reply sir", " Please answer in detail."];
const GENERIC_CONTEXT = [
  "I am a final year BAMS student from Pune.",
  "Currently doing internship at a government Ayurveda college in Jaipur.",
  "3rd prof student, from a middle class family.",
  "I passed out in 2025 and am working in a clinic now.",
  "Intern, Uttar Pradesh",
  "Final year, Karnataka. Average student, around 65% marks.",
  "My parents are doctors and want me to do PG.",
  "I am a girl from a small town in Odisha.",
  "I have a gap of one year after internship.",
  "Studying in a private college in Maharashtra.",
  "Second year student, very interested but confused.",
  "Working as RMO for 8 months now.",
];

function typo(s) {
  const words = s.split(" ");
  const idx = words.map((w, i) => [w, i]).filter(([w]) => /^[A-Za-z]{6,}$/.test(w));
  if (!idx.length) return s;
  const [w, i] = pick(idx);
  const k = 1 + Math.floor(rnd() * (w.length - 3));
  words[i] = rnd() < 0.5 ? w.slice(0, k) + w[k + 1] + w[k] + w.slice(k + 2) : w.slice(0, k) + w.slice(k + 1);
  return words.join(" ");
}

function noisy(q) {
  let s = q;
  const r = rnd();
  if (r < 0.12) s = s.toLowerCase();
  if (rnd() < 0.10) s = s.replace(/\?$/, "");
  else if (rnd() < 0.06) s = s.replace(/\?$/, "??");
  if (rnd() < 0.10) s = pick(PREFIX) + s.charAt(0).toLowerCase() + s.slice(1);
  if (rnd() < 0.08) s = s.replace(/[?.]?$/, "") + pick(SUFFIX);
  if (rnd() < 0.10) s = typo(s);
  if (rnd() < 0.05) s = s.replace(/\bgovernment\b/gi, "govt").replace(/\bplease\b/gi, "pls").replace(/\byou\b/gi, "u");
  return s;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** ~30% of intents → test, stratified per theme by a stable hash order. */
function assignSplits() {
  const split = new Map();
  const byTheme = new Map();
  INTENTS.forEach(it => { if (!byTheme.has(it.theme)) byTheme.set(it.theme, []); byTheme.get(it.theme).push(it); });
  byTheme.forEach(list => {
    const multi = list.filter(it => it.qs.length > 1).sort((a, b) => hash(a.intent) - hash(b.intent));
    const solo = list.filter(it => it.qs.length === 1).sort((a, b) => hash(a.intent) - hash(b.intent));
    [multi, solo].forEach(group => group.forEach((it, i) => split.set(it.intent, (i % 10) % 3 === 1 ? "test" : "dev")));
  });
  return split;
}

function build() {
  const split = assignSplits();
  const rows = [];
  INTENTS.forEach(it => {
    it.qs.forEach(entry => {
      const [rawQ, ctx] = Array.isArray(entry) ? entry : [entry, ""];
      const hardPositive = rawQ.startsWith("~");
      const base = hardPositive ? rawQ.slice(1) : rawQ;
      const question = noisy(base);
      let subtheme = it.sub;
      let misfiled = false;
      if (it.alt && rnd() < 0.2) { subtheme = pick(it.alt); misfiled = true; }
      const context = ctx || (rnd() < 0.3 ? pick(GENERIC_CONTEXT) : "");
      rows.push({
        theme: it.theme, subtheme, question, context, intent: it.intent, family: it.family || it.intent,
        tags: [hardPositive && "hard-positive", misfiled && "misfiled-subtheme", it.hardNegOf && "hard-negative-intent", it.qs.length === 1 && "singleton"].filter(Boolean),
      });
    });
  });
  ASK_PROMPTS.forEach(p => {
    const [intent, copies] = CHIP_INTENT[p.label] || [];
    if (!intent) return;
    const it = INTENTS.find(x => x.intent === intent);
    for (let i = 0; i < copies; i++) {
      rows.push({
        theme: p.theme, subtheme: p.sub, question: p.text, context: rnd() < 0.5 ? pick(GENERIC_CONTEXT) : "",
        intent, family: it.family || intent, tags: ["hall-prompt-verbatim"],
      });
    }
  });
  // Shuffle arrival order (seeded) and stamp ids / times like the Ask Desk does.
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  const t0 = Date.UTC(2026, 10, 1, 4, 30);
  const out = rows.map((r, i) => ({
    id: `B${String(i + 1).padStart(4, "0")}`,
    createdAt: t0 + i * 7 * 60_000,
    ...r,
    split: split.get(r.intent),
  }));
  const intents = INTENTS.map(it => ({
    intent: it.intent, theme: it.theme, family: it.family || it.intent, split: split.get(it.intent),
    hardNegOf: it.hardNegOf || [], size: out.filter(r => r.intent === it.intent).length,
  }));
  return {
    meta: {
      description: "Labelled AYURDISHA Ask Desk benchmark for the Curation-desk merge. Synthetic but hand-written; never load into production.",
      generator: "scripts/build-merge-benchmark.mjs",
      seed: 20261211,
      questions: out.length,
      intents: intents.length,
      testIntents: intents.filter(i => i.split === "test").length,
    },
    intents,
    questions: out,
  };
}

const data = build();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 1) + "\n");
const testQ = data.questions.filter(q => q.split === "test").length;
console.log(`wrote ${path.relative(ROOT, OUT)}: ${data.meta.questions} questions, ${data.meta.intents} intents (${data.meta.testIntents} test intents, ${testQ} test questions)`);
