import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function apiUrl(path: string) {
  const cleanPath = path.replace(/^\/+/, "")
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim()
  if (apiBase) {
    const base = apiBase.replace(/\/$/, "")
    if (/^api(\/|$)/.test(cleanPath) && /\/api$/.test(base)) {
      return `${base.replace(/\/api$/, "")}/${cleanPath}`
    }
    if (/^api(\/|$)/.test(cleanPath)) {
      return `${base}/${cleanPath.replace(/^api\/?/, "")}`
    }
    return `${base}/${cleanPath}`
  }
  const base = import.meta.env.BASE_URL || "/"
  return `${base}${cleanPath}`
}
