/** The night behind the app: dark gradient, red and blue glow, slow fog and film grain. Pure CSS, so it costs the game nothing. */
/** `scene`: let the blurred battle show through instead of a solid dark base. */
export function Atmosphere({ scene = false }: { scene?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className={`absolute inset-0 ${scene ? 'bg-[radial-gradient(ellipse_at_50%_-10%,rgba(27,10,16,0.55)_0%,rgba(8,12,15,0.62)_45%,rgba(5,8,10,0.78)_100%)]' : 'bg-[radial-gradient(ellipse_at_50%_-10%,#1B0A10_0%,#080C0F_45%,#05080A_100%)]'}`} />
      <div className="absolute -left-[10%] top-[8%] size-[46rem] rounded-full bg-[#FF2D44]/10 blur-[120px]" />
      <div className="absolute -right-[12%] bottom-[0%] size-[44rem] rounded-full bg-[#2D6BFF]/10 blur-[130px]" />
      <div className="shell-anim absolute -inset-x-[10%] bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_center,rgba(140,165,155,0.09),transparent_65%)] [animation:shell-fog_40s_ease-in-out_infinite]" />
      <div className="title-grain absolute -inset-[10%] opacity-[0.05]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  )
}
