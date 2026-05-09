import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRegisterChild, useListLgas, getListLgasQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { CameraCapture } from "@/components/camera-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Camera, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const [step, setStep] = useState<"face" | "ear" | "form">("face");
  const [faceImages, setFaceImages] = useState<string[]>([]);
  const [earImages, setEarImages] = useState<string[]>([]);
  
  const { data: lgas } = useListLgas({ query: { queryKey: getListLgasQueryKey() } });
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

  const handleFaceCapture = (base64: string) => {
    setFaceImages([...faceImages, base64]);
    setStep("ear");
  };

  const handleEarCapture = (base64: string) => {
    setEarImages([...earImages, base64]);
    setStep("form");
  };

  const onSubmit = (data: FormValues) => {
    if (faceImages.length === 0 || earImages.length === 0) {
      toast.error("Photos are required");
      return;
    }

    registerMutation.mutate(
      {
        data: {
          ...data,
          face_images: faceImages,
          ear_images: earImages,
          gps_lat: 12.9816, // mock GPS
          gps_lng: 7.6222
        }
      },
      {
        onSuccess: () => {
          toast.success("Child registered successfully");
          setLocation("/registry");
        },
        onError: (err) => {
          toast.error((err as any)?.error || "Registration failed");
        }
      }
    );
  };

  if (step === "face") {
    return <CameraCapture title="Capture Face" overlayType="face" onCapture={handleFaceCapture} />;
  }

  if (step === "ear") {
    return <CameraCapture title="Capture Profile/Ear" overlayType="ear" onCapture={handleEarCapture} />;
  }

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
        <header className="mb-6">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Register Child</h2>
          <p className="text-gray-600 font-medium">Enter personal details to complete registration</p>
        </header>

        {/* Photo Summary */}
        <div className="flex gap-4 mb-8">
          {faceImages[0] && (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200">
              <img src={faceImages[0]} alt="Face" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold text-center py-1">FACE</div>
            </div>
          )}
          {earImages[0] && (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200">
              <img src={earImages[0]} alt="Ear" className="w-full h-full object-cover" />
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] font-bold text-center py-1">PROFILE</div>
            </div>
          )}
          <Button 
            variant="outline" 
            className="w-24 h-24 flex flex-col items-center justify-center border-dashed"
            onClick={() => setStep("face")}
          >
            <Camera className="w-6 h-6 mb-1" />
            <span className="text-xs font-bold">Retake</span>
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          <SelectItem key={lga.code} value={lga.code} className="text-lg py-3">
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
                      <Input placeholder="Enter village name" className="h-14 text-lg" {...field} />
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
                <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> Saving...</>
              ) : (
                <><ArrowRight className="mr-2 h-6 w-6" /> Complete Registration</>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </Layout>
  );
}
