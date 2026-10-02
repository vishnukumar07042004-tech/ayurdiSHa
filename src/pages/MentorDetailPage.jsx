import React, { useEffect, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { getMentorByParam, mentorPublicPath } from "../mentors.js";
import { setPageMeta, personJsonLd } from "../siteMeta.js";
import PageSkeleton from "../components/SkeletonLoaders.jsx";
import Breadcrumbs from "../components/Breadcrumbs.jsx";

const MentorProfile = lazy(() => import("../MentorProfile.jsx"));

export default function MentorDetailPage() {
  const { slug, id } = useParams();
  const param = slug || id;
  const mentor = getMentorByParam(param);

  useEffect(() => {
    if (mentor) {
      const path = mentorPublicPath(mentor);
      setPageMeta({
        title: `${mentor.name} — Mentor · AYURDISHA`,
        description: `${mentor.name}${mentor.designation ? ` (${mentor.designation})` : ""} — tentative mentor for the 11th World Ayurveda Congress 2026.`,
        path,
        personLd: personJsonLd(mentor, path),
      });
    } else {
      setPageMeta({
        title: "Mentor not found · AYURDISHA",
        description: "The requested mentor is not on the current WAC roster.",
        path: `/mentors/${param || ""}`,
        robots: "noindex",
      });
    }
  }, [mentor, param]);

  return (
    <main className="ui-page aym-mentor-detail-page" id="main">
      <div className="ui-container ui-crumbs">
        <Breadcrumbs
          backTo="/mentors"
          backLabel="Back to Mentors"
          items={[
            { label: "Mentors", to: "/mentors" },
            { label: mentor ? mentor.name : "Mentor" },
          ]}
        />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <MentorProfile mentorId={param} />
      </Suspense>
    </main>
  );
}
