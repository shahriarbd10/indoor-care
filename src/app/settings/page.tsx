export default function SettingsPage() {
  return (
    <main className="app-shell page-shell">
      <section className="page-hero">
        <p className="page-eyebrow">Settings</p>
        <h1>App Preferences</h1>
        <p>Control camera behavior, provider priority, and confidence threshold.</p>
      </section>

      <section className="page-grid">
        <article className="option-card">
          <h2>Detection Provider</h2>
          <p>Use Pl@ntNet first, then fallback to Plant.id for uncertain results.</p>
        </article>
        <article className="option-card">
          <h2>Confidence Threshold</h2>
          <p>Adjust the minimum confidence needed before fallback is triggered.</p>
        </article>
      </section>
    </main>
  );
}
