import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, Sun, SunDim, SwitchCamera } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (images: string[]) => void;
  overlayType?: "face" | "ear";
  title?: string;
  subtitle?: string;
}

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function playBeep(type: "shutter" | "success") {
  try {
    const AudioCtx =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "shutter") {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } else {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
    osc.onended = () => ctx.close();
  } catch {
    // Audio not supported — silently ignore
  }
}

function getFrameBrightness(video: HTMLVideoElement): number {
  try {
    const cvs = document.createElement("canvas");
    cvs.width = 40;
    cvs.height = 30;
    const ctx = cvs.getContext("2d");
    if (!ctx) return 128;
    ctx.drawImage(video, 0, 0, 40, 30);
    const { data } = ctx.getImageData(0, 0, 40, 30);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return sum / (data.length / 4);
  } catch {
    return 128;
  }
}

const OVAL_BASE = {
  face: { w: 256, h: 320, dx: 0  },
  ear:  { w: 160, h: 256, dx: 32 },
} as const;

interface OvalDims {
  w: number;
  h: number;
  dx: number;
  borderRadius: "50%";
}

function computeOval(overlayType: "face" | "ear"): OvalDims {
  const base = OVAL_BASE[overlayType];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availH = (vh - 164) * 0.80;
  const scaleW = Math.min(1, (vw * 0.78) / base.w);
  const scaleH = Math.min(1, availH / base.h);
  const scale  = Math.min(scaleW, scaleH);
  return {
    w: Math.round(base.w * scale),
    h: Math.round(base.h * scale),
    dx: Math.round(base.dx * scale),
    borderRadius: "50%",
  };
}

function getClipPath(oval: OvalDims): string {
  const rx = oval.w / 2;
  const ry = oval.h / 2;
  const cx = oval.dx === 0 ? "50%" : `calc(50% + ${oval.dx}px)`;
  return `ellipse(${rx}px ${ry}px at ${cx} 50%)`;
}

function computeCrop(
  video: HTMLVideoElement,
  oval: OvalDims,
  mirrored: boolean,
): { sx: number; sy: number; sw: number; sh: number } {
  const videoW = video.videoWidth  || 640;
  const videoH = video.videoHeight || 480;
  const elemW  = video.clientWidth  || videoW;
  const elemH  = video.clientHeight || videoH;

  const scale   = Math.max(elemW / videoW, elemH / videoH);
  const offsetX = (videoW * scale - elemW) / 2;
  const offsetY = (videoH * scale - elemH) / 2;

  // When mirrored, the displayed cx must be flipped to find the real video x
  const displayCx = elemW / 2 + oval.dx;
  const realCx = mirrored ? elemW - displayCx : displayCx;
  const cy = elemH / 2;

  const toVx = (ex: number) => (ex + offsetX) / scale;
  const toVy = (ey: number) => (ey + offsetY) / scale;

  const sx = Math.max(0, toVx(realCx - oval.w / 2));
  const sy = Math.max(0, toVy(cy - oval.h / 2));
  const sw = Math.min(videoW, toVx(realCx + oval.w / 2)) - sx;
  const sh = Math.min(videoH, toVy(cy + oval.h / 2)) - sy;

  return { sx, sy, sw, sh };
}

const FRAME_COUNT = 3;
const FRAME_INTERVAL_MS = 300;

type FacingMode = "environment" | "user";

