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
    const response = await fetch(path, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

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

export function fetchSession(sessionId) {
  return request(`/api/session/${encodeURIComponent(sessionId)}`);
}

export function startSession(payload) {
  return request("/api/session/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitDemographics(payload) {
  return request("/api/session/demographics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function chooseBigFiveDepth(payload) {
  return request("/api/session/big-five-depth", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitBigFiveAnswer(payload) {
  return request("/api/big-five/answer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function startRiasec(payload) {
  return request("/api/riasec/start", { method: "POST", body: JSON.stringify(payload) });
}

export function submitRiasecAnswer(payload) {
  return request("/api/riasec/answer", { method: "POST", body: JSON.stringify(payload) });
}

export function skipRiasec(payload) {
  return request("/api/riasec/skip", { method: "POST", body: JSON.stringify(payload) });
}

export function submitJobCharRanking(payload) {
  return request("/api/job-characteristics/rank", { method: "POST", body: JSON.stringify(payload) });
}

export function submitJobCharAnswer(payload) {
  return request("/api/job-characteristics/answer", { method: "POST", body: JSON.stringify(payload) });
}

export function submitCvText(payload) {
  return request("/api/cv", { method: "POST", body: JSON.stringify(payload) });
}

export function submitJourneyAnswer(payload) {
  return request("/api/cv/journey", { method: "POST", body: JSON.stringify(payload) });
}

export function uploadCvFile({ sessionId, file }) {
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", file);
  return request("/api/cv", { method: "POST", body: form, headers: { "Content-Type": null } });
}

export function fetchDirectionQuestions(payload) {
  return request("/api/direction/question", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function answerDirectionQuestion(payload) {
  return request("/api/direction/answer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function confirmDirection(payload) {
  return request("/api/direction/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function answerNarrowingQuestion(payload) {
  return request("/api/professions/narrow", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function selectProfession(payload) {
  return request("/api/professions/select", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateRoadmap(payload) {
  return request("/api/roadmap/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function refineDirection(payload) {
  return request("/api/direction/refine", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function chooseDirection(payload) {
  return request("/api/direction/choose", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
