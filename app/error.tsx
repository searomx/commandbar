"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="loading-screen"><h1>Não foi possível abrir o balcão.</h1><p>Verifique a conexão e se as migrações do banco foram aplicadas.</p><button className="button primary" onClick={reset}>Tentar novamente</button><Link href="/login">Voltar ao login</Link></main>;
}
