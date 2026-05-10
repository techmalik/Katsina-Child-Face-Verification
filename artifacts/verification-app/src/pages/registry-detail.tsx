import { useRoute } from "wouter";
import { useGetChild, getGetChildQueryKey, useGetChildPhotos, getGetChildPhotosQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, Calendar, Users, Activity, Eye, ArrowLeft, Ear } from "lucide-react";
import { Link } from "wouter";

export function RegistryDetail() {
  const [, params] = useRoute("/registry/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const { data: child, isLoading } = useGetChild(id, {
    query: { enabled: !!id, queryKey: getGetChildQueryKey(id) }
  });

  const { data: photos, isLoading: photosLoading } = useGetChildPhotos(id, {
    query: { enabled: !!id, queryKey: getGetChildPhotosQueryKey(id) }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-4 md:p-8 max-w-2xl mx-auto w-full space-y-6">
          <Skeleton className="w-24 h-8" />
          <Skeleton className="w-full aspect-square rounded-xl" />
          <Skeleton className="w-full h-48 rounded-xl" />
        </div>
      </Layout>
    );
  }

  if (!child) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold">Record Not Found</h2>
          <Link href="/registry" className="text-primary mt-4 inline-block font-bold">Return to Registry</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto w-full pb-24">
        <Link href="/registry" className="inline-flex items-center text-primary font-bold mb-6">
          <ArrowLeft className="w-5 h-5 mr-2" /> Back to List
        </Link>

        <div className="bg-white rounded-2xl overflow-hidden shadow-md border mb-6">
          <div className="grid grid-cols-2 divide-x bg-gray-100 relative">
            <div className="aspect-square relative">
              {photosLoading ? (
                <Skeleton className="absolute inset-0" />
              ) : photos?.face_photo ? (
                <img src={photos.face_photo} alt={`${child.first_name} face`} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <User className="w-16 h-16 text-gray-300" />
                  <span className="text-xs font-bold text-gray-400 uppercase">Face</span>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/40 py-1 text-center">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Face</span>
              </div>
            </div>
            <div className="aspect-square relative">
              {photosLoading ? (
                <Skeleton className="absolute inset-0" />
              ) : photos?.ear_photo ? (
                <img src={photos.ear_photo} alt={`${child.first_name} ear`} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Ear className="w-16 h-16 text-gray-300" />
                  <span className="text-xs font-bold text-gray-400 uppercase">Ear</span>
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/40 py-1 text-center">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Ear</span>
              </div>
            </div>
            <div className="absolute top-4 right-4">
              <Badge variant="secondary" className="bg-white/90 text-black font-bold px-3 py-1 shadow-sm backdrop-blur-sm">
                ID: {child.id}
              </Badge>
            </div>
          </div>
          
          <div className="p-6">
            <h1 className="text-3xl font-black text-gray-900 leading-tight">
              {child.first_name} {child.surname}
            </h1>
            
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase">Guardian</p>
                  <p className="text-lg font-medium text-gray-900">{child.guardian_name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase">Date of Birth</p>
                  <p className="text-lg font-medium text-gray-900">{new Date(child.date_of_birth).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-500 uppercase">Location</p>
                  <p className="text-lg font-medium text-gray-900">{child.village}, {child.lga}</p>
                </div>
              </div>

              {child.visible_marks && (
                <div className="flex items-start gap-3">
                  <Eye className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-gray-500 uppercase">Visible Marks</p>
                    <p className="text-lg font-medium text-gray-900">{child.visible_marks}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-primary" /> Verification History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase">Total Checks</p>
                <p className="text-3xl font-black text-gray-900">{child.verification_count}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-500 uppercase">First Registered</p>
                <p className="text-lg font-medium text-gray-900">{new Date(child.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
