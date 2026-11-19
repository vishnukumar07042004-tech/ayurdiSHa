/**
 * Question-bank catalogue: career subjects × kinds of ask, aligned with the shared/merge.js
 * taxonomy (subject ids in `sig` are merge.js STRONG/WEAK subject ids; ask ids are its
 * SPECIFIC_ASKS / GENERIC_ASKS). build.mjs checks every generated question with
 * intentSignature() so the bank stays consistent with how staff merge questions.
 *
 * Entry fields:
 *   key     stable subject key used in intentIds
 *   sig     merge subject ids that must appear in the question's signature
 *   theme   App.jsx theme code; sub = subtheme
 *   n/hg/hi noun phrase in English / Hinglish / Hindi templates ({R} = region phrase)
 *   a/ha    action phrase for how-to / possible templates (English / Hinglish)
 *   asks    meaningful asks for this subject
 *   stages  student stages for whom the question is realistic
 *   regions region keys when the answer depends on region (abroad countries, state PSCs)
 *   prio    1–10 importance at the AYURDISHA desk
 *   custom  { en:[...], hg:[...], hi:[...] } full templates (used for compare / special intents)
 */

export const STAGES = {
  "1st-year": { en: "I am a first-year BAMS student.", hi: "मैं BAMS प्रथम वर्ष का छात्र हूँ।" },
  "final-year": { en: "I am a final-year BAMS student.", hi: "मैं BAMS अंतिम वर्ष का छात्र हूँ।" },
  intern: { en: "I am a BAMS intern.", hi: "मैं BAMS इंटर्न हूँ।" },
  "pg-aspirant": { en: "I am a PG aspirant.", hi: "मैं PG की तैयारी कर रहा हूँ।" },
  practitioner: { en: "I am a practising BAMS graduate.", hi: "मैं BAMS के बाद प्रैक्टिस कर रहा हूँ।" },
};

/** Regions: abroad countries (merge country:* ids) and Indian states (state PSC / AYUSH departments). */
export const REGIONS = {
  gulf: { label: "Gulf (UAE)", en: "the UAE (Dubai / Abu Dhabi)", hg: "UAE / Dubai", hi: "UAE (Dubai)", sig: "country:gulf" },
  usa: { label: "USA", en: "the USA", hg: "USA", hi: "USA", sig: "country:usa" },
  uk: { label: "UK", en: "the UK", hg: "UK", hi: "UK", sig: "country:uk" },
  eu: { label: "EU / Europe", en: "Europe", hg: "Europe", hi: "Europe", sig: "country:europe" },
  canada: { label: "Canada", en: "Canada", hg: "Canada", hi: "Canada", sig: "country:canada" },
  australia: { label: "Australia", en: "Australia", hg: "Australia", hi: "Australia", sig: "country:australia" },
  kerala: { label: "India / Kerala", en: "Kerala", hg: "Kerala", hi: "Kerala", state: true },
  maharashtra: { label: "India / Maharashtra", en: "Maharashtra", hg: "Maharashtra", hi: "Maharashtra", state: true },
  "uttar-pradesh": { label: "India / Uttar Pradesh", en: "Uttar Pradesh", hg: "UP", hi: "UP", state: true },
  rajasthan: { label: "India / Rajasthan", en: "Rajasthan", hg: "Rajasthan", hi: "Rajasthan", state: true },
  "madhya-pradesh": { label: "India / Madhya Pradesh", en: "Madhya Pradesh", hg: "MP", hi: "MP", state: true },
  gujarat: { label: "India / Gujarat", en: "Gujarat", hg: "Gujarat", hi: "Gujarat", state: true },
  karnataka: { label: "India / Karnataka", en: "Karnataka", hg: "Karnataka", hi: "Karnataka", state: true },
  odisha: { label: "India / Odisha", en: "Odisha", hg: "Odisha", hi: "Odisha", state: true },
};

/** Templates per ask. {S} = noun phrase, {A} = action phrase. Each must trigger the matching merge ask. */
export const ASK_TEMPLATES = {
  "how-to": {
    en: ["How do I {A}?", "What are the steps to {A}?", "How should I plan to {A}?"],
    hg: ["{HA} kaise karein?", "{HA} ka process kya hai?"],
    hi: ["{S} के लिए क्या steps हैं?", "{S} का process क्या है?"],
  },
  scope: {
    en: ["What is the scope of {S} for BAMS graduates?", "Is there a good future in {S}?"],
    hg: ["{S} ka scope kya hai?", "{S} mein future hai kya?"],
    hi: ["{S} का scope क्या है?", "क्या {S} में future है?"],
  },
  "which one": {
    en: ["Which {S} should I choose?", "How do I choose the best {S}?"],
    hg: ["Kaunsa {S} choose karun?", "Best {S} kaunsa hai?"],
    hi: ["कौन सा {S} choose करूँ?"],
  },
  "is it possible": {
    en: ["Can a BAMS graduate {A}?", "Is it possible to {A} after BAMS?"],
    hg: ["Kya BAMS ke baad {HA} possible hai?", "Kya BAMS wale {HA} kar sakte hain?"],
    hi: ["क्या BAMS के बाद {S} possible है?"],
  },
  cost: {
    en: ["How much does {S} cost?", "What budget or investment is needed for {S}?"],
    hg: ["{S} mein kitna kharcha aata hai?", "{S} ke liye kitna budget chahiye?"],
    hi: ["{S} में कितना खर्च (budget) लगता है?"],
  },
  income: {
    en: ["What salary or income can I expect from {S}?", "How much can I earn in {S}?"],
    hg: ["{S} mein kitni salary milti hai?", "{S} se kitni kamai hoti hai?"],
    hi: ["{S} में कितनी salary मिलती है?"],
  },
  resources: {
    en: ["Which books and study resources should I use for {S}?", "What are the best books or MCQ resources for {S}?"],
    hg: ["{S} ke liye kaunsi books padhni chahiye?", "{S} ke liye best notes ya test series kaunsi hai?"],
    hi: ["{S} के लिए कौन सी books पढ़ें?"],
  },
  syllabus: {
    en: ["What is the syllabus and exam pattern of {S}?", "What is the paper pattern for {S}?"],
    hg: ["{S} ka syllabus aur exam pattern kya hai?"],
    hi: ["{S} का syllabus और exam pattern क्या है?"],
  },
  cutoff: {
    en: ["What rank or score is needed in {S}?", "What were the cutoff marks for {S}?"],
    hg: ["{S} mein kitni rank ya marks chahiye?", "{S} ka cutoff kitna jaata hai?"],
    hi: ["{S} में कितनी rank या marks चाहिए?"],
  },
  eligibility: {
    en: ["What is the eligibility for {S}?", "Who is eligible for {S} and what qualification is required?"],
    hg: ["{S} ke liye eligibility kya hai?", "{S} ke liye qualification kya chahiye?"],
    hi: ["{S} के लिए eligibility क्या है?"],
  },
  necessity: {
    en: ["Is {S} compulsory?", "Is {S} really necessary for my career?"],
    hg: ["Kya {S} compulsory hai?", "Kya {S} zaroori hai?"],
    hi: ["क्या {S} compulsory है?"],
  },
  legal: {
    en: ["What licence or registration is required for {S}?", "What are the legal rules and registration for {S}?"],
    hg: ["{S} ke liye kaunsa licence ya registration chahiye?", "{S} ke legal rules kya hain?"],
    hi: ["{S} के लिए कौन सा licence या registration चाहिए?"],
  },
  timeline: {
    en: ["When should I start preparing for {S}?", "How long does {S} take?"],
    hg: ["{S} ki taiyari kab se shuru karein?", "{S} mein kitna time lagta hai, kab start karein?"],
    hi: ["{S} की तैयारी कब शुरू करें (timeline)?"],
  },
  location: {
    en: ["Is a city or a small town better for {S}?", "Which location is best for {S} — metro or rural?"],
    hg: ["{S} ke liye city better hai ya village?"],
    hi: ["{S} के लिए city बेहतर है या village?"],
  },
};

