import { useState } from "react";
import { LOADOUTS, TEAM_ROSTER, Loadout } from "@/data/team";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crosshair, User, MapPin, Wrench } from "lucide-react";
import { PrivateContent } from "@/components/ui/private-content";

export default function Equipment() {
  const [filter, setFilter] = useState<string>("ALL");

  const filteredLoadouts = LOADOUTS.filter(l => filter === "ALL" || l.class === filter);
  const classes = ["ALL", "AR", "SMG", "Sniper", "Shotgun", "LMG"];

  const getAuthorName = (id: string) => TEAM_ROSTER.find(p => p.id === id)?.gamertag || "Sconosciuto";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">ARMERIA & EQUIPAGGIAMENTI</h1>
        <p className="text-sm text-muted-foreground font-mono">DATABASE UFFICIALE SETUP</p>
      </div>

      <Tabs defaultValue="ALL" onValueChange={setFilter} className="w-full overflow-x-auto pb-2">
        <TabsList className="bg-card border border-border">
          {classes.map(c => (
            <TabsTrigger key={c} value={c} className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredLoadouts.map((loadout) => (
          <Card key={loadout.id} className="border-border/50 bg-card overflow-hidden flex flex-col">
            <CardHeader className="bg-muted/10 border-b border-border/50 pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="outline" className="mb-2 text-[10px] font-mono rounded border-primary/50 text-primary">
                    {loadout.class}
                  </Badge>
                  <CardTitle className="text-xl font-bold">{loadout.name}</CardTitle>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono tracking-tighter opacity-80">{loadout.weapon}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 flex-1 space-y-4">
              <div>
                <h4 className="text-xs font-mono text-muted-foreground mb-2 flex items-center">
                  <Wrench className="w-3 h-3 mr-1" /> ACCESSORI
                </h4>
                <div className="grid grid-cols-1 gap-1">
                  {loadout.attachments.map((att, i) => (
                    <div key={i} className="text-sm px-2 py-1 bg-muted/30 rounded border border-border/50">
                      {att}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-[10px] font-mono text-muted-foreground mb-1">PERKS</h4>
                  <div className="text-xs space-y-0.5">
                    {loadout.perks.map(p => <div key={p}>• {p}</div>)}
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-mono text-muted-foreground mb-1">OPERATORE</h4>
                  <div className="text-xs">{loadout.operatorSkill}</div>
                  
                  <h4 className="text-[10px] font-mono text-muted-foreground mb-1 mt-2">MAPPA CONSIGLIATA</h4>
                  <div className="text-xs flex items-center">
                    <MapPin className="w-3 h-3 mr-1 text-primary" /> {loadout.map}
                  </div>
                </div>
              </div>

              {loadout.isPrivate && loadout.privateNotes && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <PrivateContent>
                    <div className="bg-primary/10 border border-primary/20 rounded p-3 text-sm font-mono text-primary/90">
                      <strong className="block mb-1">NOTE TATTICHE RISERVATE:</strong>
                      {loadout.privateNotes}
                    </div>
                  </PrivateContent>
                </div>
              )}
            </CardContent>
            <CardFooter className="bg-muted/5 border-t border-border/50 py-3 flex justify-between items-center text-xs text-muted-foreground">
              <span className="flex items-center font-mono">
                <User className="w-3 h-3 mr-1" /> {getAuthorName(loadout.authorId)}
              </span>
              <div className="flex gap-1">
                {loadout.tags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-background border border-border rounded text-[10px] uppercase">
                    {t}
                  </span>
                ))}
              </div>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      {filteredLoadouts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground font-mono">
          Nessun equipaggiamento trovato per questa classe.
        </div>
      )}
    </div>
  );
}
