import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Token storage helpers
const TOKEN_KEY = 'github_access_token';
const TOKEN_EXPIRY_KEY = 'github_token_expiry';

export function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        return token;
      } else {
        // Token expired, clear it
        clearStoredToken();
      }
    }
  } catch (e) {
    console.error('Error reading token from localStorage:', e);
  }
  return null;
}

export function setStoredToken(token: string, expiresInDays: number = 30): void {
  try {
    const expiryTime = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
  } catch (e) {
    console.error('Error storing token in localStorage:', e);
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  } catch (e) {
    console.error('Error clearing token from localStorage:', e);
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: any) {
  const token = getStoredToken();

  if (!token) {
    console.log('[API_REQUEST] No token available');
    throw new Error('Unauthorized');
  }

  const headers: HeadersInit = {
    'Authorization': `Bearer ${token}`,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (data) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    if (response.status === 401) {
      console.log('[API_REQUEST] 401 Unauthorized - clearing token');
      clearStoredToken();
      throw new Error('Unauthorized');
    }
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string; // Construct URL from queryKey
    const token = getStoredToken(); // Get the stored token

    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`; // Add Authorization header
    }

    const res = await fetch(url, {
      headers,
      credentials: "omit", // Ensure no cookies are sent
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});