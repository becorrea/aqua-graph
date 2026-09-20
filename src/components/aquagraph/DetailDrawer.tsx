import type { ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

/** Painel lateral de detalhe de ativo — desliza sobre a área de trabalho. */
export function DetailDrawer({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  badge,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            aria-label={title}
          >
            <header className="drawer-head">
              <div className="drawer-title">
                <span className="drawer-eyebrow">{eyebrow}</span>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <div className="drawer-head-side">
                {badge}
                <button type="button" onClick={onClose} aria-label="Fechar detalhe">
                  <X />
                </button>
              </div>
            </header>
            <div className="drawer-body">{children}</div>
            {footer && <footer className="drawer-foot">{footer}</footer>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
