"use client";

import { useEffect, useMemo, useState } from "react";
import DeveloperInfoCard from "@/components/DeveloperInfoCard";

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

type ScansResponse = {
  scans?: SavedScan[];
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

const PAGE_SIZE = 12;

export default function LibraryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<SavedScan[]>([]);
  const [page, setPage] = useState(1);
  const [totalScans, setTotalScans] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    let ignore = false;

    async function loadScans() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/scans?page=${page}&limit=${PAGE_SIZE}`, { cache: "no-store" });
        const payload = (await response.json()) as ScansResponse;

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to fetch saved scans.");
        }

        if (!ignore) {
          setScans(payload.scans ?? []);
          setTotalScans(payload.pagination?.total ?? 0);
          setTotalPages(payload.pagination?.totalPages ?? 1);
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
  }, [page]);

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
          <p>{totalScans} scans saved</p>
        </article>
        <article className="option-card">
          <h2>High Confidence</h2>
          <p>{totalHighConfidence} scans on this page above 70% confidence</p>
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
              <div className="library-image">
                <img src={scan.imageUrl} alt={`Saved scan of ${scan.plantName}`} loading="lazy" />
              </div>
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

      {!isLoading && !error && totalPages > 1 ? (
        <section className="page-grid" aria-label="Library pagination">
          <article className="option-card">
            <h2>Page</h2>
            <p>
              {page} of {totalPages}
            </p>
            <div className="library-pagination-actions">
              <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </article>
        </section>
      ) : null}

      <DeveloperInfoCard compact />
    </main>
  );
}
