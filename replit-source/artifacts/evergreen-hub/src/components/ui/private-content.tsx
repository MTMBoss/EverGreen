import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { Link } from "wouter";

interface PrivateContentProps {
  children: React.ReactNode;
}

export function PrivateContent({ children }: PrivateContentProps) {
  const isPrivate = localStorage.getItem("evergreen_private") === "true";

  if (isPrivate) {
    return <div className="animate-in fade-in zoom-in-95 duration-300">{children}</div>;
  }

  return (
    <Card className="border-dashed border-muted bg-muted/20">
      <CardContent className="flex flex-col items-center justify-center py-6 text-center">
        <Lock className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground font-mono mb-4">
          Contenuto riservato - richiede autorizzazione.
        </p>
        <Link href="/area-privata">
          <span className="text-xs text-primary hover:underline cursor-pointer">
            Sblocca Area Privata
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}
