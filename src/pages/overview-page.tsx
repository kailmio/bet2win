import { useMemo, useState } from "react"
import { ArrowRight, CircleDollarSign, Goal, Landmark, ShieldAlert, Target } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { AddBetSheet } from "@/components/add-bet-sheet"
import { PageHeading } from "@/components/page-heading"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { buildBankrollSeries, calculateMetrics, evaluateCandidate, getProfitCents, getSportAllocation } from "@/domain/calculations"
import { formatCurrency, formatDate, formatPercent } from "@/domain/format"
import { useAppStore } from "@/state/app-store"
import { Link } from "react-router-dom"

const chartConfig = { bankroll: { label: "Bankroll", color: "var(--color-positive)" } }

export function OverviewPage() {
  const { state } = useAppStore()
  const [range, setRange] = useState("90")
  const metrics = calculateMetrics(state.bets, state.transactions)
  const fullSeries = buildBankrollSeries(state.bets, state.transactions)
  const series = useMemo(() => { const end = Math.max(...fullSeries.map((point) => Date.parse(point.date))); return range === "all" ? fullSeries : fullSeries.filter((point) => Date.parse(point.date) >= end - Number(range) * 86_400_000) }, [fullSeries, range])
  const displayedSeries = series.length > 1 ? series : fullSeries
  const recent = [...state.bets].sort((a, b) => b.placedAt.localeCompare(a.placedAt)).slice(0, 5)
  const allocation = getSportAllocation(state.bets.filter((bet) => bet.status === "pending"))
  const pending = state.bets.find((bet) => bet.status === "pending")
  const warning = pending ? evaluateCandidate(pending, state.bets.filter((bet) => bet.id !== pending.id), state.transactions, state.settings)[0] : undefined

  return (
    <>
      <PageHeading title="Overview" description="Your bankroll, performance, and current risk at a glance." actions={<><Select value={range} onValueChange={setRange}><SelectTrigger className="h-10 w-[132px] bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="365">This year</SelectItem><SelectItem value="all">All time</SelectItem></SelectGroup></SelectContent></Select><AddBetSheet /></>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Landmark} label="Bankroll" value={formatCurrency(metrics.currentBankrollCents)} meta={`${formatCurrency(metrics.availableBankrollCents)} available`} />
        <MetricCard icon={CircleDollarSign} label="Net P&L" value={formatCurrency(metrics.netProfitCents, true)} meta="Across settled bets" positive={metrics.netProfitCents >= 0} />
        <MetricCard icon={Target} label="ROI" value={formatPercent(metrics.roi)} meta={`${formatCurrency(metrics.totalStakeCents)} total staked`} positive={metrics.roi >= 0} />
        <MetricCard icon={Goal} label="Win rate" value={formatPercent(metrics.winRate)} meta="Settled wins and losses" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(315px,.7fr)]">
        <Card className="min-h-[390px]">
          <CardHeader className="border-b pb-4"><CardTitle>Bankroll performance</CardTitle><CardDescription>Balance after each settled bet</CardDescription></CardHeader>
          <CardContent className="pt-5">
            <div className="mb-5 flex gap-1 rounded-lg bg-muted p-1 sm:w-fit">{[["7", "7D"], ["30", "30D"], ["90", "90D"], ["365", "YTD"], ["all", "All"]].map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${range === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}</div>
            <ChartContainer config={chartConfig} className="h-[255px] w-full aspect-auto">
              <AreaChart data={displayedSeries} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs><linearGradient id="bankrollFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-positive)" stopOpacity={0.22} /><stop offset="100%" stopColor="var(--color-positive)" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tickFormatter={(value) => new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(value))} minTickGap={40} />
                <YAxis axisLine={false} tickLine={false} domain={["dataMin - 100", "dataMax + 100"]} tickFormatter={(value) => `$${Math.round(value / 100) * 100}`} width={58} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-semibold">{formatCurrency(Number(value) * 100)}</span>} />} />
                <Area type="monotone" dataKey="bankroll" stroke="var(--color-positive)" strokeWidth={2.5} fill="url(#bankrollFill)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="min-h-[390px]">
          <CardHeader><div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-800"><ShieldAlert className="size-5" /></div><CardTitle>Decision check</CardTitle><CardDescription>Your highest active risk signal</CardDescription></CardHeader>
          <CardContent className="flex flex-1 flex-col">
            {warning ? <><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-baseline justify-between gap-3"><p className="font-semibold text-amber-950">{warning.title}</p><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{warning.ratio.toFixed(1)}× limit</span></div><p className="mt-2 text-sm leading-6 text-amber-950/75">{warning.detail}</p></div><p className="mt-5 text-sm leading-6 text-muted-foreground">Consider reducing the stake or balancing exposure across sports. Guardrails are reminders, not predictions.</p></> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-900">Within plan</p><p className="mt-2 text-sm text-emerald-800">No active guardrail warnings.</p></div>}
            <Button variant="outline" asChild className="mt-auto justify-between"><Link to="/settings">Review guardrails <ArrowRight className="size-4" /></Link></Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(315px,.7fr)]">
        <Card>
          <CardHeader className="border-b pb-4"><div className="flex items-center justify-between"><div><CardTitle>Recent bets</CardTitle><CardDescription>Latest journal entries</CardDescription></div><Button asChild variant="ghost" size="sm"><Link to="/bets">View all <ArrowRight /></Link></Button></div></CardHeader>
          <CardContent className="px-0 pb-0"><Table><TableHeader><TableRow><TableHead className="pl-5">Event</TableHead><TableHead>Selection</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Stake</TableHead><TableHead className="pr-5 text-right">P&L</TableHead></TableRow></TableHeader><TableBody>{recent.map((bet) => <TableRow key={bet.id}><TableCell className="pl-5"><div className="font-medium">{bet.event}</div><div className="mt-0.5 text-xs text-muted-foreground">{formatDate(bet.placedAt)}</div></TableCell><TableCell><div>{bet.selection}</div><div className="text-xs text-muted-foreground">{bet.decimalOdds.toFixed(2)}</div></TableCell><TableCell><StatusBadge status={bet.status} /></TableCell><TableCell className="text-right tabular-nums">{formatCurrency(bet.stakeCents)}</TableCell><TableCell className={`pr-5 text-right font-semibold tabular-nums ${getProfitCents(bet) > 0 ? "text-emerald-700" : getProfitCents(bet) < 0 ? "text-red-700" : ""}`}>{bet.status === "pending" ? "—" : formatCurrency(getProfitCents(bet), true)}</TableCell></TableRow>)}</TableBody></Table></CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Pending allocation</CardTitle><CardDescription>Exposure by sport</CardDescription></CardHeader><CardContent className="space-y-5">{allocation.length ? allocation.map((item, index) => <div key={item.sport}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{item.sport}</span><span className="tabular-nums text-muted-foreground">{formatPercent(item.percent, 0)} · {formatCurrency(item.cents)}</span></div><Progress value={item.percent} className={index === 0 ? "[&_[data-slot=progress-indicator]]:bg-emerald-700" : "[&_[data-slot=progress-indicator]]:bg-primary/65"} /></div>) : <p className="text-sm text-muted-foreground">No pending exposure.</p>}<div className="border-t pt-4 text-xs leading-5 text-muted-foreground">Based on unsettled stakes. Review concentration before adding another bet.</div></CardContent></Card>
      </div>
    </>
  )
}

function MetricCard({ icon: Icon, label, value, meta, positive }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; meta: string; positive?: boolean }) {
  return <Card><CardContent className="flex items-start justify-between py-1"><div><p className="text-sm font-medium text-muted-foreground">{label}</p><p className={`mt-3 text-[28px] font-bold tracking-[-0.04em] tabular-nums ${positive ? "text-emerald-700" : "text-foreground"}`}>{value}</p><p className="mt-2 text-xs text-muted-foreground">{meta}</p></div><div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-primary"><Icon className="size-5" /></div></CardContent></Card>
}
