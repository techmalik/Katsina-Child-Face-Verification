import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { UserCheck, UserPlus, ClipboardCheck, ShieldAlert, Users, TrendingUp } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function Home() {
  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() }
  });

  return (
    <Layout>
      <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
        <header className="mb-6">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-gray-600 font-medium">Katsina State Field Operations</p>
        </header>

        {/* Primary Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/verify" className="block">
            <div className="bg-primary hover:bg-primary/90 text-white rounded-xl p-6 flex items-center shadow-lg transition-transform active:scale-[0.98] min-h-[120px]">
              <div className="bg-white/20 p-4 rounded-full mr-5">
                <UserCheck className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Verify Child</h3>
                <p className="text-white/80 font-medium mt-1">Scan face to check eligibility</p>
              </div>
            </div>
          </Link>

          <Link href="/register" className="block">
            <div className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl p-6 flex items-center shadow-lg transition-transform active:scale-[0.98] min-h-[120px]">
              <div className="bg-white/20 p-4 rounded-full mr-5">
                <UserPlus className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Register New</h3>
                <p className="text-white/80 font-medium mt-1">Enroll a new child</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Grid */}
        <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">Today's Summary</h3>
        
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-primary shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <UserCheck className="w-4 h-4" /> Today
                </p>
                <p className="text-3xl font-black text-gray-900 mt-2">{stats?.verifications_today || 0}</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-gray-900 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> This Week
                </p>
                <p className="text-3xl font-black text-gray-900 mt-2">{stats?.verifications_this_week || 0}</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-warning shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" /> Reviews
                </p>
                <div className="flex items-end gap-2 mt-2">
                  <p className="text-3xl font-black text-gray-900">{stats?.pending_reviews || 0}</p>
                  {stats?.pending_reviews ? (
                    <span className="text-sm font-bold text-warning mb-1">Pending</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-gray-400 shadow-sm">
              <CardContent className="p-4">
                <p className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                  <Users className="w-4 h-4" /> Total DB
                </p>
                <p className="text-3xl font-black text-gray-900 mt-2">{stats?.total_children || 0}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {stats?.pending_reviews ? (
          <Link href="/review" className="block mt-6">
            <div className="bg-warning/10 border-2 border-warning text-warning-foreground rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-warning" />
                <div>
                  <h4 className="font-bold text-gray-900">Pending Reviews</h4>
                  <p className="text-sm text-gray-700">{stats.pending_reviews} verifications need supervisor attention.</p>
                </div>
              </div>
              <Button variant="outline" className="border-warning text-warning-foreground hover:bg-warning hover:text-white font-bold">
                Review Now
              </Button>
            </div>
          </Link>
        ) : null}
      </div>
    </Layout>
  );
}
