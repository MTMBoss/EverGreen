import { useState } from "react";
import { usePrivateMode } from "@/lib/private-mode";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Unlock, ShieldAlert, FileWarning, Banknote } from "lucide-react";
import { TEAM_ROSTER } from "@/data/team";

export default function PrivateArea() {
  const { isPrivate, unlock, lock } = usePrivateMode();
  const [code, setCode] = useState("");

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    unlock(code);
    setCode("");
  };

  if (!isPrivate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in duration-500">
        <Card className="w-full max-w-md border-border bg-card/50 backdrop-blur box-shadow-glow">
          <CardHeader className="text-center border-b border-border/50 pb-6 mb-6">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 border border-border">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">ACCESSO RISTRETTO</CardTitle>
            <CardDescription className="font-mono text-xs uppercase mt-2">
              Autorizzazione di livello Alpha richiesta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="Inserisci codice di sblocco"
                  className="font-mono text-center tracking-[0.5em] h-12 text-lg bg-background"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  data-testid="input-passcode"
                />
                <p className="text-center text-[10px] text-muted-foreground font-mono opacity-50">
                  Suggerimento demo: EG2026
                </p>
              </div>
              <Button type="submit" className="w-full h-12 font-bold tracking-widest font-mono" data-testid="button-unlock">
                AUTENTICA
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-primary/20 pb-4">
        <div>
          <div className="flex items-center text-primary font-bold mb-1">
            <Unlock className="w-5 h-5 mr-2" />
            <h1 className="text-2xl tracking-tight text-shadow-glow">AREA RISERVATA</h1>
          </div>
          <p className="text-sm text-primary/70 font-mono">LIVELLO DI ACCESSO: STAFF & CAPITANI</p>
        </div>
        <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground font-mono text-xs" onClick={lock} data-testid="button-lock">
          <Lock className="w-4 h-4 mr-2" /> ESCI DALL'AREA PRIVATA
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center text-sm font-mono text-primary uppercase">
              <Banknote className="w-4 h-4 mr-2" /> Simulazione Stipendi (Mensile)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {TEAM_ROSTER.filter(p => p.status !== "Inattivo").map(p => (
                <div key={p.id} className="flex justify-between items-center text-sm border-b border-primary/10 pb-2 last:border-0">
                  <span className="font-medium">{p.gamertag} <span className="text-[10px] text-muted-foreground ml-1">({p.role})</span></span>
                  <span className="font-mono text-primary">
                    {p.role === "Manager" || p.role === "Coach" ? "€450.00" : p.status === "Riserva" ? "€150.00" : "€300.00"}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center text-sm pt-2 font-bold mt-2 border-t border-primary/30">
                <span>TOTALE BUDGET MESE:</span>
                <span className="font-mono text-primary">€2,850.00</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center text-sm font-mono text-primary uppercase">
              <ShieldAlert className="w-4 h-4 mr-2" /> Decisioni del Coach
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-background/50 p-3 rounded border border-primary/10">
              <div className="text-xs font-mono text-primary/70 mb-1">DATA: 10/10/2026</div>
              <p className="text-sm">Vanta passa a Riserva per scarso rendimento in S&D. Echo promosso titolare per la prossima settimana.</p>
            </div>
            <div className="bg-background/50 p-3 rounded border border-primary/10">
              <div className="text-xs font-mono text-primary/70 mb-1">DATA: 05/10/2026</div>
              <p className="text-sm">Valutare sostituzione di Reload se l'infortunio al polso persiste oltre il mese.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5 md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center text-sm font-mono text-primary uppercase">
              <FileWarning className="w-4 h-4 mr-2" /> Registro Disciplinare (Log Segreto)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground font-mono bg-background/50">
                  <tr>
                    <th className="px-4 py-2">GIOCATORE</th>
                    <th className="px-4 py-2">DATA</th>
                    <th className="px-4 py-2">INFRAZIONE</th>
                    <th className="px-4 py-2">STATO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/10">
                  <tr>
                    <td className="px-4 py-3 font-medium">Saetta</td>
                    <td className="px-4 py-3 font-mono text-xs">01/10/2026</td>
                    <td className="px-4 py-3">Ritardo di 15 min alla scrim contro QLASH.</td>
                    <td className="px-4 py-3"><span className="text-yellow-500 font-mono text-xs">WARNING 1</span></td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Dust07</td>
                    <td className="px-4 py-3 font-mono text-xs">28/09/2026</td>
                    <td className="px-4 py-3">Comms non pulite durante torneo.</td>
                    <td className="px-4 py-3"><span className="text-yellow-500 font-mono text-xs">WARNING 1</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
