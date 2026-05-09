import { useState } from "react";
import { Link } from "wouter";
import { useListChildren, getListChildrenQueryKey } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, MapPin, User, ChevronRight } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

export function Registry() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useListChildren({
    search: debouncedSearch || undefined,
    limit: 50
  }, {
    query: { queryKey: getListChildrenQueryKey({ search: debouncedSearch || undefined, limit: 50 }) }
  });

  return (
    <Layout>
      <div className="p-4 md:p-8 max-w-4xl mx-auto w-full flex flex-col h-full">
        <header className="mb-6 shrink-0">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Registry</h2>
          <p className="text-gray-600 font-medium mb-4">Database of all registered children</p>
          
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-6 h-6" />
            <Input 
              placeholder="Search by name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-14 text-lg font-medium shadow-sm bg-white"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-0 flex items-center h-24">
                  <Skeleton className="w-24 h-24 rounded-none" />
                  <div className="p-4 flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : data?.children.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <User className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-bold text-gray-900">No records found</h3>
              <p>Try adjusting your search</p>
            </div>
          ) : (
            data?.children.map((child) => (
              <Link key={child.id} href={`/registry/${child.id}`}>
                <Card className="overflow-hidden hover:bg-gray-50 transition-colors cursor-pointer border shadow-sm">
                  <CardContent className="p-0 flex items-center h-24">
                    {child.face_photo ? (
                      <img src={child.face_photo} alt={child.first_name} className="w-24 h-24 object-cover bg-gray-200 shrink-0" />
                    ) : (
                      <div className="w-24 h-24 bg-gray-200 flex items-center justify-center shrink-0">
                        <User className="w-10 h-10 text-gray-400" />
                      </div>
                    )}
                    <div className="p-4 flex-1 min-w-0">
                      <h4 className="font-bold text-lg text-gray-900 truncate">
                        {child.first_name} {child.surname}
                      </h4>
                      <p className="text-gray-500 text-sm font-medium flex items-center gap-1 truncate mt-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {child.village}, {child.lga}
                      </p>
                    </div>
                    <div className="p-4 text-gray-400 shrink-0">
                      <ChevronRight className="w-6 h-6" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
