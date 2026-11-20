// Paid add-ons (report §01, §08), offered only once a first path exists.
// Payments are NOT built: with MOCK_PAYMENTS on (the default outside
// production) an unlock is recorded instantly and labelled as a mock; with it
// off the unlock route answers 501 until a payment provider is wired in.

const FREE_REBUILDS = 3;

const ADDONS = [
  {
    id: "tests",
    label: "Psychological tests + deeper AI guidance",
    description:
      "Interests (RIASEC), personality (Mini-IPIP), work values and experience. The AI then explains why the path fits, proposes two or three scenarios and recommends what to add.",
    priceEur: 5,
    available: true,
  },
  {
    id: "rebuilds",
    label: "Unlimited rebuilds",
    description: `Ask the AI to rebuild your path as often as you like, beyond the ${FREE_REBUILDS} free rebuilds.`,
    priceEur: 4,
    available: true,
  },
  {
    id: "extras",
    label: "Extras matched to your path",
    description: "Related events, volunteering, internships and offers, with dates, places and reminders.",
    priceEur: 5,
    available: false, // needs a verified events source — not in this version
  },
  {
    id: "pass",
    label: "12-month pass",
    description: "Everything above for 12 months. One payment, no auto-renewal.",
    priceEur: 10,
    available: true,
    includes: ["tests", "rebuilds", "extras"],
  },
];

const ADDON_BY_ID = new Map(ADDONS.map((a) => [a.id, a]));

function emptyEntitlements() {
  return { tests: false, rebuilds: false, extras: false };
}

// The entitlements an unlock grants; extras stays off while unavailable.
function grantsFor(addonId) {
  const addon = ADDON_BY_ID.get(addonId);
  if (!addon) return [];
  const ids = addon.includes || [addon.id];
  return ids.filter((id) => ADDON_BY_ID.get(id)?.available);
}

function rebuildAllowance(session) {
  const used = session.rebuildsUsed || 0;
  const unlimited = Boolean(session.entitlements?.rebuilds);
  return {
    used,
    free: FREE_REBUILDS,
    unlimited,
    remaining: unlimited ? null : Math.max(0, FREE_REBUILDS - used),
  };
}

module.exports = { ADDONS, ADDON_BY_ID, FREE_REBUILDS, emptyEntitlements, grantsFor, rebuildAllowance };
