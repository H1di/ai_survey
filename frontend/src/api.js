async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
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

export function submitValuesAnswer(payload) {
  return request("/api/values/answer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
