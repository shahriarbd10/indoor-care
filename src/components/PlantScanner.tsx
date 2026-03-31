"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./PlantScanner.module.css";

type Prediction = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  description?: string;
  indications?: {
    commonName?: string;
    scientificName?: string;
    family?: string;
    genus?: string;
  };
  alternatives: Array<{ name: string; confidence: number }>;
};

type ResultItem = {
  name: string;
  confidence: number;
  source: "plantnet" | "plantid";
  description?: string;
  indications?: Prediction["indications"];
};

type ViewMode = "capture" | "results" | "details";
type DetectState = "idle" | "countdown" | "scanning" | "processing" | "error";

const CAPTURE_WIDTH = 720;
const CAPTURE_HEIGHT = 960;
const MODERATE_CONFIDENCE_THRESHOLD = 0.4;
const MIN_DETECTED_CONFIDENCE = 0.15;
const MIN_ALTERNATIVE_CONFIDENCE = 0.02;
const SCAN_PHASE_DURATION_MS = 2000;
const QUALITY_BOOST_DURATION_MS = 2000;
const RECHECK_DELAY_MS = 650;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveConfidenceLevel(confidence: number): "Low" | "Medium" | "High" {
  if (confidence < 0.45) return "Low";
  if (confidence < 0.75) return "Medium";
  return "High";
}

function resolveConfidenceTone(confidence: number): "low" | "medium" | "high" {
  if (confidence < 0.45) return "low";
  if (confidence < 0.75) return "medium";
  return "high";
}

function parseApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Plant detection is temporarily unavailable. Please try again in a moment.";
  }

  const maybeError = (payload as { error?: unknown }).error;
  if (typeof maybeError === "string" && maybeError.trim()) {
    const normalized = maybeError.toLowerCase();

    if (normalized.includes("no confident") || normalized.includes("unknown")) {
      return "We could not get a confident match. Move closer to a healthy leaf and scan again.";
    }

    if (normalized.includes("permission") || normalized.includes("camera")) {
      return "Camera access is required to scan plants. Please enable permission and retry.";
    }
  }

  return "Plant detection is temporarily unavailable. Please try again shortly.";
}

