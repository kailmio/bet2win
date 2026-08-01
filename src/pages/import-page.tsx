import { useEffect, useRef, useState } from "react"
import { AlertCircle, Check, CheckCheck, Download, FileSpreadsheet, FileText, FileUp, Image as ImageIcon, LockKeyhole, RefreshCw, ShieldCheck, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"
import { PageHeading } from "@/components/page-heading"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { CANONICAL_HEADERS, parseBetCsv } from "@/domain/csv"
import { duplicateFingerprint } from "@/domain/calculations"
import { centsFromAud } from "@/domain/format"
import { extractionResponseSchema, type ExtractionResponse } from "@/domain/schema"
import type { BetDraft, BetStatus, ImportCandidate, ImportSummary } from "@/domain/types"
import { useAppStore } from "@/state/app-store"

const acceptedTypes = ["image/png", "image/jpeg", "image/webp"]
const maxPdfBytes = 20 * 1024 * 1024

export function ImportPage() {
  const { state, dispatch } = useAppStore()
  const [tab, setTab] = useState("screenshots")
  const [files, setFiles] = useState<File[]>([])
  const [pdfFile, setPdfFile] = useState<File>()
  const [previews, setPreviews] = useState<string[]>([])
  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [consentOpen, setConsentOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<ImportSummary>()
  const inputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const previewsRef = useRef<string[]>([])
  useEffect(() => () => previewsRef.current.forEach(URL.revokeObjectURL), [])

  function acceptFiles(next: FileList | File[]) {
    const valid = [...next].filter((file) => acceptedTypes.includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, 8)
    if (valid.length !== [...next].length) toast.warning("Some files were skipped. Use up to 8 PNG, JPEG, or WebP images under 10 MB each.")
    previewsRef.current.forEach(URL.revokeObjectURL)
    const urls = valid.map((file) => URL.createObjectURL(file)); previewsRef.current = urls
    setFiles(valid); setPreviews(urls); setCandidates([]); setSummary(undefined); setErrors([])
  }
  function acceptPdf(file?: File) {
    if (!file) return
    if (file.type !== "application/pdf" || file.size > maxPdfBytes) {
      toast.warning("Choose one PDF statement under 20 MB.")
      return
    }
    setPdfFile(file); setCandidates([]); setSummary(undefined); setErrors([]); setWarnings([])
  }
  function parseCsv(file?: File) {
    if (!file) return
    file.text().then((text) => { const result = parseBetCsv(text, state.bets); setCandidates(result.candidates); setErrors(result.errors); setWarnings([]); setSummary(undefined) })
  }
  async function extract() {
    setConsentOpen(false); setLoading(true); setErrors([]); setSummary(undefined)
    try {
      const isPdf = tab === "pdf"
      const body = new FormData()
      if (isPdf && pdfFile) body.append("document", pdfFile)
      else files.forEach((file) => body.append("images", file))
      const response = await fetch("/api/import/bet365/extract", { method: "POST", body, headers: { "X-Bet2Win-Request": isPdf ? "pdf-import" : "screenshot-import" } })
      const json: unknown = await response.json()
      if (!response.ok) throw new Error(typeof json === "object" && json && "error" in json ? String(json.error) : "Extraction failed")
      const result = extractionResponseSchema.parse(json)
      setWarnings(result.warnings)
      setCandidates(toCandidates(result, state.bets, isPdf ? "bet365_pdf" : "bet365_screenshot")); toast.success(`Found ${result.bets.length} candidate${result.bets.length === 1 ? "" : "s"}`)
    } catch (error) { setErrors([error instanceof Error ? error.message : "The extraction service did not respond. Your batch is intact—retry or enter the bets manually."]) }
    finally { setLoading(false) }
  }
  function updateCandidate(tempId: string, update: (candidate: ImportCandidate) => ImportCandidate) { setCandidates((items) => items.map((item) => item.tempId === tempId ? update(item) : item)) }
  function toggleSelectAll() {
    setCandidates((items) => {
      const importable = items.filter(isCandidateImportable)
      const allImportableSelected = importable.length > 0 && importable.every((candidate) => candidate.selected)
      return items.map((candidate) => ({ ...candidate, selected: allImportableSelected ? false : isCandidateImportable(candidate) }))
    })
  }
  function confirmImport() {
    let imported = 0, skipped = 0, invalid = 0, duplicates = 0
    const drafts: BetDraft[] = []
    candidates.forEach((candidate) => {
      if (!candidate.selected || candidate.duplicateDecision === "skip") { skipped++; if (candidate.duplicateBetIds.length) duplicates++; return }
      const issues = candidateIssues(candidate)
      if (issues.length || candidate.unsupportedReason) { invalid++; return }
      if (candidate.duplicateBetIds.length && candidate.duplicateDecision === "review") { invalid++; duplicates++; return }
      drafts.push(candidate.draft as BetDraft); imported++
    })
    if (drafts.length) dispatch({ type: "import_bets", drafts })
    const next = { imported, skipped, invalid, duplicates }; setSummary(next); toast.success(`Imported ${imported} bet${imported === 1 ? "" : "s"}`)
  }
  const selectedCount = candidates.filter((item) => item.selected).length
  const importableCandidates = candidates.filter(isCandidateImportable)
  const allImportableSelected = importableCandidates.length > 0 && importableCandidates.every((candidate) => candidate.selected)

  return <>
    <PageHeading title="Import bet history" description="Bring past bets into your journal from a CSV, bet365 PDF statement, or screenshot. Every record stays in review until you approve it." />
    <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border bg-card p-4 sm:gap-6">{[[1, "Upload", "Choose your source"], [2, "Review", "Correct every field"], [3, "Import", "Confirm selected bets"]].map(([number, title, copy], index) => <div key={String(number)} className="flex min-w-0 items-center gap-3"><div className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${candidates.length ? index === 0 ? "bg-emerald-700 text-white" : index === 1 ? "bg-primary text-white" : "bg-muted text-muted-foreground" : index === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>{candidates.length && index === 0 ? <Check className="size-4" /> : number}</div><div className="min-w-0"><p className="text-sm font-semibold">{title}</p><p className="hidden truncate text-xs text-muted-foreground sm:block">{copy}</p></div></div>)}</div>
    <Tabs className="flex flex-col gap-2" value={tab} onValueChange={(value) => { setTab(value); setCandidates([]); setErrors([]); setSummary(undefined) }}>
      <TabsList className="mb-5 w-full justify-start bg-transparent p-0"><TabsTrigger value="csv" className="h-11 min-w-0 flex-1 gap-1 rounded-none border-b-2 border-transparent bg-transparent px-2 text-xs shadow-none data-active:border-primary data-active:bg-transparent sm:flex-none sm:gap-1.5 sm:px-8 sm:text-sm"><FileSpreadsheet />CSV file</TabsTrigger><TabsTrigger value="pdf" className="h-11 min-w-0 flex-1 gap-1 rounded-none border-b-2 border-transparent bg-transparent px-2 text-xs shadow-none data-active:border-primary data-active:bg-transparent sm:flex-none sm:gap-1.5 sm:px-8 sm:text-sm"><FileText />PDF statement</TabsTrigger><TabsTrigger value="screenshots" className="h-11 min-w-0 flex-1 gap-1 rounded-none border-b-2 border-transparent bg-transparent px-2 text-xs shadow-none data-active:border-primary data-active:bg-transparent sm:flex-none sm:gap-1.5 sm:px-8 sm:text-sm"><ImageIcon />Screenshots</TabsTrigger></TabsList>
      <TabsContent value="csv"><CsvPanel onFile={parseCsv} /></TabsContent>
      <TabsContent value="pdf"><PdfPanel file={pdfFile} onFile={acceptPdf} inputRef={pdfInputRef} loading={loading} onExtract={() => setConsentOpen(true)} /></TabsContent>
      <TabsContent value="screenshots"><ScreenshotPanel files={files} previews={previews} onFiles={acceptFiles} inputRef={inputRef} loading={loading} onExtract={() => setConsentOpen(true)} /></TabsContent>
    </Tabs>
    {!!errors.length && <Alert variant="destructive" className="mt-5"><AlertCircle /><AlertTitle>Import needs attention</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{errors.map((error) => <li key={error}>{error}</li>)}</ul></AlertDescription></Alert>}
    {!!warnings.length && <Alert className="mt-5 border-amber-200 bg-amber-50"><AlertCircle /><AlertTitle>Extraction notes</AlertTitle><AlertDescription>{warnings.join(" ")}</AlertDescription></Alert>}
    {!!candidates.length && <section className="mt-7"><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="text-xl font-bold">Review candidates</h2><p className="mt-1 text-sm text-muted-foreground">Edit unclear values. Incomplete or unsupported records cannot be imported.</p></div><div className="flex flex-wrap items-center gap-2"><Button type="button" variant={allImportableSelected ? "outline" : "default"} size="sm" onClick={toggleSelectAll} disabled={!importableCandidates.length}><CheckCheck />{allImportableSelected ? "Clear selection" : "Select all new records"}</Button><Badge variant="outline" className="w-fit">{selectedCount} selected of {candidates.length}</Badge></div></div><div className="space-y-4">{candidates.map((candidate, index) => <CandidateCard key={candidate.tempId} index={index} candidate={candidate} onChange={(next) => updateCandidate(candidate.tempId, () => next)} />)}</div><Card className="mt-5 shadow-lg"><CardContent className="flex flex-col items-start justify-between gap-4 py-1 sm:flex-row sm:items-center"><div><p className="font-semibold">Ready to add {selectedCount} candidate{selectedCount === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-muted-foreground">Duplicate decisions and required fields are checked again on import.</p></div><Button onClick={confirmImport} disabled={!selectedCount}>Import selected bets</Button></CardContent></Card></section>}
    {summary && <Alert className="mt-5 border-emerald-200 bg-emerald-50"><ShieldCheck /><AlertTitle>Import complete</AlertTitle><AlertDescription>Imported {summary.imported}, skipped {summary.skipped}, invalid {summary.invalid}, duplicate records {summary.duplicates}.</AlertDescription></Alert>}
    <AlertDialog open={consentOpen} onOpenChange={setConsentOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{tab === "pdf" ? `Send ${pdfFile?.name ?? "this PDF"} for extraction?` : `Send ${files.length} screenshot${files.length === 1 ? "" : "s"} for extraction?`}</AlertDialogTitle><AlertDialogDescription>The selected {tab === "pdf" ? "PDF statement" : "images"} will be sent to OpenAI only after you confirm. It is processed in memory, is not added to your local bankroll data, and every extracted field still requires your review.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep private</AlertDialogCancel><AlertDialogAction onClick={extract}>Confirm and extract</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}

function CsvPanel({ onFile }: { onFile: (file?: File) => void }) { function template() { const sample = `${CANONICAL_HEADERS.join(",")}\n2026-07-31T10:00:00Z,Soccer,Arsenal vs Chelsea,Match result,Arsenal,1.85,25.00,bet365,pending,,,,` ; const href = URL.createObjectURL(new Blob([sample], { type: "text/csv" })); const a = document.createElement("a"); a.href = href; a.download = "bet2win-import-template.csv"; a.click(); URL.revokeObjectURL(href) } return <Card><CardHeader><CardTitle>Upload a bet-history CSV</CardTitle><CardDescription>Use the Bet2Win template or a recognized bet365 export. Unknown headers fail safely.</CardDescription></CardHeader><CardContent><label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 text-center transition hover:border-primary/50 hover:bg-muted/40"><FileUp className="size-9 text-primary" /><span className="mt-4 font-semibold">Choose a CSV file</span><span className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Mixed-validity files are allowed. You will review every row before importing.</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} /></label><Button variant="outline" className="mt-4" onClick={template}><Download />Download canonical template</Button></CardContent></Card> }

function PdfPanel({ file, onFile, inputRef, loading, onExtract }: { file?: File; onFile: (file?: File) => void; inputRef: React.RefObject<HTMLInputElement | null>; loading: boolean; onExtract: () => void }) {
  return <Card><CardHeader><div className="flex items-center justify-between gap-4"><div><CardTitle>Upload a bet365 PDF statement</CardTitle><CardDescription>Monthly activity statements are scanned for supported single bets. Multis and bet-credit stakes stay flagged for manual handling.</CardDescription></div><Badge className="bg-emerald-50 text-emerald-800" variant="outline">bet365</Badge></div></CardHeader><CardContent><input ref={inputRef} className="sr-only" type="file" accept=".pdf,application/pdf" onChange={(e) => onFile(e.target.files?.[0])} />{!file ? <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }} onClick={() => inputRef.current?.click()} className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 text-center transition hover:border-primary/50 hover:bg-muted/40"><div className="grid size-12 place-items-center rounded-xl bg-slate-100 text-primary"><FileText className="size-6" /></div><p className="mt-4 font-semibold">Drop a PDF statement here, or click to browse</p><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">One PDF · up to 20 MB · every extracted bet remains in review</p></div> : <><button type="button" onClick={() => inputRef.current?.click()} className="flex w-full items-center gap-4 rounded-xl border bg-muted/20 p-4 text-left transition hover:border-primary/50 hover:bg-muted/35"><div className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-primary"><FileText className="size-6" /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatFileSize(file.size)} · PDF statement</p></div><span className="text-xs font-semibold text-primary">Replace</span></button><div className="mt-5 flex flex-col items-start justify-between gap-4 border-t pt-5 sm:flex-row sm:items-center"><div className="flex gap-3 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-emerald-700" /><p>Statements can contain account identifiers. Nothing is sent until you explicitly confirm, and the PDF is not stored with your journal.</p></div><Button disabled={loading} onClick={onExtract} className="shrink-0">{loading ? <><RefreshCw className="animate-spin" />Extracting…</> : <>Review with AI <FileText /></>}</Button></div></>}</CardContent></Card>
}

function ScreenshotPanel({ files, previews, onFiles, inputRef, loading, onExtract }: { files: File[]; previews: string[]; onFiles: (files: FileList | File[]) => void; inputRef: React.RefObject<HTMLInputElement | null>; loading: boolean; onExtract: () => void }) { return <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Upload bet365 screenshots</CardTitle><CardDescription>Individual receipts and multi-row history lists are supported.</CardDescription></div><Badge className="bg-emerald-50 text-emerald-800" variant="outline">bet365</Badge></div></CardHeader><CardContent><input ref={inputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => e.target.files && onFiles(e.target.files)} />{files.length === 0 && <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files) }} onClick={() => inputRef.current?.click()} className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 text-center transition hover:border-primary/50 hover:bg-muted/40"><div className="grid size-12 place-items-center rounded-xl bg-slate-100 text-primary"><UploadCloud className="size-6" /></div><p className="mt-4 font-semibold">Drop screenshots here, or click to browse</p><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">PNG, JPEG, or WebP · up to 8 images · 10 MB each</p></div>}{files.length > 0 && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{files.map((file, index) => <button type="button" onClick={() => inputRef.current?.click()} key={`${file.name}-${file.size}`} className="relative overflow-hidden rounded-xl border bg-card text-left"><img className="h-28 w-full object-cover" src={previews[index]} alt={`Selected screenshot ${index + 1}`} /><div className="truncate px-2 py-2 text-xs font-medium">{file.name}</div></button>)}</div><div className="mt-5 flex flex-col items-start justify-between gap-4 border-t pt-5 sm:flex-row sm:items-center"><div className="flex gap-3 text-sm text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-emerald-700" /><p>Nothing is sent until you explicitly confirm. Keep account names and unrelated details out of frame where possible.</p></div><Button disabled={loading} onClick={onExtract} className="shrink-0">{loading ? <><RefreshCw className="animate-spin" />Extracting…</> : <>Review with AI <ImageIcon /></>}</Button></div></>}</CardContent></Card> }

function CandidateCard({ candidate, index, onChange }: { candidate: ImportCandidate; index: number; onChange: (candidate: ImportCandidate) => void }) {
  const d = candidate.draft
  const issues = candidateIssues(candidate)
  const update = (changes: Partial<BetDraft>) => onChange({ ...candidate, draft: { ...d, ...changes } })
  function resolveAsLost() { const next: ImportCandidate = { ...candidate, draft: { ...d, status: "lost", returnCents: 0 }, unsupportedReason: undefined }; onChange({ ...next, selected: isCandidateImportable(next) }) }
  return <Card className={!candidate.selected ? "opacity-75" : ""}><CardHeader className="border-b pb-4"><div className="flex flex-wrap items-center gap-3"><Checkbox checked={candidate.selected} onCheckedChange={(selected) => onChange({ ...candidate, selected: selected === true })} aria-label={`Select candidate ${index + 1}`} /><div className="min-w-0 flex-1"><CardTitle>Candidate {index + 1}{d.externalBetId ? ` · ${d.externalBetId}` : ""}</CardTitle><CardDescription>{candidate.sourceEvidence || "CSV row—review source file for evidence."}</CardDescription></div>{candidate.unsupportedReason ? <Badge variant="destructive">Manual handling</Badge> : issues.length ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">{issues.length} issue{issues.length > 1 ? "s" : ""}</Badge> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">Ready</Badge>}</div></CardHeader><CardContent className="grid gap-4 pt-1"><div className="grid gap-4 sm:grid-cols-3"><CandidateField label="Placed at"><Input type="datetime-local" value={d.placedAt?.slice(0, 16) ?? ""} onChange={(e) => update({ placedAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></CandidateField><CandidateField label="Sport"><Input value={d.sport ?? ""} onChange={(e) => update({ sport: e.target.value })} /></CandidateField><CandidateField label="Bookmaker"><Input value={d.bookmaker ?? ""} onChange={(e) => update({ bookmaker: e.target.value })} /></CandidateField></div><CandidateField label="Event"><Input value={d.event ?? ""} onChange={(e) => update({ event: e.target.value })} /></CandidateField><div className="grid gap-4 sm:grid-cols-2"><CandidateField label="Market"><Input value={d.market ?? ""} onChange={(e) => update({ market: e.target.value })} /></CandidateField><CandidateField label="Selection"><Input value={d.selection ?? ""} onChange={(e) => update({ selection: e.target.value })} /></CandidateField></div><div className="grid gap-4 sm:grid-cols-4"><CandidateField label="Decimal odds"><Input type="number" step=".01" value={d.decimalOdds ?? ""} onChange={(e) => update({ decimalOdds: e.target.value ? Number(e.target.value) : undefined })} /></CandidateField><CandidateField label="Stake (AUD)"><Input type="number" step=".01" value={d.stakeCents === undefined ? "" : d.stakeCents / 100} onChange={(e) => update({ stakeCents: e.target.value ? centsFromAud(e.target.value) : undefined })} /></CandidateField><CandidateField label="Status"><Select value={d.status ?? "pending"} onValueChange={(status) => update({ status: status as BetStatus })}><SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["pending", "won", "lost", "void", "cashed_out"].map((s) => <SelectItem value={s} key={s}>{s.replace("_", " ")}</SelectItem>)}</SelectGroup></SelectContent></Select></CandidateField><CandidateField label="Return (AUD)"><Input type="number" step=".01" value={d.returnCents === undefined ? "" : d.returnCents / 100} onChange={(e) => update({ returnCents: e.target.value ? centsFromAud(e.target.value) : undefined })} /></CandidateField></div><div className="grid gap-4 sm:grid-cols-3"><CandidateField label="Settled at"><Input type="datetime-local" value={d.settledAt?.slice(0, 16) ?? ""} onChange={(e) => update({ settledAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></CandidateField><CandidateField label="External bet ID"><Input value={d.externalBetId ?? ""} onChange={(e) => update({ externalBetId: e.target.value || undefined })} /></CandidateField><CandidateField label="Import source"><Input disabled value={d.source?.replaceAll("_", " ") ?? "history import"} /></CandidateField></div><CandidateField label="Notes"><Textarea rows={2} value={d.notes ?? ""} onChange={(e) => update({ notes: e.target.value || undefined })} /></CandidateField>{candidate.duplicateBetIds.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-semibold text-amber-950">Possible duplicate</p><p className="mt-1 text-sm text-amber-900/75">Matches {candidate.duplicateBetIds.length} existing journal record{candidate.duplicateBetIds.length > 1 ? "s" : ""}. Choose before importing.</p></div><Select value={candidate.duplicateDecision} onValueChange={(duplicateDecision) => onChange({ ...candidate, duplicateDecision: duplicateDecision as ImportCandidate["duplicateDecision"], selected: duplicateDecision !== "skip" })}><SelectTrigger className="h-9 w-full bg-white sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="review">Decision required</SelectItem><SelectItem value="skip">Skip duplicate</SelectItem><SelectItem value="import_anyway">Import anyway</SelectItem></SelectGroup></SelectContent></Select></div></div>}{candidate.unsupportedReason && <Alert variant="destructive"><X /><AlertTitle>Settlement needs confirmation</AlertTitle><AlertDescription><p>{candidate.unsupportedReason}</p>{isUnmatchedStakeAmbiguity(candidate) && <Button type="button" variant="outline" size="sm" className="mt-3 bg-background text-foreground" onClick={resolveAsLost}>Mark as lost</Button>}</AlertDescription></Alert>}{issues.length > 0 && <div className="flex flex-wrap gap-2">{issues.map((issue) => <Badge key={issue} variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">{issue}</Badge>)}</div>}</CardContent></Card>
}
function CandidateField({ label, children }: { label: string; children: React.ReactNode }) { return <div className="grid min-w-0 gap-2"><Label className="text-xs font-semibold">{label}</Label>{children}</div> }

function candidateIssues(candidate: ImportCandidate) { const d = candidate.draft; const issues: string[] = []; if (!d.placedAt) issues.push("Missing placed date"); if (!d.sport?.trim()) issues.push("Missing sport"); if (!d.event?.trim()) issues.push("Missing event"); if (!d.market?.trim()) issues.push("Missing market"); if (!d.selection?.trim()) issues.push("Missing selection"); if (!d.decimalOdds || d.decimalOdds <= 1) issues.push("Invalid odds"); if (!d.stakeCents || d.stakeCents <= 0) issues.push("Invalid stake"); if (!d.bookmaker?.trim()) issues.push("Missing bookmaker"); if (!d.status) issues.push("Missing status"); if (d.status === "cashed_out" && d.returnCents === undefined) issues.push("Cash-out return required"); if (candidate.duplicateBetIds.length && candidate.duplicateDecision === "review") issues.push("Duplicate decision required"); return issues }

function isCandidateImportable(candidate: ImportCandidate) { return !candidate.unsupportedReason && candidate.duplicateDecision !== "skip" && candidateIssues(candidate).length === 0 }

function isUnmatchedStakeAmbiguity(candidate: ImportCandidate) { const reason = candidate.unsupportedReason?.toLowerCase() ?? ""; return reason.includes("no explicit settlement or payout") || reason.includes("loss or unsettled bet") }

function toCandidates(result: ExtractionResponse, existing: import("@/domain/types").Bet[], source: "bet365_screenshot" | "bet365_pdf"): ImportCandidate[] {
  const byExternal = new Map(existing.filter((bet) => bet.externalBetId).map((bet) => [bet.externalBetId!, bet.id])); const byFingerprint = new Map(existing.map((bet) => [duplicateFingerprint(bet), bet.id]))
  return result.bets.map((bet, index) => {
    const status = bet.status === "unsupported" ? undefined : bet.status
    const draft: Partial<BetDraft> = { externalBetId: bet.externalBetId ?? undefined, placedAt: bet.placedAt ?? undefined, sport: bet.sport ?? undefined, event: bet.event ?? undefined, market: bet.market ?? undefined, selection: bet.selection ?? undefined, decimalOdds: bet.decimalOdds ?? undefined, stakeCents: bet.stakeAud === null ? undefined : centsFromAud(bet.stakeAud), bookmaker: "bet365", status, returnCents: bet.returnAud === null ? undefined : centsFromAud(bet.returnAud), settledAt: bet.settledAt ?? undefined, notes: bet.notes ?? undefined, source }
    const duplicateBetIds: string[] = []; if (draft.externalBetId && byExternal.has(draft.externalBetId)) duplicateBetIds.push(byExternal.get(draft.externalBetId)!)
    if (draft.placedAt && draft.event && draft.market && draft.selection && draft.decimalOdds && draft.stakeCents) { const match = byFingerprint.get(duplicateFingerprint(draft as BetDraft)); if (match && !duplicateBetIds.includes(match)) duplicateBetIds.push(match) }
    const candidate: ImportCandidate = { tempId: `${source === "bet365_pdf" ? "pdf" : "image"}-${index}-${crypto.randomUUID()}`, draft, sourceImageIndex: bet.sourceImageIndex, sourceEvidence: bet.sourceEvidence, issues: bet.missingFields.map((field) => `Missing ${field}`), duplicateBetIds, duplicateDecision: duplicateBetIds.length ? "review" : "import_anyway", selected: false, unsupportedReason: bet.unsupportedReason ?? undefined }
    candidate.selected = isCandidateImportable(candidate)
    return candidate
  })
}

function formatFileSize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB` }
