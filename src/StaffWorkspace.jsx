import React from "react";
import { Layers, BookOpen, Map as MapIcon, FileSpreadsheet, LogOut, ShieldCheck, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import ActionCard from "./ActionCard.jsx";
import { DISHA_DRAFTS, DISHA_ROLE } from "./content/glossary.js";

export default function StaffWorkspace({ onGoTab, onLogout, questionsCount = 0, clustersCount = 0 }) {
  const actions = [
    {
      id: "curate",
      title: "Curation Desk",
      what: "Primary Question Curation Tool",
      why: "Review, cluster, and group raw student questions into coherent themes before mentor briefing.",
      whatHappens: "Opens the curation desk where you can merge similar asks, edit cluster wording, and assign questions to mentor tracks.",
      icon: Layers,
      buttonText: "Open Curation Desk",
      badgeText: "Core Workspace",
    },
    {
      id: "board",
      title: "Open theme stage",
      what: "Live & Published Mentor Stage Answers",
      why: "Review published mentor responses and two-chair stage conversation records.",
      whatHappens: "Displays the public stage view with published answer letters and congress proceedings.",
      icon: BookOpen,
      buttonText: "Open the theme stage",
      badgeText: "Stage & Answers",
    },
    {
      id: "insights",
      title: "Insights & Briefings",
      what: "Analytics & Mentor Briefing Board",
      why: "Track delegate question statistics, top career interest areas, and personal reply statuses.",
      whatHappens: "Opens thematic breakdown cards, delegate frequency distribution, and briefing notes.",
      icon: MapIcon,
      buttonText: "Open Insights",
      badgeText: "Analytics & Briefings",
    },
    {
      id: "pack",
      title: "Mentor Pack",
      what: "Mentor Guidance & Export Portal",
      why: "Generate tailored briefing packets and Excel exports for visiting Congress mentors.",
      whatHappens: "Opens mentor resource materials, question bank export tools, and individual mentor briefing sheets.",
      icon: FileSpreadsheet,
      buttonText: "Open Mentor Pack",
      badgeText: "Mentor Resources",
    },
    {
      id: "ai",
      title: DISHA_DRAFTS,
      what: DISHA_ROLE,
      why: "DISHA drafts answers from trusted sources; an official reviews every draft before a student sees it.",
      whatHappens: "Opens the review queue and DISHA settings: on/off, streams, daily spend cap and Test DISHA connection.",
      icon: Sparkles,
      buttonText: `Open ${DISHA_DRAFTS}`,
      badgeText: "AI Assistant",
    },
  ];

  return (
    <div className="aym-staff-workspace-container">
      <div className="aym-staff-workspace-hero">
        <div className="aym-staff-workspace-hero-inner">
          <div className="aym-eyebrow aym-eyebrow-staff">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Authority Staff Access · 11th World Ayurveda Congress</span>
          </div>
          <h1 className="aym-display aym-staff-workspace-title">Staff Curation & Management Portal</h1>
          <p className="aym-staff-workspace-lead">
            Welcome to the official AYURDISHA staff workspace. Manage submitted delegate questions, curate theme stage discussions, prepare mentor briefing packs, and track career track insights.
          </p>

          <div className="aym-staff-workspace-meta-bar">
            <div className="aym-staff-meta-pill">
              <CheckCircle2 size={14} className="aym-text-gold" aria-hidden="true" />
              <span>Session Authenticated</span>
            </div>
            {questionsCount > 0 && (
              <div className="aym-staff-meta-pill">
                <span>{questionsCount} Submitted Questions</span>
              </div>
            )}
            {clustersCount > 0 && (
              <div className="aym-staff-meta-pill">
                <span>{clustersCount} Curated Groups</span>
              </div>
            )}
            <button
              type="button"
              className="aym-btn aym-btn-ghost aym-btn-sm aym-staff-logout-btn"
              onClick={onLogout}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Exit Staff Session</span>
            </button>
          </div>
        </div>
      </div>

      <div className="aym-staff-actions-grid">
        {actions.map((act) => (
          <div key={act.id} className="aym-card aym-action-card">
            <div className="aym-action-card-head">
              <div className="aym-action-card-icon-box">
                <act.icon size={22} className="aym-action-card-icon" aria-hidden="true" />
              </div>
              <span className="aym-badge aym-badge-gold">{act.badgeText}</span>
            </div>

            <h3 className="aym-action-card-title">{act.title}</h3>
            
            <div className="aym-staff-card-details">
              <p className="aym-staff-detail-what"><strong>What it is:</strong> {act.what}</p>
              <p className="aym-staff-detail-why"><strong>Why use it:</strong> {act.why}</p>
              <p className="aym-staff-detail-happens"><strong>When opened:</strong> {act.whatHappens}</p>
            </div>

            <div className="aym-action-card-foot">
              <button
                type="button"
                className="aym-btn aym-btn-primary aym-action-card-btn"
                onClick={() => onGoTab(act.id)}
              >
                <span>{act.buttonText}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
