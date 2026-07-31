/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react"
import { appStateSchema } from "@/domain/schema"
import { seedState } from "@/domain/seed"
import type { AppSettings, AppState, BankrollTransaction, Bet, BetDraft } from "@/domain/types"

const STORAGE_KEY = "bet2win:v1"

type Action =
  | { type: "add_bet"; draft: BetDraft }
  | { type: "update_bet"; id: string; changes: Partial<BetDraft> }
  | { type: "delete_bet"; id: string }
  | { type: "import_bets"; drafts: BetDraft[] }
  | { type: "add_transaction"; transaction: Omit<BankrollTransaction, "id" | "createdAt"> }
  | { type: "settings"; settings: AppSettings }
  | { type: "reset" }

function makeBet(draft: BetDraft): Bet {
  const now = new Date().toISOString()
  return { ...draft, id: crypto.randomUUID(), source: draft.source ?? "manual", createdAt: now, updatedAt: now }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "add_bet": return { ...state, bets: [makeBet(action.draft), ...state.bets] }
    case "update_bet": return { ...state, bets: state.bets.map((bet) => bet.id === action.id ? { ...bet, ...action.changes, updatedAt: new Date().toISOString() } : bet) }
    case "delete_bet": return { ...state, bets: state.bets.filter((bet) => bet.id !== action.id) }
    case "import_bets": return { ...state, bets: [...action.drafts.map(makeBet), ...state.bets] }
    case "add_transaction": {
      const now = new Date().toISOString()
      return { ...state, transactions: [{ ...action.transaction, id: crypto.randomUUID(), createdAt: now }, ...state.transactions] }
    }
    case "settings": return { ...state, settings: action.settings }
    case "reset": return structuredClone(seedState)
  }
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(seedState)
    const parsed = appStateSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
    localStorage.setItem(`bet2win:corrupt:${Date.now()}`, raw)
  } catch {
    // Fall through to a known-good local state.
  }
  return structuredClone(seedState)
}

interface StoreValue {
  state: AppState
  dispatch: React.Dispatch<Action>
}

const StoreContext = createContext<StoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state])
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useAppStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error("useAppStore must be used inside AppStoreProvider")
  return context
}
