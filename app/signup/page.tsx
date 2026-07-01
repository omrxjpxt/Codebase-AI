"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Github } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrorMsg(""); // Clear errors when typing
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    // Validations
    if (!form.email) {
      setErrorMsg("Email is required.");
      return;
    }
    if (form.password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }
    if (form.password !== form.confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    if (!agreed) {
      setErrorMsg("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Registration failed. Please try again.");
      }

      setSuccessMsg("Registration successful! Redirecting...");
      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col">
      {/* Top nav */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-[#27272A]">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#111113] border border-[#27272A] rounded-[6px] flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold text-[#FAFAFA]">CodeBase AI</span>
        </Link>
        <Link
          href="/login"
          className="text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
        >
          Sign In
        </Link>
      </header>

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-[40px] font-bold text-[#FAFAFA] leading-tight mb-2">
            Create Your<br />Workspace
          </h1>
          <p className="text-[14px] text-[#A1A1AA] leading-relaxed">
            Upload repositories, ask questions, and<br />understand code faster.
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-[420px] bg-[#111113] border border-[#27272A] rounded-[14px] p-7">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {errorMsg && (
              <div className="p-3 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-500 text-[13px]">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-[10px] bg-green-500/10 border border-green-500/20 text-green-500 text-[13px]">
                {successMsg}
              </div>
            )}

            {/* Full Name */}
            <div>
              <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-widest mb-2">
                Full Name
              </label>
              <input
                id="fullname"
                type="text"
                value={form.name}
                onChange={update("name")}
                placeholder="Linus Torvalds"
                className="w-full bg-[#09090B] border border-[#27272A] rounded-[10px] px-4 py-3 text-[14px] text-[#FAFAFA] placeholder:text-[#3f3f46] focus:outline-none focus:border-[#52525b] transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-widest mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="name@company.com"
                className="w-full bg-[#09090B] border border-[#27272A] rounded-[10px] px-4 py-3 text-[14px] text-[#FAFAFA] placeholder:text-[#3f3f46] focus:outline-none focus:border-[#52525b] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-widest mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={update("password")}
                  placeholder="••••••••"
                  className="w-full bg-[#09090B] border border-[#27272A] rounded-[10px] px-4 py-3 pr-11 text-[14px] text-[#FAFAFA] placeholder:text-[#3f3f46] focus:outline-none focus:border-[#52525b] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#A1A1AA] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-widest mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={form.confirm}
                  onChange={update("confirm")}
                  placeholder="••••••••"
                  className="w-full bg-[#09090B] border border-[#27272A] rounded-[10px] px-4 py-3 pr-11 text-[14px] text-[#FAFAFA] placeholder:text-[#3f3f46] focus:outline-none focus:border-[#52525b] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525b] hover:text-[#A1A1AA] transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2.5 pt-1">
              <div
                onClick={() => setAgreed(!agreed)}
                className={`w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer flex-shrink-0 mt-0.5 transition-all ${
                  agreed
                    ? "bg-[#FAFAFA] border-[#FAFAFA]"
                    : "border-[#27272A] hover:border-[#52525b]"
                }`}
              >
                {agreed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#09090B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-[13px] text-[#A1A1AA] leading-snug">
                I agree to the{" "}
                <Link href="#" className="text-[#FAFAFA] hover:underline">Terms of Service</Link>{" "}
                and{" "}
                <Link href="#" className="text-[#FAFAFA] hover:underline">Privacy Policy</Link>
              </span>
            </div>

            {/* Create Account */}
            <button
              type="submit"
              id="create-account-btn"
              disabled={isLoading}
              className={`w-full py-3 rounded-[10px] bg-[#FAFAFA] text-[#09090B] text-[14px] font-semibold transition-all mt-1 flex items-center justify-center gap-2 ${
                isLoading ? "opacity-70 cursor-not-allowed" : "hover:bg-white"
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-[#09090B]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#27272A]" />
            <span className="text-[11px] text-[#52525b] tracking-widest uppercase">or</span>
            <div className="flex-1 h-px bg-[#27272A]" />
          </div>

          {/* GitHub */}
          <button
            id="github-signup-btn"
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-[10px] border border-[#27272A] text-[14px] text-[#FAFAFA] font-medium hover:bg-[#1a1a1d] hover:border-[#3f3f46] transition-all"
          >
            <Github size={18} />
            Continue with GitHub
          </button>

          {/* Footer link */}
          <p className="mt-5 text-center text-[13px] text-[#A1A1AA]">
            Already have an account?{" "}
            <Link href="/login" className="text-[#FAFAFA] font-semibold hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* Page footer */}
      <div className="border-t border-[#27272A] py-5 px-6">
        <div className="max-w-lg mx-auto flex items-center justify-between flex-wrap gap-4">
          <Link href="/" className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-[#111113] border border-[#27272A] rounded-[4px] flex items-center justify-center">
              <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
              </svg>
            </div>
            <span className="text-[12px] text-[#52525b]">CodeBase AI</span>
          </Link>
          <div className="flex items-center gap-5">
            {["Privacy Policy", "Terms of Service", "Security", "Status"].map((l) => (
              <Link key={l} href="#" className="text-[12px] text-[#52525b] hover:text-[#A1A1AA] transition-colors">
                {l}
              </Link>
            ))}
          </div>
          <span className="text-[12px] text-[#52525b]">© 2024 CodeBase AI. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
