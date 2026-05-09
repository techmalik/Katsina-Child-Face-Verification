import { useListVerifications, getListVerificationsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { Link } from "wouter";

export function Verifications() {
  const { data, isLoading } = useListVerifications(
    { limit: 50 },
    { query: { queryKey: getListVerificationsQueryKey({ limit: 50 }) } }
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "clear":
        return <Badge className="bg-success text-white"><CheckCircle className="w-3 h-3 mr-1" /> Clear</Badge>;
      case "needs_review":
        return <Badge className="bg-warning text-white"><HelpCircle className="w-3 h-3 mr-1" /> Needs Review</Badge>;
      case "confirmed_match":
        return <Badge className="bg-destructive text-white"><AlertTriangle className="w-3 h-3 mr-1" /> Confirmed Match</Badge>;
      case "confirmed_new":
        return <Badge className="bg-success text-white"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed New</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full h-full flex flex-col">
        <header className="mb-6 shrink-0">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Verification Log</h2>
          <p className="text-gray-600 font-medium">Recent field verifications</p>
        </header>

        <div className="flex-1 overflow-y-auto pb-6">
          <div className="space-y-3">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-xl bg-white shadow-sm flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))
            ) : data?.verifications.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No verifications recorded yet.</p>
              </div>
            ) : (
              data?.verifications.map((v) => (
                <div key={v.id} className="p-4 border rounded-xl bg-white shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    {v.child ? (
                      <Link href={`/registry/${v.child.id}`} className="font-bold text-lg text-primary hover:underline">
                        {v.child.first_name} {v.child.surname}
                      </Link>
                    ) : (
                      <p className="font-bold text-lg text-gray-900">Unknown Subject</p>
                    )}
                    <p className="text-sm text-gray-500 font-medium mt-1">
                      {formatDistanceToNow(new Date(v.verified_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div>
                    {getStatusBadge(v.review_status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
