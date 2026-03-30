export default function LibraryPage() {
  return (
    <main className="app-shell page-shell">
      <section className="page-hero">
        <p className="page-eyebrow">Library</p>
        <h1>Plant Collection</h1>
        <p>Save identified plants and build a personal indoor garden catalog.</p>
      </section>

      <section className="page-grid">
        <article className="option-card">
          <h2>Recent Identifications</h2>
          <p>Track your latest scans with confidence and source details.</p>
        </article>
        <article className="option-card">
          <h2>Favorites</h2>
          <p>Pin plants you own to quickly revisit care details later.</p>
        </article>
      </section>
    </main>
  );
}
