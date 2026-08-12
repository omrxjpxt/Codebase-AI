"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi, API_BASE_URL } from "@/lib/api";
import { User, LogOut, Trash2, ShieldAlert, Monitor, Moon, Sun, Database } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogState, setDialogState] = useState<{
    type: "clear-history" | "delete-account" | "logout" | null;
  }>({ type: null });
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  useEffect(() => {
    fetchApi("/auth/me")
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("token");
        router.push("/login");
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleClearHistory = async () => {
    try {
      await fetchApi("/repositories/chat-sessions/all", { method: "DELETE" });
      toast.success("Chat history cleared successfully.");
      setDialogState({ type: null });
    } catch (e: any) {
      toast.error(e.message || "Failed to clear history.");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await fetchApi("/auth/me", { method: "DELETE" });
      // Also clear the HttpOnly cookie
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      localStorage.removeItem("token");
      toast.success("Account deleted successfully.");
      window.location.href = "/login";
    } catch (e: any) {
      toast.error(e.message || "Failed to delete account.");
    }
  };

  const handleLogout = async () => {
    try {
      // Call backend to clear HttpOnly cookie
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the request fails, still clear client-side state
    }
    localStorage.removeItem("token");
    // Use replace to prevent back-button returning to authenticated pages
    window.location.href = "/login";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--spinner-head)] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--primary-text)] pb-20">
      <header className="border-b border-[var(--border)] bg-[var(--background)] sticky top-0 z-10">
        <div className="max-w-[800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-[14px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] transition-colors">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[800px] mx-auto px-6 pt-12">
        <h1 className="text-[28px] font-bold text-[var(--primary-text)] mb-8 tracking-tight">Settings</h1>

        <div className="space-y-8">
          {/* Account Information */}
          <section>
            <h2 className="text-[16px] font-semibold text-[var(--primary-text)] mb-4 flex items-center gap-2">
              <User size={18} className="text-[var(--secondary-text)]" />
              Account Information
            </h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[var(--border)]">
                <div>
                  <p className="text-[14px] font-medium text-[var(--primary-text)]">Email Address</p>
                  <p className="text-[13px] text-[var(--secondary-text)] mt-1">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--primary-text)]">Log out</p>
                  <p className="text-[13px] text-[var(--secondary-text)] mt-1">Sign out of your account on this device.</p>
                </div>
                <button onClick={() => setDialogState({ type: "logout" })} className="px-4 py-2 bg-[var(--border)] hover:bg-[var(--border-hover)] text-[var(--primary-text)] text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2">
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section>
            <h2 className="text-[16px] font-semibold text-[var(--primary-text)] mb-4 flex items-center gap-2">
              <Monitor size={18} className="text-[var(--secondary-text)]" />
              Preferences
            </h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--primary-text)]">Theme</p>
                  <p className="text-[13px] text-[var(--secondary-text)] mt-1">Select your preferred application theme.</p>
                </div>
                <div className="flex bg-[var(--background)] border border-[var(--border)] rounded-lg p-1">
                  <button 
                    onClick={() => setTheme("light")} 
                    className={`p-2 rounded-md transition-colors ${mounted && theme === 'light' ? 'bg-[var(--border)] text-[var(--primary-text)]' : 'text-[var(--secondary-text)] hover:text-[var(--primary-text)]'}`}
                    title="Light mode"
                  >
                    <Sun size={16} />
                  </button>
                  <button 
                    onClick={() => setTheme("dark")} 
                    className={`p-2 rounded-md transition-colors ${mounted && theme === 'dark' ? 'bg-[var(--border)] text-[var(--primary-text)]' : 'text-[var(--secondary-text)] hover:text-[var(--primary-text)]'}`}
                    title="Dark mode"
                  >
                    <Moon size={16} />
                  </button>
                  <button 
                    onClick={() => setTheme("system")} 
                    className={`p-2 rounded-md transition-colors ${mounted && theme === 'system' ? 'bg-[var(--border)] text-[var(--primary-text)]' : 'text-[var(--secondary-text)] hover:text-[var(--primary-text)]'}`}
                    title="System theme"
                  >
                    <Monitor size={16} />
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-[var(--border)] flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--primary-text)]">Preferred AI Model</p>
                  <p className="text-[13px] text-[var(--secondary-text)] mt-1">The model used for answering repository questions.</p>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] text-[var(--secondary-text)] text-[13px] font-medium rounded-lg opacity-80 cursor-not-allowed">
                    <Database size={14} />
                    Gemini 2.5 Flash
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Danger Zone */}
          <section>
            <h2 className="text-[16px] font-semibold text-red-500 mb-4 flex items-center gap-2">
              <ShieldAlert size={18} />
              Danger Zone
            </h2>
            <div className="bg-[var(--surface)] border border-red-500/20 rounded-xl p-5 space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--primary-text)]">Clear Chat History</p>
                  <p className="text-[13px] text-[var(--secondary-text)] mt-1">Permanently delete all chat sessions across all repositories.</p>
                </div>
                <button 
                  onClick={() => setDialogState({ type: "clear-history" })} 
                  className="px-4 py-2 border border-[var(--border)] hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500 text-[var(--primary-text)] text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Clear History
                </button>
              </div>

              <div className="pt-6 border-t border-red-500/20 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--primary-text)]">Delete Account</p>
                  <p className="text-[13px] text-[var(--secondary-text)] mt-1">Permanently delete your account and all associated data.</p>
                </div>
                <button 
                  onClick={() => setDialogState({ type: "delete-account" })} 
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Delete Account
                </button>
              </div>

            </div>
          </section>

          <div className="pt-8 text-center">
            <p className="text-[12px] text-[var(--muted-text)]">CodeBase AI • Version 0.1.0 (Production Build)</p>
          </div>

        </div>
      </main>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={dialogState.type === "clear-history"}
        onClose={() => setDialogState({ type: null })}
        onConfirm={handleClearHistory}
        title="Clear chat history?"
        description="This will permanently delete all chat sessions across all repositories. This action cannot be undone."
        confirmText="Clear History"
        icon="trash"
        isDestructive={true}
      />

      <ConfirmDialog
        isOpen={dialogState.type === "delete-account"}
        onClose={() => setDialogState({ type: null })}
        onConfirm={handleDeleteAccount}
        title="Delete your account?"
        description="This will permanently delete your account and all associated repositories, files, embeddings, and chat history. This action cannot be undone."
        confirmText="Delete Account"
        icon="warning"
        isDestructive={true}
        requireInputMatch="DELETE"
      />

      <ConfirmDialog
        isOpen={dialogState.type === "logout"}
        onClose={() => setDialogState({ type: null })}
        onConfirm={handleLogout}
        title="Log out?"
        description="You will be signed out of your account on this device."
        confirmText="Log out"
        icon="warning"
        isDestructive={false}
      />
    </div>
  );
}
