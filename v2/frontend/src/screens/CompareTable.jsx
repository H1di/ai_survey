import { compareRows } from "../pathView";

// Side-by-side comparison of up to three catalogue courses.
export default function CompareTable({ courses, onRemove, onClear }) {
  if (courses.length < 2) return null;
  const rows = compareRows(courses);
  return (
    <section className="compare" aria-label="Compare courses">
      <header className="section-head">
        <h2 className="section-title">Compare</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
          Clear
        </button>
      </header>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Detail</span>
              </th>
              {courses.map((c) => (
                <th key={c.id} scope="col">
                  <span className="compare-name">{c.title}</span>
                  <button type="button" className="link-btn" onClick={() => onRemove(c.id)}>
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((v, i) => (
                  <td key={courses[i].id}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
