"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import Form from "next/form";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, CircleCheck, Clock3, LogOut, Plus, RefreshCw, Search, ShieldCheck, Wallet, Wine } from "lucide-react";
import { logoutAction, mutateAction, refreshAction } from "@/app/actions";
import type { Command } from "@/lib/validation";
import { currency, type Employee, type MutationResult, type OrderView, type Snapshot } from "@/lib/contracts";
import { useUI } from "@/lib/ui-store";
import { Brand, FieldError, Modal, Notice, ThemeToggle } from "@/components/primitives";
import { OrderPanel } from "@/components/order-panel";

export type RunCommand = (input: Command) => Promise<MutationResult>;
type Filter = "all" | "open" | "checkout" | "paid";

export function Dashboard({ user, initial }: { user: Employee; initial: Snapshot }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"customer" | "close" | "open" | null>(null);
  const selectedId = useUI((s) => s.selectedId);
  const dismiss = useUI((s) => s.dismiss);
  const selected = data.orders.find((o) => o.id === selectedId);

  async function request(input?: Command): Promise<MutationResult> {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = input ? await mutateAction(input) : await refreshAction();
      if (result.ok) {
        setData(result.data);
        setMessage(input ? "Alteração salva." : "Painel atualizado.");
      } else setError(result.error);
      return result;
    } catch {
      console.error("[commandbar] Falha de comunicação com o servidor.");
      const error = "Não foi possível comunicar com o servidor. Verifique a conexão e atualize antes de repetir a operação.";
      setError(error);
      return { ok: false, error };
    } finally { setBusy(false); }
  }
  const run: RunCommand = (command) => request(command);
  const pending = data.orders.filter((o) => o.paymentStatus !== "PAID");
  const paid = data.orders.filter((o) => o.paymentStatus === "PAID");
  const total = (orders: OrderView[]) => orders.reduce((sum, o) => sum + Math.round(Number(o.total) * 100), 0) / 100;
  const visible = data.orders.filter((o) => {
    const matches = `${o.id} ${o.customer.name}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
    return matches && (filter === "all" || filter === "paid" && o.paymentStatus === "PAID" ||
      filter === "open" && o.state === "OPEN" || filter === "checkout" && o.state === "CHECKOUT");
  });
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Todas", count: data.orders.length },
    { key: "open", label: "Em aberto", count: data.orders.filter((o) => o.state === "OPEN").length },
    { key: "checkout", label: "Em cobrança", count: data.orders.filter((o) => o.state === "CHECKOUT").length },
    { key: "paid", label: "Pagas", count: paid.length },
  ];

  return <div className="app-shell">
    <a className="skip-link" href="#comandas">Ir para comandas</a>
    <header className="app-header">
      <Brand /><span className="header-divider" /><span className="header-location">Seu balcão digital</span>
      <div className="header-actions"><ThemeToggle />
        <div className="employee"><span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}<small>{user.role === "USER" ? "Atendimento" : user.role === "ADMIN" ? "Administrador" : "Gerente"}</small></span></div>
        <Form action={logoutAction}><button className="icon-button" aria-label="Sair da conta sem encerrar o turno" title="Sair da conta"><LogOut size={18} aria-hidden="true" /></button></Form>
      </div>
    </header>
    <main className="workspace" id="comandas" tabIndex={-1}>
      <div className="workspace-heading"><div><div className="shift-label"><span className={data.shift ? "live-dot" : "offline-dot"} />{data.shift ? `Turno #${data.shift.id} aberto` : "Turno encerrado"}{data.shift && <span className="shift-time">desde {new Date(data.shift.openedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>}</div><h1>Comandas do bar<span className="title-dot">.</span></h1><p className="muted">O movimento acontece. As contas ficam em dia.</p></div>
        <div className="workspace-actions"><button className="button secondary" onClick={() => setModal(data.shift ? "close" : "open")} disabled={busy}><ShieldCheck size={17} aria-hidden="true" />{data.shift ? "Encerrar aplicativo" : "Abrir turno"}</button><button className="button primary" disabled={busy || !data.shift} onClick={() => setModal("customer")}><Plus size={19} aria-hidden="true" />Adicionar Comanda</button></div>
      </div>
      {!data.shift && <div className="closed-banner"><Clock3 size={23} aria-hidden="true" /><div><strong>Um novo turno, tudo no lugar.</strong><p>Abra o turno para registrar pedidos. Contas pendentes de turnos anteriores continuam salvas.</p></div><button className="text-button" disabled={busy} onClick={() => setModal("open")}>Abrir turno<ChevronRight size={17} aria-hidden="true" /></button></div>}
      <section className="summary" aria-label="Resumo do turno">
        <div className="summary-cell"><span className="summary-icon"><Wallet size={19} aria-hidden="true" /></span><div><span className="summary-label">Total no painel</span><strong>{currency(total(data.orders))}</strong><small>{data.orders.length} {data.orders.length === 1 ? "comanda" : "comandas"}</small></div></div>
        <div className="summary-cell"><span className="summary-icon amber"><ArrowUpRight size={20} aria-hidden="true" /></span><div><span className="summary-label">A receber</span><strong>{currency(total(pending))}</strong><small>{pending.length} {pending.length === 1 ? "conta pendente" : "contas pendentes"}</small></div></div>
        <div className="summary-cell"><span className="summary-icon green"><ArrowDownLeft size={20} aria-hidden="true" /></span><div><span className="summary-label">Recebido neste turno</span><strong>{currency(total(paid))}</strong><small>{paid.length} {paid.length === 1 ? "conta paga" : "contas pagas"}</small></div></div>
      </section>
      <div className="board-toolbar"><div className="filters" role="group" aria-label="Filtrar comandas">{tabs.map((tab) => <button key={tab.key} aria-pressed={filter === tab.key} className={filter === tab.key ? "filter active" : "filter"} onClick={() => setFilter(tab.key)}>{tab.label}<span>{tab.count}</span></button>)}</div>
        <div className="search-group"><div className="search-field"><label htmlFor="order-search" className="search-label">Buscar comanda</label><div><Search size={17} aria-hidden="true" /><input id="order-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou número" /></div></div><button className="icon-button refresh-button" disabled={busy} onClick={() => request()} aria-label="Atualizar comandas"><RefreshCw size={18} aria-hidden="true" /></button></div>
      </div>
      <Notice error>{error}</Notice><span className="sr-only" role="status">{message}</span>
      <div className="board-caption"><span>{visible.length} {visible.length === 1 ? "comanda" : "comandas"} no painel</span><span className="hold-hint"><Clock3 size={14} aria-hidden="true" />Segure por 3s para fechar ou use o botão dentro da comanda</span></div>
      {visible.length ? <section className="order-grid" aria-label="Comandas">{visible.map((o) => <OrderCard key={o.id} order={o} disabled={busy || !data.shift} />)}</section> : <section className="empty-board"><span className="empty-icon"><Wine size={32} strokeWidth={1.4} aria-hidden="true" /></span><h2>{data.orders.length ? "Nenhuma comanda por aqui." : "O próximo pedido começa aqui."}</h2><p>{search || filter !== "all" ? "Tente outro nome, número ou filtro." : "Abra uma comanda para começar a registrar o consumo."}</p>{!search && filter === "all" && data.shift && <button className="button primary" disabled={busy} onClick={() => setModal("customer")}><Plus size={18} aria-hidden="true" />Adicionar Comanda</button>}</section>}
      <footer className="board-footer"><span><ShieldCheck size={14} aria-hidden="true" />Dados salvos no banco de dados</span><span>Um pedido de cada vez. Tudo sob controle.</span></footer>
    </main>
    {selected && selected.paymentStatus !== "PAID" && <OrderPanel key={selected.id} order={selected} products={data.products} run={run} busy={busy} onClose={dismiss} />}
    {modal === "customer" && <CustomerModal data={data} busy={busy} run={run} onClose={() => !busy && setModal(null)} />}
    {modal === "close" && data.shift && <CloseShiftModal shiftId={data.shift.id} pendingCount={pending.length} run={run} busy={busy} onClose={() => !busy && setModal(null)} />}
    {modal === "open" && <Modal title="Abrir um novo turno" onClose={() => !busy && setModal(null)}><div className="dialog-body"><p>As contas pendentes serão retomadas. As contas já pagas continuam no histórico, fora do painel.</p><Notice error>{error}</Notice><button className="button primary wide" disabled={busy} onClick={async () => { const result = await run({ type: "openShift" }); if (result.ok) setModal(null); }}>{busy ? "Abrindo…" : "Abrir turno e começar"}</button></div></Modal>}
  </div>;
}

function OrderCard({ order, disabled }: { order: OrderView; disabled: boolean }) {
  const select = useUI((s) => s.select);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const paid = order.paymentStatus === "PAID";
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function cancel() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function pointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (!e.isPrimary || e.button !== 0 || disabled || paid) return;
    cancel(); held.current = false; start.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => { held.current = true; timer.current = null; select(order.id, true); }, 3000);
  }
  return <button type="button" className={`order-card ${paid ? "paid" : order.carried ? "carried" : ""}`} disabled={disabled || paid}
    onPointerDown={pointerDown} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
    onPointerMove={(e) => { if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel(); }}
    onClick={(e) => { cancel(); if (!held.current || e.detail === 0) select(order.id); held.current = false; }}
    aria-label={`Comanda ${order.id}, ${order.customer.name}, ${currency(order.total)}, ${paid ? "paga" : "pendente"}`}>
    <span className="card-top"><span className="order-number">#{String(order.id).padStart(3, "0")}</span><span className={`status ${paid ? "status-paid" : order.state === "CHECKOUT" ? "status-checkout" : ""}`}>{paid ? <Check size={12} aria-hidden="true" /> : <span className="status-dot" />}{paid ? "Paga" : order.state === "CHECKOUT" ? "Em cobrança" : "Pendente"}</span></span>
    <span className="customer-name">{order.customer.name}</span>
    <span className="card-subtitle">{order.carried ? "Pendente de turno anterior" : `${order.items.length} ${order.items.length === 1 ? "item lançado" : "itens lançados"}`}</span>
    <span className="card-bottom"><span><span className="card-total-label">Consumo total</span><strong>{currency(order.total)}</strong></span><span className="card-arrow">{paid ? <CircleCheck size={23} strokeWidth={1.5} aria-hidden="true" /> : <ArrowUpRight size={20} aria-hidden="true" />}</span></span>
    <span className="hold-feedback" aria-hidden="true" />
  </button>;
}

