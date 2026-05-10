import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Shield, Home, Users, History, ClipboardCheck, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/registry", icon: Users, label: "Registry" },
    { href: "/verifications", icon: History, label: "Log" },
    { href: "/review", icon: ClipboardCheck, label: "Review" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 flex items-center justify-center gap-2 shadow-lg">
          <WifiOff className="w-5 h-5 shrink-0" />
          <span className="font-bold text-sm">No internet — cannot verify. Check your connection.</span>
        </div>
      )}

      {/* Mobile Header */}
      <header className={cn(
        "md:hidden bg-primary text-white p-4 flex items-center gap-3 sticky z-30 shadow-md",
        isOnline ? "top-0" : "top-12"
      )}>
        <Shield className="w-8 h-8" />
        <div>
          <h1 className="font-bold text-lg leading-tight">Katsina State</h1>
          <p className="text-xs text-primary-foreground/80 font-medium tracking-wider uppercase">Child Verification</p>
        </div>
      </header>

      {/* Sidebar (Desktop) */}
      <aside className={cn(
        "hidden md:flex w-64 bg-primary text-white flex-col sticky h-screen",
        isOnline ? "top-0" : "top-12"
      )}>
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <Shield className="w-10 h-10" />
          <div>
            <h1 className="font-bold text-xl leading-tight">Katsina State</h1>
            <p className="text-xs text-primary-foreground/80 font-medium tracking-wider uppercase">Verification</p>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-md font-medium text-lg transition-colors",
                location === item.href || (item.href !== "/" && location.startsWith(item.href))
                  ? "bg-white/20 text-white"
                  : "text-primary-foreground/70 hover:bg-white/10 hover:text-white"
              )}>
                <item.icon className="w-6 h-6" />
                {item.label}
              </div>
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs text-white/50 text-center">
          Field Officer ID: 4892
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 pb-20 md:pb-0 relative flex flex-col min-h-[100dvh] md:min-h-screen max-w-3xl mx-auto md:max-w-none w-full",
        !isOnline && "mt-12 md:mt-12"
      )}>
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 pb-safe z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                "flex flex-col items-center justify-center w-16 h-14 rounded-md transition-colors",
                isActive ? "text-primary" : "text-gray-500 hover:bg-gray-100"
              )}>
                <item.icon className="w-6 h-6 mb-1" />
                <span className="text-[10px] font-bold">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
