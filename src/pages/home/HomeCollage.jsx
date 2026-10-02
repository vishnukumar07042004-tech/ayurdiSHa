import React from "react";
import Picture from "../../components/editorial/Picture.jsx";
import { ShelfHead } from "../../components/ui/Store.jsx";

const TILES = [
  { src: "/assets/sections/collage-circle.webp", w: 1152, h: 864, caption: "Small circles, honest questions", alt: "Young interns seated in a circle around a senior woman mentor in a wooden mentoring pod" },
  { src: "/assets/sections/collage-garden.webp", w: 1024, h: 1024, caption: "Learning plants where they grow", alt: "A senior mentor in a medicinal herb garden showing a fresh leaf to two students holding notebooks" },
  { src: "/assets/sections/collage-onetoone.webp", w: 864, h: 1152, caption: "One-to-one guidance", alt: "A BAMS intern taking notes across a small table as an older mentor explains a point" },
  { src: "/assets/sections/collage-panchakarma.webp", w: 1024, h: 1024, caption: "Hands-on therapy skills", alt: "A senior therapist guiding a young intern beside a wooden Panchakarma table and brass oil vessel" },
  { src: "/assets/sections/collage-library.webp", w: 1024, h: 1024, caption: "Classical texts, living practice", alt: "A mentor pointing to a page in a library volume as two students look on between tall wooden shelves" },
];

export default function HomeCollage() {
  return (
    <section className="ui-section ui-bg-canvas ui-collage" aria-labelledby="collage-title">
      <div className="ui-container">
        <div data-reveal>
          <ShelfHead
            id="collage-title"
            className="st-shelf-head--lg"
            title="Every path begins with a conversation."
            soft="From the clinic to the garden, the therapy room and the library."
            action={<span className="ui-caption">Illustrative imagery</span>}
          />
        </div>

        <div className="ui-collage-grid" data-reveal-stagger>
          {TILES.map((t, i) => (
            <figure key={t.src} className={`ui-shot ui-shot--${i + 1}`} data-reveal data-cursor="view">
              <div className="ui-shot-img ed-media ed-zoom" data-scroll-img>
                <Picture src={t.src} alt={t.alt} width={t.w} height={t.h} sizes="(max-width: 767px) 94vw, 40vw" />
              </div>
              <figcaption className="ui-photo-caption">{t.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
