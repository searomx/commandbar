"use client";

import { useEffect, useState } from "react";
import Form from "next/form";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, CheckCheck, Copy, CreditCard, Plus, ReceiptText, Trash2 } from "lucide-react";
import { pixAction } from "@/app/actions";
import { currency, type ItemView, type OrderView, type ProductView } from "@/lib/contracts";
import { useUI } from "@/lib/ui-store";
import { FieldError, Modal, Notice } from "@/components/primitives";
import type { RunCommand } from "@/components/dashboard";

export function OrderPanel({ order, products, busy, run, onClose }: {
  order: OrderView; products: ProductView[]; busy: boolean; run: RunCommand; onClose: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});
  const closeIntent = useUI((s) => s.closeIntent);
  const editable = order.state === "OPEN";
  return <Modal title={`Comanda #${String(order.id).padStart(3, "0")}`} drawer onClose={() => !busy && onClose()}>
    <div className="drawer-body">
      <div className="customer-detail"><span className="customer-avatar">{order.customer.name.slice(0, 1).toUpperCase()}</span><div><h3>{order.customer.name}</h3><span className="muted">{order.customer.phone || "Cliente do bar"}{order.carried ? " · Turno anterior" : ""}</span></div><span className="status">{editable ? "Em aberto" : "Em cobrança"}</span></div>
      {closeIntent && editable && <Notice>Confira os itens e use “Fechar para cobrança” ao final.</Notice>}
      <section className="items-section" aria-label="Despesas da comanda">
        <div className="section-heading"><h3>Consumo</h3><span className="muted">{order.items.length} {order.items.length === 1 ? "item" : "itens"}</span></div>
        {order.items.length ? <div className="item-list">{order.items.map((item) => <ItemRow key={`${item.id}-${item.quantity}`} item={item} orderId={order.id} editable={editable} busy={busy} run={run} />)}</div> : <div className="empty-items"><ReceiptText size={28} strokeWidth={1.5} aria-hidden="true" /><p>Ainda não tem pedido nesta conta.</p><span>Adicione o primeiro item abaixo.</span></div>}
      </section>
      {editable && <section className="add-item"><h3>Adicionar pedido</h3>
        {!products.length && <Notice error>O catálogo está vazio. Peça ao responsável para cadastrar os produtos antes de lançar despesas.</Notice>}
        <Form className="form-stack" action={async () => {
          setError(""); setFields({});
          const result = await run({ type: "item", orderId: order.id, productId, quantity });
          if (result.ok) { setQuantity("1"); setProductId(""); }
          else { setError(result.error); setFields(result.fields ?? {}); }
        }}>
          <div className="field"><label htmlFor="product">Produto</label><select id="product" value={productId} onChange={(e) => setProductId(e.target.value)} required disabled={busy || !products.length} aria-invalid={!!fields.productId} aria-describedby={fields.productId ? "product-error" : undefined}><option value="">Escolha no catálogo</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {currency(p.price)} / {p.unit}</option>)}</select><FieldError id="product-error" errors={fields.productId} /></div>
          <div className="item-entry"><div className="field"><label htmlFor="quantity">Quantidade</label><input id="quantity" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} required maxLength={8} disabled={busy} aria-invalid={!!fields.quantity} aria-describedby={fields.quantity ? "quantity-error" : undefined} /><FieldError id="quantity-error" errors={fields.quantity} /></div><button className="button secondary" disabled={busy || !productId}><Plus size={18} aria-hidden="true" />{busy ? "Salvando…" : "Adicionar"}</button></div>
        </Form>
      </section>}
      <Notice error>{error}</Notice>
      <div className="order-total"><span>Total da comanda<small>{editable ? "Atualizado a cada pedido salvo" : "Confira o valor antes de receber"}</small></span><strong>{currency(order.total)}</strong></div>
      {editable ? <div className="checkout-action"><p className="muted">Tudo certo? Feche a conta para escolher a forma de pagamento.</p><button className="button primary wide" disabled={busy || Number(order.total) <= 0} onClick={async () => { const result = await run({ type: "checkout", orderId: order.id }); if (!result.ok) setError(result.error); }}>{busy ? "Salvando…" : "Fechar para cobrança"}<ArrowRight size={18} aria-hidden="true" /></button></div> : <Checkout key={`${order.id}-${order.total}`} order={order} busy={busy} run={run} onPaid={onClose} />}
    </div>
  </Modal>;
}

