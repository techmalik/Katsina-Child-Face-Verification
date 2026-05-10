import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useSearchParams } from "wouter";
import {
  useListChildren,
  getListChildrenQueryKey,
  useListLgas,
  getListLgasQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MapPin,
  User,
  ChevronRight,
  Filter,
  X,
  ArrowUpDown,
  ChevronUp,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

const SORT_OPTIONS = [
  { value: "created_at-desc", label: "Newest registered" },
  { value: "created_at-asc", label: "Oldest registered" },
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "verification_count-desc", label: "Most verified" },
  { value: "verification_count-asc", label: "Least verified" },
  { value: "lga-asc", label: "LGA A–Z" },
  { value: "date_of_birth-asc", label: "Youngest first" },
  { value: "date_of_birth-desc", label: "Oldest age first" },
];

function DateRangePair({
  label,
  fromKey,
  toKey,
  fromValue,
  toValue,
  onChange,
}: {
  label: string;
  fromKey: string;
  toKey: string;
  fromValue: string;
  toValue: string;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
            From
          </label>
          <Input
            type="date"
            value={fromValue}
            onChange={(e) => onChange(fromKey, e.target.value)}
            className="h-12 bg-gray-50 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">
            To
          </label>
          <Input
            type="date"
            value={toValue}
            onChange={(e) => onChange(toKey, e.target.value)}
            className="h-12 bg-gray-50 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

const FILTER_KEYS = ["lga", "dob_from", "dob_to", "registered_from", "registered_to", "verified_from", "verified_to"] as const;

export function Registry() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterLga       = searchParams.get("lga") ?? "";
  const dobFrom         = searchParams.get("dob_from") ?? "";
  const dobTo           = searchParams.get("dob_to") ?? "";
  const registeredFrom  = searchParams.get("registered_from") ?? "";
  const registeredTo    = searchParams.get("registered_to") ?? "";
  const verifiedFrom    = searchParams.get("verified_from") ?? "";
  const verifiedTo      = searchParams.get("verified_to") ?? "";
  const sortVal         = searchParams.get("sort") ?? "created_at-desc";

  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(searchInput, 350);

  useEffect(() => {
    const currentQ = searchParams.get("q") ?? "";
    if (debouncedSearch === currentQ) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set("q", debouncedSearch);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch]);

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearAllFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        FILTER_KEYS.forEach((k) => next.delete(k));
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const { data: lgas } = useListLgas({ query: { queryKey: getListLgasQueryKey() } });

  const [sortBy, sortDir] = sortVal.split("-") as [string, string];

  const queryParams = {
    search: debouncedSearch || undefined,
    lga: filterLga || undefined,
    dob_from: dobFrom || undefined,
    dob_to: dobTo || undefined,
    registered_from: registeredFrom || undefined,
    registered_to: registeredTo || undefined,
    verified_from: verifiedFrom || undefined,
    verified_to: verifiedTo || undefined,
    sort_by: sortBy,
    sort_dir: sortDir,
    limit: 50,
  };

  const { data, isLoading } = useListChildren(queryParams, {
    query: { queryKey: getListChildrenQueryKey(queryParams) },
  });

  const activeFilters: { label: string; key: string }[] = [
    ...(filterLga      ? [{ label: `LGA: ${filterLga}`,                   key: "lga"             }] : []),
    ...(dobFrom        ? [{ label: `Born from ${dobFrom}`,                 key: "dob_from"        }] : []),
    ...(dobTo          ? [{ label: `Born to ${dobTo}`,                     key: "dob_to"          }] : []),
    ...(registeredFrom ? [{ label: `Registered from ${registeredFrom}`,    key: "registered_from" }] : []),
    ...(registeredTo   ? [{ label: `Registered to ${registeredTo}`,        key: "registered_to"   }] : []),
    ...(verifiedFrom   ? [{ label: `Last verified from ${verifiedFrom}`,   key: "verified_from"   }] : []),
    ...(verifiedTo     ? [{ label: `Last verified to ${verifiedTo}`,       key: "verified_to"     }] : []),
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto w-full flex flex-col h-full">
        <header className="mb-4 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Registry
            </h2>
            {data && (
              <span className="text-sm font-semibold text-gray-500">
                {data.total} record{data.total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-gray-600 font-medium text-sm mb-3">
            Database of all registered children
          </p>

          {/* Search + controls row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search by name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 h-11 text-base font-medium shadow-sm bg-white"
              />
            </div>

            {/* Sort */}
            <Select value={sortVal} onValueChange={(v) => setParam("sort", v)}>
              <SelectTrigger className="h-11 w-auto min-w-[44px] gap-1 px-3 bg-white shadow-sm">
                <ArrowUpDown className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="hidden sm:inline text-sm font-medium truncate max-w-[130px]">
                  {SORT_OPTIONS.find((o) => o.value === sortVal)?.label ?? "Sort"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Filter toggle */}
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 bg-white shadow-sm relative shrink-0"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-label="Toggle filters"
            >
              <Filter className="w-4 h-4" />
              {activeFilters.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center">
                  {activeFilters.length}
                </span>
              )}
            </Button>
          </div>

          {/* Active filter chips — always visible when any filter is active */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
              {activeFilters.map((f) => (
                <Badge
                  key={f.key}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1 text-xs font-semibold"
                >
                  {f.label}
                  <button
                    onClick={() => setParam(f.key, "")}
                    className="ml-0.5 rounded-full hover:bg-gray-300 p-0.5"
                    aria-label={`Remove ${f.label} filter`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
              <button
                onClick={clearAllFilters}
                className="text-xs font-semibold text-destructive hover:underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Filter panel */}
          {filtersOpen && (
            <div className="mt-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5" /> Filters
                </p>
                <button
                  onClick={() => setFiltersOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>

              {/* LGA filter */}
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  LGA
                </label>
                <Select
                  value={filterLga || "__all__"}
                  onValueChange={(v) => setParam("lga", v === "__all__" ? "" : v)}
                >
                  <SelectTrigger className="h-12 bg-gray-50">
                    <SelectValue placeholder="All LGAs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All LGAs</SelectItem>
                    {lgas?.map((lga) => (
                      <SelectItem key={lga.code} value={lga.name}>
                        {lga.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DateRangePair
                label="Date of Birth"
                fromKey="dob_from"
                toKey="dob_to"
                fromValue={dobFrom}
                toValue={dobTo}
                onChange={setParam}
              />

              <DateRangePair
                label="Registration Date"
                fromKey="registered_from"
                toKey="registered_to"
                fromValue={registeredFrom}
                toValue={registeredTo}
                onChange={setParam}
              />

              <DateRangePair
                label="Last Verification Date"
                fromKey="verified_from"
                toKey="verified_to"
                fromValue={verifiedFrom}
                toValue={verifiedTo}
                onChange={setParam}
              />

              {activeFilters.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-destructive hover:text-destructive/80 text-xs h-10 px-2 -ml-2"
                >
                  <X className="w-3 h-3 mr-1" /> Clear all filters
                </Button>
              )}
            </div>
          )}
        </header>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto pb-4">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <CardContent className="p-0 flex items-center h-20">
                    <Skeleton className="w-20 h-20 rounded-none shrink-0" />
                    <div className="p-4 flex-1 space-y-2">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : data?.children.length === 0 ? (
            <div className="text-center py-14 text-gray-500">
              <User className="w-14 h-14 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-bold text-gray-900">No records found</h3>
              <p className="text-sm mt-1">
                {activeFilters.length > 0
                  ? "Try adjusting or clearing your filters."
                  : "No children registered yet."}
              </p>
              {activeFilters.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-3">
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data?.children.map((child) => (
                <Link key={child.id} href={`/registry/${child.id}`}>
                  <Card className="overflow-hidden hover:bg-gray-50 transition-colors cursor-pointer border shadow-sm h-full">
                    <CardContent className="p-0 flex items-center h-20">
                      {child.face_photo ? (
                        <img
                          src={child.face_photo}
                          alt={child.first_name}
                          className="w-20 h-20 object-cover bg-gray-200 shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gray-100 flex items-center justify-center shrink-0">
                          <User className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                      <div className="px-4 flex-1 min-w-0">
                        <h4 className="font-bold text-base text-gray-900 truncate">
                          {child.first_name} {child.surname}
                        </h4>
                        <p className="text-gray-500 text-xs font-medium flex items-center gap-1 truncate mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {child.village}, {child.lga}
                        </p>
                      </div>
                      <div className="px-3 text-gray-400 shrink-0">
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
