import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SyncMiddlewareProvider } from "@/contexts/SyncMiddlewareContext";
import { AuthRequiredModal } from "@/components/AuthRequiredModal";
import { SettingsRequiredModal } from "@/components/SettingsRequiredModal";
import RabbitR1 from "@/pages/rabbit";

//braucht es den router noch oder kann man das auch direkt in der main.tsx machen?
function Router() {
  return (
    <Switch>
      <Route path="/" component={RabbitR1} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SyncMiddlewareProvider>
          <TooltipProvider>
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
