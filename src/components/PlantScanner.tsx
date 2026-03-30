"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Prediction = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  description?: string;
  alternatives: Array<{ name: string; confidence: number }>;
};

type DetectState = "idle" | "scanning" | "processing" | "error";

const CAPTURE_WIDTH = 640;
const CAPTURE_HEIGHT = 480;
const LOW_CONFIDENCE_THRESHOLD = 0.45;

function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "We could not identify the plant this time. Try again with better lighting.";
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) {
    const normalized = maybeError.toLowerCase();

    if (normalized.includes("no confident") || normalized.includes("unknown")) {
      return "Could not get a clear match. Move closer to one leaf and try again.";
    }

    if (normalized.includes("permission") || normalized.includes("camera")) {
      return "Please allow camera access to continue plant detection.";
    }

    return "Plant check is temporarily unavailable. Please try again in a moment.";
  }

  return "We could not identify the plant this time. Try again with better lighting.";
}

export default function PlantScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inflightRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);
  const [state, setState] = useState<DetectState>("idle");
  const [statusMessage, setStatusMessage] = useState("Tap detect to open camera.");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("--");

  const confidenceLabel = useMemo(() => {
    if (!prediction) return null;
    return `${Math.round(prediction.confidence * 100)}% confidence`;
  }, [prediction]);

  const confidenceLevel = useMemo(() => {
    if (!prediction) return null;
    if (prediction.confidence < 0.45) return "Low";
    if (prediction.confidence < 0.75) return "Medium";
    return "High";
  }, [prediction]);

  const releaseCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

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
      setStatusMessage(
        parsed.confidence < LOW_CONFIDENCE_THRESHOLD
          ? "Low confidence. Place camera directly on one leaf and try again."
          : "Great match saved. Tap Next Detection when you want to scan again."
      );

      if (parsed.confidence >= LOW_CONFIDENCE_THRESHOLD) {
        setFrozenFrame(imageBase64);
        releaseCamera();
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Could not identify the plant. Try again with a clearer view.";

      const userSafeMessage =
        message.toLowerCase().includes("fetch") || message.toLowerCase().includes("network")
          ? "Connection seems unstable. Please check internet and try again."
          : message;

      setState("error");
      setStatusMessage(userSafeMessage);
    } finally {
      inflightRef.current = false;
    }
  }, [releaseCamera]);

  const closeCamera = useCallback(() => {
    releaseCamera();
    setIsStartingCamera(false);
    setCameraOpen(false);
    setState("idle");
    setStatusMessage("Tap detect to open camera.");
  }, [releaseCamera]);

  const openCamera = useCallback(async () => {
    try {
      if (isStartingCamera) return;

      setIsStartingCamera(true);
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
      setFrozenFrame(null);
      setCameraOpen(true);
    } catch {
      setPermissionDenied(true);
      setState("error");
      setStatusMessage("Camera access was denied or unavailable.");
      setIsStartingCamera(false);
    }
  }, [isStartingCamera]);

  useEffect(() => {
    if (!cameraOpen) return;
    if (!isStartingCamera) return;
    if (!streamRef.current || !videoRef.current) return;

    let cancelled = false;

    async function attachAndStart() {
      const videoEl = videoRef.current;
      const stream = streamRef.current;
      if (!videoEl || !stream) return;

      try {
        videoEl.srcObject = stream;
        await videoEl.play();
        if (cancelled) return;

        setState("scanning");
        setStatusMessage("Frame the plant inside the guide, then tap Detect Plant.");
      } catch {
        if (cancelled) return;
        setPermissionDenied(true);
        setState("error");
        setStatusMessage("Unable to start camera preview.");
      } finally {
        if (!cancelled) {
          setIsStartingCamera(false);
        }
      }
    }

    void attachAndStart();

    return () => {
      cancelled = true;
    };
  }, [cameraOpen, detectPlant, isStartingCamera]);

  const handleNextDetection = useCallback(() => {
    setPrediction(null);
    setFrozenFrame(null);
    setState("idle");
    setStatusMessage("Opening camera...");
    void openCamera();
  }, [openCamera]);

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

          <button
            className="scanner-launch-button"
            onClick={() => void openCamera()}
            type="button"
            disabled={isStartingCamera}
          >
            {isStartingCamera ? "Opening..." : "Detect Plant"}
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
        {frozenFrame ? (
          <img src={frozenFrame} alt="Captured plant" className="scanner-video scanner-frozen-image" />
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="scanner-video" />
        )}
        <canvas ref={canvasRef} className="hidden" />

        {!frozenFrame ? (
          <div className="scanner-target" aria-hidden>
            <span className="scanner-corner scanner-corner-tl" />
            <span className="scanner-corner scanner-corner-tr" />
            <span className="scanner-corner scanner-corner-bl" />
            <span className="scanner-corner scanner-corner-br" />
          </div>
        ) : null}

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
              {confidenceLevel ? (
                <p className={`scanner-confidence-level scanner-confidence-${confidenceLevel.toLowerCase()}`}>
                  Confidence level: {confidenceLevel}
                </p>
              ) : null}
              {prediction.confidence < LOW_CONFIDENCE_THRESHOLD ? (
                <p className="scanner-low-confidence-note">
                  This result is uncertain. Place camera closer to the plant and keep one leaf centered.
                </p>
              ) : null}
              {prediction.description ? (
                <div className="scanner-description-card">
                  <p className="scanner-description-title">Plant overview</p>
                  <p className="scanner-description-text">{prediction.description}</p>
                </div>
              ) : null}
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
                if (frozenFrame) {
                  handleNextDetection();
                  return;
                }

                void detectPlant();
              }}
              type="button"
              disabled={state === "processing" || isStartingCamera}
            >
              {frozenFrame ? "Next Detection" : prediction ? "Detect Another" : "Detect Plant"}
            </button>
            <button
              className="scanner-ghost-button"
              onClick={() => {
                if (frozenFrame) {
                  handleNextDetection();
                  return;
                }

                setPrediction(null);
                setFrozenFrame(null);
                setStatusMessage("Ready for next plant. Frame it and tap Detect Plant.");
                guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              type="button"
            >
              {frozenFrame ? "Next Detection" : "Next Plant"}
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
            setPrediction(null);
            setStatusMessage("Ready for next plant. Frame it and tap Detect Plant.");
          }}
          type="button"
        >
          Clear Result
        </button>
      </div>
    </section>
  );
}