function CustomerModal({ data, run, busy, onClose }: { data: Snapshot; run: RunCommand; busy: boolean; onClose: () => void }) {
  const [create, setCreate] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  return <Modal title="Adicionar Comanda" onClose={onClose}><div className="dialog-body">
    <p className="muted">Cada cliente tem a sua conta. Selecione quem vai aproveitar o bar hoje.</p>
    <Form className="form-stack" action={async () => {
      const result = await run({ type: "order", customerId });
      if (result.ok && result.orderId) { onClose(); useUI.getState().select(result.orderId); }
      else if (!result.ok) { setError(result.error); setFields(result.fields ?? {}); }
    }}>
      <div className="field"><label htmlFor="customer-id">Cliente cadastrado</label><select id="customer-id" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required disabled={busy} aria-invalid={!!fields.customerId} aria-describedby={fields.customerId ? "customer-id-error" : undefined}><option value="">Selecione um cliente</option>{data.customers.map((c) => {
        const pending = data.orders.some((o) => o.customer.id === c.id && o.paymentStatus !== "PAID");
        return <option key={c.id} value={c.id} disabled={pending}>{c.name}{c.phone ? ` · ${c.phone}` : ""}{pending ? " — já tem conta pendente" : ""}</option>;
      })}</select><FieldError id="customer-id-error" errors={fields.customerId} /></div>
      <button className="button primary wide" disabled={busy || !customerId}>{busy ? "Salvando…" : "Abrir comanda"}<Plus size={18} aria-hidden="true" /></button>
    </Form>
    <div className="inline-divider"><span>Cliente novo?</span><button className="text-button" type="button" onClick={() => setCreate(!create)} aria-expanded={create} disabled={busy}>{create ? "Ocultar cadastro" : "Cadastrar agora"}</button></div>
    {create && <Form className="form-stack new-customer" action={async () => {
      setError(""); setFields({});
      const result = await run({ type: "customer", name, phone });
      if (result.ok && result.customerId) { setCustomerId(String(result.customerId)); setCreate(false); setName(""); setPhone(""); }
      else if (!result.ok) { setError(result.error); setFields(result.fields ?? {}); }
    }}>
      <div className="field"><label htmlFor="new-name">Nome do cliente</label><input id="new-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={30} aria-invalid={!!fields.name} aria-describedby={fields.name ? "new-name-error" : undefined} /><FieldError id="new-name-error" errors={fields.name} /></div>
      <div className="field"><label htmlFor="new-phone">Telefone <span className="muted">(opcional)</span></label><input id="new-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" autoComplete="tel" maxLength={20} aria-invalid={!!fields.phone} aria-describedby={fields.phone ? "new-phone-error" : undefined} /><FieldError id="new-phone-error" errors={fields.phone} /></div>
      <button className="button secondary wide" disabled={busy}>{busy ? "Salvando…" : "Salvar cliente"}</button>
    </Form>}
    <Notice error>{error}</Notice>
  </div></Modal>;
}

