import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, Users, CalendarDays } from "lucide-react";
import { ANNOUNCEMENTS } from "@/data/team";
import { Link } from "wouter";
import bannerImg from "@/assets/banner.png";

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="relative rounded-lg overflow-hidden border border-border aspect-[21/9] md:aspect-[21/6]">
        <img src={bannerImg} alt="EverGreen Banner" className="object-cover w-full h-full opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute bottom-0 left-0 p-6 md:p-8">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tighter text-shadow-glow text-white mb-2">EVERGREEN</h1>
          <p className="text-primary font-mono text-sm md:text-base">COMPETITIVE SQUAD // EU REGION</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="md:col-span-2 border-primary/30 bg-card/50 backdrop-blur box-shadow-glow">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-mono text-primary uppercase tracking-widest">
              <CalendarDays className="mr-2 h-4 w-4" /> Calendario Presenze
            </CardTitle>
            <CardDescription>Monitoraggio operativo del roster e delle fasce orarie.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[21, 22, 23].map((hour, index) => (
                <div key={hour} className="bg-background/80 border border-border p-4 rounded-md">
                  <div className="text-xs text-muted-foreground font-mono mb-1">FASCIA {index + 1}</div>
                  <div className="text-xl font-bold font-mono text-primary">{hour}:00</div>
                  <div className="text-xs text-muted-foreground mt-2">Da aggiornare dal pannello presenze</div>
                </div>
              ))}
            </div>
            <Link href="/presenze" className="block mt-4">
              <Button variant="outline" size="sm" className="w-full text-xs font-mono">Apri Presenze</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-sm font-mono text-muted-foreground uppercase tracking-widest">
              <Users className="mr-2 h-4 w-4" /> Presenze Oggi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[21, 22, 23].map((hour) => (
                <div key={hour} className="flex items-center justify-between">
                  <span className="font-mono text-sm">{hour}:00</span>
                  <div className="flex items-center">
                    <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
                      {Math.floor(Math.random() * 3) + 4}/6
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/presenze" className="block mt-4">
              <Button variant="outline" size="sm" className="w-full text-xs font-mono">Aggiorna Status</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center border-b border-border pb-2">
          <Megaphone className="mr-2 h-5 w-5 text-primary" /> 
          COMUNICAZIONI RECENTI
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ANNOUNCEMENTS.slice(0, 4).map((ann) => (
            <Card key={ann.id} className="bg-card/30 hover:bg-card/60 transition-colors border-border/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-sm">{ann.title}</h3>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {new Date(ann.date).toLocaleDateString('it-IT')}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{ann.content}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
