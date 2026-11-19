/**
 * Scripted replies for triaged questions (docs/ai/QUESTION-TRIAGE-SPEC.md §5). Every reply is
 * reviewed by an official before a student sees it. Templates hold no fees, dates, cut-offs or
 * rules; the only fixed facts are the verified helpline numbers and official URLs below.
 * Shape matches a grounded draft: answer, actions[3], mistake, resources[≤2].
 */

import { THEME_EXAMPLES, themeByName } from "../../shared/triageRules.js";

/** Verified 29 Oct 2026 on telemanas.mohfw.gov.in (Ministry of Health & Family Welfare). */
export const HELPLINES = Object.freeze({ teleManas: "14416", teleManasAlt: "1-800-891-4416", emergency: "112" });

const R = {
  desk: { title: "AYURDISHA Ask Desk — ask one career question", url: "https://ayushmarg.vercel.app/ask" },
  track: { title: "Track my answer", url: "https://ayushmarg.vercel.app/track-answer" },
  teleManas: { title: "Tele-MANAS — 14416 or 1-800-891-4416 (free, 24×7)", url: "https://telemanas.mohfw.gov.in/home" },
  ncism: { title: "NCISM — National Commission for Indian System of Medicine", url: "https://ncismindia.org" },
};

const SCOPE_EN = "PG and entrances, clinical practice, research, teaching, government jobs, industry, start-ups and working abroad";
const SCOPE_HI = "PG aur entrance, clinical practice, research, teaching, sarkari naukri, industry, start-up aur abroad practice";

/**
 * Template table: key = CATEGORY or RESTRICTED:SUBTYPE; value per language. `{examples}` is a
 * bulleted pair of well-formed questions for the student's theme; `{ticket}` the linked ticket.
 */
