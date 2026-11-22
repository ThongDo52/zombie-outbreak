import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { spawn, type ChildProcess } from 'node:child_process'

const COOP_PORT = Number(process.env.COOP_PORT ?? 5174)
const COOP_PROXY = {
  '/coop': { target: `ws://localhost:${COOP_PORT}`, ws: true },
  '/relay': { target: `ws://localhost:${COOP_PORT}`, ws: true },
}

/** Starts the co-op game server next to the dev server and stops it when the dev server stops. */
function coopServer(): Plugin {
  let child: ChildProcess | null = null
  return {
    name: 'coop-server',
    apply: 'serve',
    configureServer(server) {
      child = spawn('bun', ['server/coop.ts'], { cwd: server.config.root, stdio: 'inherit', env: { ...process.env, COOP_PORT: String(COOP_PORT) } })
      child.on('error', () => console.warn('[coop] could not start the co-op server (is bun installed?)'))
      const stop = () => child?.kill()
      server.httpServer?.once('close', stop)
      process.once('exit', stop)
    },
  }
}

export default defineConfig({
  plugins: [react(), nodePolyfills(), coopServer()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  // a friend-hosted co-op room runs its match in a module worker
  worker: { format: 'es' },
  optimizeDeps: {
    include: [
      'peerjs',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    // the co-op WebSocket and the online relay go through the dev server, so the preview link (or a tunnel
    // to this machine) carries them and friends on any network can join with nothing else to set up
    proxy: COOP_PROXY,
  },
  // `vite preview` serves the built page the same way when the co-op server runs next to it (bun run coop)
  preview: {
    allowedHosts: true,
    proxy: COOP_PROXY,
  },
})
