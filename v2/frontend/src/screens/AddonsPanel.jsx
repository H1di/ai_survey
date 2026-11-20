// Paid add-ons, shown once a first path exists. Payments are not built: the
// unlock is a mock and the button says so.
export default function AddonsPanel({ addons, mockPayments, busy, onUnlock }) {
  return (
    <section className="addons" aria-label="Add-ons">
      <header className="section-head">
        <h2 className="section-title">Make it more personal</h2>
        <p className="section-sub">Optional add-ons. Your path stays free either way.</p>
      </header>
      <div className="addon-grid">
        {addons.map((a) => (
          <article key={a.id} className={`addon${a.owned ? " addon--owned" : ""}${a.available ? "" : " addon--soon"}`}>
            <h3 className="addon-title">{a.label}</h3>
            <p className="addon-desc">{a.description}</p>
            <p className="addon-price">
              €{a.priceEur}
              {a.id === "pass" ? " · 12 months" : ""}
            </p>
            {a.owned ? (
              <p className="addon-state">Unlocked</p>
            ) : !a.available ? (
              <p className="addon-state">Coming soon</p>
            ) : mockPayments ? (
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onUnlock(a.id)}>
                Unlock (test mode, no payment)
              </button>
            ) : (
              <p className="addon-state">Payments open soon</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