function ItemRow({ item, orderId, editable, busy, run }: {
  item: ItemView; orderId: number; editable: boolean; busy: boolean; run: RunCommand;
}) {
  const [quantity, setQuantity] = useState(item.quantity.replace(".", ","));
  const [error, setError] = useState("");
  return <div className="item-row"><div className="item-description"><strong>{item.name}</strong><span>{currency(item.price)} / {item.unit}</span></div><strong className="item-subtotal">{currency(item.subtotal)}</strong>
    {editable ? <Form className="item-edit" action={async () => {
      const result = await run({ type: "quantity", orderId, itemId: item.id, quantity });
      setError(result.ok ? "" : result.fields?.quantity?.join(" ") || result.error);
    }}><label htmlFor={`qty-${item.id}`}>Quantidade ({item.unit})</label><div><input id={`qty-${item.id}`} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} required maxLength={8} disabled={busy} aria-invalid={!!error} aria-describedby={error ? `qty-error-${item.id}` : undefined} /><button className="icon-button" disabled={busy} aria-label={`Salvar quantidade de ${item.name}`} title="Salvar quantidade"><Check size={17} aria-hidden="true" /></button><button type="button" className="icon-button delete-button" disabled={busy} aria-label={`Remover ${item.name}`} onClick={async () => { const result = await run({ type: "remove", orderId, itemId: item.id }); if (!result.ok) setError(result.error); }}><Trash2 size={16} aria-hidden="true" /></button></div><FieldError id={`qty-error-${item.id}`} errors={error ? [error] : undefined} /></Form> : <span className="muted item-quantity">{item.quantity.replace(".", ",")} {item.unit}</span>}
  </div>;
}

function Checkout({ order, busy, run, onPaid }: { order: OrderView; busy: boolean; run: RunCommand; onPaid: () => void }) {
  const [method, setMethod] = useState<"PIX" | "CASH" | "CARD">("PIX");
  const [pix, setPix] = useState<{ image: string; payload: string } | null>(null);
  const [pixError, setPixError] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    pixAction(order.id, order.total).then((result) => {
      if (!active) return;
      if (result.ok) setPix(result);
      else setPixError(result.error);
    }).catch(() => {
      console.error("[commandbar] Falha de comunicação ao gerar Pix.");
      if (active) setPixError("Não foi possível gerar o Pix. Atualize o painel ou escolha outro meio.");
    });
    return () => { active = false; };
  }, [order.id, order.total]);
  function choose(value: "PIX" | "CASH" | "CARD") { setMethod(value); setConfirmed(false); setError(""); }
  return <section className="payment-section"><div className="section-heading"><h3>Receber pagamento</h3><CreditCard size={19} aria-hidden="true" /></div>
    <fieldset className="payment-methods"><legend>Forma de pagamento</legend>{([{ key: "PIX", label: "Pix" }, { key: "CASH", label: "Dinheiro" }, { key: "CARD", label: "Cartão" }] as const).map((m) => <label key={m.key} className={method === m.key ? "method selected" : "method"}><input type="radio" name="payment-method" value={m.key} checked={method === m.key} onChange={() => choose(m.key)} disabled={busy} />{m.label}</label>)}</fieldset>
    {method === "PIX" && <div className="pix-section">
      {pixError ? <Notice error>{pixError}</Notice> : pix ? <><div className="qr-frame"><Image src={pix.image} width={240} height={240} alt={`QR Code Pix da comanda ${order.id}, valor ${currency(order.total)}`} unoptimized /></div><p>Peça ao cliente para escanear o código.</p><label htmlFor="pix-code" className="small-label">Pix copia e cola</label><textarea id="pix-code" readOnly value={pix.payload} rows={3} /><button className="button secondary wide" type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(pix.payload); setCopied(true); }
        catch { console.error("[commandbar] Acesso à área de transferência indisponível."); setError("Não foi possível copiar. Selecione e copie o código no campo acima."); }
      }}>{copied ? <CheckCheck size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}{copied ? "Código copiado" : "Copiar código Pix"}</button><span className="sr-only" role="status">{copied ? "Código Pix copiado." : ""}</span></> : <p role="status">Gerando QR Code Pix…</p>}
      <button className="text-button" type="button" disabled={busy} onClick={() => choose("CASH")}>Cancelar Pix e usar outro meio</button>
    </div>}
    <p className="payment-disclaimer">{method === "PIX" ? "Confira o recebimento no banco. O QR Code não confirma o pagamento automaticamente. Ocultar um Pix estático não revoga o código já compartilhado." : "Confira o valor recebido antes de confirmar. A seleção do meio não registra pagamento por si só."}</p>
    <label className="confirm-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} /><span>Conferi o recebimento de <strong>{currency(order.total)}</strong>.</span></label>
    <Notice error>{error}</Notice>
    <button className="button primary wide" type="button" disabled={busy || !confirmed || method === "PIX" && !pix} onClick={async () => {
      const result = await run({ type: "pay", orderId: order.id, expectedTotal: order.total, method });
      if (result.ok) onPaid(); else setError(result.error);
    }}><CheckCheck size={18} aria-hidden="true" />{busy ? "Confirmando…" : "Confirmar pagamento"}</button>
    <button className="text-button back-to-edit" type="button" disabled={busy} onClick={async () => { const result = await run({ type: "reopen", orderId: order.id }); if (!result.ok) setError(result.error); }}><ArrowLeft size={16} aria-hidden="true" />Voltar à edição da conta</button>
  </section>;
}
