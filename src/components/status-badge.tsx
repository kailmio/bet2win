import { Badge } from "@/components/ui/badge"
import type { BetStatus } from "@/domain/types"
import { cn } from "@/lib/utils"

export function StatusBadge({ status }: { status: BetStatus }) {
  const labels: Record<BetStatus, string> = { pending: "Pending", won: "Won", lost: "Lost", void: "Void", cashed_out: "Cashed out" }
  return <Badge variant="outline" className={cn("rounded-full px-2.5 font-semibold", status === "won" && "border-emerald-200 bg-emerald-50 text-emerald-800", status === "lost" && "border-red-200 bg-red-50 text-red-700", status === "pending" && "border-amber-200 bg-amber-50 text-amber-800", (status === "void" || status === "cashed_out") && "bg-slate-50 text-slate-600")}>{labels[status]}</Badge>
}
