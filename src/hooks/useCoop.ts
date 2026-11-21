import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { getGame } from '@/game/save'
import { CoopClient, type CoopState } from '@/net/coopClient'

/** Co-op session for the whole app: it keeps running while you look at the shop tabs. */
export function useCoop() {
  const [client] = useState(() => new CoopClient())
  const state: CoopState = useSyncExternalStore(client.subscribe, client.getState)
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  // After a page reload, take the old place back without asking for another signature.
  useEffect(() => {
    void client.resumeIfPossible()
  }, [client])

  /** Sign in with the wallet. Equipped skins and bought boosts are checked again by the server. */
  const signIn = useCallback(async () => {
    if (!address) return
    const solo = getGame()
    await client.signIn(address, (message) => signMessageAsync({ message }), solo.skin, solo.charges, solo.local.unlocked)
  }, [address, client, signMessageAsync])

  /** Host a story or Survival room on this device. Friends join with the code that comes back. */
  const host = useCallback(async () => {
    if (!address) return
    const solo = getGame()
    await client.hostRoom(address, (message) => signMessageAsync({ message }), solo.skin, solo.charges, solo.local.unlocked)
  }, [address, client, signMessageAsync])

  /** Join a room that a friend hosts on their device. */
  const joinHosted = useCallback(
    async (code: string) => {
      if (!address) return
      const solo = getGame()
      await client.joinRoom(code, address, (message) => signMessageAsync({ message }), solo.skin, solo.charges, solo.local.unlocked)
    },
    [address, client, signMessageAsync],
  )

  return { client, state, address, signIn, host, joinHosted }
}

export type CoopHandle = ReturnType<typeof useCoop>
