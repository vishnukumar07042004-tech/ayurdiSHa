import React from "react";
import Picture from "../../components/editorial/Picture.jsx";
import Button from "../../components/ui/Button.jsx";
import { Lotus } from "../../components/editorial/Ornaments.jsx";

export function HomePhotoBand() {
  return (
    <section className="ui-band ui-dark" aria-labelledby="band-title">
      <div className="ui-band-media" data-parallax="-160">
        <Picture
          src="/assets/sections/home-band.webp"
          alt=""
          width={1280}
          height={720}
          sizes="100vw"
        />
      </div>
      <div className="ui-band-veil" aria-hidden="true" />
      <div className="ui-container ui-band-inner">
        <h2 id="band-title" className="ui-headline ui-band-title" data-reveal="scale">
          Knowledge becomes meaningful <em>when it is shared.</em>
        </h2>
        <div className="ui-btn-row ui-btn-row--center" data-reveal>
          <Button to="/mentors" variant="on-dark" size="lg">Explore the Mentors</Button>
        </div>
      </div>
      <span className="aym-visually-hidden">
        A senior mentor in a timber-columned hall gesturing toward the light as young students in white coats look on.
      </span>
    </section>
  );
}

export function HomeQuote() {
  return (
    <section className="ui-section ui-bg-surface ui-quote" aria-label="The AYURDISHA idea">
      <div className="ui-container ui-container--text">
        <blockquote className="ui-quote-text" data-reveal="scale">
          <p>
            A good question, placed before the right mentor, can shape a <em>lifetime of practice.</em>
          </p>
        </blockquote>
        <p className="ui-quote-sign" data-reveal>The AYURDISHA idea</p>
      </div>
    </section>
  );
}

export function HomeFinalCta({ onAsk }) {
  return (
    <section className="ui-section ui-dark ui-cta" aria-labelledby="cta-title">
      <div className="ui-cta-bg" aria-hidden="true">
        <span className="ui-cta-glow ui-cta-glow--a" />
        <span className="ui-cta-glow ui-cta-glow--b" />
        <Lotus className="ui-cta-lotus" />
      </div>
      <div className="ui-container ui-container--text ui-cta-inner">
        <p className="ui-eyebrow" data-reveal>Explore the AYURDISHA mentor network</p>
        <h2 id="cta-title" className="ui-display ui-cta-title" data-reveal="scale">
          Your next conversation could <em>change your perspective.</em>
        </h2>
        <div className="ui-btn-row ui-btn-row--center" data-reveal>
          <Button to="/mentors" variant="on-dark" size="lg">Meet the Mentors</Button>
          <Button to={{ pathname: "/", hash: "#ask" }} onClick={onAsk} variant="on-dark-secondary" size="lg">
            Ask a question
          </Button>
        </div>
      </div>
    </section>
  );
}
