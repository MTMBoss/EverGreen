import { SCRIMS, TEAM_ROSTER } from "@/data/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrivateContent } from "@/components/ui/private-content";
import { Trophy, Clock, Map, Users } from "lucide-react";

export default function Scrims() {
  const getPlayerName = (id: string) => TEAM_ROSTER.find(p => p.id === id)?.gamertag || id;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Confermato": return "bg-primary/20 text-primary border-primary/30";
      case "Da Confermare": return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
      case "Annullato": return "bg-destructive/20 text-destructive border-destructive/30";
      case "Completato": return "bg-muted text-muted-foreground border-border";
      default: return "bg-muted";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">SCRIM & MATCHES</h1>
        <p className="text-sm text-muted-foreground font-mono">CALENDARIO OPERAZIONI</p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {SCRIMS.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((scrim) => (
          <Card key={scrim.id} className={`border-border overflow-hidden ${scrim.status === 'Completato' ? 'opacity-70' : ''}`}>
            <div className="md:flex">
              {/* Left Column - Info */}
              <div className="p-6 md:w-2/5 border-b md:border-b-0 md:border-r border-border bg-muted/5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant="outline" className={`font-mono text-[10px] rounded px-1.5 py-0.5 ${getStatusColor(scrim.status)}`}>
                      {scrim.status.toUpperCase()}
                    </Badge>
                    {scrim.score && (
                      <span className="font-bold text-lg font-mono tracking-tighter">{scrim.score}</span>
                    )}
                  </div>
                  
                  <h2 className="text-2xl font-bold tracking-tighter mb-1">vs {scrim.opponent}</h2>
                  <div className="flex items-center text-sm font-mono text-primary mb-6">
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    {new Date(scrim.date).toLocaleString('it-IT', { 
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                    }).toUpperCase()}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border/50">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1 flex items-center">
                    <Trophy className="w-3 h-3 mr-1" /> Formato
                  </div>
                  <p className="text-sm font-medium">{scrim.format}</p>
                </div>
              </div>

              {/* Right Column - Details */}
              <div className="p-6 md:w-3/5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Maps */}
                  <div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center">
                      <Map className="w-3 h-3 mr-1" /> Rotation
                    </div>
                    <div className="space-y-2">
                      {scrim.maps.map((map, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b border-border/30 pb-1 last:border-0">
                          <span className="font-mono text-muted-foreground text-xs">M{i+1}</span>
                          <span className="font-medium">{map}</span>
                          <span className="text-[10px] text-muted-foreground uppercase">{scrim.modes[i]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lineup */}
                  <div>
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center">
                      <Users className="w-3 h-3 mr-1" /> Formazione
                    </div>
                    <div className="space-y-1.5">
                      {scrim.lineup.map((l, i) => (
                        <div key={i} className="flex justify-between items-center text-sm bg-muted/20 px-2 py-1 rounded">
                          <span className="font-mono text-[10px] text-muted-foreground uppercase">{l.role}</span>
                          <span className="font-bold">{getPlayerName(l.playerId)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {scrim.notes && (
                  <div className="pt-4 border-t border-border/50">
                    <div className="text-xs font-mono text-muted-foreground mb-1">NOTE CAPITANO</div>
                    <p className="text-sm text-foreground/80">{scrim.notes}</p>
                  </div>
                )}

                {/* Private Strategy */}
                {scrim.isPrivate && scrim.privateStrategy && (
                  <div className="pt-4">
                    <PrivateContent>
                      <div className="bg-primary/5 border border-primary/20 rounded-md p-4">
                        <div className="text-xs font-mono text-primary font-bold mb-2 flex items-center">
                          STRATEGIA RISERVATA
                        </div>
                        <p className="text-sm text-primary/80 leading-relaxed font-mono">
                          {scrim.privateStrategy}
                        </p>
                      </div>
                    </PrivateContent>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
