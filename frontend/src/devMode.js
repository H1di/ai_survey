// Dev stage switcher access. The token arrives once as ?dev=<token>, moves into
// sessionStorage, and is scrubbed from the address bar so it does not sit in
// history or get copy-pasted along with a shared link.
//
// sessionStorage, not localStorage: the token dies with the tab, so it is
// harder to leave behind in a browser.

const TOKEN_KEY = "lpe.devToken";
const PARAM = "dev";

export function readTokenFromSearch(search) {
  const token = new URLSearchParams(search).get(PARAM);
  return token || null;
}

export function captureDevToken() {
  const token = readTokenFromSearch(window.location.search);
  if (!token) return;

  sessionStorage.setItem(TOKEN_KEY, token);

  const url = new URL(window.location.href);
  url.searchParams.delete(PARAM);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getDevToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null;
}

export function isDevMode() {
  return Boolean(getDevToken());
}
