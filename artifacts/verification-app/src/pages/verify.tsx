import { useState } from "react";
import { useLocation, Link } from "wouter";
import { CameraCapture } from "@/components/camera-capture";
import { useVerifyChild } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertTriangle, ArrowLeft } from "lucide-react";

export function Verify() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<"face" | "ear" | "submitting" | "result">("face");
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [earImage, setEarImage] = useState<string | null>(null);
  
  const verifyMutation = useVerifyChild();

  const handleFaceCapture = (base64: string) => {
    setFaceImage(base64);
    setStep("ear");
  };

  const handleEarCapture = (base64: string) => {
    setEarImage(base64);
    submitVerification(faceImage!, base64);
  };

  const submitVerification = (face: string, ear: string) => {
    setStep("submitting");
    verifyMutation.mutate(
      {
        data: {
          face_image: face,
          ear_image: ear,
          // mock gps coordinates
          gps_lat: 12.9816,
          gps_lng: 7.6222
        }
      },
      {
        onSuccess: () => setStep("result"),
        onError: () => setStep("result") // Handle error in result view for simplicity in this demo
      }
    );
  };

  const handleDone = () => {
    setLocation("/");
  };

  if (step === "face") {
    return (
      <CameraCapture 
        title="1. Face Photo" 
        subtitle="Look straight at the camera" 
        overlayType="face" 
        onCapture={handleFaceCapture} 
      />
    );
  }

  if (step === "ear") {
    return (
      <CameraCapture 
        title="2. Profile / Ear Photo" 
        subtitle="Turn head to the side" 
        overlayType="ear" 
        onCapture={handleEarCapture} 
      />
    );
  }

  if (step === "submitting") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 border-8 border-gray-700 border-t-white rounded-full animate-spin mb-8"></div>
        <h2 className="text-3xl font-bold text-white mb-2">Analyzing...</h2>
        <p className="text-gray-400 text-lg">Checking central database</p>
      </div>
    );
  }

  // Result Screen
  const isError = verifyMutation.isError;
  const result = verifyMutation.data;
  
  const status = isError ? "error" : result?.status;
  
  let bgColor = "bg-gray-900";
  let icon = <AlertTriangle className="w-32 h-32 text-white mb-8" />;
  let title = "SYSTEM ERROR";
  let message = "Could not complete verification. Try again.";

  if (status === "match") {
    bgColor = "bg-success";
    icon = <XCircle className="w-32 h-32 text-white mb-8" />;
    title = "ALREADY VERIFIED";
    message = "STOP. This child has already been registered and verified.";
  } else if (status === "new") {
    bgColor = "bg-destructive"; // RED
    icon = <CheckCircle className="w-32 h-32 text-white mb-8" />;
    title = "NEW CHILD";
    message = "Child not found in database. Proceed to register.";
  } else if (status === "review") {
    bgColor = "bg-warning"; // AMBER
    icon = <AlertTriangle className="w-32 h-32 text-white mb-8" />;
    title = "NEEDS REVIEW";
    message = "Match uncertain. Escalated to supervisor.";
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-8 text-center ${bgColor}`}>
      {icon}
      
      <h1 className="text-5xl font-black text-white mb-6 tracking-tight leading-tight uppercase">
        {title}
      </h1>
      
      <p className="text-2xl font-bold text-white/90 mb-12 max-w-md">
        {message}
      </p>

      {status === "match" && result?.child && (
        <div className="bg-white/20 rounded-xl p-4 w-full max-w-sm mb-12 text-left">
          <p className="text-white/80 text-sm font-bold uppercase mb-1">Matched Record:</p>
          <p className="text-white text-2xl font-bold">{result.child.first_name} {result.child.surname}</p>
          <p className="text-white text-lg">Guardian: {result.child.guardian_name}</p>
          <p className="text-white text-lg">LGA: {result.child.lga}</p>
        </div>
      )}

      <div className="w-full max-w-sm space-y-4">
        {status === "new" && (
          <Button 
            onClick={() => setLocation("/register")} 
            className="w-full h-20 text-2xl font-bold bg-white text-destructive hover:bg-gray-100"
          >
            Register This Child
          </Button>
        )}
        
        <Button 
          onClick={handleDone} 
          variant={status === "new" ? "outline" : "default"}
          className={`w-full h-20 text-2xl font-bold ${
            status === "new" 
              ? "border-white text-white hover:bg-white/10" 
              : "bg-white text-black hover:bg-gray-100"
          }`}
        >
          {status === "new" ? "Cancel" : "Done"}
        </Button>
      </div>
    </div>
  );
}
