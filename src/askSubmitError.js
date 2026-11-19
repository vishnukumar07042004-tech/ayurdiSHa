/**
 * What the Ask Desk tells a student when sending fails. Every message says the question is
 * still on the page, so nobody retypes it; server messages for 4xx are already specific.
 */

const STILL_HERE = "Your question is still here";

export function isNetworkError(err) {
  return Boolean(err && (err.network || (err.name === "TypeError" && err.status == null)));
}

export function isTimeout(err) {
  return Boolean(err && (err.timeout || err.status === 504 || err.status === 408 || /timed out/i.test(err.message || "")));
}

/** Worth one automatic resend (same id + ticket, so the server treats it as the same question). */
export function isRetryable(err) {
  return isNetworkError(err) || [502, 503, 504].includes(err && err.status);
}

export function askSubmitError(err) {
  if (isTimeout(err)) {
    return `The server took too long to answer. ${STILL_HERE} — press Send again. If the first try did arrive, it will not be sent twice.`;
  }
  if (isNetworkError(err)) {
    return `We couldn't reach the Ask Desk — check your internet connection. ${STILL_HERE}; press Send again when you're back online.`;
  }
  const status = err && err.status;
  const server = String((err && err.data && err.data.error) || "").trim();
  if (status === 429) return `Too many tries in a short time. ${STILL_HERE} — wait a minute, then press Send again.`;
  if (status >= 400 && status < 500 && server) return server;
  if (status >= 500) {
    return server && !/^store failed$/i.test(server)
      ? server
      : `The Ask Desk server is having trouble right now. ${STILL_HERE} — please press Send again in a minute.`;
  }
  return (err && err.message) || `We could not send your question. ${STILL_HERE} — press Send again.`;
}
