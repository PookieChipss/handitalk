// src/hooks/useSignDetector.js
import { useCallback, useEffect, useRef, useState } from "react";

// IMPORTANT: import the *path* modules with .js suffixes:
import { Hands, HAND_CONNECTIONS } from "@mediapipe/hands/hands.js";
import {
  drawConnectors,
  drawLandmarks,
} from "@mediapipe/drawing_utils/drawing_utils.js";

export default function useSignDetector() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const handsRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [usingFront, setUsingFront] = useState(true);
  const [status, setStatus] = useState("ready");
  const [fps, setFps] = useState(0);

  // keep a last timestamp for FPS
  const lastTsRef = useRef(performance.now());

  const stopCam = useCallback(() => {
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStatus("stopped");
  }, []);

  const startCam = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: usingFront ? "user" : "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    await video.play();

    // size canvas == video
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctxRef.current = canvas.getContext("2d");
  }, [usingFront]);

  const initHands = useCallback(async () => {
    if (handsRef.current) return;

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });

    hands.onResults((results) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) return;

      // Clear & optionally mirror drawing
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      const lms = results.multiHandLandmarks || [];
      for (const lm of lms) {
        drawConnectors(ctx, lm, HAND_CONNECTIONS, {
          color: "#ffffff",
          lineWidth: 2,
        });
        drawLandmarks(ctx, lm, { color: "#88c", radius: 2.5 });
      }
      ctx.restore();

      // FPS
      const now = performance.now();
      const dt = now - lastTsRef.current;
      lastTsRef.current = now;
      if (dt > 0) setFps(1000 / dt);
    });

    handsRef.current = hands;
  }, [mirror]);

  const processFrame = useCallback(async () => {
    if (!running) return;
    const hands = handsRef.current;
    const video = videoRef.current;
    if (hands && video && video.readyState >= 2) {
      try {
        await hands.send({ image: video });
      } catch (e) {
        console.error("hands.send error:", e);
      }
    }
    rafRef.current = requestAnimationFrame(processFrame);
  }, [running]);

  const start = useCallback(async () => {
    try {
      setStatus("starting…");
      await initHands();
      await startCam();

      videoRef.current.style.transform = mirror ? "scaleX(-1)" : "none";
      setRunning(true);
      setStatus("running");
      rafRef.current = requestAnimationFrame(processFrame);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, [initHands, startCam, processFrame, mirror]);

  const stop = useCallback(() => {
    stopCam();
  }, [stopCam]);

  const flip = useCallback(async () => {
    setUsingFront((p) => !p);
    // If running, restart camera immediately with new facing mode
    if (running) {
      await startCam();
    }
  }, [running, startCam]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopCam();
    };
  }, [stopCam]);

  return {
    // refs
    videoRef,
    canvasRef,

    // state
    running,
    status,
    fps,
    mirror,
    usingFront,

    // actions
    start,
    stop,
    flip,
    setMirror,
  };
}
