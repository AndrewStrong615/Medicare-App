/**
 * Placeholder auth service. Talks to the FastAPI /auth endpoints and holds
 * the token in memory only — no persisted/secure storage yet. Before this
 * ships, swap the in-memory token for expo-secure-store (or equivalent) and
 * add token refresh handling.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

let inMemoryToken: string | null = null;

export interface AuthResult {
  accessToken: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  const data = await response.json();
  inMemoryToken = data.access_token;
  return { accessToken: data.access_token };
}

export async function signup(email: string, password: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Signup failed");
  }
}

export function getToken(): string | null {
  return inMemoryToken;
}

export function logout(): void {
  inMemoryToken = null;
}
