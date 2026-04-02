import DeveloperInfoCard from "@/components/DeveloperInfoCard";

export default function CarePage() {
  return (
    <main className="app-shell page-shell">
      <section className="page-hero">
        <p className="page-eyebrow">Care</p>
        <h1>Care Guidance</h1>
        <p>Organize watering, light, and feeding advice based on plant type.</p>
      </section>

      <section className="page-grid">
        <article className="option-card">
          <h2>Watering Plan</h2>
          <p>Set gentle reminders tuned to your climate and season.</p>
        </article>
        <article className="option-card">
          <h2>Light Score</h2>
          <p>Check if your space matches low, medium, or bright light needs.</p>
        </article>
      </section>

      <DeveloperInfoCard compact />
    </main>
  );
}
