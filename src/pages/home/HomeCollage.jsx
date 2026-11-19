import React from "react";
import Picture from "../../components/editorial/Picture.jsx";
import { ShelfHead } from "../../components/ui/Store.jsx";

const TILES = [
  { src: "/assets/sections/collage-circle.webp", w: 1152, h: 864, caption: "Small circles, honest questions", alt: "A senior woman mentor guiding a small circle of Ayurveda students in a sandstone hall at the World Ayurveda Congress" },
  { src: "/assets/sections/collage-garden.webp", w: 1024, h: 1024, caption: "Career paths, mapped together", alt: "A mentor sketching career options in a notebook as two students look on at a congress lounge table" },
  { src: "/assets/sections/collage-onetoone.webp", w: 864, h: 1152, caption: "One-to-one guidance", alt: "A young Ayurveda graduate taking notes as an experienced mentor talks through her options, one to one" },
  { src: "/assets/sections/collage-panchakarma.webp", w: 1024, h: 1024, caption: "One clear question", alt: "A student handing a written question card to a volunteer at the Ask Desk, with mentors talking in the background" },
  { src: "/assets/sections/collage-library.webp", w: 1024, h: 1024, caption: "Research and PG, demystified", alt: "A senior mentor explaining a research paper to two students in a wood-panelled reading room" },
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
            soft="From a circle of questions to a plan you can act on."
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
