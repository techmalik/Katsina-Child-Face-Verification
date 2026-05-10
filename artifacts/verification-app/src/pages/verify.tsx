import { useState } from "react";
import { useLocation } from "wouter";
import { CameraCapture } from "@/components/camera-capture";
import { useVerifyChild } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";

export function Verify() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"face" | "submitting" | "result" | "quality_error">("face");
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [rejectedImage, setRejectedImage] = useState<string | null>(null);

  const verifyMutation = useVerifyChild();

  const handleFaceCapture = (images: string[]) => {
    setRejectedImage(images[0] ?? null);
    setStep("submitting");
    verifyMutation.mutate(
      {
        data: {
          face_images: images,
          gps_lat: null,
          gps_lng: null,
        },
      },
      {
        onSuccess: () => setStep("result"),
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; data?: { error?: string; error_code?: string } };
          const msg = apiErr?.data?.error ?? "";
          const code = apiErr?.data?.error_code ?? "";
          if (code === "quality_low" || code === "liveness_failed" || msg.includes("No face detected")) {
            setQualityError(msg);
            setStep("quality_error");
          } else {
            setStep("result");
          }
        },
      }
    );
  };

  const handleDone = () => {
    setLocation("/");
  };

  if (step === "quality_error") {
    return (
      <div className="min-h-screen bg-gray-900 overflow-y-auto">
        <div className="min-h-screen flex flex-col items-center justify-center p-5 sm:p-8 text-center">
          <div className="w-full max-w-sm space-y-5">
            <div className="rounded-xl p-4 sm:p-5 flex items-center gap-3 text-white shadow bg-orange-600">
              <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 shrink-0" />
              <div className="text-left">
                <p className="font-black text-lg sm:text-xl leading-tight">Photo Quality Too Low</p>
                <p className="text-white/80 text-sm mt-0.5">Retake in better conditions</p>
              </div>
            </div>

            {rejectedImage && (
              <div className="flex flex-col items-center gap-2">
                <img
                  src={rejectedImage}
                  alt="Rejected"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover border-4 border-red-400/60"
                />
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Rejected Photo</span>
              </div>
            )}

            <div className="bg-white/10 border border-white/20 rounded-xl p-4">
              <p className="text-white font-bold text-base">{qualityError}</p>
            </div>

            <div className="bg-amber-900/40 border border-amber-500/40 rounded-xl p-4 text-left space-y-1">
              <p className="text-amber-300 font-bold text-sm mb-1">Tips:</p>
              <ul className="text-amber-200 text-sm space-y-1 list-disc list-inside">
                <li>Move closer so the face fills the oval</li>
                <li>Ensure adequate lighting — avoid shadows</li>
                <li>Hold steady and look directly at the camera</li>
              </ul>
            </div>

            <Button
              onClick={() => {
                setQualityError(null);
                setRejectedImage(null);
                setStep("face");
              }}
              className="w-full h-14 sm:h-16 text-lg sm:text-xl font-bold bg-white text-gray-900 hover:bg-gray-100"
            >
              <RefreshCw className="mr-2 h-5 w-5 sm:h-6 sm:w-6" /> Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "face") {
    return (
      <CameraCapture
        key="face"
        title="Face Photo"
        subtitle="Look straight at the camera"
        overlayType="face"
        onCapture={handleFaceCapture}
        onCancel={() => setLocation("/")}
      />
    );
  }

  if (step === "submitting") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 sm:w-24 sm:h-24 border-8 border-gray-700 border-t-white rounded-full animate-spin mb-6 sm:mb-8"></div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Analyzing...</h2>
        <p className="text-gray-400 text-base sm:text-lg">Checking central database</p>
      </div>
    );
  }

  const isError = verifyMutation.isError;
  const result = verifyMutation.data;
  const status = isError ? "error" : result?.status;

  let bgColor = "bg-gray-900";
  let icon = <AlertTriangle className="w-20 h-20 sm:w-28 sm:h-28 text-white mb-4 sm:mb-6" />;
  let title = "SYSTEM ERROR";
  let message = "Could not complete verification. Try again.";

  if (status === "match") {
    bgColor = "bg-destructive";
    icon = <XCircle className="w-20 h-20 sm:w-28 sm:h-28 text-white mb-4 sm:mb-6" />;
    title = "ALREADY VERIFIED";
    message = "STOP. This child has already been registered and verified.";
  } else if (status === "new") {
    bgColor = "bg-success";
    icon = <CheckCircle className="w-20 h-20 sm:w-28 sm:h-28 text-white mb-4 sm:mb-6" />;
    title = "NEW CHILD";
    message = "Child not found in database. Proceed to register.";
  } else if (status === "review") {
    bgColor = "bg-warning";
    icon = <AlertTriangle className="w-20 h-20 sm:w-28 sm:h-28 text-white mb-4 sm:mb-6" />;
    title = "NEEDS REVIEW";
    message = "Match uncertain. Escalated to supervisor.";
  }

  return (
    <div className={`min-h-screen overflow-y-auto ${bgColor}`}>
      <div className="min-h-screen flex flex-col items-center justify-center p-5 sm:p-8 text-center py-10">
        {icon}

        <h1 className="text-3xl sm:text-5xl font-black text-white mb-3 sm:mb-6 tracking-tight leading-tight uppercase">
          {title}
        </h1>

        <p className="text-lg sm:text-2xl font-bold text-white/90 mb-6 sm:mb-10 max-w-sm">
          {message}
        </p>

        {status === "match" && result?.child && (
          <div className="bg-white/20 rounded-xl p-4 w-full max-w-sm mb-6 sm:mb-10 text-left">
            <p className="text-white/80 text-sm font-bold uppercase mb-1">Matched Record:</p>
            <p className="text-white text-xl sm:text-2xl font-bold">{result.child.first_name} {result.child.surname}</p>
            <p className="text-white text-base sm:text-lg">Guardian: {result.child.guardian_name}</p>
            <p className="text-white text-base sm:text-lg">LGA: {result.child.lga}</p>
          </div>
        )}

        <div className="w-full max-w-sm space-y-3 sm:space-y-4">
          {status === "new" && (
            <Button
              onClick={() => setLocation("/register")}
              className="w-full h-14 sm:h-20 text-xl sm:text-2xl font-bold bg-white text-destructive hover:bg-gray-100"
            >
              Register This Child
            </Button>
          )}

          <Button
            onClick={handleDone}
            variant={status === "new" ? "outline" : "default"}
            className={`w-full h-14 sm:h-20 text-xl sm:text-2xl font-bold ${
              status === "new"
                ? "border-white text-white hover:bg-white/10"
                : "bg-white text-black hover:bg-gray-100"
            }`}
          >
            {status === "new" ? "Cancel" : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
