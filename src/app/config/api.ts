export const API_BASE = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const TOKEN_KEY = "proysocial:token";

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await window.fetch(input, { ...init, headers });
  if (response.status === 401 && token) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem("proysocial:user");
    window.localStorage.removeItem("proysocial:semester");
    // Sesión vencida o revocada (p. ej. a las 8 h o al inactivar la cuenta): se vuelve al inicio de sesión en lugar de dejar la pantalla
    // actual con llamadas que fallan en silencio.
    if (window.location.pathname !== "/") window.location.assign("/");
  }
  return response;
}

