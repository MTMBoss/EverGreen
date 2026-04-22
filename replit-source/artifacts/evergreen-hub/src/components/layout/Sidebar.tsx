import { Link, useLocation } from "wouter";
import { Shield } from "lucide-react";
import { NAV_LINKS } from "./MobileNav";

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="hidden lg:flex w-64 flex-col fixed inset-y-0 left-0 z-50 bg-card border-r border-border">
      <div className="flex items-center h-16 px-6 border-b border-border">
        <Shield className="h-6 w-6 text-primary mr-3" />
        <span className="font-sans font-bold text-lg tracking-widest text-foreground">EVERGREEN</span>
      </div>
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
        <div className="px-3 mb-2 text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Navigazione Operativa
        </div>
        {NAV_LINKS.map((link) => {
          const Icon = link.icon;
          const isActive = location === link.href;
          return (
            <Link key={link.href} href={link.href}>
              <div
                data-testid={`link-desktop-${link.label.toLowerCase().replace(" ", "-")}`}
                className={`flex items-center px-3 py-2.5 rounded-md transition-all cursor-pointer group ${
                  isActive 
                    ? "bg-primary/20 text-primary border border-primary/30 box-shadow-glow" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
                }`}
              >
                <Icon className={`h-4 w-4 mr-3 transition-colors ${isActive ? "text-primary" : "group-hover:text-primary/70"}`} />
                <span className="font-medium text-sm">{link.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-border">
        <div className="text-[10px] font-mono text-muted-foreground text-center">
          SYS_VER: 2.0.26<br/>
          STATUS: ONLINE
        </div>
      </div>
    </div>
  );
}
