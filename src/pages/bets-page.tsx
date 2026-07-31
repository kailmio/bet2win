import { useMemo, useState } from "react"
import { Download, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { AddBetSheet } from "@/components/add-bet-sheet"
import { PageHeading } from "@/components/page-heading"
import { StatusBadge } from "@/components/status-badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { getProfitCents } from "@/domain/calculations"
import { exportBetsCsv } from "@/domain/csv"
import { centsFromAud, formatCurrency, formatDate } from "@/domain/format"
import type { Bet, BetDraft, BetStatus } from "@/domain/types"
import { useAppStore } from "@/state/app-store"

export function BetsPage() {
  const { state, dispatch } = useAppStore()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [sport, setSport] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [deleteId, setDeleteId] = useState<string>()
  const [edit, setEdit] = useState<Bet>()
  const sports = [...new Set(state.bets.map((bet) => bet.sport))].sort()
  const filtered = useMemo(() => state.bets.filter((bet) => {
    const haystack = `${bet.event} ${bet.selection} ${bet.market} ${bet.bookmaker}`.toLowerCase()
    const placedDay = bet.placedAt.slice(0, 10)
    return haystack.includes(query.toLowerCase()) && (status === "all" || bet.status === status) && (sport === "all" || bet.sport === sport) && (!startDate || placedDay >= startDate) && (!endDate || placedDay <= endDate)
  }).sort((a, b) => b.placedAt.localeCompare(a.placedAt)), [state.bets, query, status, sport, startDate, endDate])

  function download() {
    const blob = new Blob([exportBetsCsv(filtered)], { type: "text/csv;charset=utf-8" })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement("a"); anchor.href = href; anchor.download = "bet2win-bets.csv"; anchor.click(); URL.revokeObjectURL(href)
    toast.success(`Exported ${filtered.length} bets`)
  }

  return <>
    <PageHeading title="Bets" description="Search, settle, edit, and export every bet in your decision journal." actions={<><Button variant="outline" onClick={download}><Download />Export CSV</Button><AddBetSheet /></>} />
    <Card><CardContent>
      <div className="mb-5 grid gap-3 xl:grid-cols-[1fr_160px_160px_150px_150px]"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search event, selection, market…" aria-label="Search bets" value={query} onChange={(event) => setQuery(event.target.value)} /></div><FilterSelect value={status} onChange={setStatus} items={["all", "pending", "won", "lost", "void", "cashed_out"]} /><FilterSelect value={sport} onChange={setSport} items={["all", ...sports]} /><Input aria-label="Placed from" title="Placed from" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /><Input aria-label="Placed to" title="Placed to" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div>
      <Table><TableHeader><TableRow><TableHead>Placed</TableHead><TableHead>Event & selection</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Odds</TableHead><TableHead className="text-right">Stake</TableHead><TableHead className="text-right">P&L</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{filtered.map((bet) => <TableRow key={bet.id}><TableCell><div>{formatDate(bet.placedAt)}</div><div className="text-xs text-muted-foreground">{bet.sport}</div></TableCell><TableCell><div className="font-semibold">{bet.event}</div><div className="mt-1 text-xs text-muted-foreground">{bet.selection} · {bet.market}</div></TableCell><TableCell><StatusBadge status={bet.status} /></TableCell><TableCell className="text-right tabular-nums">{bet.decimalOdds.toFixed(2)}</TableCell><TableCell className="text-right tabular-nums">{formatCurrency(bet.stakeCents)}</TableCell><TableCell className={`text-right font-semibold tabular-nums ${getProfitCents(bet) > 0 ? "text-emerald-700" : getProfitCents(bet) < 0 ? "text-red-700" : ""}`}>{bet.status === "pending" ? "—" : formatCurrency(getProfitCents(bet), true)}</TableCell><TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${bet.event}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEdit(bet)}><Pencil />Edit / settle</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={() => setDeleteId(bet.id)}><Trash2 />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>
      {!filtered.length && <div className="py-16 text-center text-sm text-muted-foreground">No bets match these filters.</div>}
    </CardContent></Card>
    <EditBetSheet bet={edit} onOpenChange={(open) => !open && setEdit(undefined)} onSave={(changes) => { if (edit) dispatch({ type: "update_bet", id: edit.id, changes }); setEdit(undefined); toast.success("Bet updated") }} />
    <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(undefined)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this bet?</AlertDialogTitle><AlertDialogDescription>This removes the journal record and recalculates your bankroll. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep bet</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (deleteId) dispatch({ type: "delete_bet", id: deleteId }); setDeleteId(undefined); toast.success("Bet deleted") }}>Delete bet</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}

function FilterSelect({ value, onChange, items }: { value: string; onChange: (value: string) => void; items: string[] }) { return <Select value={value} onValueChange={onChange}><SelectTrigger className="h-9 w-full bg-card capitalize"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{items.map((item) => <SelectItem className="capitalize" key={item} value={item}>{item.replace("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select> }

function EditBetSheet({ bet, onOpenChange, onSave }: { bet?: Bet; onOpenChange: (open: boolean) => void; onSave: (changes: Partial<BetDraft>) => void }) {
  const [form, setForm] = useState<Bet | undefined>(bet)
  if (bet && form?.id !== bet.id) setForm(bet)
  if (!form) return <Sheet open={false} />
  function save() {
    let returnCents = form!.returnCents
    if (form!.status === "won" && returnCents === undefined) returnCents = Math.round(form!.stakeCents * form!.decimalOdds)
    if (form!.status === "lost") returnCents = 0
    if (form!.status === "void") returnCents = form!.stakeCents
    if (form!.status === "cashed_out" && returnCents === undefined) return toast.error("Cash-outs require the actual return")
    onSave({ ...form!, returnCents, settledAt: form!.status === "pending" ? undefined : (form!.settledAt ?? new Date().toISOString()) })
  }
  return <Sheet open={!!bet} onOpenChange={onOpenChange}><SheetContent className="overflow-y-auto sm:max-w-[560px]"><SheetHeader><SheetTitle>Edit bet</SheetTitle><SheetDescription>Correct details or record the final settlement.</SheetDescription></SheetHeader><div className="grid gap-5 px-4"><EditField label="Event"><Input value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} /></EditField><div className="grid grid-cols-2 gap-4"><EditField label="Market"><Input value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} /></EditField><EditField label="Selection"><Input value={form.selection} onChange={(e) => setForm({ ...form, selection: e.target.value })} /></EditField></div><div className="grid grid-cols-3 gap-4"><EditField label="Odds"><Input type="number" step=".01" value={form.decimalOdds} onChange={(e) => setForm({ ...form, decimalOdds: Number(e.target.value) })} /></EditField><EditField label="Stake (AUD)"><Input type="number" step=".01" value={form.stakeCents / 100} onChange={(e) => setForm({ ...form, stakeCents: centsFromAud(e.target.value) })} /></EditField><EditField label="Status"><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as BetStatus })}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["pending", "won", "lost", "void", "cashed_out"].map((value) => <SelectItem value={value} key={value}>{value.replace("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select></EditField></div>{form.status === "cashed_out" && <EditField label="Actual return (AUD)"><Input type="number" step=".01" value={form.returnCents === undefined ? "" : form.returnCents / 100} onChange={(e) => setForm({ ...form, returnCents: e.target.value ? centsFromAud(e.target.value) : undefined })} /></EditField>}<EditField label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></EditField></div><SheetFooter className="flex-row justify-end"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save changes</Button></SheetFooter></SheetContent></Sheet>
}
function EditField({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid gap-2"><Label>{label}</Label>{children}</div> }
