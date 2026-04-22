import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, Clock, Users, ArrowRight } from "lucide-react";
import { ANNOUNCEMENTS, SCRIMS } from "@/data/team";
import { Link } from "wouter";
import bannerImg from "@/assets/banner.png";

export default function Dashboard() {
  const [countdown, setCountdown] = useState("");
  const nextScrim = SCRIMS.find(s => new Date(s.date) > new Date()) || SCRIMS[0];

  useEffect(() => {
    if (!nextScrim) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(nextScrim.date).getTime() - now;

      if (distance < 0) {
        setCountdown("IN CORSO");
        clearInterval(timer);
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));

      setCountdown(`${days > 0 ? `${days}g ` : ''}${hours}h ${minutes}m`);
    }, 1000);

    return () => clearInterval(timer);
  }, [nextScrim]);

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
              <Clock className="mr-2 h-4 w-4" /> Next Operation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextScrim && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold">{nextScrim.opponent}</h3>
                  <p className="text-muted-foreground font-mono text-sm mt-1">
                    {new Date(nextScrim.date).toLocaleString('it-IT', { 
                      weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                    }).toUpperCase()}
                  </p>
                </div>
                <div className="text-center bg-background/80 border border-border p-4 rounded-md min-w-[140px]">
                  <div className="text-xs text-muted-foreground font-mono mb-1">T-MINUS</div>
                  <div className="text-xl font-bold font-mono text-primary">{countdown || "--:--"}</div>
                </div>
              </div>
            )}
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
