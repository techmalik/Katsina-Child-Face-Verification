import { useGetReviewQueue, getGetReviewQueueQueryKey, useSubmitReview } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check, X, User } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function Review() {
  const queryClient = useQueryClient();
  const { data: queue, isLoading } = useGetReviewQueue({
    query: { queryKey: getGetReviewQueueQueryKey() }
  });
  
  const submitReview = useSubmitReview();

  const handleDecision = (id: number, decision: "confirmed_match" | "confirmed_new") => {
    submitReview.mutate(
      { id, data: { decision } },
      {
        onSuccess: () => {
          toast.success("Review submitted successfully");
          queryClient.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() });
        },
        onError: () => {
          toast.error("Failed to submit review");
        }
      }
    );
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full h-full flex flex-col">
        <header className="mb-6 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Supervisor Review</h2>
            <p className="text-gray-600 font-medium">Verify uncertain matches</p>
          </div>
          {queue?.length !== undefined && (
            <div className="bg-warning text-warning-foreground font-black text-xl px-4 py-2 rounded-lg shadow-sm">
              {queue.length}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto pb-8 space-y-6">
          {isLoading ? (
            <Skeleton className="w-full h-96 rounded-2xl" />
          ) : queue?.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border shadow-sm">
              <Check className="w-20 h-20 text-success mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900">Queue is Empty</h3>
              <p className="text-gray-500 mt-2">All reviews have been processed.</p>
            </div>
          ) : (
            queue?.map((item) => (
              <Card key={item.verification_id} className="overflow-hidden border-2 shadow-md">
                <div className="bg-gray-100 p-4 border-b flex justify-between items-center">
                  <div className="flex items-center gap-2 text-warning font-bold">
                    <AlertTriangle className="w-5 h-5" /> Uncertain Match ({(item.fused_score || 0 * 100).toFixed(0)}%)
                  </div>
                  <span className="text-sm font-bold text-gray-500">ID: {item.verification_id}</span>
                </div>
                
                <CardContent className="p-6">
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    {/* Captured Image */}
                    <div className="space-y-3">
                      <h4 className="text-center font-bold text-sm text-gray-500 uppercase tracking-wider">New Capture</h4>
                      <div className="aspect-square bg-gray-200 rounded-xl overflow-hidden border-2 relative">
                        {item.capture_photo ? (
                          <img src={item.capture_photo} alt="Captured" className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <User className="w-16 h-16 text-gray-400" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Database Record */}
                    <div className="space-y-3">
                      <h4 className="text-center font-bold text-sm text-gray-500 uppercase tracking-wider">DB Record</h4>
                      <div className="aspect-square bg-gray-200 rounded-xl overflow-hidden border-2 relative">
                        {item.candidate_child?.face_photo ? (
                          <img src={item.candidate_child.face_photo} alt="Database" className="w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <User className="w-16 h-16 text-gray-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {item.candidate_child && (
                    <div className="bg-gray-50 p-4 rounded-xl mb-8 text-center border">
                      <p className="font-bold text-xl text-gray-900">{item.candidate_child.first_name} {item.candidate_child.surname}</p>
                      <p className="text-gray-500 font-medium">Guardian: {item.candidate_child.guardian_name}</p>
                      <p className="text-gray-500 font-medium">{item.candidate_child.village}, {item.candidate_child.lga}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      size="lg" 
                      variant="outline"
                      className="h-16 text-lg font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white"
                      onClick={() => handleDecision(item.verification_id, "confirmed_new")}
                      disabled={submitReview.isPending}
                    >
                      <Check className="mr-2 h-5 w-5" /> Not a Match
                      <span className="block text-xs font-normal ml-2 opacity-80">(Register New)</span>
                    </Button>
                    <Button 
                      size="lg" 
                      variant="destructive"
                      className="h-16 text-lg font-bold"
                      onClick={() => handleDecision(item.verification_id, "confirmed_match")}
                      disabled={submitReview.isPending}
                    >
                      <X className="mr-2 h-5 w-5" /> Confirmed Match
                      <span className="block text-xs font-normal ml-2 opacity-80">(Deny Aid)</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
