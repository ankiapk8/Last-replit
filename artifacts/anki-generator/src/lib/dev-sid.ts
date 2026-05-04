const LS_SID_KEY = "dev-sid";

export function getOrCreateDevSid(): string {
  let sid = localStorage.getItem(LS_SID_KEY);
  if (!sid) {
    sid = "dev-" + Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(LS_SID_KEY, sid);
  }
  return sid;
}

export function devSidHeaders(): HeadersInit {
  if (!import.meta.env.DEV) return {};
  return { "X-Dev-Sid": getOrCreateDevSid() };
}
