import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { UserPlus, ClipboardCheck, ShieldAlert, Users, TrendingUp } from "lucide-react";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function Home() {
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
        <header className="mb-6">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-gray-600 font-medium">Katsina State Field Operations</p>
        </header>

        {/* Primary Action — single unified flow */}
        <Link href="/register" className="block">
          <div className="bg-primary hover:bg-primary/90 text-white rounded-xl p-8 flex items-center shadow-lg transition-transform active:scale-[0.98] min-h-[140px]">
            <div className="bg-white/20 p-5 rounded-full mr-6">
              <UserPlus className="w-12 h-12 text-white" />
            </div>
            <div>
              <h3 className="text-3xl font-black">Register Child</h3>
              <p className="text-white/80 font-medium mt-1 text-lg">
                Scan face &amp; ear — checks for duplicates automatically
              </p>
            </div>
          </div>
        </Link>

        {/* Stats Grid */}
        <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">Today's Summary</h3>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-primary shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Today
                </p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {stats?.verifications_today ?? 0}
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-gray-900 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> This Week
                </p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {stats?.verifications_this_week ?? 0}
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Reviews
                </p>
                <div className="flex items-end gap-2 mt-2">
                  <p className="text-3xl font-black text-gray-900">
                    {stats?.pending_reviews ?? 0}
                  </p>
                  {(stats?.pending_reviews ?? 0) > 0 && (
                    <span className="text-sm font-bold text-yellow-600 mb-1">Pending</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-gray-400 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <Users className="w-4 h-4" /> Total DB
                </p>
                <p className="text-3xl font-black text-gray-900 mt-2">
                  {stats?.total_children ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {(stats?.pending_reviews ?? 0) > 0 && (
          <Link href="/review" className="block mt-6">
            <div className="bg-yellow-50 border-2 border-yellow-400 text-gray-900 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-yellow-500" />
                <div>
                  <h4 className="font-bold text-gray-900">Pending Reviews</h4>
                  <p className="text-sm text-gray-700">
                    {stats!.pending_reviews} verifications need supervisor attention.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="border-yellow-400 text-yellow-700 hover:bg-yellow-100 font-bold"
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
