import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { readSnapshot } from "@/lib/orders";
import { Dashboard } from "@/components/dashboard";

async function Workspace() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <Dashboard user={user} initial={await readSnapshot()} />;
}

export default function Home() {
  return <Suspense fallback={<main className="loading-screen" role="status">Abrindo o balcão…</main>}><Workspace /></Suspense>;
}
