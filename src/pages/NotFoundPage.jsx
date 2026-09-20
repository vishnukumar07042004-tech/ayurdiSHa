import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { setPageMeta } from "../siteMeta.js";
import { Home, Users, BookOpen, ArrowLeft } from "lucide-react";

export default function NotFoundPage({ message = "The page you are looking for might have been moved or does not exist." }) {
  useEffect(() => {
    setPageMeta({
      title: "404 Page Not Found · AYURDISHA",
      description: "The requested page was not found on AYURDISHA.",
      path: "/404",
      robots: "noindex, follow",
    });
  }, []);

  return (
    <div className="aym-page aym-py-16 aym-text-center">
      <div className="aym-container aym-max-w-2xl">
        <p className="aym-eyebrow aym-text-maroon">ERROR 404</p>
        <h1 className="aym-display aym-404-title">Page Not Found</h1>
        <p className="aym-lead aym-mb-8">{message}</p>

        <div className="aym-btn-row" style={{ justifyContent: "center" }}>
          <Link to="/" className="aym-btn aym-btn-primary">
            <Home size={16} aria-hidden="true" /> Back to Home
          </Link>
          <Link to="/mentors" className="aym-btn aym-btn-outline">
            <Users size={16} aria-hidden="true" /> Mentors
          </Link>
          <Link to="/#pods" className="aym-btn aym-btn-ghost">
            <BookOpen size={16} aria-hidden="true" /> Knowledge
          </Link>
        </div>
      </div>
    </div>
  );
}
