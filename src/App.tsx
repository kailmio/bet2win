import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppStoreProvider } from "@/state/app-store"

const OverviewPage = lazy(() => import("@/pages/overview-page").then((module) => ({ default: module.OverviewPage })))
const BetsPage = lazy(() => import("@/pages/bets-page").then((module) => ({ default: module.BetsPage })))
const InsightsPage = lazy(() => import("@/pages/insights-page").then((module) => ({ default: module.InsightsPage })))
const BankrollPage = lazy(() => import("@/pages/bankroll-page").then((module) => ({ default: module.BankrollPage })))
const ImportPage = lazy(() => import("@/pages/import-page").then((module) => ({ default: module.ImportPage })))
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })))
const NotFoundPage = lazy(() => import("@/pages/not-found-page").then((module) => ({ default: module.NotFoundPage })))

export default function App() {
  return <AppStoreProvider><TooltipProvider><BrowserRouter><Suspense fallback={<LoadingState />}><Routes><Route element={<AppShell />}><Route index element={<OverviewPage />} /><Route path="bets" element={<BetsPage />} /><Route path="insights" element={<InsightsPage />} /><Route path="bankroll" element={<BankrollPage />} /><Route path="import" element={<ImportPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<NotFoundPage />} /></Route></Routes></Suspense></BrowserRouter><Toaster position="top-right" /></TooltipProvider></AppStoreProvider>
}

function LoadingState() { return <div className="grid min-h-svh grid-cols-[248px_1fr]"><Skeleton className="rounded-none" /><div className="space-y-5 p-8"><Skeleton className="h-10 w-48" /><div className="grid grid-cols-4 gap-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div><Skeleton className="h-96" /></div></div> }
