"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Prediction = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  alternatives: Array<{ name: string; confidence: number }>;
};

type DetectState = "idle" | "scanning" | "processing" | "error";

const CAPTURE_INTERVAL_MS = 1800;
const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;

function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Unable to detect the plant right now.";

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) return maybeError;

  return "Unable to detect the plant right now.";
}

export default function PlantScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inflightRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [state, setState] = useState<DetectState>("idle");
  const [statusMessage, setStatusMessage] = useState("Tap detect to open camera.");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("--");

  const confidenceLabel = useMemo(() => {
    if (!prediction) return null;
    return `${Math.round(prediction.confidence * 100)}% confidence`;
  }, [prediction]);

  const detectPlant = useCallback(async () => {
    if (inflightRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) return;

    inflightRef.current = true;
    setState("processing");
    setStatusMessage("Analyzing plant...");

    try {
      canvas.width = CAPTURE_WIDTH;
      canvas.height = CAPTURE_HEIGHT;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas not available");

      context.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.76);

      const response = await fetch("/api/plant-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(parseApiError(payload));
      }

      const parsed = payload as Prediction;
      setPrediction(parsed);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setState("scanning");
      setStatusMessage("Keep camera steady for updates.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Detection failed.";
      setState("error");
      setStatusMessage(message);
    } finally {
      inflightRef.current = false;
    }
  }, []);

  const releaseCamera = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const closeCamera = useCallback(() => {
    releaseCamera();
    setCameraOpen(false);
    setState("idle");
    setStatusMessage("Tap detect to open camera.");
  }, [releaseCamera]);

  const openCamera = useCallback(async () => {
    try {
      setPermissionDenied(false);
      setStatusMessage("Opening camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setState("scanning");
      setStatusMessage("Point your camera at a leaf or flower.");

      timerRef.current = window.setInterval(() => {
        void detectPlant();
      }, CAPTURE_INTERVAL_MS);

      window.setTimeout(() => {
        void detectPlant();
      }, 380);
    } catch {
      setPermissionDenied(true);
      setState("error");
      setStatusMessage("Camera access was denied or unavailable.");
    }
  }, [detectPlant]);

  useEffect(() => {
    return () => {
      releaseCamera();
    };
  }, [releaseCamera]);

  if (!cameraOpen) {
    return (
      <section className="scanner-launch">
        <div className="scanner-launch-card">
          <div className="scanner-launch-logo" aria-hidden>
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12.8 2.6c3.4 2.4 5.1 5.3 5.1 8.5 0 4.6-3.2 8.3-7.6 9.6-3.1.9-5.5 3.1-6.4 5.9-.2.8-1.4.8-1.6-.1-1-3.6-.2-7.1 2.4-9.7 2.7-2.6 7.9-4 7.9-8.6 0-1.5-.4-3.2-.9-4.7-.2-.6.4-1.2 1.1-.9Z" />
            </svg>
          </div>
          <p className="page-eyebrow">Plant Detection</p>
          <h1 className="scanner-launch-title">Detect Plants On Demand</h1>
          <p className="scanner-launch-copy">
            Camera opens only when you tap. Close anytime to return to this home screen.
          </p>

          {prediction ? (
            <p className="scanner-last-result">
              Last result: <strong>{prediction.name}</strong>
            </p>
          ) : null}

          {permissionDenied ? (
            <p className="scanner-warning">
              Camera permission is required. Enable it and tap Detect Plant again.
            </p>
          ) : null}

          <button className="scanner-launch-button" onClick={() => void openCamera()} type="button">
            Detect Plant
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="scanner-shell">
      <div className="scanner-video-wrap">
        <button className="scanner-close-button" onClick={closeCamera} type="button" aria-label="Close camera">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden>
            <path d="M6.7 5.3 12 10.6l5.3-5.3a1 1 0 1 1 1.4 1.4L13.4 12l5.3 5.3a1 1 0 0 1-1.4 1.4L12 13.4l-5.3 5.3a1 1 0 0 1-1.4-1.4l5.3-5.3-5.3-5.3a1 1 0 1 1 1.4-1.4Z" />
          </svg>
        </button>
        <video ref={videoRef} autoPlay muted playsInline className="scanner-video" />
        <canvas ref={canvasRef} className="hidden" />

        <div className="scanner-target" aria-hidden />

        <div className="scanner-gradient" aria-hidden />
        <div className="scanner-overlay">
          <div className="scanner-topline">
            <div className="scanner-brand">
              <span className="scanner-brand-icon" aria-hidden>
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M12.8 2.6c3.4 2.4 5.1 5.3 5.1 8.5 0 4.6-3.2 8.3-7.6 9.6-3.1.9-5.5 3.1-6.4 5.9-.2.8-1.4.8-1.6-.1-1-3.6-.2-7.1 2.4-9.7 2.7-2.6 7.9-4 7.9-8.6 0-1.5-.4-3.2-.9-4.7-.2-.6.4-1.2 1.1-.9Z" />
                </svg>
              </span>
              <div>
                <p className="scanner-kicker">Plant Intelligence</p>
                <p className="scanner-brand-title">Indoor Care</p>
              </div>
            </div>
            <p className={`scanner-state-pill scanner-state-${state}`}>
              {state === "processing" ? "Processing" : state === "error" ? "Attention" : "Live"}
            </p>
          </div>

          <h1 className="scanner-title">Botanical Lens</h1>
          <p className="scanner-status">{statusMessage}</p>

          {prediction ? (
            <div className="scanner-result-card">
              <p className="scanner-result-eyebrow">Primary Match</p>
              <p className="scanner-result-name">{prediction.name}</p>
              <div className="scanner-confidence">
                <div
                  className="scanner-confidence-bar"
                  style={{ width: `${Math.max(4, Math.round(prediction.confidence * 100))}%` }}
                />
              </div>
              <p className="scanner-result-meta">{confidenceLabel}</p>
              <p className="scanner-result-provider">Verified by {prediction.source.toUpperCase()}</p>
              {prediction.alternatives.length > 0 ? (
                <ul className="scanner-alt-list">
                  {prediction.alternatives.map((item) => (
                    <li key={item.name}>
                      <span>{item.name}</span>
                      <span>{Math.round(item.confidence * 100)}%</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {!prediction && state !== "error" ? (
            <div className="scanner-pending-card">
              <p>Awaiting first strong match...</p>
            </div>
          ) : null}

          <div className="scanner-mobile-actions">
            <button
              className="scanner-primary-button"
              onClick={() => {
                void detectPlant();
              }}
              type="button"
              disabled={state === "processing"}
            >
              Scan Now
            </button>
            <button
              className="scanner-ghost-button"
              onClick={() => {
                guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              type="button"
            >
              View Tips
            </button>
          </div>
        </div>
      </div>

      <div ref={guideRef} className="scanner-guide">
        <div className="scanner-panel-head">
          <h2>Session Insights</h2>
          <p>Updated {lastUpdated}</p>
        </div>

        <div className="scanner-panel-grid">
          <article className="panel-card">
            <h3>Capture Quality</h3>
            <p>Hold still for two seconds. Keep one leaf fully visible inside the frame target.</p>
          </article>
          <article className="panel-card">
            <h3>Lighting</h3>
            <p>Use window light when possible. Artificial yellow lighting can reduce confidence.</p>
          </article>
          <article className="panel-card">
            <h3>Best Practice</h3>
            <p>Rotate slowly to show vein patterns and leaf shape before moving to another plant.</p>
          </article>
        </div>

        {permissionDenied ? (
          <p className="scanner-warning">
            Camera permission is required. Refresh and allow access to continue.
          </p>
        ) : null}

        <button
          className="scanner-refresh-button"
          onClick={() => {
            void detectPlant();
          }}
          type="button"
        >
          Refresh Detection
        </button>
      </div>
    </section>
  );
}
