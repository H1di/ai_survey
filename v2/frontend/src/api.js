// Thin wrappers, one per v2 endpoint. Every mutating call returns the full
// session snapshot — the single source of truth the App applies wholesale.

const REQUEST_TIMEOUT_MS = 45_000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.error || "Request failed.", response.status);
    return data;
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("The request timed out. Please try again.", 0);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const post = (path) => (payload) => request(path, { method: "POST", body: JSON.stringify(payload) });

export const fetchMeta = () => request("/api/meta");
export const fetchSession = (id) => request(`/api/session/${encodeURIComponent(id)}`);
export const startSession = post("/api/session/start");
export const updateProfile = post("/api/profile/update");
export const buildPath = post("/api/path/build");
export const rebuildPath = post("/api/path/rebuild");
export const restorePath = post("/api/path/restore");
export const addStep = post("/api/path/add");
export const removeStep = post("/api/path/remove");
export const swapStep = post("/api/path/swap");
export const moveStep = post("/api/path/move");
export const applyScenario = post("/api/path/apply-scenario");
export const unlockAddon = post("/api/addons/unlock");
export const startTests = post("/api/tests/start");
export const answerBigFive = post("/api/tests/big-five");
export const answerRiasec = post("/api/tests/riasec");
export const answerValues = post("/api/tests/values");
export const submitExperience = post("/api/tests/experience");
export const generateGuidance = post("/api/guidance/generate");

export function searchCourses(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== null && v !== "") params.set(k, v);
  return request(`/api/courses?${params}`);
}

// The v1 error boundary reports crashes; v2 has no collector yet, so log only.
export function reportClientError({ message, where }) {
  console.error("[client-error]", where, message);
}
