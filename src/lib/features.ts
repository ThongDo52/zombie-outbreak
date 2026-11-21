/**
 * The USDC prize mode (Endless Descent) needs the co-op server, so it only exists where a server does:
 * the dev server, or a copy of the page pointed at one with VITE_COOP_URL. A static copy of the site
 * (no server) simply leaves it out, and the rest of the game works as usual.
 */
export const PRIZES_ENABLED = import.meta.env.DEV || Boolean((import.meta.env.VITE_COOP_URL as string | undefined)?.trim())
