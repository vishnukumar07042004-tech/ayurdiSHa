/**
 * AYURDISHA mentor roster — Meet the Mentors · WAC 2026
 *
 * Names extracted from AYURMARG_WAC_2026 presentation slides 25–27
 * (“Tentative Mentors”). Blank numbered rows skipped; obvious duplicates
 * consolidated (Prof. Galib; Dr. Adarsh Sir / Dr. Adarsh → Dr. Adarsh).
 * Profiles filled where details are available; others remain name-only.
 */

export const MENTORS_META = {
  source: "WAC 2026 Tentative Mentors (slides 25–27)",
  extracted: true,
  count: 23,
};

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   designation: string,
 *   affiliation: string,
 *   expertise: string,
 *   bio: string,
 *   credentials?: string,
 *   experienceYears?: number,
 *   photo?: string,
 *   photoKind?: "portrait" | "document"
 * }} Mentor
 */

const emptyProfile = () => ({
  designation: "",
  affiliation: "",
  expertise: "",
  bio: "",
});

/**
 * Tentative mentor roster in slide order (deduplicated).
 * @type {Mentor[]}
 */
export const MENTORS = [
  {
    id: "m01",
    name: "Vd. Hiten Vaja",
    designation: "Chief Consultant & Director",
    affiliation: "Atrey Sashan Chikitsa Kendra, 408 Shilp-2, Income Tax Cross Road, Ahmedabad",
    expertise: "MD (Ayu.) Samhita",
    bio: "Chief Consultant and Director at Atrey Sashan Chikitsa Kendra, Ahmedabad, with an MD (Ayu.) in Samhita.",
  },
  { id: "m02", name: "Vaidya Tapan Vaidya", ...emptyProfile() },
  {
    id: "m03",
    name: "Prof. (Dr.) S.N. Gupta",
    designation: "Vice Chancellor",
    affiliation:
      "Maganbhai Adenwala Mahagujarat University, Nadiad, Gujarat; Distinguished Professor, PG Dept. of Kayacikitsa, J.S. Ayurveda College, Nadiad 387001",
    expertise: "Kayacikitsa",
    bio: "Vice Chancellor at Maganbhai Adenwala Mahagujarat University, Nadiad, and Distinguished Professor in the PG Department of Kayacikitsa at J.S. Ayurveda College, Nadiad.",
  },
  {
    id: "m04",
    name: "Prof. R.R. Dwivedi",
    designation: "Former Director, ITRA Jamnagar",
    affiliation: "Former Head, Samhita Siddhant, ITRA Jamnagar",
    expertise: "Samhita Siddhant",
    bio: "Former Director of ITRA Jamnagar and former Head of Samhita Siddhant at the institute.",
  },
  {
    id: "m05",
    name: "Dr. Galib",
    credentials: "MD (Ayu.), Ph.D.",
    designation: "Faculty, Dept. of Rasa Shastra & Bhaishajya Kalpana, AIIA",
    affiliation:
      "All India Institute of Ayurveda (AIIA); previously CCRAS New Delhi (2 yrs) and ITRA Jamnagar (9 yrs); WHO Collaborating Center Coordinator",
    expertise: "Rasa Shastra & Bhaishajya Kalpana",
    bio: "Faculty in Rasa Shastra & Bhaishajya Kalpana at AIIA since 2016, with prior service at CCRAS New Delhi and ITRA Jamnagar. WHO Collaborating Center Coordinator. About 200 publications, 1,954 citations (h-index 28, i10-index 38), one book, 50+ book chapters, and 200+ invited talks.",
  },
  {
    id: "m06",
    name: "Prof. Vaidya Kartar Singh Dhiman",
    credentials:
      "Ph.D. Ayurveda (Shalakya), Sampurnanand Sanskrit University, Varanasi; MD Ayurveda (Shalakya), Gujarat Ayurved University, Jamnagar",
    designation: "Vice Chancellor",
    affiliation: "Shri Krishna AYUSH University, Kurukshetra (Haryana)",
    expertise: "Ayurvedic ophthalmology (Shalakya); clinical sciences",
    bio: "Respected physician, scholar, researcher, and academic leader. Vice Chancellor at Shri Krishna AYUSH University, Kurukshetra, with a focus on Ayurvedic ophthalmology (Shalakya) and the clinical sciences.",
  },
  {
    id: "m07",
    name: "Prof. (Dr.) P. Hemantha Kumar",
    credentials: "M.S. (Ay.), Ph.D.",
    designation: "Pro-Vice Chancellor; Professor & Head, Dept. of Shalya Tantra",
    affiliation: "National Institute of Ayurveda (Deemed to be University), Jaipur",
    expertise: "Shalya Tantra (Ayurveda Surgery)",
    bio: "Pro-Vice Chancellor and Professor & Head of the Department of Shalya Tantra at the National Institute of Ayurveda (Deemed to be University), Jaipur.",
  },
  {
    id: "m08",
    name: "Dr. Tukaram S. Dudhamal",
    credentials: "M.S. (Ayu.), Ph.D. (Ayu.)",
    designation: "Associate Professor & I/C Head, Dept. of Shalya Tantra",
    affiliation:
      "Institute of Teaching & Research in Ayurveda (Institute of National Importance), Ministry of AYUSH, Govt. of India, Jamnagar, Gujarat 361008",
    expertise: "Shalya Tantra",
    bio: "Associate Professor and In-Charge Head of Shalya Tantra at ITRA (Institute of National Importance), Jamnagar, under the Ministry of AYUSH.",
  },
  {
    id: "m09",
    name: "Prof. Vaidya Rabinarayan Acharya",
    credentials: "B.Sc. Botany; BAMS; MD, PhD, DSc Ayurveda; PG Diploma in Bioethics",
    designation: "Director General, CCRAS, Ministry of AYUSH, Govt. of India",
    affiliation:
      "Central Council for Research in Ayurvedic Sciences (CCRAS); alumnus of Utkal University and Gujarat Ayurveda University",
    expertise: "Plant sciences; Ayurvedic pharmacology; biomedical ethics",
    bio: "Director General of the Central Council for Research in Ayurvedic Sciences (CCRAS), Ministry of AYUSH, Government of India. An alumnus of Utkal University and Gujarat Ayurveda University, with work spanning plant sciences, Ayurvedic pharmacology, and biomedical ethics.",
  },
  {
    id: "m10",
    name: "Dr. Adarsh",
    designation: "Assistant Director (Ayurveda)",
    affiliation: "Central Council for Research in Ayurvedic Sciences (CCRAS)",
    expertise: "",
    bio: "",
  },
  { id: "m11", name: "Prof. Huddar", ...emptyProfile() },
  { id: "m12", name: "Dr. Sanjay Khedekar", ...emptyProfile() },
  {
    id: "m13",
    name: "Dr. Bharti",
    designation: "Director",
    affiliation:
      "Central Ayurveda Research Institute (CARI), New Delhi (CCRAS); 61-65, opp. D Block, Janakpuri Institutional Area, Janakpuri, New Delhi 110058",
    expertise: "",
    bio: "",
  },
  {
    id: "m14",
    name: "Prof. Shri Krishna Khandal",
    designation: "Former Head, Roga Nidana (Disease Diagnosis and Pathology)",
    affiliation: "National Institute of Ayurveda, Jaipur",
    expertise: "Roga Nidana",
    bio: "Consultant physician, academician, author, researcher, and mentor with more than 40 years in Ayurveda worldwide. Former Head of Roga Nidana at the National Institute of Ayurveda, Jaipur.",
  },
  {
    id: "m15",
    name: "Prof. (Dr.) Hari Mohan Chandola",
    credentials:
      "BAMS (Gurukul Kangri Ayurvedic College, Haridwar); MD (Ay); PhD Ayurveda; Diploma in Yoga; PGD Indian Philosophy and Religion (BHU)",
    designation: "Director-Principal; Professor & Head — Kayachikitsa & Roga Nidana Vikriti Vijnana",
    affiliation: "Ch. Brahm Prakash Ayurved Charak Sansthan",
    expertise: "Kayachikitsa; Roga Nidana Vikriti Vijnana",
    bio: "",
  },
  { id: "m16", name: "Prof. Nishteshwar", ...emptyProfile() },
  {
    id: "m17",
    name: "Prof. Sanjeev Sharma",
    credentials: "MD, Gujarat Ayurveda University, Jamnagar; PhD, National Institute of Ayurveda, Jaipur",
    designation: "Vice-Chancellor",
    affiliation: "National Institute of Ayurveda (NIA), Jaipur",
    expertise: "Evidence-based Ayurveda; surgery and orthopedics",
    bio: "Vice-Chancellor of the National Institute of Ayurveda, Jaipur, with more than 30 years of work in evidence-based Ayurveda, surgery and orthopedics, and the global integration of traditional medicine.",
  },
  {
    id: "m18",
    name: "Prof. Nisha Kumari Ojha",
    credentials:
      "BAMS (Dr. Bhimrao Ambedkar University, Muzaffarpur, 2003); MD/MS Kaumarbhritya (Rajasthan Ayurveda University, Jodhpur, 2007); Ph.D. Kaumarbhritya (2014); B.Sc. Botany, Zoology, Chemistry (Allahabad University, 2004)",
    designation: "",
    affiliation: "",
    expertise: "Kaumarbhritya",
    bio: "",
  },
  {
    id: "m19",
    name: "Dr. Dinesh K.S.",
    credentials: "MD (Ay), PhD",
    designation: "Professor and Head, Department of Kaumarabhritya",
    affiliation: "Vaidyaratnam P.S. Varier Ayurveda College, Kottakkal, Kerala, India",
    expertise: "Kaumarabhritya",
    bio: "Professor and Head of the Department of Kaumarabhritya at Vaidyaratnam P.S. Varier Ayurveda College, Kottakkal. MD (Ay) and PhD, with scholarly work in Ayurvedic pediatrics for BAMS education.",
    photo: "/mentors/dinesh-ks.jpg",
    photoKind: "document",
  },
  {
    id: "m20",
    name: "Vd. Dhanraj Gahukar",
    designation: "",
    affiliation: "Samdhan Ayurved Panchkarma Hospital & Research Centre",
    expertise: "",
    bio: "",
  },
  {
    id: "m21",
    name: "Vaidya Samir Jamadagni",
    designation: "",
    affiliation: "Pune, Maharashtra",
    expertise: "Nadi Pariksha; Panchakarma",
    bio: "Ayurvedic physician in Pune, Maharashtra, practising traditional pulse diagnosis (Nadi Pariksha) and Panchakarma, with a clinical focus on chronic and complex disorders.",
  },
  {
    id: "m22",
    name: "Dr. Pradnya Akkalkotkar",
    credentials: "MD (Ayu)",
    designation: "",
    affiliation: "",
    expertise: "Agnikarma; Viddhakarma",
    bio: "",
  },
  {
    id: "m23",
    name: "Dr. P. Rammanohar (Rammanohar Puthiyedath)",
    designation: "Research Director and Professor of Dravyaguna",
    affiliation:
      "Amrita School of Ayurved; Professor and Research Director, Amrita Centre for Advanced Research in Ayurveda (ĀCĀRA), Amrita Vishwa Vidyapeetham, Kerala",
    expertise: "Dravyaguna",
    bio: "Research Director and Professor of Dravyaguna at Amrita School of Ayurved and the Amrita Centre for Advanced Research in Ayurveda (ĀCĀRA), Amrita Vishwa Vidyapeetham, Kerala. Served on the three-member WHO committee that drafted international standard terminologies for Ayurveda included in ICD-11.",
  },
];

