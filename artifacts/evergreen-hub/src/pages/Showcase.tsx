import { LOADOUTS } from "@/data/team";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import weaponAk from "@/assets/weapon-ak117.png";
import weaponFennec from "@/assets/weapon-fennec.png";
import weaponLocus from "@/assets/weapon-locus.png";

const IMG_MAP: Record<string, string> = {
  "AK117": weaponAk,
  "Fennec": weaponFennec,
  "Locus": weaponLocus,
};

export default function Showcase() {
  const featured = LOADOUTS.filter(l => l.featured && l.stats);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tighter mb-2 text-shadow-glow">VETRINA</h1>
        <p className="text-sm text-muted-foreground font-mono uppercase">Loadout in evidenza della settimana</p>
      </div>

      <div className="space-y-12">
        {featured.map((loadout, idx) => {
          const stats = loadout.stats!;
          const imgSrc = IMG_MAP[loadout.weapon] || weaponAk; // fallback
          
          return (
            <Card key={loadout.id} className="overflow-hidden border-primary/20 bg-card/40 backdrop-blur">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="relative aspect-[16/9] lg:aspect-auto lg:h-full border-b lg:border-b-0 lg:border-r border-border">
                  <img src={imgSrc} alt={loadout.weapon} className="w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-background to-transparent" />
                  <div className="absolute top-4 left-4">
                    <Badge className="bg-primary text-primary-foreground font-mono font-bold tracking-widest box-shadow-glow">
                      FEATURED #{idx + 1}
                    </Badge>
                  </div>
                  <div className="absolute bottom-4 left-4">
                    <h2 className="text-4xl font-bold tracking-tighter text-white drop-shadow-md">{loadout.weapon}</h2>
                    <p className="text-primary font-mono text-sm">{loadout.name}</p>
                  </div>
                </div>
                
                <div className="p-6 md:p-8 flex flex-col justify-center space-y-6">
                  <div>
                    <h3 className="text-sm font-mono text-muted-foreground mb-4 uppercase">Performance Metrics</h3>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span>DANNO</span><span>{stats.damage}</span>
                        </div>
                        <Progress value={stats.damage} className="h-1.5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span>RATEO/PRECISIONE</span><span>{stats.accuracy}</span>
                        </div>
                        <Progress value={stats.accuracy} className="h-1.5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span>MOBILITÀ</span><span>{stats.mobility}</span>
                        </div>
                        <Progress value={stats.mobility} className="h-1.5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span>CONTROLLO</span><span>{stats.control}</span>
                        </div>
                        <Progress value={stats.control} className="h-1.5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span>PORTATA</span><span>{stats.range}</span>
                        </div>
                        <Progress value={stats.range} className="h-1.5" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border/50">
                    <div className="flex flex-wrap gap-2">
                      {loadout.tags.map(t => (
                        <span key={t} className="px-2 py-1 bg-muted/50 border border-border rounded text-xs font-mono uppercase text-muted-foreground">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
