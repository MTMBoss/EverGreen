import { RULES } from "@/data/team";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function Rules() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="text-center mb-8">
        <ScrollText className="w-12 h-12 text-primary mx-auto mb-4 opacity-80" />
        <h1 className="text-3xl font-bold tracking-tight mb-2">CODICE REGOLAMENTARE</h1>
        <p className="text-sm text-muted-foreground font-mono">DOCUMENTO UFFICIALE EVERGREEN ESPORTS</p>
      </div>

      <Card className="border-border bg-card/50 backdrop-blur">
        <CardContent className="p-6 md:p-8">
          <div className="text-xs font-mono text-muted-foreground mb-6 pb-6 border-b border-border/50 text-center">
            LEGGERE ATTENTAMENTE. LA NON OSSERVANZA COMPORTA SANZIONI.
          </div>

          <Accordion type="multiple" className="w-full space-y-4">
            {RULES.map((section, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border bg-muted/10 rounded-lg px-4">
                <AccordionTrigger className="font-bold text-left hover:text-primary transition-colors hover:no-underline font-sans tracking-wide">
                  {section.category}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm space-y-3 pt-2 pb-4">
                  {section.articles.map((article, j) => (
                    <div key={j} className="flex items-start">
                      <span className="text-primary mr-2 opacity-50">›</span>
                      <span className="leading-relaxed">{article}</span>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
