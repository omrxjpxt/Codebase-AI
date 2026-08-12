"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Github, AlertTriangle } from "lucide-react";
import { API_BASE_URL, fetchApi, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/dashboard");
    } else {
      fetchApi("/auth/me")
        .then(() => router.push("/dashboard"))
        .catch((error) => {
          if (error instanceof ApiError && error.status === 401) {
            // Normal unauthenticated state
            setIsCheckingAuth(false);
          } else {
            // Actual 500 or network error
            setErrorMsg(
              error.message === "Failed to fetch" || !error.status
                ? "Cannot connect to server. Please ensure the backend is running."
                : "An unexpected error occurred while checking authentication."
            );
            setIsCheckingAuth(false);
          }
        });
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Invalid email or password.");
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
        router.push("/dashboard");
      } else {
        throw new Error("No access token received.");
      }
    } catch (error: any) {
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--spinner-head)] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      {/* Top logo */}
      <div className="flex justify-center pt-10">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[var(--btn-primary-bg)] rounded-[6px] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#09090B" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="#09090B" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="#09090B" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="#09090B" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold text-[var(--primary-text)]">CodeBase AI</span>
        </Link>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Heading */}
        <div className="text-center mb-8">
          <h1 className="text-[36px] font-bold text-[var(--primary-text)] leading-tight mb-2">
            Welcome Back
          </h1>
          <p className="text-[14px] text-[var(--secondary-text)] leading-relaxed">
            Sign in to continue exploring your repositories.
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-[420px] bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-7">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {errorMsg && (
              <div className="p-3 rounded-[10px] bg-red-500/10 border border-red-500/20 text-red-500 text-[13px]">
                {errorMsg}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--secondary-text)] uppercase tracking-widest mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-[10px] px-4 py-3 text-[14px] text-[var(--primary-text)] placeholder:text-[var(--placeholder-text)] focus:outline-none focus:border-[var(--input-focus-border)] transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[11px] font-semibold text-[var(--secondary-text)] uppercase tracking-widest">
                  Password
                </label>
                <Link
                  href="#"
                  className="text-[12px] text-[var(--secondary-text)] hover:text-[var(--primary-text)] transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-[10px] px-4 py-3 pr-11 text-[14px] text-[var(--primary-text)] placeholder:text-[var(--placeholder-text)] focus:outline-none focus:border-[var(--input-focus-border)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)] hover:text-[var(--secondary-text)] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2.5">
              <div
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer transition-all ${
                  rememberMe
                    ? "bg-[var(--btn-primary-bg)] border-[var(--btn-primary-bg)]"
                    : "border-[var(--border)] hover:border-[var(--border-hover)]"
                }`}
              >
                {rememberMe && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#09090B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-[13px] text-[var(--secondary-text)]">Remember me for 30 days</span>
            </div>

            {/* Sign In */}
            <button
              type="submit"
              id="signin-btn"
              disabled={isLoading}
              className={`w-full py-3 rounded-[10px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-[14px] font-semibold transition-all flex items-center justify-center gap-2 ${
                isLoading ? "opacity-70 cursor-not-allowed" : "hover:bg-white"
              }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-[var(--btn-primary-text)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-[11px] text-[var(--muted-text)] tracking-widest uppercase">or</span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* GitHub */}
          <Link
            href={`${API_BASE_URL}/auth/github/login`}
            id="github-signin-btn"
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-[10px] border border-[var(--border)] text-[14px] text-[var(--primary-text)] font-medium hover:bg-[var(--surface-hover)] hover:border-[var(--border-hover)] transition-all"
          >
            <Github size={18} />
            Continue with GitHub
          </Link>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-[13px] text-[var(--secondary-text)]">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-[var(--primary-text)] font-semibold hover:underline">
            Create Account
          </Link>
        </p>
      </div>

      {/* Page footer */}
      <div className="border-t border-[var(--border)] py-5 px-6">
        <div className="max-w-lg mx-auto flex items-center justify-center gap-6 flex-wrap">
          {["Terms", "Privacy", "Security", "Docs"].map((l) => (
            <Link key={l} href="#" className="text-[12px] text-[var(--muted-text)] hover:text-[var(--secondary-text)] transition-colors">
              {l}
            </Link>
          ))}
          <span className="text-[12px] text-[var(--muted-text)]">© 2024 CodeBase AI. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