function CloseShiftModal({ shiftId, pendingCount, run, busy, onClose }: { shiftId: number; pendingCount: number; run: RunCommand; busy: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  return <Modal title="Encerrar o turno do bar" onClose={onClose}><div className="dialog-body"><p>O encerramento vale para todos os dispositivos. {pendingCount ? `${pendingCount} conta(s) pendente(s) serão retomadas no próximo turno.` : "As contas pagas sairão do painel no próximo turno."}</p><p className="muted">Informe as credenciais de ADMIN. O relatório diário será enviado ao e-mail desse administrador antes do encerramento.</p>
    <Form className="form-stack" action={async () => {
      const result = await run({ type: "closeShift", shiftId, email, password });
      if (result.ok) onClose();
      else { setError(result.error); setFields(result.fields ?? {}); }
    }}>
      <div className="field"><label htmlFor="admin-email">E-mail do responsável</label><input id="admin-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={50} aria-invalid={!!fields.email} aria-describedby={fields.email ? "admin-email-error" : undefined} /><FieldError id="admin-email-error" errors={fields.email} /></div>
      <div className="field"><label htmlFor="admin-password">Senha do responsável</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={200} aria-invalid={!!fields.password} aria-describedby={fields.password ? "admin-password-error" : undefined} /><FieldError id="admin-password-error" errors={fields.password} /></div>
      <Notice error>{error}</Notice><button className="button danger wide" disabled={busy}>{busy ? "Gerando relatório e encerrando…" : "Autorizar e encerrar turno"}</button>
    </Form>
  </div></Modal>;
}
