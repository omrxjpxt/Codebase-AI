"use client";

import { useEffect, useState } from "react";
import AppSidebar from "@/components/layout/AppSidebar";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "getting-started", label: "Getting Started" },
  { id: "uploading", label: "Uploading a Repository" },
  { id: "ai-chat", label: "AI Chat" },
  { id: "code-search", label: "Code Search" },
  { id: "keyboard-shortcuts", label: "Keyboard Shortcuts" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setIsMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
      <AppSidebar />
      
      <div className="flex-1 flex flex-col ml-14 overflow-hidden relative">
        {/* Header */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-[#27272A] bg-[#09090B]/80 backdrop-blur-sm flex-shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard"
              className="flex items-center gap-2 text-[13px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
            
            <div className="h-4 w-px bg-[#27272A] hidden sm:block" />
            
            <div className="hidden sm:flex items-center gap-2 text-[13px]">
              <Link href="/dashboard" className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors">
                Dashboard
              </Link>
              <ChevronRight size={14} className="text-[#52525b]" />
              <span className="text-[#FAFAFA]">Documentation</span>
            </div>
          </div>
          
          <button 
            className="sm:hidden text-[#A1A1AA] hover:text-[#FAFAFA]"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto flex relative">
          
          {/* Mobile Navigation Dropdown */}
          {isMobileMenuOpen && (
            <div className="absolute inset-x-0 top-0 bg-[#111113] border-b border-[#27272A] z-10 sm:hidden flex flex-col p-4 shadow-xl">
              <span className="text-[11px] font-semibold text-[#52525b] uppercase tracking-widest mb-3 px-2">
                Contents
              </span>
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "text-left px-3 py-2 text-[13px] rounded-[6px] transition-colors",
                    activeSection === section.id 
                      ? "text-[#FAFAFA] bg-[#1a1a1d] font-medium" 
                      : "text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1a1a1d]/50"
                  )}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}

          {/* Sidebar TOC (Desktop) */}
          <aside className="hidden sm:block w-64 border-r border-[#27272A] bg-[#09090B] flex-shrink-0 overflow-y-auto p-6">
            <div className="sticky top-0 pt-4">
              <span className="text-[11px] font-semibold text-[#52525b] uppercase tracking-widest block mb-4">
                Contents
              </span>
              <nav className="flex flex-col gap-1">
                {SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className={cn(
                      "text-left px-3 py-2 text-[13px] rounded-[6px] transition-colors",
                      activeSection === section.id 
                        ? "text-[#FAFAFA] bg-[#1a1a1d] font-medium" 
                        : "text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#1a1a1d]/50"
                    )}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto px-6 py-10 sm:p-12 lg:px-20">
            <div className="max-w-3xl mx-auto pb-32">
              <div className="mb-12">
                <h1 className="text-[32px] sm:text-[40px] font-bold text-[#FAFAFA] tracking-tight leading-tight mb-4">
                  Documentation
                </h1>
                <p className="text-[16px] text-[#A1A1AA] leading-relaxed">
                  Everything you need to understand and use CodeBase AI to navigate, search, and analyze your repositories.
                </p>
              </div>

              {/* Sections */}
              <div className="space-y-20">
                
                <section id="getting-started" className="scroll-mt-24">
                  <h2 className="text-[24px] font-semibold text-[#FAFAFA] mb-6 tracking-tight">Getting Started</h2>
                  <div className="text-[15px] text-[#A1A1AA] space-y-4 leading-relaxed">
                    <p>Welcome to CodeBase AI. Follow these steps to begin analyzing your codebase:</p>
                    <ol className="list-decimal pl-5 space-y-3">
                      <li><strong>Navigate to your Dashboard.</strong> This is your central hub for all repositories and chats.</li>
                      <li><strong>Upload a repository.</strong> Click the "Upload" button and provide a ZIP file containing your codebase.</li>
                      <li><strong>Wait for indexing.</strong> The platform will extract, chunk, and embed your code for semantic search.</li>
                      <li><strong>Open the repository.</strong> Click on the repository card to view its files, chunks, and initiate AI chats.</li>
                      <li><strong>Start asking questions.</strong> Use the Ask AI feature to understand architecture, flows, and dependencies.</li>
                    </ol>
                  </div>
                </section>

                <section id="uploading" className="scroll-mt-24">
                  <h2 className="text-[24px] font-semibold text-[#FAFAFA] mb-6 tracking-tight">Uploading a Repository</h2>
                  <div className="text-[15px] text-[#A1A1AA] space-y-4 leading-relaxed">
                    <p>
                      Repositories must be uploaded as a <strong>ZIP archive</strong>. 
                      CodeBase AI currently enforces a maximum upload size based on your server configuration (default 50MB).
                    </p>
                    <div className="p-4 bg-[#111113] border border-[#27272A] rounded-[8px] my-6">
                      <h4 className="text-[14px] font-medium text-[#FAFAFA] mb-2">Indexing Process</h4>
                      <ul className="list-disc pl-5 space-y-2 text-[14px]">
                        <li><strong>Extraction:</strong> The ZIP is unzipped and standard text/code files are read. Binary files and media are automatically ignored.</li>
                        <li><strong>Chunking:</strong> Large files are broken into semantic chunks to optimize context windows for the AI.</li>
                        <li><strong>Embedding:</strong> Chunks are converted into vector embeddings using the configured embedding model for semantic retrieval.</li>
                      </ul>
                    </div>
                    <p>
                      If indexing fails (e.g., due to an unreadable archive or API failure), the repository card will show a red "Failed" status. You can delete it and try again.
                    </p>
                  </div>
                </section>

                <section id="ai-chat" className="scroll-mt-24">
                  <h2 className="text-[24px] font-semibold text-[#FAFAFA] mb-6 tracking-tight">AI Chat</h2>
                  <div className="text-[15px] text-[#A1A1AA] space-y-4 leading-relaxed">
                    <p>
                      The AI Chat is contextually aware of your uploaded repository. When you ask a question, CodeBase AI performs a semantic search across your codebase and provides the most relevant files to the LLM.
                    </p>
                    <p className="mb-2">Example queries you can try:</p>
                    <div className="grid gap-3">
                      <div className="p-3 bg-[#111113] border border-[#27272A] rounded-[8px] text-[14px] text-[#FAFAFA]">
                        "How does authentication work in this app?"
                      </div>
                      <div className="p-3 bg-[#111113] border border-[#27272A] rounded-[8px] text-[14px] text-[#FAFAFA]">
                        "Where is the database connection configured?"
                      </div>
                      <div className="p-3 bg-[#111113] border border-[#27272A] rounded-[8px] text-[14px] text-[#FAFAFA]">
                        "Explain the investment calculation logic in utils.ts."
                      </div>
                    </div>
                  </div>
                </section>

                <section id="code-search" className="scroll-mt-24">
                  <h2 className="text-[24px] font-semibold text-[#FAFAFA] mb-6 tracking-tight">Code Search</h2>
                  <div className="text-[15px] text-[#A1A1AA] space-y-4 leading-relaxed">
                    <p>
                      CodeBase AI includes a global command palette that allows you to instantly search across all your resources.
                    </p>
                    <p>The global search currently indexes:</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Repositories:</strong> By repository name.</li>
                      <li><strong>Files:</strong> By file path or filename.</li>
                      <li><strong>Code Snippets:</strong> Deep text search across indexed file chunks.</li>
                      <li><strong>Chat Sessions:</strong> By the title of your previous conversations.</li>
                    </ul>
                    <p>
                      Clicking any result will immediately route you to that repository or specific chat session.
                    </p>
                  </div>
                </section>

                <section id="keyboard-shortcuts" className="scroll-mt-24">
                  <h2 className="text-[24px] font-semibold text-[#FAFAFA] mb-6 tracking-tight">Keyboard Shortcuts</h2>
                  <div className="text-[15px] text-[#A1A1AA] space-y-4 leading-relaxed">
                    <p>CodeBase AI supports several keyboard shortcuts to improve your workflow:</p>
                    
                    <div className="border border-[#27272A] rounded-[8px] overflow-hidden mt-6">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#111113] border-b border-[#27272A]">
                            <th className="px-4 py-3 text-[13px] font-medium text-[#FAFAFA]">Action</th>
                            <th className="px-4 py-3 text-[13px] font-medium text-[#FAFAFA]">Shortcut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#27272A]">
                          <tr>
                            <td className="px-4 py-3 text-[13px] text-[#A1A1AA] border-b border-[#27272A]">Open Global Search</td>
                            <td className="px-4 py-3 border-b border-[#27272A]">
                              <div className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#3f3f46] text-[11px] text-[#FAFAFA] font-mono">⌘</kbd>
                                <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#3f3f46] text-[11px] text-[#FAFAFA] font-mono">K</kbd>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-[13px] text-[#A1A1AA] border-b border-[#27272A]">Close Modals</td>
                            <td className="px-4 py-3 border-b border-[#27272A]">
                              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#3f3f46] text-[11px] text-[#FAFAFA] font-mono">Esc</kbd>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-[13px] text-[#A1A1AA] border-b border-[#27272A]">Navigate Search Results</td>
                            <td className="px-4 py-3 border-b border-[#27272A]">
                              <div className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#3f3f46] text-[11px] text-[#FAFAFA] font-mono">↑</kbd>
                                <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#3f3f46] text-[11px] text-[#FAFAFA] font-mono">↓</kbd>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-3 text-[13px] text-[#A1A1AA]">Select Search Result</td>
                            <td className="px-4 py-3">
                              <kbd className="px-1.5 py-0.5 rounded-[4px] bg-[#1a1a1d] border border-[#3f3f46] text-[11px] text-[#FAFAFA] font-mono">Enter</kbd>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>

                <section id="troubleshooting" className="scroll-mt-24">
                  <h2 className="text-[24px] font-semibold text-[#FAFAFA] mb-6 tracking-tight">Troubleshooting</h2>
                  <div className="text-[15px] text-[#A1A1AA] space-y-6 leading-relaxed">
                    
                    <div>
                      <h4 className="text-[15px] font-medium text-[#FAFAFA] mb-2">Repository indexing failed</h4>
                      <p>
                        This usually occurs if the ZIP file is corrupted, empty, or contains primarily binary assets. 
                        Ensure you are uploading a valid source code archive. If using GitHub import, ensure the repository is public.
                      </p>
                    </div>

                    <div>
                      <h4 className="text-[15px] font-medium text-[#FAFAFA] mb-2">AI cannot answer my question</h4>
                      <p>
                        The AI relies on the semantic chunks retrieved from your codebase. If your question is too broad 
                        or uses terminology completely foreign to the codebase, the retrieval step might fail to find relevant files. 
                        Try referencing specific file names or function names if you know them.
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="text-[15px] font-medium text-[#FAFAFA] mb-2">Authentication expired</h4>
                      <p>
                        CodeBase AI uses secure HttpOnly cookies. If your session expires, the dashboard will automatically 
                        redirect you to the login screen. You will not lose your uploaded repositories or chat history.
                      </p>
                    </div>

                  </div>
                </section>

              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
