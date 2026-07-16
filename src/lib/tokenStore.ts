// In-memory access token store. Never persist the access token to
// localStorage/sessionStorage — the HttpOnly refresh cookie is the only
// thing that should survive a page reload, so an XSS payload can't read
// a live bearer token off the page.
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
