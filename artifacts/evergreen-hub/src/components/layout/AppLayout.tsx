import { ReactNode } from "react";
import { usePrivateMode } from "@/lib/private-mode";
import { Lock, Unlock } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { isPrivate } = usePrivateMode();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col lg:flex-row">
      {/* Top Status Strip */}
      <div className="fixed top-0 left-0 right-0 h-6 bg-card border-b border-border z-50 flex items-center justify-between px-3 lg:pl-72 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <div className="flex items-center space-x-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          <span>EverGreen | COD MOBILE | Stagione 2026</span>
        </div>
        <div className="flex items-center space-x-2">
          <span>SEC_LEVEL:</span>
          {isPrivate ? (
            <span className="flex items-center text-primary font-bold">
              <Unlock className="w-3 h-3 mr-1" />
              ALPHA
            </span>
          ) : (
            <span className="flex items-center">
              <Lock className="w-3 h-3 mr-1" />
              BETA
            </span>
          )}
        </div>
      </div>

      <Sidebar />

      <div className="flex-1 flex flex-col lg:ml-64 pt-6">
        {/* Mobile Header */}
        <header className="lg:hidden h-14 border-b border-border bg-card/80 backdrop-blur-md sticky top-6 z-40 flex items-center px-4 justify-between">
          <div className="flex items-center">
            <span className="font-sans font-bold text-lg tracking-widest text-foreground text-shadow-glow">EVERGREEN</span>
          </div>
          <MobileNav />
        </header>

        <main className="flex-1 p-4 lg:p-8 pb-safe">
          <div className="max-w-6xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
