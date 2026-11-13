export type FormState = {
  error?: string;
  fields?: Record<string, string[] | undefined>;
  success?: string;
};

export type Employee = { id: number; name: string; role: "USER" | "ADMIN" | "MANAGER" };
export type CustomerView = { id: number; name: string; phone: string | null };
export type ProductView = { id: number; name: string; unit: string; price: string };
export type ItemView = {
  id: number; productId: number; name: string; quantity: string; unit: string;
  price: string; subtotal: string;
};
export type OrderView = {
  id: number; customer: CustomerView; total: string; createdAt: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  state: "OPEN" | "CHECKOUT" | "PAID";
  carried: boolean; items: ItemView[]; paymentDate: string | null;
};
export type Snapshot = {
  shift: { id: number; openedAt: string } | null;
  customers: CustomerView[];
  products: ProductView[];
  orders: OrderView[];
};
export type MutationResult =
  | { ok: true; data: Snapshot; orderId?: number; customerId?: number }
  | { ok: false; error: string; fields?: Record<string, string[] | undefined> };

export const currency = (amount: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(amount));

export const orderDate = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(date));
