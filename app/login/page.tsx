import { Brand, ThemeToggle } from "@/components/primitives";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return <main className="login-page">
    <section className="login-story" aria-label="Comanda, gestão de contas do bar">
      <Brand />
      <div className="login-story-copy"><h1>Mais tempo<br />para servir.<br /><em>Menos para somar.</em></h1><p>Cada pedido no lugar certo.<br />Cada conta sob controle.</p></div>
      <div className="login-story-footer"><span className="live-dot" />Feito para o ritmo do seu bar.</div>
    </section>
    <section className="login-main">
      <div className="login-top"><span>Seu balcão digital</span><ThemeToggle /></div>
      <div className="login-content">
        <span className="mobile-brand">
          <Brand />
          </span>
          <h2>Bom ter você por aqui.</h2>
          <p className="muted">Entre com sua conta para cuidar das comandas.</p>
          <LoginForm />
      </div>
      <footer className="login-footer">Comanda · Simples de abrir. Fácil de fechar.</footer>
    </section>
  </main>;
}
