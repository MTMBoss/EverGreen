import { useState } from "react";
import { TEAM_ROSTER, Player } from "@/data/team";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Shield, Target, Trophy, Crosshair } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Roster() {
  const [search, setSearch] = useState("");

  const filteredRoster = TEAM_ROSTER.filter(p => 
    p.gamertag.toLowerCase().includes(search.toLowerCase()) || 
    p.role.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusColor = (status: Player["status"]) => {
    switch (status) {
      case "Attivo": return "bg-primary/20 text-primary border-primary/30";
      case "Riserva": return "bg-blue-500/20 text-blue-500 border-blue-500/30";
      case "Infortunato": return "bg-destructive/20 text-destructive border-destructive/30";
      case "Inattivo": return "bg-muted text-muted-foreground border-muted-foreground/30";
      default: return "bg-muted";
    }
  };

  const getRoleIcon = (role: Player["role"]) => {
    switch (role) {
      case "Captain":
      case "Manager": return <Shield className="h-3 w-3 mr-1" />;
      case "Slayer": return <Target className="h-3 w-3 mr-1" />;
      case "Anchor": return <Shield className="h-3 w-3 mr-1" />;
      case "Support": return <Crosshair className="h-3 w-3 mr-1" />;
      default: return <Trophy className="h-3 w-3 mr-1" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">ROSTER ATTIVO</h1>
          <p className="text-sm text-muted-foreground font-mono">PERSONALE OPERATIVO STAGIONE 2026</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca operatore..."
            className="pl-9 font-mono text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRoster.map((player) => (
          <Card key={player.id} className="overflow-hidden group hover:border-primary/50 transition-colors">
            <CardContent className="p-0">
              <div className="p-4 flex items-start gap-4">
                <Avatar className="h-12 w-12 border border-border rounded-md bg-muted">
                  <AvatarFallback className="font-mono text-lg font-bold bg-transparent rounded-md">
                    {player.gamertag.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg leading-tight truncate">{player.gamertag}</h3>
                      <p className="text-xs text-muted-foreground truncate">{player.firstName}</p>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-mono px-1.5 py-0 rounded ${getStatusColor(player.status)}`}>
                      {player.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="mt-3 flex items-center text-xs font-mono text-muted-foreground">
                    <span className="flex items-center px-2 py-0.5 rounded bg-muted/50 border border-border mr-2">
                      {getRoleIcon(player.role)}
                      {player.role.toUpperCase()}
                    </span>
                    <span className="ml-auto opacity-50">{player.flag}</span>
                  </div>
                </div>
              </div>
              
              <div className="border-t border-border/50 bg-muted/10 p-3 grid grid-cols-3 gap-2 divide-x divide-border/50 text-center">
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground mb-0.5">K/D</div>
                  <div className="font-mono font-bold text-sm">{player.kd > 0 ? player.kd.toFixed(2) : '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground mb-0.5">WIN %</div>
                  <div className="font-mono font-bold text-sm">{player.winRate > 0 ? `${player.winRate}%` : '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-mono text-muted-foreground mb-0.5">MAIN</div>
                  <div className="font-mono font-bold text-xs truncate px-1" title={player.weapons[0]}>
                    {player.weapons[0] || '-'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
