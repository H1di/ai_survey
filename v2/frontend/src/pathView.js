// Pure view helpers for the path screens (unit-tested in pathView.test.js).

export const CITY_LABELS = {
  dublin: "Dublin",
  cork: "Cork",
  galway: "Galway",
  limerick: "Limerick",
  waterford: "Waterford",
  online: "Online",
};

export const MODE_LABELS = { full_time: "Full-time", part_time: "Part-time", online: "Online" };

export const KIND_LABELS = {
  short: "Short course",
  plc: "PLC / FET",
  higher_cert: "Higher certificate",
  undergrad: "Bachelor's degree",
  postgrad: "Postgraduate",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MAX_COMPARE = 3;

export function formatEur(n) {
  if (!Number.isFinite(n)) return "—";
  return n === 0 ? "Free" : `€${n.toLocaleString("en-IE")}`;
}

export function formatDuration(months) {
  if (!Number.isFinite(months) || months <= 0) return "—";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = months / 12;
  return Number.isInteger(years) ? `${years} year${years === 1 ? "" : "s"}` : `${months} months`;
}

export function startLabel(month) {
  return MONTHS[(month || 1) - 1] || "—";
}

export function placeLabel(course) {
  if (!course) return "";
  return course.mode === "online" ? "Online" : CITY_LABELS[course.city] || course.city;
}

// Button text + state for the rebuild control.
export function rebuildState(rebuilds) {
  if (!rebuilds) return { label: "Rebuild with AI", disabled: true, exhausted: false };
  if (rebuilds.unlimited) return { label: "Rebuild with AI", disabled: false, exhausted: false, hint: "Unlimited rebuilds" };
  const left = rebuilds.remaining ?? 0;
  if (left <= 0) {
    return { label: "Free rebuilds used", disabled: true, exhausted: true, hint: `You've used all ${rebuilds.free} free rebuilds.` };
  }
  return { label: "Rebuild with AI", disabled: false, exhausted: false, hint: `${left} of ${rebuilds.free} free rebuilds left` };
}

// Toggle a course in the compare list, capped at MAX_COMPARE (oldest drops).
export function toggleCompare(list, courseId) {
  if (list.includes(courseId)) return list.filter((id) => id !== courseId);
  const next = [...list, courseId];
  return next.length > MAX_COMPARE ? next.slice(next.length - MAX_COMPARE) : next;
}

// Rows for the side-by-side comparison table.
export function compareRows(courses) {
  return [
    ["Provider", (c) => c.provider],
    ["Award", (c) => `${c.award} · NFQ ${c.nfqLevel}`],
    ["Type", (c) => KIND_LABELS[c.kind] || c.kind],
    ["Where", (c) => placeLabel(c)],
    ["Mode", (c) => MODE_LABELS[c.mode] || c.mode],
    ["Length", (c) => formatDuration(c.durationMonths)],
    ["Fee per year", (c) => formatEur(c.feeEur)],
    ["Total fees", (c) => formatEur(c.totalFeeEur ?? c.feeEur)],
    ["Starts", (c) => startLabel(c.startMonth)],
    ["Skills", (c) => c.skills.join(", ")],
  ].map(([label, get]) => ({ label, values: courses.map(get) }));
}

// Signed delta copy for scenario cards: "+6 months", "−€1,500".
export function deltaLabel(value, kind) {
  if (!value) return kind === "months" ? "same length" : "same cost";
  const sign = value > 0 ? "+" : "−";
  const abs = Math.abs(value);
  return kind === "months" ? `${sign}${formatDuration(abs)}` : `${sign}€${abs.toLocaleString("en-IE")}`;
}

// Stored answers → form state, and back. Age is a string in the form.
export function profileToForm(profile) {
  if (!profile) return {};
  return { ...profile, age: profile.age === undefined ? "" : String(profile.age) };
}

export function formToAnswers(form) {
  return { ...form, age: form.age === "" ? "" : Number(form.age) };
}

// Which questions in the form are still unanswered (client-side hint only;
// the server validates for real).
export function missingAnswers(questions, form) {
  return questions
    .filter((q) => {
      const v = form[q.id];
      if (q.kind === "number") return v === "" || v === undefined || !Number.isFinite(Number(v));
      return typeof v !== "string" || !v.trim();
    })
    .map((q) => q.id);
}
