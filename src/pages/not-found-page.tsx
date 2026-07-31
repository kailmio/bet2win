import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
export function NotFoundPage() { return <div className="grid min-h-[60vh] place-items-center text-center"><div><p className="text-sm font-semibold text-emerald-700">404</p><h1 className="mt-2 text-3xl font-bold">Page not found</h1><p className="mt-2 text-muted-foreground">This route is not part of your betting journal.</p><Button asChild className="mt-6"><Link to="/">Back to overview</Link></Button></div></div> }
