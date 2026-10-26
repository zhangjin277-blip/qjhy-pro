import { env } from "@/lib/env";

/** Shared by sign-in and authenticated writes served through the NAS proxy. */
export function getTrustedOrigins(): string[] {
  return [
    env.NEXT_PUBLIC_APP_URL,
    "http://172.16.39.61:3000",
    "http://localhost:3000",
    ...(process.env.TRUSTED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []),
  ];
}

export function isTrustedOrigin(origin: string | null): boolean {
  if (!origin || origin === "null") return false;
  return getTrustedOrigins().some((configured) => {
    try {
      const url = new URL(configured);
      return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
    } catch {
      return false;
    }
  });
}
