import React, { useEffect, lazy, Suspense } from "react";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import PageSkeleton from "../components/SkeletonLoaders.jsx";
import { setPageMeta } from "../siteMeta.js";

const MentorsDirectory = lazy(() => import("../MentorsDirectory.jsx"));

export default function MentorsPage() {
  useEffect(() => {
    setPageMeta({
      title: "Meet the Mentors · AYURDISHA · WAC 2026",
      description:
        "Tentative mentor roster for AYURDISHA at the 11th World Ayurveda Congress, Bhubaneswar 2026.",
      path: "/mentors",
    });
  }, []);

  return (
    <main className="ui-page" id="main">
      <div className="ui-container ui-crumbs">
        <Breadcrumbs items={[{ label: "Mentors" }]} />
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <MentorsDirectory />
      </Suspense>
    </main>
  );
}
