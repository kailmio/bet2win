import { cloneElement, useId, useMemo, useState, type FormEvent, type ReactElement } from "react"
import { AlertTriangle, Plus, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { evaluateCandidate, getAvailableBankrollCents, getCurrentBankrollCents } from "@/domain/calculations"
import { centsFromAud, formatCurrency } from "@/domain/format"
import type { BetDraft, BetStatus } from "@/domain/types"
import { useAppStore } from "@/state/app-store"

const sports = ["Soccer", "Basketball", "Tennis", "Baseball", "Hockey", "Rugby", "AFL", "Other"]
const initial = () => ({ sport: "Soccer", event: "", market: "", selection: "", odds: "", stake: "", bookmaker: "Sportsbook", date: new Date().toISOString().slice(0, 10), notes: "", settled: false, status: "won" as BetStatus, returnAud: "", settledDate: new Date().toISOString().slice(0, 10) })

export function AddBetSheet({ trigger }: { trigger?: React.ReactNode }) {
  const { state, dispatch } = useAppStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initial)
  function changeOpen(next: boolean) { setOpen(next); if (!next) setForm(initial()) }
  const draftPreview = useMemo(() => ({ placedAt: new Date(`${form.date}T12:00:00`).toISOString(), sport: form.sport, stakeCents: centsFromAud(form.stake) }), [form.date, form.sport, form.stake])
  const warnings = useMemo(() => evaluateCandidate(draftPreview, state.bets, state.transactions, state.settings), [draftPreview, state])
  const available = getAvailableBankrollCents(state.bets, state.transactions)
  const stakeCents = centsFromAud(form.stake)
  const blocked = stakeCents > available
  const highest = warnings[0]

  function submit(event: FormEvent) {
    event.preventDefault()
    const odds = Number(form.odds)
    if (!form.event.trim() || !form.market.trim() || !form.selection.trim() || odds <= 1 || stakeCents <= 0) return toast.error("Complete the required bet details")
    if (blocked) return toast.error("Stake exceeds your available bankroll")
    const status: BetStatus = form.settled ? form.status : "pending"
    let returnCents: number | undefined
    if (status === "won") returnCents = form.returnAud ? centsFromAud(form.returnAud) : Math.round(stakeCents * odds)
    if (status === "lost") returnCents = 0
    if (status === "void") returnCents = stakeCents
    if (status === "cashed_out") {
      if (!form.returnAud) return toast.error("Enter the actual cash-out return")
      returnCents = centsFromAud(form.returnAud)
    }
    const draft: BetDraft = { placedAt: new Date(`${form.date}T12:00:00`).toISOString(), sport: form.sport, event: form.event.trim(), market: form.market.trim(), selection: form.selection.trim(), decimalOdds: odds, stakeCents, bookmaker: form.bookmaker.trim() || "Sportsbook", status, returnCents, settledAt: status === "pending" ? undefined : new Date(`${form.settledDate}T12:00:00`).toISOString(), notes: form.notes.trim() || undefined }
    dispatch({ type: "add_bet", draft })
    toast.success("Bet saved to your journal")
    changeOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger asChild>{trigger ?? <Button className="h-10 gap-2 px-4"><Plus className="size-4" />Add bet</Button>}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto p-0" style={{ maxWidth: 650 }} aria-describedby="add-bet-description">
        <form onSubmit={submit} className="flex min-h-full flex-col">
          <SheetHeader className="border-b px-7 py-6">
            <SheetTitle className="text-2xl font-bold tracking-tight">Add a bet</SheetTitle>
            <SheetDescription id="add-bet-description">Record the decision before the result. Warnings guide you without taking control away.</SheetDescription>
          </SheetHeader>
          <div className="grid flex-1 gap-5 px-7 py-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Sport"><Select value={form.sport} onValueChange={(sport) => setForm({ ...form, sport })}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{sports.map((sport) => <SelectItem key={sport} value={sport}>{sport}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field label="Bookmaker"><Input value={form.bookmaker} onChange={(e) => setForm({ ...form, bookmaker: e.target.value })} /></Field>
            </div>
            <Field label="Event"><Input placeholder="e.g. Arsenal vs Chelsea" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} required /></Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Market"><Input placeholder="e.g. Match result" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} required /></Field>
              <Field label="Selection"><Input placeholder="e.g. Arsenal" value={form.selection} onChange={(e) => setForm({ ...form, selection: e.target.value })} required /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Decimal odds"><Input type="number" min="1.01" step="0.01" placeholder="1.85" value={form.odds} onChange={(e) => setForm({ ...form, odds: e.target.value })} required /></Field>
              <Field label="Stake (AUD)"><Input type="number" min="0.01" step="0.01" placeholder="25.00" value={form.stake} onChange={(e) => setForm({ ...form, stake: e.target.value })} required /></Field>
              <Field label="Bet date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            </div>
            <Field label="Notes (optional)"><Textarea rows={3} placeholder="Why does this bet fit your plan?" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex items-center justify-between rounded-xl border bg-muted/35 p-4"><div><Label htmlFor="settled" className="font-semibold">Already settled</Label><p className="mt-1 text-xs text-muted-foreground">Record a historical result manually.</p></div><Switch id="settled" checked={form.settled} onCheckedChange={(settled) => setForm({ ...form, settled })} /></div>
            {form.settled && <div className="grid gap-5 rounded-xl border bg-card p-4 sm:grid-cols-3"><Field label="Outcome"><Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as BetStatus })}><SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["won", "lost", "void", "cashed_out"].map((status) => <SelectItem key={status} value={status}>{status.replace("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field label="Actual return"><Input type="number" step="0.01" placeholder="Auto for wins" value={form.returnAud} onChange={(e) => setForm({ ...form, returnAud: e.target.value })} /></Field><Field label="Settled date"><Input type="date" value={form.settledDate} onChange={(e) => setForm({ ...form, settledDate: e.target.value })} /></Field></div>}
            <section className="rounded-xl border bg-slate-50/80 p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h3 className="font-semibold">Before you place it</h3></div><div className="grid grid-cols-3 gap-3 text-sm"><Stat label="Bankroll" value={formatCurrency(getCurrentBankrollCents(state.bets, state.transactions))} /><Stat label="Available" value={formatCurrency(available)} /><Stat label="Stake" value={stakeCents ? `${((stakeCents / Math.max(1, getCurrentBankrollCents(state.bets, state.transactions))) * 100).toFixed(1)}%` : "—"} /></div>{blocked && <Alert variant="destructive" className="mt-4"><AlertTriangle /><AlertTitle>Stake is blocked</AlertTitle><AlertDescription>It exceeds the available bankroll of {formatCurrency(available)}.</AlertDescription></Alert>}{!blocked && highest && <Alert className="mt-4 border-amber-200 bg-amber-50 text-amber-950"><AlertTriangle /><AlertTitle>{highest.title}</AlertTitle><AlertDescription>{highest.detail} You can still save this bet.</AlertDescription></Alert>}{!blocked && !highest && <p className="mt-4 text-sm font-medium text-emerald-800">This bet is within your current guardrails.</p>}</section>
          </div>
          <SheetFooter className="sticky bottom-0 flex-row justify-end border-t bg-card px-7 py-4"><Button type="button" variant="outline" onClick={() => changeOpen(false)}>Cancel</Button><Button type="submit" disabled={blocked} className="bg-emerald-700 hover:bg-emerald-800">Save bet</Button></SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) { const id = useId(); return <div className="grid gap-2"><Label htmlFor={id} className="text-[13px] font-semibold">{label}</Label>{cloneElement(children, { id })}</div> }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div> }
