import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Home from "@/pages/home";
import Settings from "@/pages/settings";
import Recordings from "@/pages/recordings";
import Auth from "@/pages/auth";
import RabbitR1 from "@/pages/rabbit";
import NotFound from "@/pages/not-found";
import type { User } from "@shared/schema";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { data: user, isLoading, error } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      const response = await fetch('/api/auth/user', {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Not authenticated');
      }
      
      return response.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background max-w-[240px] mx-auto">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-body text-muted-foreground">Laden...</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    console.log('[PROTECTED_ROUTE] Auth check failed:', { error, user });
    return <Redirect to="/auth" />;
  }

  console.log('[PROTECTED_ROUTE] User authenticated:', user.username);
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/rabbit" component={RabbitR1} />
      <Route path="/auth" component={Auth} />
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route path="/recordings">
        {() => <ProtectedRoute component={Recordings} />}
      </Route>
      <Route path="/">
        {() => <ProtectedRoute component={Home} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
