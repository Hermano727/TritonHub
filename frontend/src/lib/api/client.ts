const DEFAULT_API_ORIGIN = "http://127.0.0.1:8000";

export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  return base && base.length > 0 ? base : DEFAULT_API_ORIGIN;
}
