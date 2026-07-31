import { NavLink, Outlet, useLocation } from "react-router-dom"
import { BarChart3, BookOpenCheck, CircleDollarSign, FileUp, Gauge, Settings2 } from "lucide-react"
import { AppLogo } from "@/components/app-logo"
import { cn } from "@/lib/utils"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

const items = [
  { to: "/", label: "Overview", icon: Gauge },
  { to: "/bets", label: "Bets", icon: BookOpenCheck },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/bankroll", label: "Bankroll", icon: CircleDollarSign },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/settings", label: "Settings", icon: Settings2 },
]

export function AppShell() {
  return (
    <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
      <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
        <SidebarHeader className="h-[86px] justify-center px-6"><AppLogo /></SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 py-4">
            <SidebarGroupContent>
              <NavigationItems />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t p-5">
          <p className="text-xs font-medium leading-5 text-muted-foreground"><span className="block text-foreground">Discipline over outcome.</span>Track decisions. Manage risk.</p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur md:hidden">
          <SidebarTrigger /><AppLogo compact /><span className="text-sm font-semibold">Bet2Win</span>
        </header>
        <main className="mx-auto w-full max-w-[1510px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function NavigationItems() {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  return <SidebarMenu className="gap-1.5">{items.map((item) => {
    const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
    return <SidebarMenuItem key={item.to}><SidebarMenuButton asChild isActive={active ? true : undefined} tooltip={item.label} className={cn("relative h-11 rounded-lg px-3 text-[14px] font-medium", active && "bg-emerald-50 text-emerald-800 before:absolute before:-left-3 before:h-6 before:w-1 before:rounded-r-full before:bg-emerald-700")}><NavLink to={item.to} onClick={() => { if (isMobile) setOpenMobile(false) }}><item.icon className="size-[18px]" /><span>{item.label}</span></NavLink></SidebarMenuButton></SidebarMenuItem>
  })}</SidebarMenu>
}
