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

export function generateInitialBranch(payload) {
  return request("/api/branches/initial", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function unlockTheme(payload) {
  return request("/api/payment/unlock-theme", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createThematicBranch(payload) {
  return request("/api/branches/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function evolveBranch(payload) {
  return request("/api/branches/evolve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
