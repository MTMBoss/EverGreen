import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrivateModeProvider } from "@/lib/private-mode";

import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Dashboard from "@/pages/Dashboard";
import Roster from "@/pages/Roster";
import Attendance from "@/pages/Attendance";
import Equipment from "@/pages/Equipment";
import Showcase from "@/pages/Showcase";
import Rules from "@/pages/Rules";
import Scrims from "@/pages/Scrims";
import PrivateArea from "@/pages/PrivateArea";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/roster" component={Roster} />
        <Route path="/presenze" component={Attendance} />
        <Route path="/equipaggiamenti" component={Equipment} />
        <Route path="/vetrina" component={Showcase} />
        <Route path="/regolamento" component={Rules} />
        <Route path="/scrim" component={Scrims} />
        <Route path="/area-privata" component={PrivateArea} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PrivateModeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </PrivateModeProvider>
    </QueryClientProvider>
  );
}

export default App;
