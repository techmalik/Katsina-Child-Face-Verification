import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  overlayType?: "face" | "ear";
  title?: string;
  subtitle?: string;
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
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
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
        videoRef.current.onloadedmetadata = () => setReady(true);
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
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) onCapture(capturedImage);
  };

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
            className="w-20 h-20 rounded-full bg-white border-4 border-gray-400 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Camera className="h-8 w-8 text-black" />
          </button>
        )}
      </div>
    </div>
  );
}
