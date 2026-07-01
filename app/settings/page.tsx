"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { User, LogOut, Trash2, ShieldAlert, Monitor, Moon, Sun, Database } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { toast } from "sonner";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; id: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { theme, setTheme } = useTheme();
  
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    fetchApi("/auth/me")
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("token");
        router.push("/login");
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to delete all chat history across all repositories?")) return;
    
    try {
      await fetchApi("/repositories/chat-sessions/all", { method: "DELETE" });
      toast.success("Chat history cleared successfully.");
    } catch (e: any) {
      toast.error(e.message || "Failed to clear history.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you absolutely sure you want to delete your account? This will permanently delete all your repositories, files, embeddings, and chat history. This action cannot be undone.")) return;
    
    try {
      await fetchApi("/auth/me", { method: "DELETE" });
      localStorage.removeItem("token");
      toast.success("Account deleted successfully.");
      router.push("/");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete account.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090B] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#27272A] border-t-[#FAFAFA] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#FAFAFA] pb-20">
      <header className="border-b border-[#27272A] bg-[#09090B] sticky top-0 z-10">
        <div className="max-w-[800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-[14px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[800px] mx-auto px-6 pt-12">
        <h1 className="text-[28px] font-bold text-[#FAFAFA] mb-8 tracking-tight">Settings</h1>

        <div className="space-y-8">
          {/* Account Information */}
          <section>
            <h2 className="text-[16px] font-semibold text-[#FAFAFA] mb-4 flex items-center gap-2">
              <User size={18} className="text-[#A1A1AA]" />
              Account Information
            </h2>
            <div className="bg-[#111113] border border-[#27272A] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#27272A]">
                <div>
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Email Address</p>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Log out</p>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">Sign out of your account on this device.</p>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 bg-[#27272A] hover:bg-[#3f3f46] text-[#FAFAFA] text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2">
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section>
            <h2 className="text-[16px] font-semibold text-[#FAFAFA] mb-4 flex items-center gap-2">
              <Monitor size={18} className="text-[#A1A1AA]" />
              Preferences
            </h2>
            <div className="bg-[#111113] border border-[#27272A] rounded-xl p-5 space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Theme</p>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">Select your preferred application theme.</p>
                </div>
                <div className="flex bg-[#09090B] border border-[#27272A] rounded-lg p-1">
                  <button 
                    onClick={() => setTheme("light")} 
                    className={`p-2 rounded-md transition-colors ${theme === 'light' ? 'bg-[#27272A] text-white' : 'text-[#A1A1AA] hover:text-white'}`}
                    title="Light mode"
                  >
                    <Sun size={16} />
                  </button>
                  <button 
                    onClick={() => setTheme("dark")} 
                    className={`p-2 rounded-md transition-colors ${theme === 'dark' ? 'bg-[#27272A] text-white' : 'text-[#A1A1AA] hover:text-white'}`}
                    title="Dark mode"
                  >
                    <Moon size={16} />
                  </button>
                  <button 
                    onClick={() => setTheme("system")} 
                    className={`p-2 rounded-md transition-colors ${theme === 'system' ? 'bg-[#27272A] text-white' : 'text-[#A1A1AA] hover:text-white'}`}
                    title="System theme"
                  >
                    <Monitor size={16} />
                  </button>
                </div>
              </div>

              <div className="pt-6 border-t border-[#27272A] flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Preferred AI Model</p>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">The model used for answering repository questions.</p>
                </div>
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#09090B] border border-[#27272A] text-[#A1A1AA] text-[13px] font-medium rounded-lg opacity-80 cursor-not-allowed">
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
            <div className="bg-[#111113] border border-red-500/20 rounded-xl p-5 space-y-6">
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Clear Chat History</p>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">Permanently delete all chat sessions across all repositories.</p>
                </div>
                <button 
                  onClick={handleClearHistory} 
                  className="px-4 py-2 border border-[#27272A] hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-500 text-[#FAFAFA] text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Clear History
                </button>
              </div>

              <div className="pt-6 border-t border-red-500/20 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[#FAFAFA]">Delete Account</p>
                  <p className="text-[13px] text-[#A1A1AA] mt-1">Permanently delete your account and all associated data.</p>
                </div>
                <button 
                  onClick={handleDeleteAccount} 
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Delete Account
                </button>
              </div>

            </div>
          </section>

          <div className="pt-8 text-center">
            <p className="text-[12px] text-[#52525b]">CodeBase AI • Version 0.1.0 (Production Build)</p>
          </div>

        </div>
      </main>
    </div>
  );
}
