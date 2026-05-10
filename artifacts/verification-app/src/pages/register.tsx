import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useVerifyChild,
  useRegisterChild,
  useListLgas,
  getListLgasQueryKey,
} from "@workspace/api-client-react";
import type { VerificationResult, Child } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { CameraCapture } from "@/components/camera-capture";
import { VillageCombobox } from "@/components/village-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Loader2,
  ArrowRight,
  Camera,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

type Step = "face" | "checking" | "exists" | "review" | "new_form" | "duplicate" | "quality_error";

const formSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  surname: z.string().min(1, "Surname is required"),
  guardian_name: z.string().min(1, "Guardian name is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  lga: z.string().min(1, "LGA is required"),
  village: z.string().min(1, "Village is required"),
  visible_marks: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function Register() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("face");
  const [faceImages, setFaceImages] = useState<string[]>([]);
  const faceImage = faceImages[0] ?? null;

  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<{ child: Child | null; confidence: number } | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState(false);

  const { data: lgas } = useListLgas({ query: { queryKey: getListLgasQueryKey() } });
  const verifyMutation = useVerifyChild();
  const registerMutation = useRegisterChild();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      surname: "",
      guardian_name: "",
      date_of_birth: "",
      lga: "",
      village: "",
      visible_marks: "",
    },
  });

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
      },
      () => setGpsError(true),
      { timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const resetFlow = () => {
    setStep("face");
    setFaceImages([]);
    setVerifyResult(null);
    setDuplicateMatch(null);
    setQualityError(null);
    form.reset();
  };

  const handleFaceCapture = (images: string[]) => {
    setFaceImages(images);
    setStep("checking");
    verifyMutation.mutate(
      {
        data: {
          face_images: images,
          gps_lat: gpsLat,
          gps_lng: gpsLng,
        },
      },
      {
        onSuccess: (data) => {
          setVerifyResult(data);
          if (data.status === "match") setStep("exists");
          else if (data.status === "review") setStep("review");
          else setStep("new_form");
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; data?: { error?: string; error_code?: string } };
          const msg = apiErr?.data?.error ?? "";
          const code = apiErr?.data?.error_code ?? "";
          if (code === "quality_low" || msg.includes("No face detected")) {
            setQualityError(msg);
            setStep("quality_error");
          } else {
            // Network or other error — proceed to form so the field worker isn't blocked
            setStep("new_form");
          }
        },
      }
    );
  };

  const onSubmit = (data: FormValues) => {
    if (faceImages.length === 0) {
      toast.error("Face photo is required");
      return;
    }
    registerMutation.mutate(
      {
        data: {
          first_name: data.first_name,
          surname: data.surname,
          guardian_name: data.guardian_name,
          date_of_birth: data.date_of_birth,
          lga: data.lga,
          village: data.village,
          visible_marks: data.visible_marks ?? null,
          gps_lat: gpsLat,
          gps_lng: gpsLng,
          face_images: faceImages,
        },
      },
      {
        onSuccess: () => {
          toast.success("Child registered successfully");
          setLocation("/registry");
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; data?: { matched_child?: Child | null; confidence?: number; error?: string; error_code?: string } };
          if (apiErr?.status === 409 && apiErr?.data) {
            setDuplicateMatch({
              child: apiErr.data.matched_child ?? null,
              confidence: apiErr.data.confidence ?? 0,
            });
            setStep("duplicate");
          } else {
            const msg = (apiErr?.data as { error?: string })?.error ?? "Registration failed";
            const code = (apiErr?.data as { error_code?: string })?.error_code ?? "";
            if (code === "quality_low" || msg.includes("No face detected")) {
              setQualityError(msg);
              setStep("quality_error");
            } else {
              toast.error(msg);
            }
          }
        },
      }
    );
  };

  /* ── Photo quality rejection ────────────────────────────────────── */
  if (step === "quality_error") {
    return (
      <Layout>
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-5">
          <div className="bg-red-600 text-white rounded-xl p-4 flex items-center gap-3 shadow">
            <AlertTriangle className="w-10 h-10 shrink-0" />
            <div>
              <p className="font-black text-xl leading-tight">Photo Quality Too Low</p>
              <p className="text-white/80 text-sm">Retake in better conditions</p>
            </div>
          </div>

          {faceImage && (
            <div className="flex flex-col items-center gap-2 py-2">
              <img
                src={faceImage}
                alt="Rejected capture"
                className="w-32 h-32 rounded-xl object-cover border-4 border-red-300"
              />
              <span className="text-xs font-bold text-red-500 uppercase tracking-wider">Rejected Photo</span>
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-900 font-bold text-base">{qualityError}</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
            <p className="text-amber-900 font-bold text-sm">Tips:</p>
            <ul className="text-amber-800 text-sm space-y-1 list-disc list-inside">
              <li>Move closer so the face fills the oval</li>
              <li>Ensure adequate lighting — avoid shadows</li>
              <li>Hold steady and look directly at the camera</li>
            </ul>
          </div>

          <Button onClick={resetFlow} className="w-full h-16 text-xl font-bold">
            <RefreshCw className="mr-2 h-6 w-6" /> Try Again
          </Button>
        </div>
      </Layout>
    );
  }

  /* ── Camera step ────────────────────────────────────────────────── */
  if (step === "face") {
    return (
      <CameraCapture
        key="face"
        title="Face Photo"
        subtitle="Look straight at the camera"
        overlayType="face"
        onCapture={handleFaceCapture}
      />
    );
  }

  /* ── Checking ───────────────────────────────────────────────────── */
  if (step === "checking") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="flex gap-4 mb-10">
          {faceImage && (
            <div className="flex flex-col items-center gap-2">
              <img
                src={faceImage}
                alt="Face"
                className="w-32 h-32 rounded-xl object-cover border-2 border-white/30"
              />
              <span className="text-white/60 text-xs font-bold uppercase tracking-wider">Face</span>
            </div>
          )}
        </div>
        <div className="w-14 h-14 border-4 border-gray-700 border-t-white rounded-full animate-spin mb-6" />
        <h2 className="text-2xl font-bold text-white">Checking database…</h2>
        <p className="text-gray-400 mt-2">Searching for matching record</p>
      </div>
    );
  }

  /* ── Already exists ─────────────────────────────────────────────── */
  if (step === "exists") {
    const child = verifyResult?.child;
    return (
      <Layout>
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-5">
          <div className="bg-green-500 text-white rounded-xl p-4 flex items-center gap-3 shadow">
            <CheckCircle2 className="w-10 h-10 shrink-0" />
            <div>
              <p className="font-black text-xl leading-tight">Already Registered</p>
              <p className="text-white/80 text-sm">This child is already in the database</p>
            </div>
          </div>

          <div className="flex gap-3">
            {faceImage && (
              <div className="flex flex-col items-center gap-1">
                <img src={faceImage} alt="Face" className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200" />
                <span className="text-xs font-bold text-gray-500 uppercase">Scanned Face</span>
              </div>
            )}
            {verifyResult?.confidence != null && (
              <div className="flex flex-col items-center justify-center ml-auto px-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-3xl font-black text-green-700">
                  {Math.round(verifyResult.confidence * 100)}%
                </p>
                <p className="text-xs font-bold text-green-600 uppercase">Match</p>
              </div>
            )}
          </div>

          {child && (
            <div className="bg-white rounded-xl p-5 shadow border space-y-4">
              <div className="flex gap-4 items-start">
                {child.face_photo ? (
                  <img
                    src={child.face_photo}
                    alt={child.first_name}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200 shrink-0">
                    <span className="text-3xl font-black text-gray-400">
                      {child.first_name[0]}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-2xl font-black text-gray-900">
                    {child.first_name} {child.surname}
                  </p>
                  <p className="text-gray-600 font-medium">Guardian: {child.guardian_name}</p>
                  <p className="text-gray-500 text-sm">{child.lga} · {child.village}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Date of Birth</p>
                  <p className="font-semibold text-gray-800">{child.date_of_birth}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Village</p>
                  <p className="font-semibold text-gray-800">{child.village}</p>
                </div>
                {child.visible_marks && (
                  <div className="col-span-2">
                    <p className="text-xs font-bold text-gray-400 uppercase">Visible Marks</p>
                    <p className="font-semibold text-gray-800">{child.visible_marks}</p>
                  </div>
                )}
              </div>

              {(child.verification_count ?? 0) > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-amber-800 font-bold text-sm">
                    Previously verified {child.verification_count} time(s) — do not issue again
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <Button onClick={() => setLocation("/")} className="w-full h-14 text-lg font-bold">
              Done — Return Home
            </Button>
            <Button variant="outline" onClick={resetFlow} className="w-full h-14 text-lg">
              <RefreshCw className="mr-2 h-5 w-5" /> Scan Another Child
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ── Needs supervisor review ────────────────────────────────────── */
  if (step === "review") {
    return (
      <Layout>
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-5">
          <div className="bg-yellow-400 text-gray-900 rounded-xl p-4 flex items-center gap-3 shadow">
            <AlertTriangle className="w-10 h-10 shrink-0" />
            <div>
              <p className="font-black text-xl leading-tight">Needs Supervisor Review</p>
              <p className="text-gray-800 text-sm">Match uncertain — escalated for review</p>
            </div>
          </div>
          <div className="flex gap-3">
            {faceImage && (
              <div className="flex flex-col items-center gap-1">
                <img src={faceImage} alt="Face" className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200" />
                <span className="text-xs font-bold text-gray-500 uppercase">Face</span>
              </div>
            )}
          </div>
          <p className="text-gray-600">The record has been flagged for supervisor review. Do not issue donations until cleared.</p>
          <div className="space-y-3">
            <Button onClick={() => setLocation("/")} className="w-full h-14 text-lg font-bold">
              Done — Return Home
            </Button>
            <Button variant="outline" onClick={resetFlow} className="w-full h-14 text-lg">
              <RefreshCw className="mr-2 h-5 w-5" /> Scan Again
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ── Duplicate detected during registration ─────────────────────── */
  if (step === "duplicate") {
    const child = duplicateMatch?.child ?? null;
    const confidence = duplicateMatch?.confidence ?? 0;
    return (
      <Layout>
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full space-y-5">
          <div className="bg-orange-500 text-white rounded-xl p-4 flex items-center gap-3 shadow">
            <AlertTriangle className="w-10 h-10 shrink-0" />
            <div>
              <p className="font-black text-xl leading-tight">Possible Duplicate Registration</p>
              <p className="text-white/80 text-sm">This child may already be in the database</p>
            </div>
          </div>

          <div className="flex gap-3">
            {faceImage && (
              <div className="flex flex-col items-center gap-1">
                <img src={faceImage} alt="Face" className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200" />
                <span className="text-xs font-bold text-gray-500 uppercase">Scanned Face</span>
              </div>
            )}
            <div className="flex flex-col items-center justify-center ml-auto px-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-3xl font-black text-orange-700">
                {Math.round(confidence * 100)}%
              </p>
              <p className="text-xs font-bold text-orange-600 uppercase">Similarity</p>
            </div>
          </div>

          {child && (
            <div className="bg-white rounded-xl p-5 shadow border space-y-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Matched Record</p>
              <div className="flex gap-4 items-start">
                {child.face_photo ? (
                  <img
                    src={child.face_photo}
                    alt={child.first_name}
                    className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center border-2 border-gray-200 shrink-0">
                    <span className="text-3xl font-black text-gray-400">
                      {child.first_name[0]}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-2xl font-black text-gray-900">
                    {child.first_name} {child.surname}
                  </p>
                  <p className="text-gray-600 font-medium">Guardian: {child.guardian_name}</p>
                  <p className="text-gray-500 text-sm">{child.lga} · {child.village}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Date of Birth</p>
                  <p className="font-semibold text-gray-800">{child.date_of_birth}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Village</p>
                  <p className="font-semibold text-gray-800">{child.village}</p>
                </div>
                {child.visible_marks && (
                  <div className="col-span-2">
                    <p className="text-xs font-bold text-gray-400 uppercase">Visible Marks</p>
                    <p className="font-semibold text-gray-800">{child.visible_marks}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-orange-900 font-bold text-sm">
              Registration was blocked. If this is a different child, retake the photo and try again. Otherwise, use the Verify screen instead of Register.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Button onClick={() => setLocation("/")} className="w-full h-14 text-lg font-bold">
              Done — Return Home
            </Button>
            <Button variant="outline" onClick={resetFlow} className="w-full h-14 text-lg">
              <RefreshCw className="mr-2 h-5 w-5" /> Retake Photo &amp; Try Again
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  /* ── New child — registration form ─────────────────────────────── */
  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
        <header className="mb-6">
          <div className="bg-blue-600 text-white rounded-xl p-3 flex items-center gap-3 mb-4 shadow">
            <CheckCircle2 className="w-7 h-7 shrink-0" />
            <div>
              <p className="font-black text-lg leading-tight">New Child — Not in Database</p>
              <p className="text-white/80 text-sm">Complete the form to register</p>
            </div>
          </div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Register Child</h2>
          <p className="text-gray-600 font-medium">Enter personal details to complete registration</p>
        </header>

        <div className="flex gap-3 mb-6">
          {faceImage && (
            <div className="flex flex-col items-center gap-1">
              <img src={faceImage} alt="Face" className="w-24 h-24 rounded-lg object-cover border-2 border-gray-200" />
              <span className="text-xs font-bold text-gray-500 uppercase">
                Face{faceImages.length > 1 ? ` (${faceImages.length} frames)` : ""}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            className="flex flex-col items-center justify-center w-24 h-24 border-dashed self-start"
            onClick={resetFlow}
          >
            <Camera className="w-6 h-6 mb-1" />
            <span className="text-xs font-bold">Retake</span>
          </Button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-start gap-3">
          <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-700 mb-1">GPS Coordinates (auto-detected)</p>
            {gpsLat != null && gpsLng != null ? (
              <p className="text-sm font-mono text-gray-600">
                {gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}
              </p>
            ) : gpsError ? (
              <p className="text-sm text-gray-400 italic">GPS unavailable — location not recorded</p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Acquiring GPS…
              </div>
            )}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-bold">First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter first name" className="h-14 text-lg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="surname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-bold">Surname</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter surname" className="h-14 text-lg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="guardian_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-bold">Guardian Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter parent or guardian's full name" className="h-14 text-lg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date_of_birth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-bold">Date of Birth</FormLabel>
                  <FormControl>
                    <Input type="date" className="h-14 text-lg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="lga"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-bold">Local Government Area (LGA)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-14 text-lg">
                          <SelectValue placeholder="Select LGA" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {lgas?.map((lga) => (
                          <SelectItem key={lga.code} value={lga.name} className="text-lg py-3">
                            {lga.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="village"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-bold">Village / Settlement</FormLabel>
                    <FormControl>
                      <VillageCombobox
                        value={field.value}
                        lga={form.watch("lga")}
                        onChange={(v) => {
                          field.onChange(v);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="visible_marks"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base font-bold">Visible Marks (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. Scar on left cheek"
                      className="min-h-[100px] text-lg resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-16 text-xl font-bold"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <ArrowRight className="mr-2 h-6 w-6" /> Complete Registration
                </>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