export default function PlantScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopActiveRef = useRef(false);
  const scanSessionTokenRef = useRef(0);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [state, setState] = useState<DetectState>("idle");
  const [statusMessage, setStatusMessage] = useState("Frame one leaf clearly for the best result.");
  const [scanHeadline, setScanHeadline] = useState("Smart scan ready");
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [savedImageUrl, setSavedImageUrl] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("capture");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCloseMatches, setShowCloseMatches] = useState(false);
  const [countDown, setCountDown] = useState<number | null>(null);

  const selectedItem = useMemo(() => results[selectedIndex] ?? null, [results, selectedIndex]);
  const closeMatches = useMemo(() => results.slice(1), [results]);

  const stopSmartScan = useCallback(() => {
    scanLoopActiveRef.current = false;
    scanSessionTokenRef.current += 1;
  }, []);

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

  const captureFrameFromVideo = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    return canvas.toDataURL("image/jpeg", 0.78);
  }, []);

  const identifyFromImage = useCallback(async (imageBase64: string): Promise<{ prediction?: Prediction; error?: string }> => {
    try {
      const response = await fetch("/api/plant-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });

      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        return { error: parseApiError(payload) };
      }

      const prediction = payload as Prediction;
      return {
        prediction: {
          ...prediction,
          alternatives: (prediction.alternatives ?? [])
            .filter((item) => item.confidence >= MIN_ALTERNATIVE_CONFIDENCE)
            .sort((a, b) => b.confidence - a.confidence),
        },
      };
    } catch {
      return { error: "Plant detection is temporarily unavailable. We are still scanning." };
    }
  }, []);

  const openResultFromPrediction = useCallback(
    async (imageBase64: string, prediction: Prediction) => {
      const mapped: ResultItem[] = [
        {
          name: prediction.name,
          confidence: prediction.confidence,
          source: prediction.source,
          description: prediction.description,
          indications: prediction.indications,
        },
        ...prediction.alternatives
          .filter((item) => item.confidence >= MIN_ALTERNATIVE_CONFIDENCE)
          .map((item) => ({
            name: item.name,
            confidence: item.confidence,
            source: prediction.source,
            description: prediction.description,
            indications: prediction.indications,
          })),
      ];

      setResults(mapped);
      setSelectedIndex(0);
      setShowCloseMatches(false);
      setBackgroundImage(imageBase64);
      setCapturedFrame(imageBase64);
      setSavedImageUrl(null);
      setViewMode("results");
      setState("idle");
      setStatusMessage("Best match found with moderate confidence. Tap a card for full details.");
      setScanHeadline("Detection complete");

      stopSmartScan();
      releaseCamera();

      if (prediction.confidence >= MODERATE_CONFIDENCE_THRESHOLD) {
        void persistScan(imageBase64, prediction);
      }
    },
    [persistScan, releaseCamera, stopSmartScan]
  );

  const startSmartScan = useCallback(async () => {
    if (!cameraOpen || scanLoopActiveRef.current) return;

    scanLoopActiveRef.current = true;
    scanSessionTokenRef.current += 1;
    const sessionToken = scanSessionTokenRef.current;

    // 3-second countdown phase
    setState("countdown");
    setScanHeadline("Get ready");
    setStatusMessage("Position the camera over a plant leaf...");
    for (let i = 3; i > 0; i--) {
      if (!scanLoopActiveRef.current || sessionToken !== scanSessionTokenRef.current) return;
      setCountDown(i);
      await sleep(1000);
    }
    setCountDown(null);
    if (!scanLoopActiveRef.current || sessionToken !== scanSessionTokenRef.current) return;

    const scanStart = Date.now();
    let attempts = 0;
    let bestPrediction: Prediction | null = null;
    let bestFrame: string | null = null;
    let bestConfidence = 0;

    setState("scanning");
    setScanHeadline("Scanning in progress");
    setStatusMessage("Keep the leaf centered in the marked area.");

    if (capturedFrame) {
      const { prediction } = await identifyFromImage(capturedFrame);
      if (prediction) {
        bestPrediction = prediction;
        bestFrame = capturedFrame;
        bestConfidence = prediction.confidence;
      }
      setStatusMessage("Using captured frame and validating with live scan...");
    }

    while (scanLoopActiveRef.current && sessionToken === scanSessionTokenRef.current) {
      const frame = captureFrameFromVideo();
      if (!frame) {
        await sleep(250);
        continue;
      }

      attempts += 1;
      const elapsed = Date.now() - scanStart;
      const firstPhaseRemaining = Math.max(0, Math.ceil((SCAN_PHASE_DURATION_MS - elapsed) / 1000));
      if (elapsed < SCAN_PHASE_DURATION_MS) {
        setStatusMessage(`Analyzing frame ${attempts}. Keep leaf centered... ${firstPhaseRemaining}s`);
      }

      const { prediction } = await identifyFromImage(frame);
      if (!scanLoopActiveRef.current || sessionToken !== scanSessionTokenRef.current) {
        return;
      }

      if (prediction && prediction.confidence > bestConfidence) {
        bestPrediction = prediction;
        bestFrame = frame;
        bestConfidence = prediction.confidence;
      }

      if (elapsed >= SCAN_PHASE_DURATION_MS) {
        break;
      }

      await sleep(RECHECK_DELAY_MS);
    }

    if (!scanLoopActiveRef.current || sessionToken !== scanSessionTokenRef.current) {
      return;
    }

    if (bestPrediction && bestFrame && bestPrediction.confidence >= MODERATE_CONFIDENCE_THRESHOLD) {
      await openResultFromPrediction(bestFrame, bestPrediction);
      return;
    }

    if (bestPrediction && bestPrediction.confidence < MIN_DETECTED_CONFIDENCE) {
      setScanHeadline("No clear plant detected");
      setStatusMessage("No plant detected. Please scan a plant leaf.");
    }

    const secondPhaseStart = Date.now();
    setScanHeadline("Quality boost scan");
    setStatusMessage("Keep camera still for 2 seconds for better quality.");

    while (scanLoopActiveRef.current && sessionToken === scanSessionTokenRef.current) {
      const frame = captureFrameFromVideo();
      if (!frame) {
        await sleep(250);
        continue;
      }

      const elapsed = Date.now() - secondPhaseStart;
      const remaining = Math.max(0, Math.ceil((QUALITY_BOOST_DURATION_MS - elapsed) / 1000));
      setStatusMessage(`Keep camera still for better quality... ${remaining}s`);

      const { prediction } = await identifyFromImage(frame);
      if (!scanLoopActiveRef.current || sessionToken !== scanSessionTokenRef.current) {
        return;
      }

      if (prediction && prediction.confidence > bestConfidence) {
        bestPrediction = prediction;
        bestFrame = frame;
        bestConfidence = prediction.confidence;
      }

      if (elapsed >= QUALITY_BOOST_DURATION_MS) {
        break;
      }

      await sleep(RECHECK_DELAY_MS);
    }

    if (!scanLoopActiveRef.current || sessionToken !== scanSessionTokenRef.current) {
      return;
    }

    if (bestPrediction && bestFrame && bestPrediction.confidence >= MODERATE_CONFIDENCE_THRESHOLD) {
      await openResultFromPrediction(bestFrame, bestPrediction);
      return;
    }

    stopSmartScan();
    setState("error");
    setScanHeadline("No plant detected");
    setStatusMessage(
      bestPrediction && bestPrediction.confidence >= MIN_DETECTED_CONFIDENCE
        ? "We found weak matches only. Keep camera still, center one leaf, and scan again."
        : "No plant detected. Please scan a plant leaf and keep it centered."
    );
  }, [cameraOpen, captureFrameFromVideo, capturedFrame, identifyFromImage, openResultFromPrediction]);

  const openCamera = useCallback(async () => {
    if (isStartingCamera) return;

    stopSmartScan();
    setIsStartingCamera(true);
    setPermissionDenied(false);
    setViewMode("capture");
    setBackgroundImage(null);
    setCapturedFrame(null);
    setResults([]);
    setSelectedIndex(0);
    setSavedImageUrl(null);
    setScanHeadline("Smart scan ready");
    setStatusMessage("Opening camera...");
    setCameraOpen(true);
  }, [isStartingCamera, stopSmartScan]);

  const closeScanner = useCallback(() => {
    stopSmartScan();
    releaseCamera();
    setCameraOpen(false);
    setIsStartingCamera(false);
    setViewMode("capture");
    setResults([]);
    setSelectedIndex(0);
    setBackgroundImage(null);
    setCapturedFrame(null);
    setSavedImageUrl(null);
    setCountDown(null);
    setState("idle");
    setScanHeadline("Smart scan ready");
    setStatusMessage("Frame one leaf clearly for the best result.");
  }, [releaseCamera, stopSmartScan]);

  const nextDetection = useCallback(() => {
    closeScanner();
    void openCamera();
  }, [closeScanner, openCamera]);

  const captureForScan = useCallback(() => {
    const frame = captureFrameFromVideo();
    if (!frame) {
      setScanHeadline("Capture failed");
      setStatusMessage("Could not capture frame yet. Hold steady and try again.");
      return;
    }

    setCapturedFrame(frame);
    setScanHeadline("Frame captured");
    setStatusMessage("Great. Tap Scan to run a 2+2 second intelligent scan.");
  }, [captureFrameFromVideo]);

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

        setState("idle");
        setScanHeadline("Smart scan ready");
        setStatusMessage("Place the plant leaf inside the frame, hold still, and tap Start Plant Scan.");
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
      stopSmartScan();
    };
  }, [cameraOpen, isStartingCamera, stopSmartScan]);

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
          <p>Open the camera to analyze a leaf and identify your plant in seconds.</p>
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

        <div className={styles.scanHeader}>
          <p className={styles.scanOverline}>Plant Scanner</p>
          <p className={styles.scanTitle}>AI Leaf Identification</p>
        </div>

        <button type="button" className={styles.iconButtonLeft} onClick={viewMode === "details" ? () => setViewMode("results") : closeScanner}>
          <span>‹</span>
        </button>
        <button type="button" className={styles.iconButtonRight} onClick={viewMode === "details" ? nextDetection : closeScanner}>
          <span>{viewMode === "details" ? "↻" : "×"}</span>
        </button>

        {viewMode === "capture" ? (
          <>
            <div className={styles.guideFrame}>
              <span className={styles.bracketTopLeft} />
              <span className={styles.bracketTopRight} />
              <span className={styles.bracketBottomLeft} />
              <span className={styles.bracketBottomRight} />
              {(state === "scanning" || countDown !== null) && <div className={styles.scanLine} />}
            </div>

            {countDown !== null ? (
              <div className={styles.cornerCountdownOverlay}>
                <span className={styles.cornerCountdownNumber}>{countDown}</span>
              </div>
            ) : null}

            <div className={styles.captureBottomOverlay}>
              <div className={styles.floatingResultCard}>
                <div className={styles.floatingThumb}>
                  <svg viewBox="0 0 24 24"><path d="M12 2L9 8h6l-3-6zM5 10c0 4.5 3 8 7 8s7-3.5 7-8-3-8-7-8-7 3.5-7 8z" opacity="0.3"/><path d="M12 21c-4.5 0-8-3.5-8-8s3.5-8 8-8 8 3.5 8 8-3.5 8-8 8zM12 7v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="15" r="1.5"/></svg>
                </div>
                <div className={styles.floatingInfo}>
                  <h3 className={styles.floatingTitle}>{scanHeadline}</h3>
                  <p className={styles.floatingDesc}>{statusMessage}</p>
                </div>
                <div className={styles.floatingArrow}>
                  <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
              </div>

              <div className={styles.segmentedControl}>
                <button type="button" className={`${styles.segmentedBtn} ${styles.active}`}>Identify</button>
                <button type="button" className={styles.segmentedBtn}>Multiple</button>
              </div>

              <div className={styles.bottomNav}>
                <button type="button" className={styles.iconBtn}>
                  <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 2v12h16V6H4zm8 3c1.65 0 3 1.35 3 3s-1.35 3-3 3-3-1.35-3-3 1.35-3 3-3zm0 2c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm-6 6l3.5-4.5L11 14l2.5-3.5L17 17H6z"/></svg>
                  <span>Gallery</span>
                </button>
                
                <button
                  type="button"
                  className={styles.mainScanBtn}
                  onClick={state === "countdown" || state === "scanning" ? closeScanner : () => void startSmartScan()}
                >
                  {state === "countdown" || state === "scanning" ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24"><path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4M7 12h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M12 7v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  )}
                </button>

                <button type="button" className={styles.iconBtn}>
                  <svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                  <span>Photo Tips</span>
                </button>
              </div>
            </div>
          </>
        ) : null}

        {viewMode === "results" ? (
          <div className={styles.resultsLayer}>
            <div className={styles.resultsHeader}>
              <p className={styles.resultsKicker}>Detection Results</p>
              <p className={styles.resultsCaption}>Ordered by strongest match confidence.</p>
            </div>
            <p className={styles.resultsIntro}>
              We found <strong>{results.length}</strong> possible matches. Select a card to view care details.
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
                  <div
                    className={styles.resultThumb}
                    style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
                  />
                  <div className={styles.resultInfo}>
                    <p className={styles.resultName}>{item.name}</p>
                    <p className={styles.resultMeta}>
                      {Math.round(item.confidence * 100)}% match
                    </p>
                    <div className={styles.resultMetaRow}>
                      <span className={`${styles.badge} ${styles[`badge${resolveConfidenceTone(item.confidence)}`]}`}>
                        {resolveConfidenceLevel(item.confidence)} confidence
                      </span>
                      <span className={styles.sourcePill}>{item.source.toUpperCase()}</span>
                    </div>
                  </div>
                  <span className={styles.rankTag}>#{index + 1}</span>
                </button>
              ))}
            </div>

            <div className={styles.captureActions}>
              {closeMatches.length > 0 ? (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowCloseMatches((current) => !current)}
                >
                  {showCloseMatches ? "Hide Close Matches" : "Close Matches"}
                </button>
              ) : null}
              <button type="button" className={styles.primaryBtn} onClick={nextDetection}>
                Scan Next Plant
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={closeScanner}>
                Done
              </button>
            </div>

            {showCloseMatches && closeMatches.length > 0 ? (
              <div className={styles.closeMatchesPanel}>
                <p className={styles.closeMatchesTitle}>Close match list</p>
                <ul className={styles.closeMatchesList}>
                  {closeMatches.map((item, index) => (
                    <li key={`${item.name}-close-${index}`}>
                      <span>{item.name}</span>
                      <strong>{Math.round(item.confidence * 100)}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {viewMode === "details" && selectedItem ? (
          <div className={styles.detailsLayer}>
            <h3>{selectedItem.name}</h3>
            <div className={styles.detailMetaRow}>
              <p className={styles.detailSub}>{Math.round(selectedItem.confidence * 100)}% match confidence</p>
              <span className={`${styles.badge} ${styles[`badge${resolveConfidenceTone(selectedItem.confidence)}`]}`}>
                {resolveConfidenceLevel(selectedItem.confidence)}
              </span>
            </div>
            {selectedItem.indications ? (
              <ul className={styles.indicationList}>
                {selectedItem.indications.commonName ? <li><span>Common name</span><strong>{selectedItem.indications.commonName}</strong></li> : null}
                {selectedItem.indications.scientificName ? <li><span>Scientific name</span><strong>{selectedItem.indications.scientificName}</strong></li> : null}
                {selectedItem.indications.family ? <li><span>Family</span><strong>{selectedItem.indications.family}</strong></li> : null}
                {selectedItem.indications.genus ? <li><span>Genus</span><strong>{selectedItem.indications.genus}</strong></li> : null}
              </ul>
            ) : null}
            <p className={styles.detailText}>
              {selectedItem.description ?? "Detailed information is not available for this match yet."}
            </p>
            <p className={styles.detailMeta}>Data source: {selectedItem.source.toUpperCase()}</p>
            {savedImageUrl ? <p className={styles.savedTag}>Saved to collection</p> : null}
            <button type="button" className={styles.primaryBtn} onClick={nextDetection}>
              Scan Next Plant
            </button>
          </div>
        ) : null}
      </div>

    </section>
  );
}
