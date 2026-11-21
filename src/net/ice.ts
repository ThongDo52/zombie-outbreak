/**
 * Network helpers for WebRTC. Two browsers behind home routers usually connect directly through a STUN
 * server. Some networks (mobile data, offices) cannot, and then a TURN relay carries the traffic instead.
 * A free relay account is optional: without it the room still works for everyone who can connect directly.
 */

export interface IceConfig {
  iceServers: RTCIceServer[]
  /** A relay server is configured, so networks that cannot connect directly can still join. */
  relay: boolean
}

// STUN servers only help two browsers find each other's public address. They carry no game data.
// (The free public relays that used to need no account, such as PeerJS's own and Open Relay's shared login, have been shut down.)
const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.nextcloud.com:3478' },
]

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

let cached: { at: number; value: IceConfig } | null = null
const TTL_MS = 10 * 60 * 1000

/** STUN plus, when configured, a TURN relay: fixed values from the environment, or a Metered.ca free-tier account. */
export async function loadIceServers(): Promise<IceConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const servers = [...STUN]
  let relay = false

  const url = text(import.meta.env.VITE_TURN_URL)
  const username = text(import.meta.env.VITE_TURN_USERNAME)
  const credential = text(import.meta.env.VITE_TURN_CREDENTIAL)
  if (url && username && credential) {
    servers.push({ urls: url.split(',').map((u) => u.trim()), username, credential })
    relay = true
  }

  // accept `yourapp`, `yourapp.metered.live` or a pasted https:// address
  const rawApp = text(import.meta.env.VITE_METERED_APP).replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const app = rawApp && !rawApp.includes('.') ? `${rawApp}.metered.live` : rawApp
  const key = text(import.meta.env.VITE_METERED_KEY)
  if (!relay && app && key) {
    try {
      const res = await fetch(`https://${app}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const list = (await res.json()) as unknown
        if (Array.isArray(list) && list.length > 0) {
          servers.push(...(list as RTCIceServer[]))
          relay = true
        }
      }
    } catch {
      // the relay is a bonus: without it rooms still work for networks that can connect directly
    }
  }

  const value = { iceServers: servers, relay }
  cached = { at: Date.now(), value }
  return value
}

export interface IceReport {
  /** Candidates found on this device (the local network). */
  host: number
  /** Candidates with a public address seen through STUN. Without any, UDP to the internet is blocked. */
  srflx: number
  /** Candidates on a relay server. Without any, only networks that can connect directly can join. */
  relay: number
  /** A relay is configured. */
  relayConfigured: boolean
}

/**
 * Asks the browser what kinds of network paths it can find, for about five seconds. A relay path means
 * friends on strict networks (mobile data, some offices and schools) can still connect.
 */
export async function diagnoseIce(ice: IceConfig, ms = 5000): Promise<IceReport> {
  const report: IceReport = { host: 0, srflx: 0, relay: 0, relayConfigured: ice.relay }
  const pc = new RTCPeerConnection({ iceServers: ice.iceServers })
  try {
    pc.createDataChannel('probe')
    const done = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) {
          clearTimeout(timer)
          resolve()
          return
        }
        const c = ev.candidate.candidate
        if (c.includes(' typ host')) report.host++
        else if (c.includes(' typ srflx')) report.srflx++
        else if (c.includes(' typ relay')) report.relay++
      }
    })
    await pc.setLocalDescription(await pc.createOffer())
    await done
  } finally {
    pc.close()
  }
  return report
}
