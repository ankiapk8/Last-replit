import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import "./index.css";

const apiBase = import.meta.env.VITE_API_BASE as string | undefined;
if (apiBase && apiBase.trim()) {
  setBaseUrl(apiBase.trim().replace(/\/$/, ""));
}

type PromiseWithResolversConstructor = PromiseConstructor & {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};

const promiseConstructor = Promise as PromiseWithResolversConstructor;

if (!promiseConstructor.withResolvers) {
  promiseConstructor.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };
}

// Apply saved dark/light theme immediately before React renders to prevent flash
try {
  const stored = localStorage.getItem("ankigen-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = stored ? stored === "dark" : prefersDark;
  document.documentElement.classList.toggle("dark", dark);
} catch {
  /* ignore */
}

// Detect installed APK / standalone mode for any platform-specific styling,
// but allow normal pinch-to-zoom in all environments.
function detectApk() {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  const inApk =
    !!w.Capacitor?.isNativePlatform?.() ||
    w.Capacitor?.getPlatform?.() === "android" ||
    w.Capacitor?.getPlatform?.() === "ios" ||
    document.referrer.startsWith("android-app://") ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: fullscreen)").matches ||
    // @ts-expect-error iOS only
    window.navigator.standalone === true ||
    /\bwv\b|AnkiGen/.test(navigator.userAgent);
  if (inApk) document.documentElement.dataset.apk = "1";
}
detectApk();

try {
  localStorage.removeItem("ankigen-appearance");
} catch {
  /* ignore */
}

const { default: App } = await import("./App");

createRoot(document.getElementById("root")!).render(<App />);

function hideSplash() {
  const el = document.getElementById("app-splash");
  if (!el) return;
  el.classList.add("is-hidden");
  window.setTimeout(() => el.remove(), 700);
}
const SPLASH_MIN_MS = 800;
const startedAt = (window as unknown as { __splashStart?: number }).__splashStart ?? performance.now();
const remaining = Math.max(0, SPLASH_MIN_MS - (performance.now() - startedAt));
window.setTimeout(() => requestAnimationFrame(hideSplash), remaining);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {});
  });
}
