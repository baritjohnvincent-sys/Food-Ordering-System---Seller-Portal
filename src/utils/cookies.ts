/**
 * Dual-Engine Cookie Management Helper for Food System Portal.
 * Manages both real document.cookie and fallback localStorage states 
 * to bypass sandboxed iframe restrictions if standard cookies are blocked.
 */

export const setCookie = (name: string, value: string, days?: number) => {
  try {
    let expires = "";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie = `${name}=${value || ""}${expires}; path=/; SameSite=Strict; Secure`;
  } catch (e) {
    console.warn("Cookies blocked by sandbox/iframe security. Using storage fallbacks.");
  }
  // Local storage fallback for dual-engine sync
  localStorage.setItem(`cookie_${name}`, value);
  if (days) {
    localStorage.setItem(`cookie_${name}_expires`, new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString());
  } else {
    // Session cookie fallback
    sessionStorage.setItem(`cookie_${name}`, value);
  }
};

export const getCookie = (name: string): string | null => {
  // Try reading standard document cookie first
  try {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
  } catch (e) {
    // Suppress warning
  }

  // Dual engine fallback
  const fallbackVal = localStorage.getItem(`cookie_${name}`) || sessionStorage.getItem(`cookie_${name}`);
  if (fallbackVal) {
    // Check if persistent expired
    const expiry = localStorage.getItem(`cookie_${name}_expires`);
    if (expiry && new Date() > new Date(expiry)) {
      eraseCookie(name);
      return null;
    }
    return fallbackVal;
  }
  return null;
};

export const eraseCookie = (name: string) => {
  try {
    document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Strict; Secure';
  } catch (e) {}
  localStorage.removeItem(`cookie_${name}`);
  localStorage.removeItem(`cookie_${name}_expires`);
  sessionStorage.removeItem(`cookie_${name}`);
};