const HONORIFICS = new Set([
  "vaidya",
  "prof",
  "prof.",
  "dr",
  "dr.",
  "vd",
  "vd.",
  "shri",
  "smt",
]);

/** Significant name tokens (honorifics stripped). */
export function mentorNameParts(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter(p => {
      const key = p.toLowerCase().replace(/[(),]/g, "");
      return !HONORIFICS.has(key);
    });
}

/** Mentors with a real display name (non-empty after trim). */
export function mentorsWithNames(list = MENTORS) {
  return list.filter(m => String(m.name || "").trim());
}

export function mentorInitials(name) {
  const parts = mentorNameParts(name);
  if (!parts.length) return "?";
  const clean = p => p.replace(/\./g, "");
  if (parts.length === 1) return clean(parts[0]).slice(0, 2).toUpperCase();
  return (clean(parts[0])[0] + clean(parts[parts.length - 1])[0]).toUpperCase();
}

function mentorPhotoUrl(m) {
  return String(m?.photo || "").trim();
}

function mentorPhotoKind(m) {
  const kind = String(m?.photoKind || "portrait").toLowerCase();
  return kind === "document" ? "document" : "portrait";
}

/** Circular avatar image; empty when the photo is a document/credential scan. */
export function mentorPortraitUrl(m) {
  const url = mentorPhotoUrl(m);
  if (!url || mentorPhotoKind(m) === "document") return "";
  return url;
}

