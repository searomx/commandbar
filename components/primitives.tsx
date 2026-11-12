"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Moon, Sun, X, Wine } from "lucide-react";
import Image from 'next/image';

export function Brand() {
  return <span className="brand"><span className="brand-mark">
    <Wine size={23} strokeWidth={1.7} aria-hidden="true" /></span>commandBar<span className="brand-dot">.</span></span>;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("commandbar-theme");
      if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
    } catch {
      console.error("[commandbar] Não foi possível ler a preferência de tema.");
    }
  }, []);
  function toggle() {
    const current = document.documentElement.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("commandbar-theme", next);
    } catch {
      console.error("[commandbar] Não foi possível salvar a preferência de tema.");
      setError("O tema foi alterado, mas não será lembrado neste navegador.");
    }
  }
  return <><button type="button" className="icon-button theme-toggle" onClick={toggle} aria-label={`Alternar tema claro/escuro${theme ? `, atual ${theme === "dark" ? "escuro" : "claro"}` : ""}`}>
    <Sun size={19} className="sun-icon" aria-hidden="true" /><Moon size={19} className="moon-icon" aria-hidden="true" />
  </button><span className="sr-only" role="status">{error}</span></>;
}

export function Modal({ title, children, onClose, drawer = false }: {
  title: string; children: ReactNode; onClose: () => void; drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected && !previous.matches(":disabled")) previous.focus();
      else document.getElementById("comandas")?.focus();
    };
  }, []);
  return <dialog ref={ref} className={drawer ? "drawer" : "modal"} aria-labelledby={id} onCancel={onClose}>
    <header className="dialog-heading"><h2 id={id}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar janela"><X size={21} aria-hidden="true" /></button></header>
    {children}
  </dialog>;
}

export function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  return errors?.length ? <span id={id} className="field-error">{errors.join(" ")}</span> : null;
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return children ? <p className={error ? "notice error" : "notice"} role={error ? "alert" : "status"}>{children}</p> : null;
}
