import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, Check } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  overlayType?: "face" | "ear";
  title?: string;
  subtitle?: string;
}

export function CameraCapture({ onCapture, overlayType = "face", title = "Capture Photo", subtitle }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Failed to access camera. Please check permissions.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        setCapturedImage(base64);
        stopCamera();
      }
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <h2 className="text-white text-xl font-bold text-center">{title}</h2>
        {subtitle && <p className="text-white/80 text-center text-sm mt-1">{subtitle}</p>}
      </div>

      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {error ? (
          <div className="text-white p-6 text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <Button onClick={startCamera} variant="outline" className="min-h-touch">Retry</Button>
          </div>
        ) : capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Guide Overlays */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center border-[6px] border-black/20">
              {overlayType === "face" && (
                <div className="w-64 h-80 border-4 border-dashed border-white/50 rounded-[40%] animate-pulse" />
              )}
              {overlayType === "ear" && (
                <div className="w-48 h-72 border-4 border-dashed border-white/50 rounded-full animate-pulse ml-16" />
              )}
            </div>
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="bg-black pb-8 pt-4 px-6 flex justify-center items-center gap-6">
        {capturedImage ? (
          <>
            <Button 
              size="lg" 
              variant="outline" 
              onClick={handleRetake}
              className="w-full h-16 text-lg font-bold"
            >
              <RefreshCw className="mr-2 h-6 w-6" /> Retake
            </Button>
            <Button 
              size="lg" 
              onClick={handleConfirm}
              className="w-full h-16 text-lg font-bold bg-primary hover:bg-primary/90 text-white"
            >
              <Check className="mr-2 h-6 w-6" /> Confirm
            </Button>
          </>
        ) : (
          <Button 
            size="lg" 
            onClick={handleCapture}
            className="w-20 h-20 rounded-full bg-white text-black hover:bg-gray-200 border-4 border-gray-400"
          >
            <Camera className="h-8 w-8" />
          </Button>
        )}
      </div>
    </div>
  );
}
