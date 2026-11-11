"use client";

import Form from "next/form";
import { useActionState, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { loginAction } from "@/app/actions";
import { FieldError, Notice } from "@/components/primitives";
import type { FormState } from "@/lib/contracts";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {} as FormState);
  const [email, setEmail] = useState("");
  return <Form action={action} className="form-stack">
    <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@seubar.com.br" maxLength={50} required aria-invalid={!!state.fields?.email} aria-describedby={state.fields?.email ? "email-error" : undefined} /><FieldError id="email-error" errors={state.fields?.email} /></div>
    <div className="field"><label htmlFor="password">Senha</label><input id="password" name="password" type="password" autoComplete="current-password" placeholder="Sua senha de acesso" maxLength={200} required aria-invalid={!!state.fields?.password} aria-describedby={state.fields?.password ? "password-error" : undefined} /><FieldError id="password-error" errors={state.fields?.password} /></div>
    <Notice error>{state.error}</Notice>
    <button className="button primary wide" disabled={pending}>{pending ? "Entrando…" : "Entrar no meu bar"}<ArrowRight size={19} aria-hidden="true" /></button>
    <p className="login-help"><LockKeyhole size={15} aria-hidden="true" />Acesso exclusivo para a equipe do bar.</p>
  </Form>;
}
