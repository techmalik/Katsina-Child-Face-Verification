import { useListVerifications, getListVerificationsQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle, AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function Verifications() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useListVerifications(
    { limit: 50 },
    { query: { queryKey: getListVerificationsQueryKey({ limit: 50 }) } },
  );

  const clearMutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch("/api/verifications", {
        method: "DELETE",
        headers: { "X-Confirm-Delete": "true" },
      });
      if (!resp.ok) throw new Error("Failed to clear logs");
      return resp.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast.success(`${result.deleted} verification log${result.deleted !== 1 ? "s" : ""} cleared`);
    },
    onError: () => {
      toast.error("Failed to clear logs. Please try again.");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "clear":
        return (
          <Badge className="bg-success text-white shrink-0">
            <CheckCircle className="w-3 h-3 mr-1" /> Clear
          </Badge>
        );
      case "needs_review":
        return (
          <Badge className="bg-warning text-white shrink-0">
            <HelpCircle className="w-3 h-3 mr-1" /> Needs Review
          </Badge>
        );
      case "confirmed_match":
        return (
          <Badge className="bg-destructive text-white shrink-0">
            <AlertTriangle className="w-3 h-3 mr-1" /> Confirmed Match
          </Badge>
        );
      case "confirmed_new":
        return (
          <Badge className="bg-success text-white shrink-0">
            <CheckCircle className="w-3 h-3 mr-1" /> Confirmed New
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const total = data?.total ?? 0;

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full h-full flex flex-col">
        <header className="mb-5 shrink-0 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Verification Log
            </h2>
            <p className="text-gray-600 font-medium text-sm mt-0.5">
              {isLoading ? "Loading…" : `${total} verification${total !== 1 ? "s" : ""} recorded`}
            </p>
          </div>

          {total > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive text-destructive hover:bg-destructive hover:text-white shrink-0 min-h-[44px]"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">Clear All Logs</span>
                  <span className="sm:hidden">Clear</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all verification logs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {total} verification record
                    {total !== 1 ? "s" : ""}. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => clearMutation.mutate()}
                    disabled={clearMutation.isPending}
                  >
                    {clearMutation.isPending ? "Clearing…" : "Yes, clear all"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </header>

        <div className="flex-1 overflow-y-auto pb-6">
          <div className="space-y-2">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="p-4 border rounded-xl bg-white shadow-sm flex items-center justify-between"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))
            ) : data?.verifications.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-semibold text-gray-600">No verifications recorded yet.</p>
              </div>
            ) : (
              data?.verifications.map((v) => (
                <div
                  key={v.id}
                  className="p-4 border rounded-xl bg-white shadow-sm flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    {v.child ? (
                      <Link
                        href={`/registry/${v.child.id}`}
                        className="font-bold text-base text-primary hover:underline block truncate"
                      >
                        {v.child.first_name} {v.child.surname}
                      </Link>
                    ) : (
                      <p className="font-bold text-base text-gray-900">Unknown Subject</p>
                    )}
                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                      {formatDistanceToNow(new Date(v.verified_at), { addSuffix: true })}
                      {v.child?.lga && (
                        <span className="ml-2 text-gray-400">· {v.child.lga}</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">{getStatusBadge(v.review_status)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function History({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}
