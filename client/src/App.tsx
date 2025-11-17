import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Settings from "@/pages/settings";
import Recordings from "@/pages/recordings";
import Auth from "@/pages/auth";
import RabbitR1 from "@/pages/rabbit";
import NotFound from "@/pages/not-found";
import type { User } from "@shared/schema";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  console.log('[PROTECTED_ROUTE] ========================================');
  console.log('[PROTECTED_ROUTE] Component mounting/rendering');
  console.log('[PROTECTED_ROUTE] Current URL:', window.location.href);
  console.log('[PROTECTED_ROUTE] Cookies:', document.cookie);
  console.log('[PROTECTED_ROUTE] ========================================');

  const { data: user, isLoading, error, status, fetchStatus } = useQuery<User>({
    queryKey: ['/api/auth/user'],
    queryFn: async () => {
      console.log('[PROTECTED_ROUTE] ========================================');
      console.log('[PROTECTED_ROUTE] 🔄 Starting auth check');
      console.log('[PROTECTED_ROUTE] Cookies before fetch:', document.cookie);
      console.log('[PROTECTED_ROUTE] ========================================');

      const response = await fetch('/api/auth/user', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        }
      });

      console.log('[PROTECTED_ROUTE] ========================================');
      console.log('[PROTECTED_ROUTE] 📥 Response received');
      console.log('[PROTECTED_ROUTE] Status:', response.status);
      console.log('[PROTECTED_ROUTE] Status Text:', response.statusText);
      console.log('[PROTECTED_ROUTE] Headers:', Object.fromEntries(response.headers.entries()));
      console.log('[PROTECTED_ROUTE] ========================================');

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('auth_token');
        }
        throw new Error('Unauthorized');
      }

      return await response.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  console.log('[PROTECTED_ROUTE] ========================================');
  console.log('[PROTECTED_ROUTE] Query state:');
  console.log('[PROTECTED_ROUTE] - isLoading:', isLoading);
  console.log('[PROTECTED_ROUTE] - status:', status);
  console.log('[PROTECTED_ROUTE] - fetchStatus:', fetchStatus);
  console.log('[PROTECTED_ROUTE] - error:', error);
  console.log('[PROTECTED_ROUTE] - user:', user);
  console.log('[PROTECTED_ROUTE] ========================================');

  if (isLoading) {
    console.log('[PROTECTED_ROUTE] 🔄 Still loading, showing spinner');
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
    console.log('[PROTECTED_ROUTE] ========================================');
    console.log('[PROTECTED_ROUTE] ❌ AUTH CHECK FAILED - REDIRECTING TO /auth');
    console.log('[PROTECTED_ROUTE] Error:', error);
    console.log('[PROTECTED_ROUTE] User:', user);
    console.log('[PROTECTED_ROUTE] Error instance:', error instanceof Error ? error.message : 'Not an Error instance');
    console.log('[PROTECTED_ROUTE] ========================================');
    return <Redirect to="/auth" />;
  }

  console.log('[PROTECTED_ROUTE] ========================================');
  console.log('[PROTECTED_ROUTE] ✅ User authenticated, rendering component');
  console.log('[PROTECTED_ROUTE] User:', user.username);
  console.log('[PROTECTED_ROUTE] ========================================');
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RabbitR1} />
      <Route path="/recordings">
        {() => <ProtectedRoute component={Recordings} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route path="/auth" component={Auth} />
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