const T = {
  OFF_TOPIC: {
    en: {
      answer: `Thanks for writing in! This desk is the Meet the Mentors hall for anyone building a career in Ayurveda, so our mentors can only help with Ayurveda and AYUSH careers — ${SCOPE_EN}. Your question is outside that, so we would rather not guess at an answer.\n\nIf there is a career decision on your mind, please ask it and a mentor will answer it properly. For example:\n{examples}`,
      actions: ["Pick the career decision you most want help with right now", "Write it as one specific question, with your stage (student, intern, graduate)", "Send it from the Ask Desk under the closest theme"],
      mistake: "Sending general or personal questions here — the mentors can only add value on Ayurveda career choices.",
      resources: [R.desk],
    },
    hinglish: {
      answer: `Message ke liye shukriya! Yeh desk Ayurveda me career banane wale sabhi logon ke liye Meet the Mentors hall hai, isliye mentors sirf Ayurveda / AYUSH career par madad kar sakte hain — ${SCOPE_HI}. Aapka sawaal is daayre se bahar hai, isliye hum andaaza nahi lagana chahte.\n\nAgar career ko lekar koi decision hai, toh woh poochiye — mentor theek se jawab denge. Jaise:\n{examples}`,
      actions: ["Abhi jis career decision par sabse zyada madad chahiye, use chuniye", "Use ek specific sawaal ke roop me likhiye, apne stage ke saath (student, intern, graduate)", "Ask Desk par sabse kareebi theme me bhejiye"],
      mistake: "Yahan general ya personal sawaal bhejna — mentors sirf Ayurveda career choices par madad kar sakte hain.",
      resources: [R.desk],
    },
  },
  UNFOCUSED: {
    en: {
      answer: `Happy to help — your question is quite broad, so a mentor can't give you something useful yet. In short: most Ayurveda careers branch into PG (MD/MS), clinical practice, government service, research, teaching, industry or work abroad, and the right path depends on your stage, what you enjoy and your constraints.\n\nTo get a focused answer, tell us three things: (1) your stage — student, intern or graduate; (2) the two or three options you are weighing; (3) the decision you want to make in the next 90 days. Questions like these get the best answers:\n{examples}`,
      actions: ["Write down your stage and the options you are choosing between", "Ask a new question on the Ask Desk with that detail, and mention {ticketRef}", "Pick the theme that matches the option you are most unsure about"],
      mistake: "Asking for 'everything about careers' — one specific decision gets a far more useful answer.",
      resources: [R.desk],
    },
    hinglish: {
      answer: `Madad zaroor karenge — aapka sawaal kaafi broad hai, isliye mentor abhi kuch kaam ka nahi bata paayenge. Short me: zyada tar Ayurveda careers PG (MD/MS), clinical practice, sarkari naukri, research, teaching, industry ya abroad me jaate hain, aur sahi raasta aapke stage, pasand aur situation par depend karta hai.\n\nFocused jawab ke liye teen cheezein bataiye: (1) aapka stage — student, intern ya graduate; (2) kaun se do-teen options soch rahe hain; (3) agle 90 din me kya decide karna hai. Aise sawaal ka sabse achha jawab milta hai:\n{examples}`,
      actions: ["Apna stage aur jin options me confusion hai, likh lijiye", "Ask Desk par yeh detail ke saath naya sawaal bhejiye, aur {ticketRef} mention kijiye", "Jis option par sabse zyada doubt hai, usi ki theme chuniye"],
      mistake: "'Career ke baare me sab kuch' poochna — ek specific decision ka jawab kahin zyada kaam aata hai.",
      resources: [R.desk],
    },
  },
  DUPLICATE: {
    en: {
      answer: "Thank you — it looks like you have already asked this on ticket {ticket}, so we have linked the two. A mentor will answer it once, on that ticket, and you will get a note when it is ready. If something has changed since you asked, add the new detail as a fresh question and mention {ticket}.",
      actions: ["Keep ticket {ticket} handy", "Check Track my answer with that ticket", "Ask again only if your situation has changed, and mention the ticket"],
      mistake: "Sending the same question many times — it does not speed things up and can delay the answer.",
      resources: [R.track],
    },
    hinglish: {
      answer: "Shukriya — lagta hai aap yeh sawaal ticket {ticket} par pehle hi pooch chuke hain, isliye humne dono ko jod diya hai. Mentor ek hi baar, usi ticket par jawab denge aur tayyar hone par aapko note mil jayega. Agar tab se kuch badla hai, toh nayi detail ke saath naya sawaal bhejiye aur {ticket} mention kijiye.",
      actions: ["Ticket {ticket} sambhal kar rakhiye", "Track my answer par woh ticket check kijiye", "Situation badli ho tabhi dobara poochiye, ticket mention karke"],
      mistake: "Ek hi sawaal baar-baar bhejna — isse jawab jaldi nahi aata, ulta der ho sakti hai.",
      resources: [R.track],
    },
  },
  "RESTRICTED:MEDICAL": {
    en: {
      answer: "We are sorry to hear about the health concern. Mentors at this desk guide careers, so they cannot advise on a diagnosis, a medicine, a dose or a treatment plan — that needs a qualified, registered physician who can examine the patient in person and follow up safely.\n\nPlease consult a registered Ayurveda physician or your family doctor, and seek urgent care if symptoms are severe or getting worse. If your question has a career side — for example, building a practice in this area — ask that as a career question and a mentor will gladly help.",
      actions: ["Book an in-person consultation with a registered physician", "Take previous reports and the list of current medicines to that visit", "If you meant a career question, ask it again framed around your career"],
      mistake: "Starting or changing a medicine or dose based on advice from someone who has not examined the patient.",
      resources: [R.ncism],
    },
    hinglish: {
      answer: "Health problem ke baare me sunkar afsos hua. Is desk ke mentors career guide karte hain, isliye diagnosis, dawai, dose ya treatment par salah nahi de sakte — iske liye qualified, registered physician chahiye jo patient ko khud dekh kar safely follow-up kar sake.\n\nKripya kisi registered Ayurveda physician ya family doctor se miliye, aur symptoms zyada ho ya badh rahe ho toh turant medical help lijiye. Agar aapke sawaal ka career wala hissa hai — jaise is field me practice banana — toh use career sawaal ke roop me poochiye, mentor zaroor madad karenge.",
      actions: ["Registered physician se in-person consultation book kijiye", "Purani reports aur abhi chal rahi dawaiyon ki list saath le jaiye", "Agar career sawaal tha, toh use career ke angle se dobara poochiye"],
      mistake: "Bina patient ko dekhe kisi ki salah par dawai ya dose shuru ya badalna.",
      resources: [R.ncism],
    },
  },
  "RESTRICTED:LEGAL_FINANCIAL": {
    en: {
      answer: "Thanks for trusting us with this. Mentors here can share career guidance, but they cannot give specific legal, tax or investment advice for your personal situation — the details matter too much, and a wrong steer could cost you.\n\nFor a dispute or a legal step, speak to a qualified lawyer; for tax or investments, a chartered accountant or a registered financial adviser. If your college or an institution is involved, its written grievance process is usually the first step. If there is a career decision behind this, ask it here and a mentor will help.",
      actions: ["Write down the facts, dates and documents you have", "Consult a qualified lawyer or chartered accountant as appropriate", "Use the institution's written grievance process where one applies"],
      mistake: "Acting on informal legal or money advice without someone who can read your documents.",
      resources: [R.desk],
    },
    hinglish: {
      answer: "Humse yeh share karne ke liye shukriya. Mentors career guidance de sakte hain, lekin aapki personal situation ke liye specific legal, tax ya investment salah nahi de sakte — details bahut maayne rakhti hain aur galat salah nuksaan kar sakti hai.\n\nKisi dispute ya legal kadam ke liye qualified vakil se baat kijiye; tax ya investment ke liye chartered accountant ya registered financial adviser se. Agar college ya koi institution involved hai, toh pehle unka written grievance process use kijiye. Agar iske peeche koi career decision hai, toh woh yahan poochiye.",
      actions: ["Facts, dates aur documents ek jagah likh lijiye", "Zaroorat ke hisaab se vakil ya CA se consult kijiye", "Institution ka written grievance process use kijiye"],
      mistake: "Bina documents dekhe di gayi informal legal ya paise ki salah par kadam uthana.",
      resources: [R.desk],
    },
  },
  "RESTRICTED:EXAM_INTEGRITY": {
    en: {
      answer: "We understand exam pressure can feel overwhelming, but we cannot help with leaked papers, proxies, cheating or certificates for work that was not done. Beyond being unfair to others, these can lead to cancelled results, debarment and problems with registration later — a risk no career is worth.\n\nWhat we can do is help you prepare well. Tell us your exam, how much time you have and where you feel stuck, and a mentor will suggest a realistic plan.",
      actions: ["Note your exam, the time left and your weakest areas", "Ask the Ask Desk for a preparation plan with those details", "Use only official notices and genuine study material"],
      mistake: "Trusting anyone who offers 'leaked' papers or certificates — these are often scams and can end a career.",
      resources: [R.desk],
    },
    hinglish: {
      answer: "Hum samajhte hain ki exam ka pressure bahut bhaari lag sakta hai, lekin leaked paper, proxy, nakal ya bina kaam kiye certificate me hum madad nahi kar sakte. Yeh doosron ke saath na-insaafi hai, aur isse result cancel, debar aur aage registration me dikkat ho sakti hai — koi bhi career is risk ke laayak nahi.\n\nHum achhi taiyari me zaroor madad kar sakte hain. Apna exam, bacha hua samay aur kahan atak rahe hain, bataiye — mentor ek realistic plan suggest karenge.",
      actions: ["Apna exam, bacha samay aur weak topics note kijiye", "In details ke saath Ask Desk par preparation plan poochiye", "Sirf official notices aur genuine study material use kijiye"],
      mistake: "'Leaked' paper ya certificate dene walon par bharosa karna — aksar yeh scam hote hain aur career khatam kar sakte hain.",
      resources: [R.desk],
    },
  },
  "RESTRICTED:UNSAFE_ILLEGAL": {
    en: {
      answer: "We can't help with this one — it could put patients at risk and expose you to serious legal consequences. Practising, prescribing or selling medicines is regulated precisely so that patients are protected, and shortcuts here can end a career.\n\nThe good news is that the legitimate route is usually clearer than it looks. If you tell us what you are trying to achieve — start a practice, launch a product, get registered — a mentor will walk you through the proper steps.",
      actions: ["Write down the goal you are trying to reach", "Ask the Ask Desk how to reach it through the proper route", "Check registration and licensing requirements with the official regulator"],
      mistake: "Assuming a shortcut will go unnoticed — regulatory action usually follows, and patients can be harmed.",
      resources: [R.ncism],
    },
    hinglish: {
      answer: "Is mamle me hum madad nahi kar sakte — isse patients ko khatra ho sakta hai aur aap par gambhir legal karyavahi ho sakti hai. Practice, prescription aur dawai bechne ke niyam isi liye hain ki patients surakshit rahein, aur yahan shortcut career khatam kar sakta hai.\n\nAchhi baat yeh hai ki sahi raasta aksar dikhne se aasaan hota hai. Aap kya karna chahte hain — practice shuru karna, product launch karna, registration — bataiye, mentor sahi steps samjhayenge.",
      actions: ["Aap kya achieve karna chahte hain, likh lijiye", "Ask Desk par uska sahi tareeka poochiye", "Registration aur licence ki requirements official regulator se check kijiye"],
      mistake: "Yeh sochna ki shortcut kisi ko pata nahi chalega — aksar action hota hai aur patients ko nuksaan ho sakta hai.",
      resources: [R.ncism],
    },
  },
  "RESTRICTED:PERSONAL_DATA": {
    en: {
      answer: "Thanks for asking. We can't share anyone's personal contact details, marks or other private information — mentors and students share their details with us in confidence, and we protect yours the same way.\n\nIf you would like to meet a mentor, the best route is the Meet the Mentors hall itself and the sessions listed by the organisers; and if you have a career question for a mentor, ask it here and it will reach them.",
      actions: ["Ask your career question on the Ask Desk — it reaches the mentors", "Use the official sessions to meet mentors in person", "Contact institutions only through their official channels"],
      mistake: "Trying to reach mentors or classmates through private details — it is rarely welcome and can breach privacy rules.",
      resources: [R.desk],
    },
    hinglish: {
      answer: "Poochne ke liye shukriya. Hum kisi ka personal contact, marks ya doosri private jaankari share nahi kar sakte — mentors aur students apni details humein bharose me dete hain, aur hum aapki details bhi isi tarah surakshit rakhte hain.\n\nMentor se milna ho toh Meet the Mentors hall aur organisers ke official sessions sabse achha raasta hai; aur mentor ke liye career sawaal ho toh yahan poochiye, woh unhe mil jayega.",
      actions: ["Apna career sawaal Ask Desk par poochiye — woh mentors tak pahunchta hai", "Mentors se milne ke liye official sessions use kijiye", "Institutions se sirf official channels se sampark kijiye"],
      mistake: "Private details se mentors ya classmates tak pahunchne ki koshish — yeh privacy ke khilaf hai.",
      resources: [R.desk],
    },
  },
  "RESTRICTED:ABUSIVE": {
    en: {
      answer: "We hear that you are frustrated, and we're sorry if the desk has let you down. We do ask everyone to keep messages respectful — the mentors here volunteer their time for students.\n\nIf you are waiting on an earlier question, you can check it on Track my answer with your ticket. And if there is a career question we can help with, please send it and a mentor will look at it.",
      actions: ["Check any earlier question on Track my answer", "Send your career question in a few clear lines", "Tell us calmly what went wrong if the desk missed something"],
      mistake: "Letting frustration drown out the question — a clear, calm question gets answered fastest.",
      resources: [R.track],
    },
    hinglish: {
      answer: "Hum samajh sakte hain ki aap pareshaan hain, aur agar desk se kahin chook hui ho toh maafi chahte hain. Hum sabse respectful messages ki request karte hain — yahan ke mentors students ke liye apna samay dete hain.\n\nAgar pehle ke sawaal ka intezaar hai, toh ticket se Track my answer par check kijiye. Aur koi career sawaal ho toh bhejiye, mentor zaroor dekhenge.",
      actions: ["Pehle ka sawaal Track my answer par check kijiye", "Apna career sawaal kuch saaf lines me bhejiye", "Desk se kya chhoota, shaanti se bataiye"],
      mistake: "Gusse me sawaal kho jaana — saaf aur shaant sawaal ka jawab sabse jaldi aata hai.",
      resources: [R.track],
    },
  },
  "RESTRICTED:SELF_HARM": {
    en: {
      answer: `Thank you for telling us — that sounds really heavy, and you don't have to carry it alone. Please talk to someone right now: Tele-MANAS is free and confidential, 24×7, at ${HELPLINES.teleManas} or ${HELPLINES.teleManasAlt}. If you are in immediate danger, call ${HELPLINES.emergency} or go to the nearest hospital, and if you can, tell a friend or family member you trust.\n\nAn exam result or a hard year is not the end of a career — many mentors here took more than one attempt or changed paths and did well. When you feel ready, we would be glad to help you plan the next step, one small step at a time.`,
      actions: [`Call Tele-MANAS on ${HELPLINES.teleManas} (free, 24×7) today`, "Tell one person you trust how you are feeling", "When you are ready, ask the desk for help planning one next step"],
      mistake: "Waiting until things feel unbearable before talking to someone — reaching out early helps.",
      resources: [R.teleManas],
    },
    hinglish: {
      answer: `Humein batane ke liye shukriya — yeh sach me bahut bhaari lag raha hoga, aur aapko yeh akele nahi uthana hai. Kripya abhi kisi se baat kijiye: Tele-MANAS free aur confidential hai, 24×7, ${HELPLINES.teleManas} ya ${HELPLINES.teleManasAlt} par. Agar aap turant khatre me hain, toh ${HELPLINES.emergency} par call kijiye ya nazdeeki hospital jaiye, aur ho sake toh kisi bharosemand dost ya ghar wale ko bataiye.\n\nEk exam result ya mushkil saal career ka ant nahi hai — yahan ke kai mentors ne ek se zyada attempt diye ya raasta badla aur aage badhe. Jab aap taiyaar hon, hum agla kadam plan karne me khushi se madad karenge, ek-ek chhota kadam.`,
      actions: [`Aaj hi Tele-MANAS ${HELPLINES.teleManas} par call kijiye (free, 24×7)`, "Kisi ek bharosemand insaan ko apni feeling bataiye", "Jab taiyaar hon, agla ek kadam plan karne ke liye desk se poochiye"],
      mistake: "Bahut zyada bhaari lagne tak intezaar karna — jaldi baat karna madad karta hai.",
      resources: [R.teleManas],
    },
    hi: {
      answer: `हमें बताने के लिए धन्यवाद — यह सच में बहुत भारी लग रहा होगा, और आपको इसे अकेले नहीं उठाना है। कृपया अभी किसी से बात कीजिए: टेली-मानस (Tele-MANAS) मुफ़्त और गोपनीय है, 24×7, ${HELPLINES.teleManas} या ${HELPLINES.teleManasAlt} पर। अगर आप तुरंत ख़तरे में हैं, तो ${HELPLINES.emergency} पर कॉल कीजिए या नज़दीकी अस्पताल जाइए, और हो सके तो किसी भरोसेमंद दोस्त या परिवार वाले को बताइए।\n\nएक परीक्षा का परिणाम या मुश्किल साल करियर का अंत नहीं है — यहाँ के कई मेंटर्स ने एक से ज़्यादा प्रयास किए या रास्ता बदला और आगे बढ़े। जब आप तैयार हों, हम अगला कदम तय करने में ख़ुशी से मदद करेंगे।`,
      actions: [`आज ही टेली-मानस ${HELPLINES.teleManas} पर कॉल कीजिए (मुफ़्त, 24×7)`, "किसी एक भरोसेमंद व्यक्ति को अपनी भावना बताइए", "जब तैयार हों, अगला एक कदम तय करने के लिए डेस्क से पूछिए"],
      mistake: "बहुत ज़्यादा भारी लगने तक इंतज़ार करना — जल्दी बात करना मदद करता है।",
      resources: [R.teleManas],
    },
  },
  "RESTRICTED:PROMOTIONAL": {
    en: {
      answer: "Thanks for your message. The Ask Desk carries students' career questions only, so we can't share promotions, courses, channels or offers here.\n\nIf you have a career question of your own, please send it and a mentor will answer it.",
      actions: ["Send your own career question if you have one", "Use official event channels for any exhibitor or partner enquiries", "Keep personal contact details out of questions"],
      mistake: "Using the question desk for promotion — such messages are not shown to mentors.",
      resources: [R.desk],
    },
    hinglish: {
      answer: "Message ke liye shukriya. Ask Desk par sirf students ke career sawaal liye jaate hain, isliye hum yahan promotions, courses, channels ya offers share nahi kar sakte.\n\nAgar aapka apna career sawaal hai, toh bhejiye — mentor jawab denge.",
      actions: ["Apna career sawaal ho toh bhejiye", "Exhibitor ya partner enquiry ke liye official event channels use kijiye", "Sawaal me personal contact details mat daaliye"],
      mistake: "Question desk ko promotion ke liye use karna — aise messages mentors ko nahi dikhaye jaate.",
      resources: [R.desk],
    },
  },
  "RESTRICTED:PROMPT_INJECTION": {
    en: {
      answer: "Thanks for your message. This desk only answers Ayurveda career questions, and it can't change how it works or share its internal instructions.\n\nIf you have a career question — about PG, practice, research, jobs or working abroad — please send just that question and a mentor will answer it.",
      actions: ["Send only your career question, in plain words", "Add your stage (student, intern, graduate) for a sharper answer", "Pick the theme closest to your question"],
      mistake: "Mixing instructions into a question — it only delays the answer you need.",
      resources: [R.desk],
    },
    hinglish: {
      answer: "Message ke liye shukriya. Yeh desk sirf Ayurveda career sawaalon ka jawab deta hai, aur apna tareeka badal ya andar ke instructions share nahi kar sakta.\n\nAgar career sawaal hai — PG, practice, research, naukri ya abroad ke baare me — toh sirf woh sawaal bhejiye, mentor jawab denge.",
      actions: ["Sirf apna career sawaal saaf shabdon me bhejiye", "Behtar jawab ke liye apna stage (student, intern, graduate) likhiye", "Sawaal ke sabse kareeb wali theme chuniye"],
      mistake: "Sawaal me instructions milana — isse sirf jawab me der hoti hai.",
      resources: [R.desk],
    },
  },
};

