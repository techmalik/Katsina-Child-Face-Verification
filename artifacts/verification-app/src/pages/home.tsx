import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { UserPlus, ClipboardCheck, ShieldAlert, Users, TrendingUp } from "lucide-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KatsinaMap } from "@/components/katsina-map";

export function Home() {
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-5 max-w-4xl mx-auto w-full">
        {/* Katsina State hero banner */}
        <div className="relative bg-primary rounded-2xl overflow-hidden shadow-lg">
          <div className="absolute inset-0 flex items-center justify-end pr-4 opacity-10 pointer-events-none select-none">
            <KatsinaMap size={200} className="text-white" />
          </div>
          <div className="relative z-10 p-6 flex items-center gap-5">
            <KatsinaMap size={56} className="text-white/90 shrink-0" />
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight">
                Katsina State
              </h2>
              <p className="text-white/80 font-semibold text-sm mt-0.5">
                Child Verification Platform — Field Operations
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action */}
        <Link href="/register" className="block">
          <div className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl p-6 flex items-center shadow transition-transform active:scale-[0.98] min-h-[110px]">
            <div className="bg-white/15 p-4 rounded-xl mr-5">
              <UserPlus className="w-10 h-10 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-black">Register Child</h3>
              <p className="text-white/70 font-medium mt-1 text-base">
                Scan face — checks for duplicates automatically
              </p>
            </div>
          </div>
        </Link>

        {/* Stats Grid */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3">Today's Summary</h3>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-l-4 border-l-primary shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" /> Today
                  </p>
                  <p className="text-3xl font-black text-gray-900 mt-1.5">
                    {stats?.verifications_today ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-gray-900 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> This Week
                  </p>
                  <p className="text-3xl font-black text-gray-900 mt-1.5">
                    {stats?.verifications_this_week ?? 0}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-yellow-500 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> Reviews
                  </p>
                  <div className="flex items-end gap-1.5 mt-1.5">
                    <p className="text-3xl font-black text-gray-900">
                      {stats?.pending_reviews ?? 0}
                    </p>
                    {(stats?.pending_reviews ?? 0) > 0 && (
                      <span className="text-xs font-bold text-yellow-600 mb-1">Pending</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-gray-400 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Total DB
                  </p>
                  <p className="text-3xl font-black text-gray-900 mt-1.5">
                    {stats?.total_children ?? 0}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {(stats?.pending_reviews ?? 0) > 0 && (
          <Link href="/review" className="block">
            <div className="bg-yellow-50 border-2 border-yellow-400 text-gray-900 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-yellow-500 shrink-0" />
                <div>
                  <h4 className="font-bold text-gray-900">Pending Reviews</h4>
                  <p className="text-sm text-gray-700">
                    {stats!.pending_reviews} verifications need supervisor attention.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-yellow-400 text-yellow-700 hover:bg-yellow-100 font-bold shrink-0 ml-3"
              >
                Review Now
              </Button>
            </div>
          </Link>
        )}
      </div>
    </Layout>
  );
}
