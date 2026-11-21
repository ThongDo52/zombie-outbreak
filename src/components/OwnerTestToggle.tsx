import { FlaskConical } from 'lucide-react'
import type { SkinShopState } from '@/hooks/useSkinShop'

/**
 * Shown only to the wallet that owns the box contract. Unlocks every skin for equipping on this
 * device so the visuals can be tested. Nothing is minted or sent onchain.
 */
export function OwnerTestToggle({ shop }: { shop: SkinShopState }) {
  if (!shop.isOwner) return null
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm">
      <input
        type="checkbox"
        checked={shop.testUnlock}
        onChange={(e) => shop.setTestUnlock(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-amber-400"
      />
      <span className="text-pretty">
        <span className="flex items-center gap-1.5 font-semibold text-amber-200">
          <FlaskConical size={15} aria-hidden /> Owner test mode
        </span>
        <span className="text-slate-300">
          Unlock and equip every skin, and start every solo run with every gun (heavy ones included, with plenty of ammo), on this device only. Nothing is minted onchain, and buying is hidden while this is on.
        </span>
      </span>
    </label>
  )
}
