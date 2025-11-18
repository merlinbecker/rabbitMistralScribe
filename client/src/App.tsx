import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SyncMiddlewareProvider } from "@/contexts/SyncMiddlewareContext";
import { AuthRequiredModal } from "@/components/AuthRequiredModal";
import { SettingsRequiredModal } from "@/components/SettingsRequiredModal";
import Recordings from "@/pages/recordings";
import RabbitR1 from "@/pages/rabbit";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={RabbitR1} />
      <Route path="/recordings" component={Recordings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SyncMiddlewareProvider>
          <TooltipProvider>
            <Toaster />
            <AuthRequiredModal />
            <SettingsRequiredModal />
            <Router />
          </TooltipProvider>
        </SyncMiddlewareProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;