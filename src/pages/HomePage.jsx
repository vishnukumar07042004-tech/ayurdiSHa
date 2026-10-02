import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MENTORS, mentorsWithNames } from "../mentors.js";
import { getAllPrograms } from "../data/programs.js";
import { setPageMeta } from "../siteMeta.js";
import { observeScrollReveal } from "../scrollReveal.js";
import { useParallax } from "../components/editorial/motion.js";
import { scrollToSection } from "../AppHeader.jsx";
import HomeHero from "./home/HomeHero.jsx";
import { HomeIdea, HomeStats } from "./home/HomeStory.jsx";
import HomeMentors from "./home/HomeMentors.jsx";
import HomeHowItWorks from "./home/HomeHowItWorks.jsx";
import HomePathways from "./home/HomePathways.jsx";
import { HomePhotoBand, HomeQuote, HomeFinalCta } from "./home/HomeInterludes.jsx";
import { HomeWac, HomeTimeline } from "./home/HomeWac.jsx";
import HomeCollage from "./home/HomeCollage.jsx";

const MENTOR_COUNT = mentorsWithNames(MENTORS).length;
const TRACK_COUNT = getAllPrograms().length;

export default function HomePage({ onGoTab }) {
  const rootRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  const goFeature = (id, e) => {
    e?.preventDefault();
    onGoTab?.(id);
  };

  useEffect(() => {
    setPageMeta({
      title: "AYURDISHA | Meet the Mentors | 11th World Ayurveda Congress",
      description:
        "Discover and connect with mentors, practitioners, researchers and thought leaders from the Ayurveda community through AYURDISHA.",
      path: "/",
    });
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    return observeScrollReveal(root, { once: true, threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
  }, []);

  useParallax(rootRef);

  /* Nav items like "How It Works" land here with router state, not a #hash
     (hashes on "/" are reserved for app tabs). */
  useEffect(() => {
    const section = location.state?.section;
    if (!section) return undefined;
    const t = window.setTimeout(() => {
      scrollToSection(section);
      navigate(".", { replace: true, state: null });
    }, 80);
    return () => window.clearTimeout(t);
  }, [location.state, navigate]);

  return (
    <main id="main" className="ed-home" ref={rootRef}>
      <HomeHero mentorCount={MENTOR_COUNT} onAsk={(e) => goFeature("ask", e)} />
      <HomeStats mentorCount={MENTOR_COUNT} trackCount={TRACK_COUNT} />
      <HomeIdea />
      <HomeMentors />
      <HomeHowItWorks onGo={goFeature} />
      <HomePhotoBand />
      <HomePathways trackCount={TRACK_COUNT} />
      <HomeWac onGo={goFeature} />
      <HomeTimeline />
      <HomeCollage />
      <HomeQuote />
      <HomeFinalCta onAsk={(e) => goFeature("ask", e)} />
    </main>
  );
}
