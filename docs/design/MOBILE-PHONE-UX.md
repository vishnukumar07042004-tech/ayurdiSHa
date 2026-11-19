# AYURDISHA — Mobile phone UX overhaul

**Product:** AYURDISHA (Meet the Mentors · WAC 2026)  
**Live:** https://ayushmarg.vercel.app  
**Scope:** Phone view only. Desktop, Windows, Mac, and tablet layouts must stay visually unchanged.  
**Reference:** Apple Store India mobile — [apple.com/in/store](https://www.apple.com/in/store) (hierarchy, readability, CTAs, tap targets, calm chrome).  
**Status:** Spec for implementation. Layout / typography / spacing / visibility polish only — no new product features.

---

## 1. Goals

1. **Crystal-clear on a phone.** A first-time visitor on a handset must find Ask Desk / Register, Track my answer, Meet Mentors, How it works, and WAC 2026 without hunting.
2. **Professional, not “mobile afterthought.”** Same calm hierarchy as a good desktop web experience: one primary idea per band, readable type, obvious CTAs, generous hit areas, no cluttered chrome.
3. **Phone-first usability.** Thumb-reachable primary actions; forms fill the width; submit never buried; no horizontal page scroll; notches and home indicators respected.
4. **Parity of intent with desktop.** Same destinations and copy; only the phone chrome and rhythm change.

---

## 2. Non-goals

- **No desktop / tablet redesign.** Do not change layouts, type scales, or chrome at widths above the phone breakpoint (see §5). Existing `@media (min-width: …)` and tablet bands (≈641–1023px) must look the same before and after.
- **No new features.** No new routes, sticky bars, onboarding flows, or staff tools — only polish of what already exists.
- **No content rewrite** beyond tiny label/visibility fixes required for phone clarity.
- **No performance / imagery campaign** in this pass (srcset, hero crop assets, etc. stay out of scope unless a CSS-only object-position tweak is needed).
- **No commit of secrets.** Do not touch `.env*` beyond local verify; never print keys.

---

## 3. Reference principles (Apple Store–style mobile)

Measured against Apple Store India on a phone (~390px):

| Principle | What “good” looks like on AYURDISHA phone |
|---|---|
| **One primary CTA** | Ask Desk (or Register & ask when signed out) is the loudest action; Track is the clear utility sibling. |
| **Clear nav** | Brand readable; hamburger/More opens a scannable sheet; critical links in the first screen of the sheet. |
| **Readable body** | Body ≈16–17px / ~1.45–1.5 line-height; headlines 28–34px with tight tracking; avoid micro-copy under 13px for actions. |
| **Sticky utility without covering content** | Existing Ask FAB stays; pad for safe-area; never overlap form submits or sticky register banners. |
| **Calm chrome** | No overlapping glows on text; no clipped buttons from `overflow: hidden` on the nav; no dense icon piles. |
| **Section = one job** | Stack cards; swipe shelves only where already intentional (mentor shelves, how-steps). |
| **Tap targets** | Interactive controls ≥44×44px (Apple HIG). |

---

## 4. Critical actions inventory (must never be missed on phone)

| Action | Where it lives today | Phone rule |
|---|---|---|
| **Ask Desk** | Home Ask band, `#ask` / Ask tab, FAB, overlay secondary | Primary in overlay; FAB visible when rules allow; band CTAs full-width / ≥46px. |
| **Register & ask** | Register tab, Ask guest banner, overlay Take part | Banner CTA full-width; Register one tap from overlay Take part. |
| **Track my answer** | Nav primary (desktop), overlay list, Track tab | In overlay primary list (already); large ticket field + full-width submit. |
| **Meet Mentors** | `/mentors`, home shelves, overlay | Portrait cards stack/swipe cleanly; **View profile** ≥44px hit. |
| **How it works** | `/how-it-works`, overlay | Jump chips scroll horizontally without clipping; steps readable stacked. |
| **Staff portal** (if staff) | Header staff control | Icon + badge remain; label may collapse; ≥44px hit; not crushing Ask/Profile. |
| **Profile chip** | Header → `/account` | Avatar-only on phone OK; ≥44px hit; never pushes burger off-screen. |
| **Hall map** | Hall / `#hall` | List primary; map pan-x; pins ≥44px hit (existing hall-map.css). |
| **WAC 2026** | Home section + overlay | Section CTAs side-by-side or stacked on SE; map/facts readable. |

---

## 5. Breakpoint policy

| Token | Value | Use |
|---|---|---|
| **`--phone-max` (canonical)** | **`640px`** | **All new phone-only rules** in `src/styles/phone-ux.css` and any additive patches: `@media (max-width: 640px)`. |
| Narrow SE | `max-width: 390px` (optional nested) | Single-column CTA stacks, tighter gutters. |
| Existing home phone sheet | `max-width: 767px` in `home-mobile.css` | **Leave as-is** for home shelf behaviour; do not raise that band to redesign tablet. New global polish stays at **640** so 641–767 (small tablets / large phones in landscape edge cases) are not newly restyled. |
| Coarse pointer (optional) | `(hover: none) and (pointer: coarse)` | Only for hover→always-visible affordances (e.g. mentor card extras) where safe; never for layout that would change desktop trackpads. |

**Do not** introduce new rules at `max-width: 767px`, `734px`, `720px`, or `1080px` for this overhaul unless fixing a phone-only bug that those files already own — prefer extending `phone-ux.css` at **640**.

---

## 6. Interaction & layout tokens (phone)

| Token | Rule |
|---|---|
| Tap target | **≥44px** min-height/width (prefer 46–48 for primary buttons). |
| Safe areas | `env(safe-area-inset-*)` on nav padding, overlay, FAB, sticky banners, footer bottom. |
| Gutters | 16–20px; content never flush to the physical edge on notched devices. |
| Body type | ≥16px; leads 17px; captions for non-actions ≥13px. |
| Headlines | Home / page titles ≈28–34px; section titles ≈22–28px. |
| Spacing | Section rhythm ≈40–56px; card padding ≥20px; form fields stacked with ≥12px gap. |
| Viewport height | Prefer `100dvh` / `svh` over `100vh` for overlays and full-bleed shells to avoid iOS URL-bar cutoffs. |
| Sticky header | Keep existing nav height; content `scroll-margin-top` clears nav + local nav. |
| Sticky bottom | Ask FAB only; leave ≥12px above home indicator; do not invent a second bottom bar. |
| Motion | Honour `prefers-reduced-motion: reduce` (already site-wide); no new ambient motion on phone. |
| Overflow | Page: no horizontal scroll. Nav/actions: `overflow: visible` — never clip CTAs. Cards may clip media only. |

---

## 7. Section-by-section checklist

### 7.1 AppHeader / overlay

- [ ] Brand word readable (≥18px); kicker may hide.
- [ ] Search, Profile (avatar), Staff (if present), Burger each ≥44px.
- [ ] Profile meta text hidden; chip does not crush burger or staff.
- [ ] Nav inner does not use overflow that clips actions.
- [ ] Overlay: Ask Desk styled as primary CTA; Track visible in primary list; Register under Take part; Meet Mentors / How it works / WAC / Hall present.
- [ ] Overlay uses `dvh` and bottom safe-area padding; close control ≥44px.
- [ ] Flyout (“More”) is desktop-oriented; on phone the burger sheet is the path — do not rely on flyout at ≤640.

### 7.2 Home

- [ ] Hero: primary Ask CTA full-width, ≥52–56px; supporting link clear.
- [ ] How-it-works / pathways / collage: existing swipe rows OK; type readable; glows that sit under copy disabled or behind content.
- [ ] Stats / idea / bands: no huge empty waste; CTAs not tiny pills under 40px.
- [ ] Final CTA buttons ≥46px; stacked on SE if needed.

### 7.3 How it works (page)

- [ ] Jump chips: horizontal scroll, tap ≥44px height.
- [ ] Step cards stack; body ≥15–16px.
- [ ] Local nav / sticky titles clear the global header.

### 7.4 Mentors (home shelves + directory + detail)

- [ ] Portrait / spot cards: name ≤2 lines; **View profile** / CTA ≥44px hit area.
- [ ] Filters / search / quick-nav usable; no horizontal page scroll.
- [ ] Directory shelves keep snap; paddles hidden on phone (existing).

### 7.5 Ask Desk / Register

- [ ] Forms full-width; inputs min-height ≥48px; font ≥16px (no iOS zoom).
- [ ] Labels clear; counters not colliding with labels.
- [ ] Submit / Register CTA above the fold when possible, else sticky within the form card — always ≥48px and not under FAB.
- [ ] Guest register banner: full-width CTA; safe under nav.
- [ ] No disabled-form wall as the only UI (existing product behaviour — do not invent new signed-out UX beyond CSS clarity).

### 7.6 Track

- [ ] Ticket field full-width, large type; submit full-width ≥48px.
- [ ] Answer card readable; actions stacked; no clip from ornaments.

### 7.7 Account

- [ ] Hero and rows stack; share actions wrap with ≥44px buttons.
- [ ] Guest CTAs full-width.

### 7.8 Staff desks

- [ ] Tables scroll horizontally inside a contained frame, not the page.
- [ ] Toolbars wrap; primary actions ≥44px.
- [ ] Do not restyle desktop staff density.

### 7.9 Footers / modals / FAB

- [ ] Footer links ≥44px min-height; legal row wraps.
- [ ] Modals: max-height `min(90dvh, …)` with internal scroll; safe-area padding.
- [ ] Ask FAB: safe-area; does not cover Track/Ask submit on those routes (existing askFabRules).

---

## 8. Implementation plan

1. Land this spec at `docs/design/MOBILE-PHONE-UX.md`.
2. Add **`src/styles/phone-ux.css`** — all new rules under `@media (max-width: 640px)` (plus optional SE / reduced-motion nests). Import last among layout CSS from `main.jsx`.
3. Patch existing phone blocks only when a rule already lives in that file at ≤640 (e.g. `account.css`, `ask-fab.css`, `track.css`) — keep diffs minimal.
4. Avoid JSX feature work; if overlay CTA order needs fixing, prefer CSS `order` / button class swaps that only apply ≤640, or a tiny className change with no desktop visual delta.
5. Verify: build pass; optional browser snapshot at 390×844; deploy `npx vercel --prod --yes`.

---

## 9. QA checklist

### Devices / viewports

| Device | Viewport | Focus |
|---|---|---|
| iPhone SE (3rd) | 375×667 | CTA stack, no h-scroll, overlay fit, forms. |
| Standard (iPhone 14 / 15) | 390×844 | Header chip + FAB + Ask band; mentors shelf. |
| Large (Pro Max / Plus) | 430×932 | Type still dense, not sparse; safe-area FAB. |
| Control | 768×1024 + 1280×800 | **Must match pre-change** tablet/desktop. |

### Pass criteria

- [ ] Hard refresh production; cold load `/` on phone.
- [ ] Open hamburger: Ask Desk, Track, Mentors, How it works, WAC, Hall, Register reachable in ≤1 scroll.
- [ ] Profile chip + burger both tappable; nothing clipped.
- [ ] Ask Desk / Register / Track: type a field without page zoom; submit visible without sideways scroll.
- [ ] Mentors: open a profile from a card CTA.
- [ ] Hall map: select a zone from the list; pan map if shown.
- [ ] Staff (if applicable): portal control works; desks usable.
- [ ] Rotate to landscape phone: no broken nav; safe-area left/right.
- [ ] `prefers-reduced-motion`: no stuck invisible `[data-reveal]` content.
- [ ] Desktop/tablet screenshot or side-by-side: no visual regression.

### Deploy note

After `npx vercel --prod --yes`, hard-refresh https://ayushmarg.vercel.app (purge CDN cache if needed) and re-check the SE / standard / large list above on a real handset.

---

## 10. Key files

| File | Role |
|---|---|
| `docs/design/MOBILE-PHONE-UX.md` | This spec |
| `src/styles/phone-ux.css` | New phone-only overlay (≤640px) |
| `src/styles/home-mobile.css` | Existing home ≤767 phone sheet (unchanged contract) |
| `src/styles/ui.css` / `editorial.css` / `store.css` / `aym.css` | Shared; touch only if phone-scoped |
| `src/styles/ask-desk.css`, `ask-fab.css`, `track.css`, `account.css`, `how-it-works.css`, `hall-map.css` | Surface-specific |
| `src/AppHeader.jsx` | Structure for overlay CTAs (minimal / CSS-first) |
| `src/main.jsx` | Import order for `phone-ux.css` |
