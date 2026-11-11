// The demo list the index page renders. A demo is "built" when
// demos/<slug>/Demo.jsx exists — the glob is lazy, so nothing is loaded.
export const DEMO_SLUGS = [
  "occupation-funnel",
  "occupation-map",
  "values-fit",
  "values-insertion",
  "riasec-settle",
  "archetype-emblem",
  "refine-shift",
  "roadmap-draw",
  "micro-interactions",
];

const built = new Set(
  Object.keys(import.meta.glob("./*/Demo.jsx")).map((path) => path.split("/")[1])
);

export function renderIndex(list) {
  for (const slug of DEMO_SLUGS) {
    const li = document.createElement("li");
    const name = document.createElement(built.has(slug) ? "a" : "span");
    name.textContent = slug;
    const status = document.createElement("span");
    status.className = "demo-status";
    if (built.has(slug)) {
      name.href = `/demos/${slug}.html`;
      status.textContent = "built";
    } else {
      name.className = "demo-missing";
      status.textContent = "not built yet";
    }
    li.append(name, status);
    list.append(li);
  }
}
