const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';
const RETURN_URL_KEY = 'scolReturnUrl';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function setAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function setReturnUrl(path: string) {
  if (path && path !== '/login') {
    localStorage.setItem(RETURN_URL_KEY, path);
  }
}

export function consumeReturnUrl(): string | null {
  const url = localStorage.getItem(RETURN_URL_KEY);
  localStorage.removeItem(RETURN_URL_KEY);
  return url;
}

export function postLoginPath(): string {
  const returnUrl = consumeReturnUrl();
  if (returnUrl) return returnUrl;
  return '/universities';
}
