import { getDevToken } from "./devMode";

const REQUEST_TIMEOUT_MS = 45_000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // A null header value removes the default — multipart bodies need the
    // browser to set its own Content-Type boundary.
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    for (const key of Object.keys(headers)) {
      if (headers[key] === null) delete headers[key];
    }
    const response = await fetch(path, { ...options, headers, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const post = (path) => (payload) =>
  request(path, { method: "POST", body: JSON.stringify(payload) });

export function fetchSession(sessionId) {
  return request(`/api/session/${encodeURIComponent(sessionId)}`);
}

export const startSession = post("/api/session/start");
export const sessionGoto = post("/api/session/goto");
export const submitDemographics = post("/api/session/demographics");
export const submitBigFiveAnswer = post("/api/big-five/answer");
export const startRiasec = post("/api/riasec/start");
export const submitRiasecAnswer = post("/api/riasec/answer");
export const skipRiasec = post("/api/riasec/skip");
export const startValues = post("/api/values/start");
export const submitValuesAnswer = post("/api/values/answer");
export const confirmValues = post("/api/values/confirm");
export const postCvIntent = post("/api/cv/intent");
export const submitCvText = post("/api/cv");
export const submitJourneyAnswer = post("/api/cv/journey");
export const continueSummary = post("/api/summary/continue");
export const fetchFirstOutput = post("/api/output/first");
export const refineOutput = post("/api/output/refine");
export const acceptOutput = post("/api/output/accept");
export const generateRoadmap = post("/api/roadmap/generate");

export function uploadCvFile({ sessionId, file }) {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", file);
  return request("/api/cv", { method: "POST", body: form, headers: { "Content-Type": null } });
}

// Dev stage switcher. The only request that carries the dev token; without one
// the backend answers 404, same as when the route is not mounted at all.
export function devJump(payload) {
  return request("/api/dev/jump", {
    method: "POST",
    headers: { "X-Dev-Token": getDevToken() || "" },
    body: JSON.stringify(payload),
  });
}
