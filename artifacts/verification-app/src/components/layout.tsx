import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Home, Users, History, ClipboardCheck, WifiOff, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { KatsinaMap } from "@/components/katsina-map";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/registry", icon: Users, label: "Registry" },
    { href: "/verifications", icon: History, label: "Log" },
    { href: "/review", icon: ClipboardCheck, label: "Review" },
  ];

  const isActive = (href: string) =>
    location === href || (href !== "/" && location.startsWith(href));

  const NavLinks = () => (
    <>
      {navItems.map((item) => (
        <Link key={item.href} href={item.href}>
          <div
            className={cn(
              "flex items-center gap-3 px-4 py-3.5 rounded-lg font-medium text-base transition-colors min-h-[52px]",
              isActive(item.href)
                ? "bg-white/20 text-white"
                : "text-primary-foreground/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.label}
          </div>
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center justify-center gap-2 shadow-lg">
          <WifiOff className="w-5 h-5 shrink-0" />
          <span className="font-bold text-sm">No internet — cannot verify. Check your connection.</span>
        </div>
      )}

      {/* Mobile / Tablet Header */}
      <header
        className={cn(
          "md:hidden bg-primary text-white px-4 py-3 flex items-center gap-3 sticky z-30 shadow-md",
          isOnline ? "top-0" : "top-12",
        )}
      >
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <KatsinaMap size={36} className="text-white/90 shrink-0" />
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-base leading-tight truncate">Katsina State</h1>
          <p className="text-[11px] text-primary-foreground/75 font-semibold tracking-wider uppercase">
            Child Verification
          </p>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={cn(
          "md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-primary text-white flex flex-col transition-transform duration-300 shadow-2xl",
          isOnline ? "" : "pt-12",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <KatsinaMap size={44} className="text-white/90" />
            <div>
              <h1 className="font-black text-lg leading-tight">Katsina State</h1>
              <p className="text-xs text-primary-foreground/70 font-semibold tracking-wider uppercase">
                Child Verification
              </p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/50 text-center">
          Field Officer ID: 4892
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex w-56 lg:w-64 bg-primary text-white flex-col sticky h-screen shrink-0",
          isOnline ? "top-0" : "top-12",
        )}
      >
        <div className="p-5 flex items-center gap-3 border-b border-white/10">
          <KatsinaMap size={44} className="text-white/85 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-black text-base leading-tight">Katsina State</h1>
            <p className="text-[10px] text-primary-foreground/70 font-semibold tracking-wider uppercase">
              Child Verification
            </p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/50 text-center">
          Field Officer ID: 4892
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex-1 pb-20 md:pb-0 relative flex flex-col min-h-[100dvh] md:min-h-screen w-full overflow-x-hidden max-w-full",
          !isOnline && "mt-12 md:mt-12",
        )}
      >
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-1 pb-safe z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-14 rounded-lg transition-colors",
                  active ? "text-primary" : "text-gray-500 hover:bg-gray-100",
                )}
              >
                <item.icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-bold">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