/** Template ids the pipeline can produce (tests check every one renders). */
export const TEMPLATE_IDS = Object.freeze(Object.keys(T));

export function templateIdFor(category, subtype = "") {
  if (category === "RESTRICTED") return `RESTRICTED:${subtype || "MEDICAL"}`;
  return category;
}

function examplesFor(theme) {
  const code = (themeByName(theme) || {}).code || "any";
  const list = (THEME_EXAMPLES[code] || THEME_EXAMPLES.any).slice(0, 2);
  return list.map(x => `• “${x}”`).join("\n");
}

function fill(s, vars) {
  return String(s || "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/**
 * Build the scripted reply.
 * @param {{category:string, subtype?:string, lang?:string}} triage
 * @param {{theme?:string, ticket?:string}} ctx
 * @returns {{answer:string, actions:string[], mistake:string, resources:{title:string,url:string}[], templateId:string, lang:string}}
 */
export function scriptedReply(triage, ctx = {}) {
  const templateId = templateIdFor(triage.category, triage.subtype);
  const byLang = T[templateId] || T.OFF_TOPIC;
  let lang = triage.lang || "en";
  if (!byLang[lang]) lang = lang === "hi" && byLang.hinglish ? "hinglish" : "en";
  const t = byLang[lang];
  const ticket = String(ctx.ticket || "").trim();
  const en = lang === "en";
  const vars = {
    examples: examplesFor(ctx.theme),
    ticket: ticket || (en ? "your earlier ticket" : "pichhla ticket"),
    ticketRef: ticket ? `ticket ${ticket}` : (en ? "your ticket number" : "apna ticket number"),
  };
  return {
    answer: fill(t.answer, vars),
    actions: t.actions.map(a => fill(a, vars)).slice(0, 3),
    mistake: fill(t.mistake, vars),
    resources: t.resources.slice(0, 2).map(r => ({ ...r })),
    templateId,
    lang,
  };
}
