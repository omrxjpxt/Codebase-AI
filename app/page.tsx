import Link from "next/link";
import Navbar from "@/components/layout/Navbar";
import StatCard from "@/components/ui/StatCard";
import FeatureCard from "@/components/ui/FeatureCard";
import {
  landingStats,
  landingFeatures,
  workflowSteps,
} from "@/lib/mock-data";
import { ArrowRight, Upload, Check } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090B]">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-20 px-6 text-center max-w-5xl mx-auto">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#27272A] bg-[#111113] text-[12px] text-[#A1A1AA] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Now in public beta — free for developers
        </div>

        <h1 className="text-[52px] md:text-[72px] font-bold text-[#FAFAFA] leading-[1.05] tracking-tight mb-6">
          Understand Any Codebase<br className="hidden md:block" /> in Minutes.
        </h1>
        <p className="text-[17px] md:text-[19px] text-[#A1A1AA] leading-relaxed max-w-2xl mx-auto mb-10">
          Upload a repository and ask questions in plain English.
          Instantly discover architecture, authentication flows,
          database schemas and implementation details.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-[10px] bg-[#FAFAFA] text-[#09090B] text-[14px] font-semibold hover:bg-white transition-all"
          >
            Start Free
            <ArrowRight size={15} />
          </Link>
          <Link
            href="#demo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-[10px] border border-[#27272A] text-[#A1A1AA] text-[14px] font-medium hover:text-[#FAFAFA] hover:border-[#3f3f46] transition-all"
          >
            View Demo
          </Link>
        </div>
      </section>

      {/* ── Product Preview ── */}
      <section id="demo" className="px-6 pb-24 max-w-5xl mx-auto">
        <div className="rounded-[16px] border border-[#27272A] bg-[#111113] overflow-hidden">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#27272A]">
            <div className="w-3 h-3 rounded-full bg-[#27272A]" />
            <div className="w-3 h-3 rounded-full bg-[#27272A]" />
            <div className="w-3 h-3 rounded-full bg-[#27272A]" />
            <div className="ml-4 flex-1 h-6 rounded-[6px] bg-[#1a1a1d] border border-[#27272A] flex items-center px-3">
              <span className="text-[11px] text-[#52525b]">app.codebase.ai / SmartSpend AI / chat</span>
            </div>
          </div>

          {/* App mockup */}
          <div className="flex h-[400px]">
            {/* Left sidebar mockup */}
            <div className="w-[180px] border-r border-[#27272A] flex flex-col p-3 gap-1 flex-shrink-0">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                <div className="w-4 h-4 rounded-[3px] bg-[#1a1a1d] border border-[#27272A]" />
                <span className="text-[11px] text-[#52525b]">smartspend-ai</span>
              </div>
              {[
                { label: "AI Chat", active: true },
                { label: "Files Explorer", active: false },
                { label: "Architecture", active: false },
                { label: "Settings", active: false },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-[6px] ${
                    item.active ? "bg-[#1a1a1d]" : ""
                  }`}
                >
                  <div className={`w-3 h-3 rounded-[2px] ${item.active ? "bg-[#3f3f46]" : "bg-[#27272A]"}`} />
                  <span className={`text-[11px] ${item.active ? "text-[#FAFAFA]" : "text-[#52525b]"}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Chat area */}
            <div className="flex-1 flex flex-col p-6 overflow-hidden">
              {/* User message */}
              <div className="flex items-center gap-2 mb-5">
                <div className="w-5 h-5 rounded-full bg-[#27272A]" />
                <div>
                  <div className="text-[10px] text-[#52525b] mb-0.5">You</div>
                  <div className="text-[18px] font-semibold text-[#FAFAFA]">
                    How does authentication work?
                  </div>
                </div>
              </div>

              {/* AI response */}
              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-[4px] bg-[#1a1a1d] border border-[#27272A] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-[#52525b] mb-2">CodeBase AI</div>
                  <div className="text-[10px] text-[#52525b] uppercase tracking-widest mb-1.5">Overview</div>
                  <p className="text-[13px] text-[#e4e4e7] leading-relaxed mb-4">
                    Authentication is implemented using{" "}
                    <span className="font-semibold text-[#FAFAFA]">JWT (JSON Web Tokens)</span>{" "}
                    to ensure stateless security across the service.
                  </p>

                  <div className="text-[10px] text-[#52525b] uppercase tracking-widest mb-1.5">Implementation Flow</div>
                  <div className="space-y-1.5 mb-4">
                    {[
                      "The login flow starts in auth.py",
                      "JWT generation occurs in jwt_service.py using HS256",
                      "Protected routes are validated in middleware.py",
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-[#3f3f46] mt-1.5 flex-shrink-0" />
                        <span className="text-[12px] text-[#e4e4e7]">{item}</span>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-[#52525b] uppercase tracking-widest mb-1.5">Key Files</div>
                  <div className="flex gap-2">
                    {["auth.py", "jwt_service.py", "middleware.py"].map((f) => (
                      <div
                        key={f}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-[6px] bg-[#1a1a1d] border border-[#27272A] text-[11px] font-mono text-[#A1A1AA]"
                      >
                        <div className="w-2 h-2 rounded-[1px] bg-[#27272A]" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar mockup */}
            <div className="w-[180px] border-l border-[#27272A] p-4 flex-shrink-0 hidden lg:block">
              <div className="text-[10px] text-[#52525b] uppercase tracking-widest mb-3">Repository Context</div>
              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#52525b]">Files</span>
                  <span className="text-[#A1A1AA]">142</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#52525b]">Languages</span>
                  <span className="text-[#A1A1AA]">Python, TS</span>
                </div>
              </div>
            </div>
          </div>

          {/* Input bar */}
          <div className="border-t border-[#27272A] p-4">
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-[10px] bg-[#1a1a1d] border border-[#27272A]">
              <span className="text-[13px] text-[#52525b] flex-1">
                Ask anything about this repository...
              </span>
              <div className="w-6 h-6 rounded-[6px] bg-[#27272A] flex items-center justify-center">
                <ArrowRight size={12} className="text-[#52525b]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 px-6 border-y border-[#27272A]">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-8 md:gap-12">
          {landingStats.map((stat) => (
            <StatCard key={stat.label} value={stat.value} label={stat.label} />
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[13px] text-[#A1A1AA] uppercase tracking-widest mb-3 font-medium">
            Deep insights for deep thinkers.
          </p>
          <h2 className="text-[36px] md:text-[44px] font-bold text-[#FAFAFA] leading-tight tracking-tight">
            Skip the documentation and jump straight to the logic with code file and repo exploration.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {landingFeatures.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      {/* ── Workflow ── */}
      <section className="py-24 px-6 border-t border-[#27272A]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-[32px] md:text-[40px] font-bold text-[#FAFAFA] tracking-tight leading-tight">
              Built for the modern development workflow.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Steps */}
            <div className="space-y-8">
              {workflowSteps.map((step) => (
                <div key={step.step} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full border border-[#27272A] bg-[#111113] flex items-center justify-center text-[12px] font-semibold text-[#A1A1AA] flex-shrink-0 mt-0.5">
                    {step.step}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-[#FAFAFA] mb-1">
                      {step.title}
                    </h3>
                    <p className="text-[13px] text-[#A1A1AA] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview card */}
            <div className="hidden md:block rounded-[14px] border border-[#27272A] bg-[#111113] p-6">
              <div className="space-y-3">
                {[
                  "Repository uploaded successfully",
                  "Processing 142 files...",
                  "Vector index created",
                  "Ready to answer questions",
                ].map((line, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#1a1a1d] border border-[#27272A] flex items-center justify-center">
                      {i < 4 ? (
                        <Check size={10} className="text-emerald-400" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-[#27272A]" />
                      )}
                    </div>
                    <span className="text-[13px] text-[#A1A1AA]">{line}</span>
                  </div>
                ))}
                <div className="mt-6 p-3 rounded-[8px] bg-[#1a1a1d] border border-[#27272A]">
                  <p className="text-[12px] text-[#52525b] mb-1.5">How does auth work?</p>
                  <p className="text-[12px] text-[#e4e4e7] leading-relaxed">
                    Authentication uses JWT tokens issued from{" "}
                    <code>auth.py</code> and validated in{" "}
                    <code>middleware.py</code>...
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-6 border-t border-[#27272A]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-[40px] md:text-[52px] font-bold text-[#FAFAFA] tracking-tight leading-tight mb-5">
            Ready to Understand Any Codebase?
          </h2>
          <p className="text-[16px] text-[#A1A1AA] mb-10 leading-relaxed">
            Stop searching through hundreds of files. Let AI explain your code, in thousands of
            developer-saving hours of exploration time every week.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[10px] bg-[#FAFAFA] text-[#09090B] text-[14px] font-semibold hover:bg-white transition-all"
            >
              Get Started Free
              <ArrowRight size={15} />
            </Link>
            <Link
              href="#"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-[10px] border border-[#27272A] text-[#A1A1AA] text-[14px] font-medium hover:text-[#FAFAFA] hover:border-[#3f3f46] transition-all"
            >
              Schedule a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-[#27272A] py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 bg-[#FAFAFA] rounded-[5px] flex items-center justify-center">
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <rect x="1" y="1" width="5" height="5" rx="1" fill="#09090B" />
                    <rect x="8" y="1" width="5" height="5" rx="1" fill="#09090B" />
                    <rect x="1" y="8" width="5" height="5" rx="1" fill="#09090B" />
                    <rect x="8" y="8" width="5" height="5" rx="1" fill="#09090B" />
                  </svg>
                </div>
                <span className="text-[14px] font-semibold text-[#FAFAFA]">CodeBase AI</span>
              </div>
              <p className="text-[12px] text-[#52525b] leading-relaxed">
                © 2024 CodeBase AI. Built for developers who crave technical excellence.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-[12px] font-semibold text-[#FAFAFA] uppercase tracking-wide mb-3">Product</p>
              <div className="space-y-2">
                {["Documentation", "Pricing", "Send Us"].map((l) => (
                  <Link key={l} href="#" className="block text-[13px] text-[#52525b] hover:text-[#A1A1AA] transition-colors">
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {/* Resources */}
            <div>
              <p className="text-[12px] font-semibold text-[#FAFAFA] uppercase tracking-wide mb-3">Resources</p>
              <div className="space-y-2">
                {["Documentation", "API Reference", "GitHub"].map((l) => (
                  <Link key={l} href="#" className="block text-[13px] text-[#52525b] hover:text-[#A1A1AA] transition-colors">
                    {l}
                  </Link>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <p className="text-[12px] font-semibold text-[#FAFAFA] uppercase tracking-wide mb-3">Legal</p>
              <div className="space-y-2">
                {["Privacy", "Terms", "Contact"].map((l) => (
                  <Link key={l} href="#" className="block text-[13px] text-[#52525b] hover:text-[#A1A1AA] transition-colors">
                    {l}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
