import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";

interface PrivateModeContextType {
  isPrivate: boolean;
  unlock: (code: string) => boolean;
  lock: () => void;
}

const PrivateModeContext = createContext<PrivateModeContextType | undefined>(undefined);

export function PrivateModeProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const saved = localStorage.getItem("evergreen_private");
    if (saved === "true") {
      setIsPrivate(true);
    }
  }, []);

  const unlock = (code: string) => {
    if (code.trim().toUpperCase() === "EG2026") {
      setIsPrivate(true);
      localStorage.setItem("evergreen_private", "true");
      toast({
        title: "Accesso Consentito",
        description: "Area privata sbloccata.",
        variant: "default",
      });
      return true;
    }
    toast({
      title: "Accesso Negato",
      description: "Codice di sicurezza non valido.",
      variant: "destructive",
    });
    return false;
  };

  const lock = () => {
    setIsPrivate(false);
    localStorage.setItem("evergreen_private", "false");
    toast({
      title: "Area Bloccata",
      description: "Sei uscito dall'area privata.",
    });
  };

  return (
    <PrivateModeContext.Provider value={{ isPrivate, unlock, lock }}>
      {children}
    </PrivateModeContext.Provider>
  );
}

export function usePrivateMode() {
  const context = useContext(PrivateModeContext);
  if (context === undefined) {
    throw new Error("usePrivateMode must be used within a PrivateModeProvider");
  }
  return context;
}
