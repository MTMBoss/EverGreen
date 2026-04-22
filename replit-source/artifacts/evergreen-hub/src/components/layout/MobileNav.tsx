import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Shield, Users, Calendar, Crosshair, Target, ScrollText, Trophy, Lock, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: Shield },
  { href: "/roster", label: "Roster", icon: Users },
  { href: "/presenze", label: "Presenze", icon: Calendar },
  { href: "/equipaggiamenti", label: "Equipaggiamenti", icon: Crosshair },
  { href: "/vetrina", label: "Vetrina", icon: Target },
  { href: "/scrim", label: "Scrim", icon: Trophy },
  { href: "/regolamento", label: "Regolamento", icon: ScrollText },
  { href: "/area-privata", label: "Area Privata", icon: Lock },
];

export function MobileNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden text-primary" data-testid="button-mobile-menu">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] border-r-border bg-card p-0">
        <SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
        <div className="flex h-full flex-col">
          <div className="flex items-center p-6 border-b border-border">
            <Shield className="h-8 w-8 text-primary mr-3" />
            <span className="font-sans font-bold text-xl tracking-wider text-foreground">EVERGREEN</span>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const isActive = location === link.href;
              return (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
                  <div
                    data-testid={`link-mobile-${link.label.toLowerCase().replace(" ", "-")}`}
                    className={`flex items-center px-4 py-3 rounded-md transition-colors cursor-pointer ${
                      isActive 
                        ? "bg-primary/20 text-primary border border-primary/30" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-5 w-5 mr-3 ${isActive ? "text-primary" : ""}`} />
                    <span className="font-medium">{link.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );
}