/** Credential/document figure for the profile page (not used as a face avatar). */
export function mentorDocumentPhotoUrl(m) {
  const url = mentorPhotoUrl(m);
  if (!url || mentorPhotoKind(m) !== "document") return "";
  return url;
}

export function mentorField(value, fallback = "Details coming soon") {
  const v = String(value || "").trim();
  return v || fallback;
}

/** True when the mentor has any filled profile fields. */
export function mentorHasProfile(m) {
  return Boolean(
    String(m?.designation || "").trim() ||
      String(m?.affiliation || "").trim() ||
      String(m?.expertise || "").trim() ||
      String(m?.bio || "").trim() ||
      String(m?.credentials || "").trim()
  );
}

/** Verification badge only when designation or bio is actually filled. */
export function mentorIsVerified(m) {
  return Boolean(String(m?.designation || "").trim() || String(m?.bio || "").trim());
}

export function getMentorById(id) {
  const key = decodeURIComponent(String(id || "")).trim();
  return MENTORS.find(m => m.id === key) || null;
}

/** URL slug from a mentor’s name (honorifics stripped). */
export function mentorSlug(m) {
  const fromName = mentorNameParts(m?.name)
    .map(p => p.replace(/[()]/g, ""))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return fromName || String(m?.id || "mentor");
}

const SLUG_INDEX = (() => {
  const used = new Map();
  const bySlug = new Map();
  for (const m of MENTORS) {
    let slug = mentorSlug(m);
    if (used.has(slug)) slug = `${slug}-${m.id}`;
    used.set(slug, m.id);
    bySlug.set(slug, m);
    bySlug.set(m.id, m);
  }
  return bySlug;
})();

/** Resolve a roster row from `/mentors/:id` or `/mentors/:slug`. */
export function getMentorByParam(param) {
  const key = decodeURIComponent(String(param || "")).trim();
  if (!key) return null;
  return SLUG_INDEX.get(key) || SLUG_INDEX.get(key.toLowerCase()) || getMentorById(key);
}

/** Canonical public path for a mentor (name slug; falls back to id). */
export function mentorPublicPath(m) {
  if (!m) return "/mentors";
  const slug = mentorSlug(m);
  const owner = SLUG_INDEX.get(slug);
  const safe = owner && owner.id !== m.id ? `${slug}-${m.id}` : slug;
  return `/mentors/${encodeURIComponent(safe)}`;
}

export function mentorAffiliationSnippet(affiliation, max = 88) {
  const s = String(affiliation || "").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

