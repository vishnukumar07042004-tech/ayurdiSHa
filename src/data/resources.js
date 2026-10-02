/**
 * AYURDISHA Resources Data Architecture
 * Unified resources combining Podcast talks and Knowledge Pod guides.
 */

import { PODCASTS } from "../podcasts.js";
import { POD_KNOWLEDGE } from "../podKnowledge.js";

export function resourceSlug(resource) {
  if (!resource) return "";
  const nameSlug = String(resource.title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${resource.id}-${nameSlug}`;
}

export function resourcePublicPath(resource) {
  if (!resource) return "/resources";
  return `/resources/${resourceSlug(resource)}`;
}

export function getAllResources() {
  const podGuides = POD_KNOWLEDGE.map(p => ({
    id: `guide-${p.code.toLowerCase()}`,
    type: "guide",
    title: `${p.title} — Career & Clinical Guide`,
    category: "Career Guide",
    description: p.tagline,
    author: "AYURDISHA Knowledge Desk",
    trackCode: p.code,
    contentSections: p.sections,
    references: p.references,
    heroImage: p.heroImage,
    publishedDate: "2026-09-01",
  }));

  const podcasts = PODCASTS.map(pod => ({
    id: pod.id,
    type: "podcast",
    title: pod.title,
    category: "Podcast Talk",
    description: pod.description,
    author: pod.mentorName || "AYURDISHA Podcast",
    videoUrl: pod.videoUrl,
    thumbnail: pod.thumbnail,
    publishedDate: "2026-09-10",
  }));

  // Fallback sample podcast if array is empty so users see a realistic experience
  if (podcasts.length === 0) {
    podcasts.push({
      id: "talk-bams-orientation",
      type: "podcast",
      title: "Navigating Ayurveda Career Pathways After BAMS",
      category: "Podcast Talk",
      description: "An orientation podcast with veteran mentors discussing clinical practice, PG specialty selection, and research careers.",
      author: "AYURDISHA Meet the Mentors Session",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnail: "/assets/sections/hall-podcast-talk.webp",
      publishedDate: "2026-09-10",
    });
  }

  const combined = [...podGuides, ...podcasts].map(r => ({
    ...r,
    slug: resourceSlug(r),
    path: resourcePublicPath(r),
  }));

  return combined;
}

export function getResourceBySlug(slug) {
  if (!slug) return null;
  const clean = decodeURIComponent(slug).toLowerCase().trim();
  const resources = getAllResources();
  return resources.find(r => 
    r.slug.toLowerCase() === clean || 
    r.id.toLowerCase() === clean ||
    r.slug.startsWith(clean)
  ) || null;
}

export function getResourcesByCategory(category) {
  const all = getAllResources();
  if (!category || category === "All") return all;
  return all.filter(r => r.category.toLowerCase() === category.toLowerCase() || r.type === category.toLowerCase());
}

export default getAllResources;
