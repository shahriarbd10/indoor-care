import { developerInfo } from "@/lib/developer";

type DeveloperInfoCardProps = {
  compact?: boolean;
};

export default function DeveloperInfoCard({ compact = false }: DeveloperInfoCardProps) {
  return (
    <section className={`developer-card ${compact ? "developer-card-compact" : ""}`} aria-label="Developer information">
      <p className="developer-kicker">Built by</p>
      <h2>{developerInfo.name}</h2>
      <p className="developer-role">{developerInfo.role}</p>
      <div className="developer-links">
        <a href={developerInfo.github} target="_blank" rel="noreferrer">GitHub</a>
        <a href={developerInfo.website} target="_blank" rel="noreferrer">Website</a>
        <a href={developerInfo.email}>Email</a>
      </div>
    </section>
  );
}
