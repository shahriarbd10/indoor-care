"use client";

import { useEffect, useMemo, useState } from "react";

type SavedScan = {
  id: string;
  plantName: string;
  confidence: number;
  confidenceLevel: "Low" | "Medium" | "High";
  source: "plantnet" | "plantid";
  description?: string;
  indications?: {
    commonName?: string;
    scientificName?: string;
    family?: string;
    genus?: string;
  };
  alternatives: Array<{ name: string; confidence: number }>;
  imageUrl: string;
  createdAt?: string;
  createdAtClient?: string;
};

export default function LibraryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<SavedScan[]>([]);

  useEffect(() => {
    let ignore = false;

    async function loadScans() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/scans", { cache: "no-store" });
        const payload = (await response.json()) as { scans?: SavedScan[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to fetch saved scans.");
        }

        if (!ignore) {
          setScans(payload.scans ?? []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Unable to fetch saved scans.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadScans();
    return () => {
      ignore = true;
    };
  }, []);

  const totalHighConfidence = useMemo(() => scans.filter((item) => item.confidence >= 0.7).length, [scans]);

  return (
    <main className="app-shell page-shell">
      <section className="page-hero">
        <p className="page-eyebrow">Library</p>
        <h1>Saved Plant Scans</h1>
        <p>Review your detected plants, confidence levels, and provider details in one place.</p>
      </section>

      <section className="page-grid">
        <article className="option-card">
          <h2>Total Scans</h2>
          <p>{scans.length} scans saved</p>
        </article>
        <article className="option-card">
          <h2>High Confidence</h2>
          <p>{totalHighConfidence} scans above 70% confidence</p>
        </article>
      </section>

      {isLoading ? <p className="library-state">Loading saved scans...</p> : null}
      {error ? <p className="library-state library-error">{error}</p> : null}
      {!isLoading && !error && scans.length === 0 ? (
        <p className="library-state">No scans saved yet. Detect a plant and it will appear here.</p>
      ) : null}

      {!isLoading && !error && scans.length > 0 ? (
        <section className="library-grid">
          {scans.map((scan) => (
            <article key={scan.id} className="library-card">
              <img className="library-image" src={scan.imageUrl} alt={scan.plantName} loading="lazy" />
              <div className="library-content">
                <p className="library-kicker">{scan.source.toUpperCase()}</p>
                <h2>{scan.plantName}</h2>
                <p className="library-confidence">
                  {Math.round(scan.confidence * 100)}% confidence · {scan.confidenceLevel}
                </p>
                {scan.indications ? (
                  <ul className="library-indications">
                    {scan.indications.commonName ? <li><span>Common</span><strong>{scan.indications.commonName}</strong></li> : null}
                    {scan.indications.scientificName ? <li><span>Scientific</span><strong>{scan.indications.scientificName}</strong></li> : null}
                    {scan.indications.family ? <li><span>Family</span><strong>{scan.indications.family}</strong></li> : null}
                    {scan.indications.genus ? <li><span>Genus</span><strong>{scan.indications.genus}</strong></li> : null}
                  </ul>
                ) : null}
                {scan.description ? <p className="library-description">{scan.description}</p> : null}
                {scan.alternatives?.length ? (
                  <div className="library-alt">
                    <p>Close calls</p>
                    <ul>
                      {scan.alternatives.slice(0, 4).map((alt) => (
                        <li key={`${scan.id}-${alt.name}`}>
                          <span>{alt.name}</span>
                          <strong>{Math.round(alt.confidence * 100)}%</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
