import { useState, useEffect } from "react";

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("ankigen-theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ankigen-theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, setDark] as const;
}
