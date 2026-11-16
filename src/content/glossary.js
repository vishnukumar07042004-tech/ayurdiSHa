/**
 * Canonical user-facing labels. Spec: docs/design/copy/ASK-CTA-AND-COPY-SPEC.md §5.
 * Sentence case everywhere except proper nouns (AYURDISHA, Ask Desk, Meet the Mentors, The Hall).
 */

export const ASK_DESK = "Ask Desk";
export const ASK_KICKER = "Career question?";
/** QR short link: skips the welcome deck, opens the Ask Desk, returns there after registering. */
export const ASK_HREF = "/ask";

export const TRACK_LABEL = "Track my answer";
/**
 * The delegate's number: the WAC Delegate ID when the account is linked to WAC's delegate list,
 * else the app's own "AYURDISHA pass number" — never "WAC (registration) number". Pick with
 * `displayPassId()` from shared/passId.js.
 */
export { WAC_DELEGATE_ID_LABEL as WAC_DELEGATE_ID, PASS_NUMBER_LABEL as PASS_NUMBER } from "../../shared/passId.js";
export const TICKET_ID = "ticket ID";
export const THEME_STAGE = "Open theme stage";

/**
 * DISHA is the AI assistant that drafts answers for officials to review. Staff screens use the
 * name freely; students see it only in the note on AI-assisted answers.
 */
export const DISHA = "DISHA";
export const DISHA_ROLE = "DISHA — AI mentor assistant";
export const DISHA_DRAFTS = "DISHA drafts";
export const DISHA_TRACK_NOTE = "Prepared with DISHA, our AI assistant, and reviewed by WAC mentors.";

export const AUDIENCE = "students, scholars and practitioners at every stage";
export const AUDIENCE_LIST = "Ayurveda students, interns, PG scholars and young practitioners";

export { META_DESCRIPTION, PROMISE_SHORT } from "../../shared/productConfig.js";
