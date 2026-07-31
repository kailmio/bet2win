import { cn } from "@/lib/utils"

export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 grid-cols-3 items-end gap-0.5 rounded-lg bg-primary p-2 shadow-sm" aria-hidden="true">
        <span className="h-2 rounded-sm bg-white/70" />
        <span className="h-3.5 rounded-sm bg-white" />
        <span className="h-5 rounded-sm bg-emerald-400" />
      </div>
      <div className={cn(compact && "sr-only")}><div className="text-[17px] font-bold tracking-tight">Bet2Win</div><div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Decision journal</div></div>
    </div>
  )
}
