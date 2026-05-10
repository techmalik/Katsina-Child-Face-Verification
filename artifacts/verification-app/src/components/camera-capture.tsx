import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check, Sun, SunDim } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  overlayType?: "face" | "ear";
  title?: string;
  subtitle?: string;
}

function playBeep(type: "shutter" | "success") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx() as AudioContext;
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

export function CameraCapture({
  onCapture,
  overlayType = "face",
  title = "Capture Photo",
  subtitle,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const brightnessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [brightness, setBrightness] = useState<number>(128);

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

  const startCamera = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
  }, []);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImage(base64);
    stopCamera();
    playBeep("shutter");
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      playBeep("success");
      onCapture(capturedImage);
    }
  };

  const lightLevel: "good" | "dim" | "dark" =
    brightness >= 100 ? "good" : brightness >= 55 ? "dim" : "dark";

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <h2 className="text-white text-xl font-bold text-center">{title}</h2>
        {subtitle && (
          <p className="text-white/70 text-center text-sm mt-1">{subtitle}</p>
        )}
      </div>

      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {error ? (
          <div className="text-white p-6 text-center">
            <p className="text-red-400 mb-4 text-lg">{error}</p>
            <Button onClick={startCamera} variant="outline" className="min-h-[48px]">
              Retry
            </Button>
          </div>
        ) : capturedImage ? (
          <img
            src={capturedImage}
            alt="Captured"
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {ready && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="absolute inset-0 bg-black/30" />
                {overlayType === "face" && (
                  <div className="relative w-64 h-80 border-4 border-white rounded-[40%] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                )}
                {overlayType === "ear" && (
                  <div className="relative w-40 h-64 border-4 border-white rounded-[30%] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] translate-x-8" />
                )}
              </div>
            )}

            {ready && (
              <div className="absolute top-20 right-4 z-20 flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1.5 pointer-events-none">
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
              className="flex-1 h-16 text-lg font-bold border-white/40 text-white hover:bg-white/10"
            >
              <RefreshCw className="mr-2 h-5 w-5" /> Retake
            </Button>
            <Button
              size="lg"
              onClick={handleConfirm}
              className="flex-1 h-16 text-lg font-bold bg-primary hover:bg-primary/90 text-white"
            >
              <Check className="mr-2 h-5 w-5" /> Use Photo
            </Button>
          </>
        ) : (
          <button
            onClick={handleCapture}
            disabled={!ready}
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-400 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
          >
            <Camera className="h-8 w-8 text-black" />
          </button>
        )}
      </div>
    </div>
  );
}
