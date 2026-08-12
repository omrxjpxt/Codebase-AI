"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  requireInputMatch?: string;
  icon?: "trash" | "warning" | "none";
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = true,
  requireInputMatch,
  icon = "trash",
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const isConfirmDisabled = requireInputMatch ? inputValue !== requireInputMatch : false;

  useEffect(() => {
    if (isOpen) {
      setInputValue("");
      setIsDeleting(false);
      // Focus appropriate element
      setTimeout(() => {
        if (requireInputMatch && inputRef.current) {
          inputRef.current.focus();
        } else if (confirmBtnRef.current) {
          confirmBtnRef.current.focus();
        }
      }, 50);
    }
  }, [isOpen, requireInputMatch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape" && !isDeleting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isConfirmDisabled || isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      // The parent component might close it on success, 
      // but if it fails, we should re-enable the button.
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !isDeleting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div
        className={cn(
          "bg-[var(--surface)] border border-[var(--border)] rounded-[16px] shadow-2xl flex flex-col w-full overflow-hidden",
          "max-w-[440px] transform transition-all duration-200 scale-100 opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            {icon !== "none" && (
              <div className={cn(
                "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                isDestructive ? "bg-red-500/10 text-red-500" : "bg-[var(--border)] text-[var(--primary-text)]"
              )}>
                {icon === "trash" ? <Trash2 size={18} /> : <AlertTriangle size={18} />}
              </div>
            )}
            
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 id="confirm-dialog-title" className="text-[16px] font-semibold text-[var(--primary-text)]">
                {title}
              </h2>
              <p id="confirm-dialog-desc" className="text-[14px] text-[var(--secondary-text)] mt-2 leading-relaxed">
                {description}
              </p>

              {requireInputMatch && (
                <div className="mt-4">
                  <label htmlFor="confirm-input" className="block text-[13px] font-medium text-[var(--primary-text)] mb-1.5">
                    Type <strong>{requireInputMatch}</strong> to confirm
                  </label>
                  <input
                    id="confirm-input"
                    ref={inputRef}
                    type="text"
                    disabled={isDeleting}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-[14px] text-[var(--primary-text)] focus:outline-none focus:border-[var(--input-focus-border)] transition-colors disabled:opacity-50"
                    placeholder={requireInputMatch}
                    autoComplete="off"
                    autoCorrect="off"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-[var(--background)] border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-[13px] font-medium text-[var(--primary-text)] bg-transparent hover:bg-[var(--border)] rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={handleConfirm}
            disabled={isConfirmDisabled || isDeleting}
            className={cn(
              "px-4 py-2 text-[13px] font-medium rounded-lg transition-all flex items-center gap-2",
              isDestructive 
                ? "bg-red-500 text-white hover:bg-red-600 disabled:bg-red-500/50 disabled:text-white/50" 
                : "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-white disabled:bg-[var(--btn-primary-bg)]/50",
              (isConfirmDisabled && !isDeleting) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isDeleting && <Loader2 size={14} className="animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
