import { useState, useEffect } from "react";
import { TEAM_ROSTER } from "@/data/team";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar as CalendarIcon, Check, X, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type AttendanceState = "available" | "unavailable" | "tentative";

const DAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const SLOTS = ["21:00", "22:00", "23:00"];

export default function Attendance() {
  const [viewerId, setViewerId] = useState<string>("");
  const [attendance, setAttendance] = useState<Record<string, AttendanceState>>({});
  const { toast } = useToast();

  useEffect(() => {
    const savedViewer = localStorage.getItem("evergreen_viewer");
    if (savedViewer) setViewerId(savedViewer);

    const savedAttendance = localStorage.getItem("evergreen_attendance_v1");
    if (savedAttendance) {
      try {
        setAttendance(JSON.parse(savedAttendance));
      } catch (e) {
        console.error("Failed to parse attendance", e);
      }
    }
  }, []);

  const handleViewerChange = (val: string) => {
    setViewerId(val);
    localStorage.setItem("evergreen_viewer", val);
  };

  const toggleCell = (day: string, slot: string) => {
    if (!viewerId) {
      toast({
        title: "Errore",
        description: "Seleziona chi sei dal menu a tendina prima di segnare le presenze.",
        variant: "destructive"
      });
      return;
    }

    const key = `${viewerId}_${day}_${slot}`;
    const current = attendance[key];
    let next: AttendanceState = "available";
    
    if (current === "available") next = "tentative";
    else if (current === "tentative") next = "unavailable";
    else if (current === "unavailable") next = "available";

    const newAttendance = { ...attendance, [key]: next };
    setAttendance(newAttendance);
    localStorage.setItem("evergreen_attendance_v1", JSON.stringify(newAttendance));
  };

  const getCellState = (playerId: string, day: string, slot: string) => {
    return attendance[`${playerId}_${day}_${slot}`];
  };

  const getCellIcon = (state?: AttendanceState) => {
    if (state === "available") return <Check className="w-4 h-4 text-primary" />;
    if (state === "unavailable") return <X className="w-4 h-4 text-destructive" />;
    if (state === "tentative") return <HelpCircle className="w-4 h-4 text-yellow-500" />;
    return <div className="w-4 h-4 rounded-sm border border-dashed border-muted-foreground/30" />;
  };

  const getAggregateCount = (day: string, slot: string) => {
    let count = 0;
    TEAM_ROSTER.forEach(p => {
      if (getCellState(p.id, day, slot) === "available") count++;
    });
    return count;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">REGISTRO PRESENZE</h1>
          <p className="text-sm text-muted-foreground font-mono">SETTIMANA CORRENTE</p>
        </div>
        <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-md border border-border">
          <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">ID OPERATORE:</span>
          <Select value={viewerId} onValueChange={handleViewerChange}>
            <SelectTrigger className="w-[180px] font-mono h-8">
              <SelectValue placeholder="Seleziona..." />
            </SelectTrigger>
            <SelectContent>
              {TEAM_ROSTER.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.gamertag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="bg-muted/10 border-b border-border">
          <CardTitle className="text-sm font-mono flex items-center">
            <CalendarIcon className="w-4 h-4 mr-2" /> GRIGLIA OPERATIVA
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-[120px_1fr_1fr_1fr] border-b border-border bg-muted/5">
              <div className="p-3 text-xs font-mono font-bold text-muted-foreground">GIORNO</div>
              {SLOTS.map(slot => (
                <div key={slot} className="p-3 text-center text-xs font-mono font-bold text-muted-foreground border-l border-border/50">
                  {slot}
                </div>
              ))}
            </div>

            <div className="divide-y divide-border/50">
              {DAYS.map(day => (
                <div key={day} className="grid grid-cols-[120px_1fr_1fr_1fr] hover:bg-muted/5 transition-colors group">
                  <div className="p-3 text-sm font-medium flex items-center">
                    {day}
                  </div>
                  {SLOTS.map(slot => {
                    const count = getAggregateCount(day, slot);
                    const myState = viewerId ? getCellState(viewerId, day, slot) : undefined;
                    const isGood = count >= 5;
                    
                    return (
                      <div 
                        key={`${day}-${slot}`} 
                        className="p-3 border-l border-border/50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/10"
                        onClick={() => toggleCell(day, slot)}
                        data-testid={`cell-${day}-${slot}`}
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded bg-background border border-border">
                          {getCellIcon(myState)}
                        </div>
                        <div className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isGood ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}>
                          {count}/6 Disp.
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-center gap-6 text-xs font-mono text-muted-foreground pt-4">
        <span className="flex items-center"><Check className="w-3 h-3 text-primary mr-1"/> Disponibile</span>
        <span className="flex items-center"><HelpCircle className="w-3 h-3 text-yellow-500 mr-1"/> In Forse</span>
        <span className="flex items-center"><X className="w-3 h-3 text-destructive mr-1"/> Assente</span>
      </div>
    </div>
  );
}
