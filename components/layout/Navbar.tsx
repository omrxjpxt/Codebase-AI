"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#27272A] bg-[#09090B]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 bg-[#FAFAFA] rounded-[6px] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="1" fill="#09090B" />
              <rect x="8" y="1" width="5" height="5" rx="1" fill="#09090B" />
              <rect x="1" y="8" width="5" height="5" rx="1" fill="#09090B" />
              <rect x="8" y="8" width="5" height="5" rx="1" fill="#09090B" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#FAFAFA]">
            CodeBase AI
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-7">
          <Link
            href="#features"
            className="text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            Features
          </Link>
          <Link
            href="#pricing"
            className="text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="#docs"
            className="text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            Documentation
          </Link>
        </div>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors px-3 py-1.5"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="text-[13px] font-medium bg-[#FAFAFA] text-[#09090B] px-4 py-1.5 rounded-[8px] hover:bg-white transition-colors"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-[#A1A1AA]"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#27272A] bg-[#09090B] px-6 py-4 flex flex-col gap-4">
          <Link href="#features" className="text-[13px] text-[#A1A1AA]">Features</Link>
          <Link href="#pricing" className="text-[13px] text-[#A1A1AA]">Pricing</Link>
          <Link href="#docs" className="text-[13px] text-[#A1A1AA]">Documentation</Link>
          <hr className="border-[#27272A]" />
          <Link href="/login" className="text-[13px] text-[#A1A1AA]">Login</Link>
          <Link href="/signup" className="text-[13px] font-medium bg-[#FAFAFA] text-[#09090B] px-4 py-2 rounded-[8px] text-center">
            Get Started
          </Link>
        </div>
      )}
    </nav>
  );
}