const ABROAD = ["gulf", "usa", "uk", "eu", "canada", "australia"];
const STATES = ["kerala", "maharashtra", "uttar-pradesh", "rajasthan", "madhya-pradesh", "gujarat", "karnataka", "odisha"];

const E = (key, o) => ({ key, sig: [], asks: [], stages: ["final-year", "intern"], prio: 5, ...o });

export const CATALOG = [
  /* ---------------- PG / AIAPGET (T02 · Choosing a PG branch) ---------------- */
  E("aiapget", { sig: ["aiapget"], theme: "T02", sub: "Choosing a PG branch", prio: 10,
    n: "AIAPGET", hg: "AIAPGET", hi: "AIAPGET", a: "prepare for AIAPGET", ha: "AIAPGET ki taiyari",
    asks: ["how-to", "syllabus", "resources", "cutoff", "eligibility", "timeline"], stages: ["final-year", "intern", "pg-aspirant"] }),
  E("aiapget-attempts", { sig: ["aiapget"], theme: "T02", sub: "Choosing a PG branch", prio: 8, asks: ["eligibility"], stages: ["pg-aspirant", "intern"],
    custom: { en: ["How many attempts are allowed for AIAPGET and is there an age limit?", "Is there an attempt limit or age limit for AIAPGET?"], hg: ["AIAPGET mein kitne attempts allowed hain, age limit hai kya?"], hi: ["AIAPGET में कितने attempts allowed हैं, age limit है क्या?"] } }),
  E("pg", { sig: ["pg"], theme: "T02", sub: "Choosing a PG branch", prio: 9,
    n: "PG (MD/MS Ayurveda)", hg: "PG (MD/MS)", hi: "PG (MD/MS)", a: "get admission to MD/MS Ayurveda", ha: "MD/MS mein admission",
    asks: ["how-to", "cost", "scope", "necessity"], stages: ["1st-year", "final-year", "intern", "practitioner"] }),
  E("pg-branch", { sig: ["pg"], theme: "T02", sub: "Choosing a PG branch", prio: 10,
    n: "PG branch", hg: "PG branch", hi: "PG branch", asks: ["which one"], stages: ["final-year", "intern", "pg-aspirant"] }),
  E("pg-counselling", { sig: ["pg"], theme: "T02", sub: "Choosing a PG branch", prio: 9, asks: ["how-to"], stages: ["pg-aspirant", "intern"],
    custom: { en: ["How does PG counselling (AACCC all-India quota and state quota) work after AIAPGET?", "What is the process of PG counselling after the AIAPGET result?"], hg: ["AIAPGET ke baad PG counselling ka process kya hai?"], hi: ["AIAPGET के बाद PG counselling का process क्या है?"] } }),
  E("pg-seat-fees", { sig: ["pg"], theme: "T02", sub: "Choosing a PG branch", prio: 7, asks: ["cost"], stages: ["pg-aspirant"],
    custom: { en: ["What are the fees for MD Ayurveda in government vs private colleges?", "How much are PG fees in private Ayurveda colleges?"], hg: ["Private college mein PG ki fees kitni hoti hai?"], hi: ["Private college में PG की fees कितनी होती है?"] } }),
  E("neetpg-vs-aiapget", { sig: ["neetpg"], theme: "T02", sub: "Choosing a PG branch", prio: 9, asks: ["is it possible"], stages: ["1st-year", "final-year", "intern"],
    custom: { en: ["Can a BAMS graduate write NEET-PG, or only AIAPGET?", "Is NEET-PG possible after BAMS instead of AIAPGET?"], hg: ["Kya BAMS ke baad NEET-PG de sakte hain ya sirf AIAPGET?"], hi: ["क्या BAMS के बाद NEET-PG दे सकते हैं या सिर्फ AIAPGET?"] } }),
  ...[
    ["kayachikitsa", "MD Kayachikitsa", 8], ["shalya", "MS Shalya Tantra", 7], ["prasuti", "MS Prasuti Tantra (Obstetrics & Gynaecology)", 6],
    ["dravyaguna", "MD Dravyaguna", 6], ["rasashastra", "MD Rasashastra", 5], ["kaumarbhritya", "MD Kaumarbhritya (Paediatrics)", 5],
    ["shalakya", "MS Shalakya Tantra", 5], ["samhita", "MD Samhita Siddhanta", 4], ["swasthavritta", "MD Swasthavritta", 4],
  ].map(([b, name, prio]) => E(`branch-${b}`, { sig: [`branch:${b}`], theme: "T02", sub: "Choosing a PG branch", prio,
    n: name, hg: name, hi: name, asks: ["scope", "income"], stages: ["final-year", "pg-aspirant"] })),
  E("pg-panchakarma", { sig: ["pg", "panchakarma"], theme: "T02", sub: "Choosing a PG branch", prio: 6, asks: ["scope"], stages: ["pg-aspirant", "final-year"],
    custom: { en: ["What is the scope of MD Panchakarma as a PG branch?"], hg: ["MD Panchakarma PG branch ka scope kya hai?"], hi: ["MD Panchakarma PG branch का scope क्या है?"] } }),
  E("after-bams", { sig: [], theme: "T02", sub: "Choosing a PG branch", prio: 10, asks: ["which one"], stages: ["1st-year", "final-year", "intern"],
    custom: { en: ["What should I do after BAMS — PG, clinical practice, research or something else?", "What are the career options after BAMS and how do I choose?"], hg: ["BAMS ke baad kya karein — PG, practice ya kuch aur?", "BAMS ke baad career options kaunse hain?"], hi: ["BAMS के बाद क्या करें — PG, practice या कुछ और?"] } }),
  E("pg-vs-clinic", { sig: ["pg", "clinic"], theme: "T02", sub: "Choosing a PG branch", prio: 10, asks: ["compare"], stages: ["final-year", "intern", "practitioner"],
    custom: { en: ["Should I do PG first or start my own clinic after BAMS?", "Is it better to do MD or start a clinic right after internship?"], hg: ["Pehle PG karun ya apna clinic start karun?"], hi: ["पहले PG करूँ या अपना clinic शुरू करूँ (compare)?"] } }),
  E("diploma", { sig: ["diploma"], theme: "T02", sub: "Choosing a PG branch", prio: 5, n: "diploma or certificate course after BAMS", hg: "diploma course", hi: "diploma course",
    asks: ["which one", "scope"], stages: ["final-year", "intern", "practitioner"] }),

  /* ---------------- Teaching / academia (T02) ---------------- */
  E("faculty", { sig: ["faculty"], theme: "T02", sub: "Faculty recruitment & eligibility", prio: 7,
    n: "a teaching job in an Ayurveda college", hg: "Ayurveda college mein teaching job", hi: "Ayurveda college में teaching job",
    a: "become a lecturer in an Ayurveda college", ha: "lecturer banna",
    asks: ["eligibility", "income", "how-to"], stages: ["pg-aspirant", "practitioner"] }),
  E("faculty-without-pg", { sig: ["faculty"], theme: "T02", sub: "Faculty recruitment & eligibility", prio: 6, asks: ["necessity"], stages: ["final-year", "practitioner"],
    custom: { en: ["Is MD compulsory for a teaching job in an Ayurveda college?"], hg: ["Kya Ayurveda college mein teaching job ke liye MD compulsory hai?"], hi: ["क्या Ayurveda college में teaching job के लिए MD compulsory है?"] } }),
  E("teaching-skills", { sig: ["faculty"], theme: "T02", sub: "Teaching skills", prio: 4, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How can a new Ayurveda faculty member improve teaching skills?"], hg: ["Naye faculty ke roop mein teaching skills kaise improve karein?"], hi: ["नए faculty के रूप में teaching skills कैसे improve करें?"] } }),
  E("curriculum", { sig: ["faculty"], theme: "T02", sub: "Curriculum & assessment", prio: 3, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How does competency-based curriculum and assessment work for Ayurveda faculty?"], hg: ["Competency based curriculum mein faculty assessment kaise karein?"], hi: ["Competency based curriculum में faculty assessment कैसे करें?"] } }),
  E("leadership", { sig: ["leadership"], theme: "T02", sub: "Academic leadership", prio: 3, n: "a principal or HOD post", hg: "principal ya HOD post", hi: "principal या HOD post",
    asks: ["eligibility", "timeline"], stages: ["practitioner"] }),
  E("phd", { sig: ["phd"], theme: "T02", sub: "PhD pathway", prio: 7, n: "a PhD in Ayurveda", hg: "Ayurveda mein PhD", hi: "Ayurveda में PhD",
    a: "do a PhD in Ayurveda", ha: "PhD", asks: ["eligibility", "how-to", "scope", "is it possible"], stages: ["pg-aspirant", "practitioner"] }),

  /* ---------------- Research (T03) ---------------- */
  E("research-career", { sig: ["research"], theme: "T03", sub: "Framing a research question", prio: 8, n: "a research career in Ayurveda", hg: "research career", hi: "research career",
    a: "start a research career after BAMS", ha: "research career start", asks: ["how-to", "scope", "income", "is it possible"], stages: ["final-year", "intern", "practitioner"] }),
  E("research-question", { sig: ["research"], theme: "T03", sub: "Framing a research question", prio: 5, asks: ["how-to"], stages: ["pg-aspirant", "practitioner"],
    custom: { en: ["How do I frame a good research question for an Ayurveda study?"], hg: ["Achha research question kaise frame karein?"], hi: ["अच्छा research question कैसे frame करें?"] } }),
  E("study-design", { sig: ["research"], theme: "T03", sub: "Study design", prio: 5, asks: ["which one"], stages: ["pg-aspirant", "practitioner"],
    custom: { en: ["Which study design should I choose for my first Ayurveda research project?"], hg: ["Pehle research project ke liye kaunsa study design choose karun?"], hi: ["पहले research project के लिए कौन सा study design चुनूँ?"] } }),
  E("thesis", { sig: ["thesis"], theme: "T03", sub: "Thesis & publication", prio: 6, n: "my MD thesis", hg: "MD thesis", hi: "MD thesis", a: "plan my MD thesis", ha: "MD thesis plan",
    asks: ["how-to", "timeline"], stages: ["pg-aspirant"] }),
  E("publish", { sig: ["publish"], theme: "T03", sub: "Thesis & publication", prio: 7, n: "publishing a research paper", hg: "research paper publish", hi: "research paper publish",
    a: "publish my first research paper", ha: "pehla research paper publish", asks: ["how-to", "cost"], stages: ["intern", "pg-aspirant", "practitioner"] }),
  E("journal-choice", { sig: ["publish"], theme: "T03", sub: "Thesis & publication", prio: 6, asks: ["which one"], stages: ["intern", "practitioner"],
    custom: { en: ["Which journal should I publish my case report in, and how do I avoid predatory journals?"], hg: ["Case report kis journal mein publish karun, predatory journal se kaise bachein?"], hi: ["Case report किस journal में publish करूँ?"] } }),
  E("ethics", { sig: ["ethics"], theme: "T03", sub: "Ethics & approvals", prio: 5, n: "ethics committee approval", hg: "ethics committee approval", hi: "ethics committee approval",
    a: "get ethics committee approval for my study", ha: "ethics approval", asks: ["how-to", "necessity", "timeline"], stages: ["pg-aspirant", "practitioner"] }),
  E("ctri", { sig: ["ctri"], theme: "T03", sub: "Ethics & approvals", prio: 4, n: "CTRI registration", hg: "CTRI registration", hi: "CTRI registration",
    a: "register my trial on CTRI", ha: "CTRI registration", asks: ["necessity", "how-to"], stages: ["pg-aspirant", "practitioner"] }),
  E("biostat", { sig: ["statistic"], theme: "T03", sub: "Biostatistics", prio: 4, n: "biostatistics for research", hg: "biostatistics", hi: "biostatistics",
    a: "learn biostatistics and SPSS for research", ha: "biostatistics seekhna", asks: ["resources", "how-to"], stages: ["pg-aspirant", "practitioner"] }),
  E("samplesize", { sig: ["samplesize"], theme: "T03", sub: "Biostatistics", prio: 3, asks: ["how-to"], stages: ["pg-aspirant"],
    custom: { en: ["How do I calculate the sample size for my clinical study?"], hg: ["Clinical study ka sample size kaise calculate karein?"], hi: ["Clinical study का sample size कैसे calculate करें?"] } }),
  E("grant", { sig: ["grant"], theme: "T03", sub: "Grants & funding", prio: 5, n: "research grants for young Ayurveda researchers", hg: "research grant", hi: "research grant",
    a: "get a research grant", ha: "research grant lena", asks: ["eligibility", "how-to"], stages: ["pg-aspirant", "practitioner"] }),

  /* ---------------- Clinical practice (T01) ---------------- */
  E("clinic", { sig: ["clinic"], theme: "T01", sub: "Setting up private practice", prio: 10, n: "starting my own Ayurveda clinic", hg: "apna clinic kholna", hi: "अपना clinic खोलना",
    a: "start my own Ayurveda clinic", ha: "apna clinic start", asks: ["how-to", "cost", "legal", "location", "timeline", "income"], stages: ["intern", "practitioner", "final-year"] }),
  E("clinic-registration", { sig: [], theme: "T01", sub: "Setting up private practice", prio: 9, asks: ["legal"], stages: ["intern", "final-year"],
    custom: { en: ["How do I get state board registration or NCISM central registration after internship?", "What is the registration process with the state board after BAMS internship?"], hg: ["Internship ke baad state board registration kaise karein?"], hi: ["Internship के बाद state board registration कैसे करें?"] } }),
  E("allopathy", { sig: ["allopathy"], theme: "T01", sub: "Integrative referrals", prio: 9, asks: ["legal"], stages: ["intern", "practitioner"],
    custom: { en: ["Can a BAMS doctor legally prescribe allopathic medicines?", "Is it legal for BAMS doctors to practise allopathy in India?"], hg: ["Kya BAMS doctor allopathic medicine prescribe kar sakta hai legally?"], hi: ["क्या BAMS doctor allopathy medicine prescribe कर सकता है (legal)?"] } }),
  E("hospital", { sig: ["hospital"], theme: "T01", sub: "Hospital employment", prio: 8, n: "a hospital job after BAMS", hg: "hospital job", hi: "hospital job",
    a: "get a job in a good hospital after BAMS", ha: "hospital mein job", asks: ["how-to", "income"], stages: ["intern", "final-year"] }),
  E("hospital-vs-clinic", { sig: ["hospital", "clinic"], theme: "T01", sub: "Hospital employment", prio: 8, asks: ["compare"], stages: ["intern", "practitioner"],
    custom: { en: ["Is it better to work in a hospital first or start my own clinic straight away?"], hg: ["Pehle hospital mein job karun ya seedha apna clinic?"], hi: ["पहले hospital में job या सीधा अपना clinic — कौन बेहतर (compare)?"] } }),
  E("specialty", { sig: [], theme: "T01", sub: "Choosing a clinical specialty", prio: 6, asks: ["which one"], stages: ["intern", "practitioner"],
    custom: { en: ["Which clinical specialty should I focus my Ayurveda practice on?"], hg: ["Practice ke liye kaunsi clinical specialty choose karun?"], hi: ["Practice के लिए कौन सी clinical specialty चुनूँ?"] } }),
  E("specialty-skin", { sig: ["specialty:skin"], theme: "T01", sub: "Choosing a clinical specialty", prio: 5, n: "an Ayurveda skin and cosmetology practice", hg: "skin aur cosmetology practice", hi: "skin और cosmetology practice",
    asks: ["scope"], stages: ["intern", "practitioner"] }),
  E("specialty-infertility", { sig: ["specialty:infertility"], theme: "T01", sub: "Choosing a clinical specialty", prio: 4, n: "an infertility-focused Ayurveda practice", hg: "infertility practice", hi: "infertility practice",
    asks: ["scope"], stages: ["practitioner"] }),
  E("records", { sig: ["records"], theme: "T01", sub: "Records & clinical quality", prio: 4, n: "clinic records and EMR software", hg: "clinic records aur EMR software", hi: "clinic records और EMR software",
    asks: ["legal", "which one"], stages: ["practitioner"] }),
  E("panchakarma-centre", { sig: ["panchakarma"], theme: "T01", sub: "Panchakarma & therapy services", prio: 8, n: "a Panchakarma centre", hg: "Panchakarma centre", hi: "Panchakarma centre",
    a: "start a Panchakarma centre", ha: "Panchakarma centre start", asks: ["how-to", "cost", "legal", "income", "scope"], stages: ["intern", "practitioner"] }),
  E("therapist", { sig: ["therapist"], theme: "T01", sub: "Panchakarma & therapy services", prio: 4, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How do I find and train good Panchakarma therapists for my centre?"], hg: ["Panchakarma therapist kaise hire aur train karein?"], hi: ["Panchakarma therapist कैसे hire और train करें?"] } }),

  /* ---------------- Entrepreneurship (T04) ---------------- */
  E("startup-idea", { sig: ["startup"], theme: "T04", sub: "Validating the idea", prio: 6, asks: ["how-to"], stages: ["final-year", "practitioner"],
    custom: { en: ["How do I validate my Ayurveda start-up idea before investing?"], hg: ["Ayurveda start-up idea ko validate kaise karein?"], hi: ["Ayurveda start-up idea को validate कैसे करें?"] } }),
  E("business-model", { sig: ["business"], theme: "T04", sub: "Business model", prio: 5, asks: ["which one"], stages: ["practitioner"],
    custom: { en: ["Which business model works best for an Ayurveda health start-up?"], hg: ["Ayurveda start-up ke liye kaunsa business model best hai?"], hi: ["Ayurveda start-up के लिए कौन सा business model best है?"] } }),
  E("product-launch", { sig: ["product"], theme: "T04", sub: "Product & prototype", prio: 6, n: "launching my own Ayurvedic product", hg: "apna Ayurvedic product launch", hi: "अपना Ayurvedic product launch",
    a: "launch my own Ayurvedic product brand", ha: "apna product launch", asks: ["how-to", "legal", "cost"], stages: ["practitioner"] }),
  E("incubation", { sig: ["incubation"], theme: "T04", sub: "Incubation support", prio: 5, n: "incubation support for an Ayurveda start-up", hg: "start-up incubation", hi: "start-up incubation",
    a: "get incubation support for my start-up", ha: "incubation support lena", asks: ["how-to", "eligibility"], stages: ["final-year", "practitioner"] }),
  E("funding", { sig: ["funding"], theme: "T04", sub: "Funding & finance", prio: 5, n: "start-up funding", hg: "start-up funding", hi: "start-up funding",
    a: "raise funding for my Ayurveda start-up", ha: "funding raise", asks: ["how-to", "eligibility"], stages: ["practitioner"] }),
  E("patent", { sig: ["patent"], theme: "T04", sub: "Team & intellectual property", prio: 4, n: "a patent for my Ayurvedic formulation", hg: "formulation ka patent", hi: "formulation का patent",
    a: "patent my Ayurvedic formulation", ha: "formulation patent", asks: ["is it possible", "cost", "how-to"], stages: ["practitioner"] }),
  E("trademark", { sig: ["trademark"], theme: "T04", sub: "Team & intellectual property", prio: 3, n: "a trademark for my brand", hg: "brand trademark", hi: "brand trademark",
    a: "register a trademark for my brand", ha: "trademark registration", asks: ["how-to", "cost"], stages: ["practitioner"] }),

  /* ---------------- Industry / pharma (T05) ---------------- */
  E("pharma-job", { sig: ["pharma"], theme: "T05", sub: "R&D and formulation", prio: 6, n: "an R&D job in an Ayurveda pharma company", hg: "pharma company mein R&D job", hi: "pharma company में R&D job",
    a: "get an R&D job in an Ayurveda pharma company", ha: "pharma R&D job", asks: ["how-to", "income", "eligibility"], stages: ["final-year", "pg-aspirant", "practitioner"] }),
  E("manufacturing", { sig: ["manufacturing"], theme: "T05", sub: "Production & scale-up", prio: 5, n: "an Ayurvedic medicine manufacturing unit", hg: "Ayurvedic medicine manufacturing unit", hi: "Ayurvedic medicine manufacturing unit",
    a: "start manufacturing Ayurvedic medicines", ha: "manufacturing unit start", asks: ["how-to", "legal", "cost"], stages: ["practitioner"] }),
  E("gmp", { sig: ["gmp"], theme: "T05", sub: "GMP and licensing", prio: 5, n: "GMP (Schedule T) certification", hg: "GMP certification", hi: "GMP certification",
    a: "get GMP certification for my unit", ha: "GMP certification", asks: ["how-to", "necessity", "cost"], stages: ["practitioner"] }),
  E("qc", { sig: ["qc"], theme: "T05", sub: "QA / QC and testing", prio: 4, n: "a QA/QC career in Ayurveda pharma", hg: "QA/QC job", hi: "QA/QC job",
    a: "build a QA/QC career in Ayurveda pharma", ha: "QA/QC career", asks: ["how-to", "eligibility", "income"], stages: ["final-year", "practitioner"] }),
  E("regulatory", { sig: ["regulatory"], theme: "T05", sub: "Regulatory affairs", prio: 4, n: "a regulatory affairs career for Ayurveda products", hg: "regulatory affairs career", hi: "regulatory affairs career",
    a: "move into regulatory affairs", ha: "regulatory affairs mein jaana", asks: ["how-to", "scope"], stages: ["practitioner"] }),
  E("pharmacovigilance", { sig: ["pharmacovigilance"], theme: "T05", sub: "Pharmacovigilance", prio: 4, n: "pharmacovigilance for Ayurveda", hg: "pharmacovigilance", hi: "pharmacovigilance",
    a: "build a career in pharmacovigilance", ha: "pharmacovigilance career", asks: ["scope", "how-to"], stages: ["final-year", "practitioner"] }),

  /* ---------------- Brand / digital (T06) ---------------- */
  E("socialmedia", { sig: ["socialmedia"], theme: "T06", sub: "Digital presence", prio: 6, n: "social media for my practice", hg: "practice ke liye social media", hi: "practice के लिए social media",
    a: "promote my practice on social media ethically", ha: "social media par practice promote", asks: ["how-to", "legal"], stages: ["intern", "practitioner"] }),
  E("advertise", { sig: ["advertise"], theme: "T06", sub: "Advertising & claims compliance", prio: 6, asks: ["legal"], stages: ["practitioner"],
    custom: { en: ["What are the legal rules for advertising an Ayurveda clinic or product and its claims?", "Is it legal to advertise cure claims for Ayurvedic treatment?"], hg: ["Ayurveda clinic ka advertisement karne ke legal rules kya hain?"], hi: ["Ayurveda clinic के advertisement के legal rules क्या हैं?"] } }),
  E("brand", { sig: ["brand"], theme: "T06", sub: "Positioning a practice or product", prio: 5, asks: ["how-to"], stages: ["intern", "practitioner"],
    custom: { en: ["How do I build a personal brand as a young Ayurveda doctor?"], hg: ["Young Ayurveda doctor apna brand kaise banaye?"], hi: ["Young Ayurveda doctor अपना brand कैसे बनाए?"] } }),
  E("scicomm", { sig: [], theme: "T06", sub: "Scientific communication", prio: 4, asks: ["how-to"], stages: ["intern", "practitioner"],
    custom: { en: ["How can I communicate Ayurveda research to the public in a scientific way?"], hg: ["Ayurveda research ko public tak scientific tarike se kaise pahunchayein?"], hi: ["Ayurveda research को public तक scientific तरीके से कैसे पहुँचाएँ?"] } }),
  E("camp", { sig: ["camp"], theme: "T06", sub: "Community education", prio: 4, n: "a free health camp", hg: "free health camp", hi: "free health camp",
    a: "organise a free health camp", ha: "health camp organise", asks: ["how-to", "legal"], stages: ["intern", "practitioner"] }),

  /* ---------------- Export (T07) ---------------- */
  E("export", { sig: ["export"], theme: "T07", sub: "Getting started in export", prio: 5, n: "exporting Ayurvedic products", hg: "Ayurvedic products export", hi: "Ayurvedic products export",
    a: "start exporting Ayurvedic products", ha: "export business start", asks: ["how-to", "cost"], stages: ["practitioner"] }),
  E("export-region", { sig: ["export"], theme: "T07", sub: "Certification and quality marks", prio: 4, asks: ["legal"], stages: ["practitioner"], regions: ["gulf", "usa", "eu", "uk"],
    custom: { en: ["What registration and certification are needed to export Ayurvedic products to {R}?"], hg: ["{R} mein Ayurvedic products export karne ke liye kaunsa registration chahiye?"], hi: ["{R} में Ayurvedic products export के लिए कौन सा registration चाहिए?"] } }),
  E("export-docs", { sig: ["export"], theme: "T07", sub: "Documentation & shipping terms", prio: 3, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["What documents and shipping terms (Incoterms) do I need to understand to export Ayurvedic medicines?"], hg: ["Export ke liye kaunse documents aur shipping terms samajhne honge?"], hi: ["Export के लिए कौन से documents और shipping terms समझने होंगे?"] } }),
  E("export-pricing", { sig: ["export"], theme: "T07", sub: "Pricing & distribution", prio: 3, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How should I price and find distributors for exporting Ayurvedic products?"], hg: ["Export products ki pricing aur distributor kaise dhoondhein?"], hi: ["Export products की pricing और distributor कैसे ढूँढें?"] } }),

  /* ---------------- Abroad (T08) ---------------- */
  E("abroad", { sig: ["abroad"], theme: "T08", sub: "Country-wise recognition", prio: 9, n: "practising Ayurveda abroad", hg: "abroad mein Ayurveda practice", hi: "abroad में Ayurveda practice",
    a: "practise Ayurveda abroad", ha: "abroad practice", asks: ["how-to", "scope", "which one"], stages: ["final-year", "intern", "practitioner"] }),
  E("abroad-country", { sig: [], theme: "T08", sub: "Licensing & registration", prio: 8, regions: ABROAD, asks: ["legal", "how-to", "income"], stages: ["intern", "practitioner"],
    n: "practising Ayurveda in {R}", hg: "{R} mein Ayurveda practice", hi: "{R} में Ayurveda practice", a: "practise Ayurveda in {R}", ha: "{R} mein Ayurveda practice" }),
  E("abroad-recognition", { sig: [], theme: "T08", sub: "Country-wise recognition", prio: 8, regions: ABROAD, asks: ["is it possible"], stages: ["final-year", "intern", "practitioner"],
    custom: { en: ["Is the BAMS degree recognised in {R}, and can I work there as an Ayurveda practitioner?"], hg: ["Kya BAMS degree {R} mein recognised hai, wahan practice kar sakte hain?"], hi: ["क्या BAMS degree {R} में recognised है?"] } }),
  E("abroad-visa", { sig: ["visa"], theme: "T08", sub: "Visa and employment routes", prio: 6, regions: ["gulf", "usa", "uk", "eu", "canada", "australia"], asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["Which visa or employment route can an Ayurveda practitioner use to work in {R}?"], hg: ["{R} mein Ayurveda job ke liye kaunsa visa milta hai?"], hi: ["{R} में Ayurveda job के लिए कौन सा visa मिलता है?"] } }),
  E("bridging", { sig: ["bridging"], theme: "T08", sub: "Bridging qualifications", prio: 5, n: "a bridging course to work abroad", hg: "abroad ke liye bridging course", hi: "abroad के लिए bridging course",
    asks: ["which one", "necessity"], stages: ["practitioner"] }),
  E("wellness-abroad", { sig: ["abroad"], theme: "T08", sub: "Wellness centre roles abroad", prio: 6, n: "a wellness centre job abroad", hg: "abroad wellness centre job", hi: "abroad wellness centre job",
    a: "get a wellness centre job abroad", ha: "abroad wellness centre job", asks: ["how-to", "income"], stages: ["intern", "practitioner"] }),

  /* ---------------- MVT & wellness (T09) ---------------- */
  E("mvt", { sig: ["mvt"], theme: "T09", sub: "How the MVT ecosystem works", prio: 5, n: "medical value travel (MVT) in Ayurveda", hg: "medical value travel", hi: "medical value travel",
    a: "build a career in medical value travel", ha: "medical value travel career", asks: ["scope", "how-to"], stages: ["practitioner", "final-year"] }),
  E("nabh", { sig: ["nabh"], theme: "T09", sub: "Accreditation and standards", prio: 5, n: "NABH accreditation for an Ayurveda hospital or centre", hg: "NABH accreditation", hi: "NABH accreditation",
    a: "get NABH accreditation for my centre", ha: "NABH accreditation", asks: ["how-to", "necessity", "cost"], stages: ["practitioner"] }),
  E("packages", { sig: [], theme: "T09", sub: "Designing packages", prio: 3, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How do I design ethical Ayurveda wellness packages for international visitors?"], hg: ["International visitors ke liye wellness packages kaise design karein?"], hi: ["International visitors के लिए wellness packages कैसे design करें?"] } }),
  E("intl-patients", { sig: ["patient"], theme: "T09", sub: "Handling international patients", prio: 4, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How should an Ayurveda centre handle international patients — documentation, consent and follow-up?"], hg: ["International patients ko kaise handle karein — documents aur consent?"], hi: ["International patients को कैसे handle करें?"] } }),
  E("resort", { sig: ["resort"], theme: "T09", sub: "Careers in wellness resorts", prio: 6, n: "a job in an Ayurveda wellness resort", hg: "wellness resort job", hi: "wellness resort job",
    a: "get a job in a wellness resort", ha: "wellness resort mein job", asks: ["how-to", "income", "eligibility"], stages: ["intern", "practitioner"] }),
  E("yoga", { sig: ["yoga"], theme: "T09", sub: "Careers in wellness resorts", prio: 4, n: "yoga certification for an Ayurveda doctor", hg: "yoga certification", hi: "yoga certification",
    asks: ["scope", "which one"], stages: ["final-year", "practitioner"] }),

  /* ---------------- Government / policy (T10) ---------------- */
  E("govt-mo", { sig: ["medicalofficer"], theme: "T10", sub: "Government service routes", prio: 10, n: "a government Ayurveda Medical Officer post", hg: "government Ayurveda Medical Officer job", hi: "सरकारी Ayurveda Medical Officer job",
    a: "become a government Ayurveda Medical Officer", ha: "government Medical Officer banna", asks: ["how-to", "eligibility", "income", "resources"], stages: ["final-year", "intern", "practitioner"] }),
  E("psc", { sig: ["psc"], theme: "T10", sub: "Government service routes", prio: 8, regions: STATES, asks: ["syllabus", "eligibility", "resources", "how-to"], stages: ["intern", "practitioner"],
    n: "the {R} PSC Ayurveda Medical Officer exam", hg: "{R} PSC Ayurveda Medical Officer exam", hi: "{R} PSC Ayurveda Medical Officer exam",
    a: "prepare for the {R} PSC Ayurveda Medical Officer exam", ha: "{R} PSC exam ki taiyari" }),
  E("upsc", { sig: ["upsc"], theme: "T10", sub: "Government service routes", prio: 7, n: "UPSC civil services", hg: "UPSC", hi: "UPSC",
    a: "clear UPSC civil services after BAMS", ha: "UPSC", asks: ["is it possible", "how-to", "eligibility"], stages: ["final-year", "intern", "practitioner"] }),
  E("govt-vs-private", { sig: ["government", "clinic"], theme: "T10", sub: "Government service routes", prio: 8, asks: ["compare"], stages: ["intern", "practitioner"],
    custom: { en: ["Is a government job better than my own clinic for a BAMS doctor?"], hg: ["Government job better hai ya apna clinic?"], hi: ["सरकारी job बेहतर है या अपना clinic (compare)?"] } }),
  E("nam", { sig: ["nam"], theme: "T10", sub: "National AYUSH Mission delivery", prio: 6, n: "National AYUSH Mission jobs", hg: "National AYUSH Mission job", hi: "National AYUSH Mission job",
    a: "get a job under the National AYUSH Mission", ha: "NAM job", asks: ["how-to", "eligibility", "income"], stages: ["intern", "practitioner"] }),
  E("ccras", { sig: ["ccras"], theme: "T10", sub: "Research councils", prio: 6, n: "a job at CCRAS", hg: "CCRAS job", hi: "CCRAS job",
    a: "get a research job at CCRAS", ha: "CCRAS mein job", asks: ["eligibility", "how-to", "income"], stages: ["pg-aspirant", "practitioner"] }),
  E("mph", { sig: ["mph"], theme: "T10", sub: "Public health projects", prio: 6, n: "an MPH after BAMS", hg: "BAMS ke baad MPH", hi: "BAMS के बाद MPH",
    a: "do an MPH after BAMS", ha: "MPH", asks: ["scope", "eligibility", "cost"], stages: ["final-year", "intern", "practitioner"] }),
  E("public-health", { sig: [], theme: "T10", sub: "Public health projects", prio: 4, asks: ["how-to"], stages: ["intern", "practitioner"],
    custom: { en: ["How can a BAMS graduate work on public health projects?"], hg: ["BAMS graduate public health projects mein kaise kaam kare?"], hi: ["BAMS graduate public health projects में कैसे काम करे?"] } }),
  E("who", { sig: ["whoorg"], theme: "T10", sub: "International organisations", prio: 6, n: "working with WHO", hg: "WHO mein kaam", hi: "WHO में काम",
    a: "work with WHO", ha: "WHO mein kaam", asks: ["is it possible", "how-to", "eligibility"], stages: ["final-year", "practitioner"] }),
  E("policy", { sig: [], theme: "T10", sub: "Policy research & advocacy", prio: 3, asks: ["how-to"], stages: ["practitioner"],
    custom: { en: ["How do I build a career in AYUSH policy research and advocacy?"], hg: ["AYUSH policy research mein career kaise banayein?"], hi: ["AYUSH policy research में career कैसे बनाएँ?"] } }),

  /* ---------------- Internship / early career ---------------- */
  E("internship", { sig: ["internship"], theme: "T01", sub: "Hospital employment", prio: 9, n: "the BAMS internship", hg: "internship", hi: "internship",
    a: "make the best use of my internship year", ha: "internship ka best use", asks: ["how-to", "timeline"], stages: ["final-year", "intern"] }),
  E("internship-pg-prep", { sig: ["internship", "aiapget"], theme: "T02", sub: "Choosing a PG branch", prio: 8, asks: ["how-to"], stages: ["intern"],
    custom: { en: ["How do I balance internship duties with AIAPGET preparation?"], hg: ["Internship ke saath AIAPGET ki taiyari kaise manage karein?"], hi: ["Internship के साथ AIAPGET की तैयारी कैसे manage करें?"] } }),
  E("first-year", { sig: [], theme: "T02", sub: "Choosing a PG branch", prio: 6, asks: ["how-to"], stages: ["1st-year"],
    custom: { en: ["What should a first-year BAMS student focus on to build a good career?"], hg: ["First year BAMS student career ke liye kis par focus kare?"], hi: ["First year BAMS student career के लिए किस पर focus करे?"] } }),
  E("internship-stipend", { sig: ["internship"], theme: "T01", sub: "Hospital employment", prio: 6, asks: ["income"], stages: ["final-year", "intern"],
    custom: { en: ["Do BAMS interns get a stipend, and how much is the internship stipend?"], hg: ["BAMS internship mein stipend milta hai kya, kitna?"], hi: ["BAMS internship में stipend मिलता है क्या?"] } }),
  E("internship-where", { sig: ["internship"], theme: "T01", sub: "Hospital employment", prio: 5, asks: ["location"], stages: ["final-year"],
    custom: { en: ["Can I do part of my internship in another hospital or city, and which location is better?"], hg: ["Internship dusre city ya hospital mein kar sakte hain kya?"], hi: ["Internship दूसरे city या hospital में कर सकते हैं क्या (location)?"] } }),
  E("internship-rules", { sig: ["internship"], theme: "T01", sub: "Hospital employment", prio: 6, asks: ["legal"], stages: ["final-year", "intern"],
    custom: { en: ["What are the NCISM rules for the compulsory rotatory internship?"], hg: ["Compulsory rotatory internship ke NCISM rules kya hain?"], hi: ["Compulsory rotatory internship के NCISM rules क्या हैं?"] } }),
  E("after-bams-scope", { sig: [], theme: "T02", sub: "Choosing a PG branch", prio: 8, asks: ["scope"], stages: ["1st-year", "final-year"],
    custom: { en: ["Is there a good future for BAMS graduates in India today?"], hg: ["Aaj BAMS ka future kaisa hai India mein?"], hi: ["आज BAMS का future कैसा है?"] } }),
  E("after-bams-income", { sig: [], theme: "T02", sub: "Choosing a PG branch", prio: 7, asks: ["income"], stages: ["1st-year", "final-year", "intern"],
    custom: { en: ["What starting salary can a fresh BAMS graduate realistically expect?"], hg: ["Fresh BAMS graduate ki starting salary kitni hoti hai?"], hi: ["Fresh BAMS graduate की starting salary कितनी होती है?"] } }),
  E("switch-mbbs", { sig: [], theme: "T02", sub: "Choosing a PG branch", prio: 6, asks: ["switch"], stages: ["1st-year"],
    custom: { en: ["Can I switch from BAMS to MBBS, and should I?"], hg: ["Kya BAMS se MBBS mein switch kar sakte hain?"], hi: ["क्या BAMS से MBBS में switch कर सकते हैं?"] } }),
  E("switch-industry", { sig: ["pharma"], theme: "T05", sub: "R&D and formulation", prio: 5, asks: ["switch"], stages: ["practitioner"],
    custom: { en: ["How do I switch from clinical practice to a pharma industry career?"], hg: ["Clinical practice se pharma industry mein switch kaise karein?"], hi: ["Clinical practice से pharma industry में switch कैसे करें?"] } }),
  E("mba", { sig: [], theme: "T01", sub: "Hospital employment", prio: 7, asks: ["scope", "which one", "eligibility"], stages: ["final-year", "intern", "practitioner"],
    n: "an MBA in hospital or healthcare management after BAMS", hg: "BAMS ke baad hospital management MBA", hi: "BAMS के बाद hospital management MBA",
    a: "move into hospital administration with an MBA" }),
  E("cra", { sig: ["research"], theme: "T03", sub: "Study design", prio: 5, n: "a clinical research associate (CRA) job", hg: "clinical research associate job", hi: "clinical research associate job",
    a: "get a clinical research associate job", ha: "clinical research job", asks: ["how-to", "income"], stages: ["final-year", "intern", "practitioner"] }),
  E("fellowship", { sig: ["research"], theme: "T03", sub: "Grants & funding", prio: 5, asks: ["eligibility"], stages: ["pg-aspirant", "practitioner"],
    custom: { en: ["Which research fellowships can BAMS or MD Ayurveda graduates apply for, and what is the eligibility?"], hg: ["BAMS ya MD ke baad research fellowship ki eligibility kya hai?"], hi: ["BAMS या MD के बाद research fellowship की eligibility क्या है?"] } }),
  E("medical-writing", { sig: [], theme: "T06", sub: "Scientific communication", prio: 4, asks: ["how-to", "income"], stages: ["intern", "practitioner"],
    n: "medical writing as a career", hg: "medical writing career", hi: "medical writing career", a: "start a career in medical writing", ha: "medical writing career start" }),
  E("content-creator", { sig: ["socialmedia"], theme: "T06", sub: "Digital presence", prio: 4, asks: ["legal", "income"], stages: ["intern", "practitioner"],
    n: "being an Ayurveda doctor on YouTube and social media", hg: "YouTube aur social media par Ayurveda doctor", hi: "YouTube और social media पर Ayurveda doctor" }),
  E("socialmedia-platform", { sig: ["socialmedia"], theme: "T06", sub: "Digital presence", prio: 3, asks: ["which one", "cost"], stages: ["practitioner"],
    n: "social media platform for my clinic", hg: "clinic ke liye social media platform", hi: "clinic के लिए social media platform" }),
  E("telemedicine", { sig: ["online"], theme: "T01", sub: "Records & clinical quality", prio: 6, n: "online (telemedicine) Ayurveda consultations", hg: "online consultation", hi: "online consultation",
    a: "start online Ayurveda consultations", ha: "online consultation start", asks: ["legal", "how-to"], stages: ["intern", "practitioner"] }),
  E("insurance", { sig: ["insurance"], theme: "T01", sub: "Records & clinical quality", prio: 4, n: "insurance (TPA) empanelment for an Ayurveda hospital", hg: "insurance empanelment", hi: "insurance empanelment",
    a: "get my Ayurveda hospital empanelled with insurance", ha: "insurance empanelment", asks: ["how-to", "eligibility"], stages: ["practitioner"] }),
  E("drug-inspector", { sig: ["government"], theme: "T10", sub: "Government service routes", prio: 5, n: "an AYUSH drug inspector government job", hg: "AYUSH drug inspector government job", hi: "AYUSH drug inspector सरकारी job",
    a: "become an AYUSH drug inspector in government service", ha: "government drug inspector banna", asks: ["eligibility", "how-to"], stages: ["intern", "practitioner"] }),
  E("defence-mo", { sig: ["medicalofficer"], theme: "T10", sub: "Government service routes", prio: 4, asks: ["is it possible"], stages: ["intern", "practitioner"],
    custom: { en: ["Can a BAMS doctor join the armed forces or railways as an AYUSH medical officer?"], hg: ["Kya BAMS doctor army ya railway mein AYUSH medical officer ban sakta hai?"], hi: ["क्या BAMS doctor army या railway में AYUSH medical officer बन सकता है?"] } }),
  E("corporate-wellness", { sig: [], theme: "T09", sub: "Careers in wellness resorts", prio: 3, asks: ["scope"], stages: ["practitioner"],
    custom: { en: ["What is the scope for Ayurveda doctors in corporate wellness programmes?"], hg: ["Corporate wellness mein Ayurveda doctor ka scope kya hai?"], hi: ["Corporate wellness में Ayurveda doctor का scope क्या है?"] } }),
  E("pk-course", { sig: ["panchakarma", "course"], theme: "T01", sub: "Panchakarma & therapy services", prio: 5, asks: ["which one"], stages: ["intern", "practitioner"],
    custom: { en: ["Which Panchakarma certificate course is worth doing after BAMS?"], hg: ["BAMS ke baad kaunsa Panchakarma certificate course karein?"], hi: ["BAMS के बाद कौन सा Panchakarma certificate course करें?"] } }),
  E("teach-abroad", { sig: ["abroad"], theme: "T08", sub: "Wellness centre roles abroad", prio: 4, asks: ["is it possible"], stages: ["practitioner"],
    custom: { en: ["Is it possible to teach Ayurveda courses abroad or online to international students?"], hg: ["Kya abroad ya online international students ko Ayurveda padha sakte hain?"], hi: ["क्या abroad या online international students को Ayurveda पढ़ा सकते हैं?"] } }),
  E("pg-abroad", { sig: ["pg", "abroad"], theme: "T08", sub: "Bridging qualifications", prio: 5, asks: ["is it possible"], stages: ["final-year", "intern"],
    custom: { en: ["Can I do a master's or PG abroad after BAMS?"], hg: ["Kya BAMS ke baad abroad se masters/PG kar sakte hain?"], hi: ["क्या BAMS के बाद abroad से masters/PG कर सकते हैं?"] } }),
  E("clinic-state", { sig: ["clinic"], theme: "T01", sub: "Setting up private practice", prio: 7, regions: STATES, asks: ["legal"], stages: ["intern", "practitioner"],
    custom: { en: ["What registrations and licences do I need to open an Ayurveda clinic in {R}?"], hg: ["{R} mein Ayurveda clinic kholne ke liye kaunse licence aur registration chahiye?"], hi: ["{R} में Ayurveda clinic खोलने के लिए कौन से licence और registration चाहिए?"] } }),
  E("registration-state", { sig: [], theme: "T01", sub: "Setting up private practice", prio: 7, regions: STATES, asks: ["legal"], stages: ["intern"],
    custom: { en: ["How do I register with the {R} state board of Indian medicine after my BAMS internship?"], hg: ["BAMS internship ke baad {R} state board mein registration kaise karein?"], hi: ["BAMS internship के बाद {R} state board में registration कैसे करें?"] } }),
  E("govt-jobs-state", { sig: ["government"], theme: "T10", sub: "Government service routes", prio: 7, regions: STATES, asks: ["how-to"], stages: ["intern", "practitioner"],
    custom: { en: ["What government Ayurveda jobs are open to BAMS graduates in {R}, and how do I apply?"], hg: ["{R} mein BAMS ke liye kaunse government jobs hain, apply kaise karein?"], hi: ["{R} में BAMS के लिए कौन से सरकारी jobs हैं, apply कैसे करें?"] } }),
  E("wellness-region", { sig: [], theme: "T08", sub: "Wellness centre roles abroad", prio: 5, regions: ["gulf", "eu", "usa", "uk"], asks: ["how-to"], stages: ["intern", "practitioner"],
    custom: { en: ["How do I find a job in an Ayurveda wellness centre in {R}?"], hg: ["{R} mein Ayurveda wellness centre job kaise milegi?"], hi: ["{R} में Ayurveda wellness centre job कैसे मिलेगी?"] } }),
];

// Extra asks on existing subjects (kept separate so the main table above stays readable).
const EXTRA_ASKS = {
  psc: ["cutoff", "timeline"], "abroad-country": ["eligibility", "cost"], pg: ["timeline", "income"],
  hospital: ["eligibility", "location"], "panchakarma-centre": ["location"], "research-career": ["eligibility"],
  ccras: ["resources"], phd: ["cost", "income", "timeline"], faculty: ["timeline"], mph: ["income", "which one", "how-to"],
  upsc: ["resources", "syllabus", "timeline"], gmp: ["legal"], manufacturing: ["location"], export: ["scope", "income", "eligibility"],
  yoga: ["how-to", "cost"], resort: ["location"], mvt: ["income", "eligibility"], "govt-mo": ["timeline", "cutoff"],
  "pharma-job": ["scope"], nam: ["timeline"], clinic: ["resources"],
};
for (const e of CATALOG) {
  if (EXTRA_ASKS[e.key]) e.asks = [...new Set([...e.asks, ...EXTRA_ASKS[e.key]])];
  if (/^branch-/.test(e.key)) e.asks = [...new Set([...e.asks, "cutoff"])];
}
