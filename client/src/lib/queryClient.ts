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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

  // Add stored token to headers if available
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "omit", // Changed from "include" to "omit" to remove cookie usage
  });

  await throwIfResNotOk(res);
  return res;
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