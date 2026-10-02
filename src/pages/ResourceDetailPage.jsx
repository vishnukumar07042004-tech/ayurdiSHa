import React, { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { getResourceBySlug } from "../data/resources.js";
import { parseVideo } from "../podcasts.js";
import { setPageMeta, breadcrumbJsonLd } from "../siteMeta.js";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import { Mic, FileText, User, ArrowUpRight } from "lucide-react";
import NotFoundPage from "./NotFoundPage.jsx";
import Button, { MoreLink } from "../components/ui/Button.jsx";
import { PageHero, useReveal } from "../components/ui/PageChrome.jsx";

const ASK = { pathname: "/", hash: "#ask" };

export default function ResourceDetailPage() {
  const { slug } = useParams();
  const resource = getResourceBySlug(slug);
  const rootRef = useRef(null);
  useReveal(rootRef, [slug]);

  useEffect(() => {
    if (resource) {
      setPageMeta({
        title: `${resource.title} · AYURDISHA Resource`,
        description: resource.description,
        path: resource.path,
        breadcrumbLd: breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Resources", path: "/resources" },
          { name: resource.category, path: resource.path }
        ]),
      });
    }
  }, [resource]);

  if (!resource) return <NotFoundPage message="The requested resource could not be found." />;

  const isPodcast = resource.type === "podcast";
  const parsedVideo = isPodcast ? parseVideo(resource.videoUrl) : null;

  return (
    <main className="ui-page ui-detail" id="main" ref={rootRef}>
      <div className="ui-container ui-crumbs">
        <Breadcrumbs
          backTo="/resources"
          backLabel="Back to Resources"
          items={[
            { label: "Resources", to: "/resources" },
            { label: resource.category }
          ]}
        />
      </div>

      <PageHero
        eyebrow={isPodcast ? "Mentor podcast" : "Career guide"}
        title={resource.title}
        lead={resource.description}
        meta={
          <>
            <span className={`ui-tag ${isPodcast ? "" : "ui-tag--gold"}`}>
              {isPodcast ? <Mic size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
              {resource.category}
            </span>
            {resource.author && (
              <span className="ui-tag ui-tag--neutral">
                <User size={13} aria-hidden="true" /> {resource.author}
              </span>
            )}
          </>
        }
      />

      <div className="ui-container ui-container--text ui-detail-body">
        {isPodcast && parsedVideo && (
          <div className="ui-media-frame" data-reveal>
            {parsedVideo.kind === "youtube" && (
              <div className="ui-embed">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${parsedVideo.id}`}
                  title={resource.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            {parsedVideo.kind === "vimeo" && (
              <div className="ui-embed">
                <iframe
                  src={`https://player.vimeo.com/video/${parsedVideo.id}`}
                  title={resource.title}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            {parsedVideo.kind === "mp4" && (
              <video controls className="ui-video">
                <source src={parsedVideo.src} type="video/mp4" />
                Your browser does not support HTML5 video.
              </video>
            )}
            {parsedVideo.kind === "link" && (
              <div className="ui-tile ui-tile--surface ui-tile--center">
                <p className="ui-body">Watch or listen to this talk on the external platform:</p>
                <div className="ui-btn-row ui-btn-row--center">
                  <Button href={parsedVideo.href} target="_blank" rel="noopener noreferrer" iconAfter={<ArrowUpRight size={16} aria-hidden="true" />}>
                    Open Video Stream
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {resource.contentSections && resource.contentSections.map((sec, i) => (
          <section key={i} className="ui-detail-section" data-reveal>
            <h2 className="ui-title">{sec.title}</h2>
            <ul className="ui-checklist">
              {sec.bullets.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          </section>
        ))}

        {resource.references && resource.references.length > 0 && (
          <section className="ui-tile ui-tile--surface ui-detail-refs" data-reveal>
            <h2 className="ui-title">Official References</h2>
            <ul>
              {resource.references.map((ref, i) => (
                <li key={i}>
                  <a href={ref.url} target="_blank" rel="noopener noreferrer" className="ui-link">
                    {ref.label} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <aside className="ui-tile ui-tile--dark ui-tile--center ui-page-cta" data-reveal>
          <p className="ui-eyebrow">Ask Desk</p>
          <h2 className="ui-tile-title">Need further guidance?</h2>
          <p className="ui-body">Submit your question to the Ask Desk for personalized mentor feedback.</p>
          <div className="ui-btn-row ui-btn-row--center">
            <Button to={ASK} size="lg" variant="on-dark">Ask a Mentor</Button>
          </div>
          <MoreLink to="/resources" onDark>Back to all resources</MoreLink>
        </aside>
      </div>
    </main>
  );
}