export function CameraCapture({
  onCapture,
  overlayType = "face",
  title = "Capture Photo",
  subtitle,
}: CameraCaptureProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const brightnessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedFramesRef = useRef<string[]>([]);

  const [oval, setOval] = useState<OvalDims>(() => computeOval(overlayType));
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");

  // front camera preview is mirrored so it feels natural; back camera is not
  const isMirrored = facingMode === "user";

  useEffect(() => {
    const onResize = () => setOval(computeOval(overlayType));
    window.addEventListener("resize", onResize);
    screen.orientation?.addEventListener("change", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      screen.orientation?.removeEventListener("change", onResize);
    };
  }, [overlayType]);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [ready,  setReady]  = useState(false);
  const [brightness, setBrightness] = useState<number>(128);
  const [capturing, setCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (brightnessIntervalRef.current) {
      clearInterval(brightnessIntervalRef.current);
      brightnessIntervalRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (mode: FacingMode = "environment") => {
    setError(null);
    setReady(false);
    setCapturedImage(null);
    capturedFramesRef.current = [];
    stopCamera();
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = ms;
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        videoRef.current.onloadedmetadata = () => {
          setReady(true);
          brightnessIntervalRef.current = setInterval(() => {
            if (videoRef.current) {
              setBrightness(getFrameBrightness(videoRef.current));
            }
          }, 1000);
        };
      }
    } catch {
      setError("Failed to access camera. Please check permissions.");
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera(facingMode);
    return stopCamera;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlipCamera = useCallback(() => {
    const next: FacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  const captureFrame = useCallback((): string | null => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const { sx, sy, sw, sh } = computeCrop(video, oval, isMirrored);
    canvas.width  = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // For front camera: the crop already accounts for the mirror,
    // so we draw straight — the saved image will be un-mirrored (correct)
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, [oval, isMirrored]);

  const handleCapture = useCallback(async () => {
    if (!ready || capturing) return;

    setCapturing(true);
    capturedFramesRef.current = [];
    playBeep("shutter");

    const frames: string[] = [];

    const f1 = captureFrame();
    if (f1) frames.push(f1);
    setCountdown(FRAME_COUNT - 1);

    for (let i = 1; i < FRAME_COUNT; i++) {
      await new Promise<void>((r) => setTimeout(r, FRAME_INTERVAL_MS));
      const frame = captureFrame();
      if (frame) frames.push(frame);
      setCountdown(FRAME_COUNT - 1 - i === 0 ? null : FRAME_COUNT - 1 - i);
    }

    stopCamera();
    capturedFramesRef.current = frames;
    setCapturedImage(frames[0] ?? null);
    setCapturing(false);
  }, [ready, capturing, captureFrame, stopCamera]);

  const handleRetake = () => {
    setCapturedImage(null);
    setCountdown(null);
    capturedFramesRef.current = [];
    startCamera(facingMode);
  };

  const handleConfirm = () => {
    const frames = capturedFramesRef.current;
    if (frames.length > 0) {
      playBeep("success");
      onCapture(frames);
    }
  };

  const lightLevel: "good" | "dim" | "dark" =
    brightness >= 100 ? "good" : brightness >= 55 ? "dim" : "dark";

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <h2 className="text-white text-lg sm:text-xl font-bold text-center">{title}</h2>
        {subtitle && (
          <p className="text-white/70 text-center text-sm mt-1">{subtitle}</p>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {error ? (
          <div className="text-white p-6 text-center">
            <p className="text-red-400 mb-4 text-lg">{error}</p>
            <Button onClick={() => startCamera(facingMode)} variant="outline" className="min-h-[48px]">
              Retry
            </Button>
          </div>
        ) : capturedImage ? (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={capturedImage}
              alt="Captured"
              style={{
                width: oval.w,
                height: oval.h,
                borderRadius: oval.borderRadius,
                border: "4px solid white",
              }}
              className="object-cover"
            />
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={ready
                ? { clipPath: getClipPath(oval), transform: isMirrored ? "scaleX(-1)" : "none" }
                : { transform: isMirrored ? "scaleX(-1)" : "none" }}
            />
            {ready && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className="border-4 border-white"
                  style={{
                    width: oval.w,
                    height: oval.h,
                    borderRadius: oval.borderRadius,
                    transform: oval.dx ? `translateX(${oval.dx}px)` : undefined,
                  }}
                />
              </div>
            )}

            {capturing && countdown !== null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                <div className="bg-black/70 rounded-full w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center mb-3">
                  <span className="text-white text-4xl sm:text-5xl font-black">{countdown}</span>
                </div>
                <p className="text-white font-bold text-lg sm:text-xl tracking-wide">Hold still…</p>
              </div>
            )}

            {ready && !capturing && (
              <div className="absolute top-16 right-3 z-20 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1.5 pointer-events-none">
                {lightLevel === "good" ? (
                  <Sun className="w-4 h-4 text-green-400" />
                ) : (
                  <SunDim className={`w-4 h-4 ${lightLevel === "dim" ? "text-yellow-400" : "text-red-400"}`} />
                )}
                <span className={`text-xs font-bold ${
                  lightLevel === "good" ? "text-green-400" :
                  lightLevel === "dim" ? "text-yellow-400" : "text-red-400"
                }`}>
                  {lightLevel === "good" ? "Good light" : lightLevel === "dim" ? "Low light" : "Too dark"}
                </span>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="bg-black pb-safe pb-8 pt-4 px-6 flex justify-center items-center gap-4">
        {capturedImage ? (
          <>
            <Button
              size="lg"
              variant="outline"
              onClick={handleRetake}
              className="flex-1 h-14 sm:h-16 text-base sm:text-lg font-bold border-white/40 text-white hover:bg-white/10"
            >
              <RefreshCw className="mr-2 h-5 w-5" /> Retake
            </Button>
            <Button
              size="lg"
              onClick={handleConfirm}
              className="flex-1 h-14 sm:h-16 text-base sm:text-lg font-bold bg-primary hover:bg-primary/90 text-white"
            >
              <Check className="mr-2 h-5 w-5" /> Use Photo
            </Button>
          </>
        ) : (
          <>
            {/* Camera flip button */}
            <button
              onClick={handleFlipCamera}
              disabled={capturing}
              className="w-14 h-14 rounded-full bg-white/20 border border-white/30 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
              aria-label="Switch camera"
            >
              <SwitchCamera className="h-6 w-6 text-white" />
            </button>

            {/* Shutter button */}
            <button
              onClick={handleCapture}
              disabled={!ready || capturing}
              className="w-20 h-20 rounded-full bg-white border-4 border-gray-400 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
              aria-label="Capture photo"
            >
              <Camera className="h-8 w-8 text-black" />
            </button>

            {/* Spacer to keep shutter centred */}
            <div className="w-14 h-14" />
          </>
        )}
      </div>
    </div>
  );
}
