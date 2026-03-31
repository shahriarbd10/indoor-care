"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./PlantScanner.module.css";

type Prediction = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  description?: string;
  alternatives: Array<{ name: string; confidence: number }>;
};

type ResultItem = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  description?: string;
};

type ViewMode = "capture" | "results" | "details";
type DetectState = "idle" | "scanning" | "processing" | "error";

const CAPTURE_WIDTH = 720;
const CAPTURE_HEIGHT = 960;
const LOW_CONFIDENCE_THRESHOLD = 0.45;

function resolveConfidenceLevel(confidence: number): "Low" | "Medium" | "High" {
  if (confidence < 0.45) return "Low";
  if (confidence < 0.75) return "Medium";
  return "High";
}

function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "We could not identify this plant right now. Try again with better light.";
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) {
    const normalized = maybeError.toLowerCase();

    if (normalized.includes("no confident") || normalized.includes("unknown")) {
      return "Could not get a clear match. Move closer to one leaf and try again.";
    }

    if (normalized.includes("permission") || normalized.includes("camera")) {
      return "Please allow camera access to continue.";
    }
  }

  return "Plant check is temporarily unavailable. Please try again shortly.";
}

export default function PlantScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inflightRef = useRef(false);
  const autoScanPendingRef = useRef(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [state, setState] = useState<DetectState>("idle");
  const [statusMessage, setStatusMessage] = useState("Focus camera on your plant.");
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("capture");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectedItem = useMemo(() => results[selectedIndex] ?? null, [results, selectedIndex]);

  const releaseCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const persistScan = useCallback(async (imageBase64: string, prediction: Prediction) => {
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          createdAtClient: new Date().toISOString(),
          confidenceLevel: resolveConfidenceLevel(prediction.confidence),
          prediction,
        }),
      });

      if (!response.ok) return;
      const payload = (await response.json()) as { imageUrl?: string };
      if (payload.imageUrl) {
        setSavedImageUrl(payload.imageUrl);
      }
    } catch {
      // Keep detection smooth even if save fails.
    }
  }, []);

  const detectFromImage = useCallback(
    async (imageBase64: string) => {
      if (inflightRef.current) return;

      inflightRef.current = true;
      setState("processing");
      setStatusMessage("Analyzing plant...");

      try {
        const response = await fetch("/api/plant-identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64 }),
        });

        const payload = (await response.json()) as unknown;
        if (!response.ok) {
          throw new Error(parseApiError(payload));
        }

        const prediction = payload as Prediction;
        const mapped: ResultItem[] = [
          {
            name: prediction.name,
            confidence: prediction.confidence,
            source: prediction.source,
            description: prediction.description,
          },
          ...prediction.alternatives.map((item) => ({
            name: item.name,
            confidence: item.confidence,
            source: prediction.source,
            description: prediction.description,
          })),
        ];

        setResults(mapped);
        setSelectedIndex(0);
        setBackgroundImage(imageBase64);
        setSavedImageUrl(null);
        setViewMode("results");
        setState("scanning");
        setStatusMessage(
          prediction.confidence >= LOW_CONFIDENCE_THRESHOLD
            ? "We identified possible matches. Tap a card for details."
            : "Confidence is low. Move closer and scan again for better results."
        );

        releaseCamera();

        if (prediction.confidence >= LOW_CONFIDENCE_THRESHOLD) {
          void persistScan(imageBase64, prediction);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to identify plant.";
        setState("error");
        setStatusMessage(message);
      } finally {
        inflightRef.current = false;
      }
    },
    [persistScan, releaseCamera]
  );

  const detectFromVideo = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.78);
    await detectFromImage(imageBase64);
  }, [detectFromImage]);

  const openCamera = useCallback(async () => {
    if (isStartingCamera) return;

    setIsStartingCamera(true);
    setPermissionDenied(false);
    setViewMode("capture");
    setBackgroundImage(null);
    setResults([]);
    setSelectedIndex(0);
    setSavedImageUrl(null);
    setStatusMessage("Opening camera...");
    autoScanPendingRef.current = true;
    setCameraOpen(true);
  }, [isStartingCamera]);

  const closeScanner = useCallback(() => {
    releaseCamera();
    autoScanPendingRef.current = false;
    setCameraOpen(false);
    setIsStartingCamera(false);
    setViewMode("capture");
    setResults([]);
    setSelectedIndex(0);
    setBackgroundImage(null);
    setSavedImageUrl(null);
    setState("idle");
    setStatusMessage("Focus camera on your plant.");
  }, [releaseCamera]);

  const nextDetection = useCallback(() => {
    closeScanner();
    void openCamera();
  }, [closeScanner, openCamera]);

  useEffect(() => {
    if (!cameraOpen || !isStartingCamera) return;

    let cancelled = false;

    async function attach() {
      let localStream: MediaStream | null = null;

      const video = videoRef.current;
      if (!video) return;

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 1920 },
          },
          audio: false,
        });

        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = localStream;

        video.srcObject = localStream;
        await video.play();
        if (cancelled) return;

        setState("scanning");
        setStatusMessage("Scanning plant...");

        if (autoScanPendingRef.current) {
          autoScanPendingRef.current = false;
          await detectFromVideo();
        }
      } catch {
        if (cancelled) return;
        if (localStream) {
          localStream.getTracks().forEach((track) => track.stop());
        }
        setState("error");
        setPermissionDenied(true);
        setStatusMessage("Camera access is required to scan plants.");
      } finally {
        if (!cancelled) {
          setIsStartingCamera(false);
        }
      }
    }

    void attach();
    return () => {
      cancelled = true;
    };
  }, [cameraOpen, detectFromVideo, isStartingCamera]);

  useEffect(() => {
    return () => {
      releaseCamera();
    };
  }, [releaseCamera]);

  if (!cameraOpen) {
    return (
      <section className={styles.homeShell}>
        <div className={styles.homeCard}>
          <h1>Let&apos;s find your plants</h1>
          <p>Open camera and we will scan a frame automatically.</p>
          {permissionDenied ? <p className={styles.warning}>Please allow camera permission to continue.</p> : null}
          <div className={styles.homeActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => void openCamera()}>
              {isStartingCamera ? "Opening..." : "Detect Plant"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.wrapper}>
      <div
        className={styles.phoneCard}
        style={
          backgroundImage
            ? { backgroundImage: `linear-gradient(180deg, rgba(21,31,33,0.62), rgba(14,22,22,0.8)), url(${backgroundImage})` }
            : undefined
        }
      >
        {!backgroundImage ? <video ref={videoRef} autoPlay muted playsInline className={styles.video} /> : null}
        <canvas ref={canvasRef} className={styles.hiddenCanvas} />

        <button type="button" className={styles.iconButtonLeft} onClick={viewMode === "details" ? () => setViewMode("results") : closeScanner}>
          <span>‹</span>
        </button>
        <button type="button" className={styles.iconButtonRight} onClick={viewMode === "details" ? nextDetection : closeScanner}>
          <span>{viewMode === "details" ? "↻" : "×"}</span>
        </button>

        {viewMode === "capture" ? (
          <div className={styles.captureLayer}>
            <p className={styles.captureHint}>{statusMessage}</p>
            {state === "error" ? (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => void detectFromVideo()}
                disabled={isStartingCamera}
              >
                Try Again
              </button>
            ) : (
              <p className={styles.captureAuto}>Auto scanning...</p>
            )}
          </div>
        ) : null}

        {viewMode === "results" ? (
          <div className={styles.resultsLayer}>
            <p className={styles.resultsIntro}>
              We identified <strong>{results.length}</strong> species here. Click each card for more details.
            </p>
            <div className={styles.resultList}>
              {results.map((item, index) => (
                <button
                  key={`${item.name}-${index}`}
                  type="button"
                  className={styles.resultCard}
                  onClick={() => {
                    setSelectedIndex(index);
                    setViewMode("details");
                  }}
                >
                  <div className={styles.resultThumb} />
                  <div className={styles.resultInfo}>
                    <p className={styles.resultName}>{item.name}</p>
                    <p className={styles.resultMeta}>{Math.round(item.confidence * 100)}% match</p>
                  </div>
                </button>
              ))}
            </div>

            <div className={styles.captureActions}>
              <button type="button" className={styles.primaryBtn} onClick={nextDetection}>
                Next Detection
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={closeScanner}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {viewMode === "details" && selectedItem ? (
          <div className={styles.detailsLayer}>
            <h3>{selectedItem.name}</h3>
            <p className={styles.detailSub}>{Math.round(selectedItem.confidence * 100)}% • {resolveConfidenceLevel(selectedItem.confidence)} confidence</p>
            <p className={styles.detailText}>
              {selectedItem.description ?? "Detailed description is not available for this result yet."}
            </p>
            <p className={styles.detailMeta}>Source: {selectedItem.source.toUpperCase()}</p>
            {savedImageUrl ? <p className={styles.savedTag}>Saved to collection</p> : null}
            <button type="button" className={styles.primaryBtn} onClick={nextDetection}>
              Next Detection
            </button>
          </div>
        ) : null}
      </div>

    </section>
  );
}
