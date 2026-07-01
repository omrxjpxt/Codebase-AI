"use client";

import { ChatMessageType } from "@/lib/api";
import SourcePill from "./SourcePill";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
  onSourceClick?: (source: any) => void;
}

function renderContent(text: string): React.ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-[#FAFAFA]">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function ChatMessage({ message, onSourceClick }: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex items-start gap-3 animate-fade-in">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-[#27272A] border border-[#3f3f46] flex items-center justify-center text-[11px] font-medium text-[#A1A1AA] flex-shrink-0 mt-0.5">
          O
        </div>
        <div>
          <p className="text-[12px] text-[#52525b] mb-1 font-medium">You</p>
          <h2 className="text-[22px] font-semibold text-[#FAFAFA] leading-tight">
            {message.content}
          </h2>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-3 animate-slide-up">
      {/* AI Avatar */}
      <div className="w-7 h-7 rounded-[6px] bg-[#111113] border border-[#27272A] flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
          <rect x="8" y="1" width="5" height="5" rx="1" fill="#FAFAFA" />
          <rect x="1" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
          <rect x="8" y="8" width="5" height="5" rx="1" fill="#FAFAFA" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[#52525b] mb-3 font-medium">CodeBase AI</p>

        {/* Sections */}
        {message.sections?.map((section, idx) => (
          <div key={idx} className={cn("mb-6", idx > 0 && "")}>
            <p className="text-[11px] uppercase tracking-widest text-[#52525b] mb-2 font-medium">
              {section.title}
            </p>

            {section.content && (
              <p className="text-[14px] text-[#e4e4e7] leading-relaxed">
                {renderContent(section.content)}
              </p>
            )}

            {section.items && (
              <ul className="space-y-3 mt-2">
                {section.items.map((item, iIdx) => (
                  <li key={iIdx} className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#3f3f46] flex-shrink-0 mt-2" />
                    <span className="text-[14px] text-[#e4e4e7] leading-relaxed">
                      {renderContent(item)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {/* Fallback content if no sections */}
        {!message.sections && (
          <p className="text-[14px] text-[#e4e4e7] leading-relaxed">
            {renderContent(message.content)}
          </p>
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-widest text-[#52525b] mb-2.5 font-medium">
              Key Files
            </p>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((src, i) => (
                <SourcePill 
                  key={i} 
                  source={src} 
                  onClick={onSourceClick}
                />
              ))}
            </div>
          </div>
        )}
        
        {/* Export Actions */}
        <div className="mt-6 flex items-center gap-3 border-t border-[#27272A] pt-4">
          <button 
            onClick={() => {
              navigator.clipboard.writeText(message.content);
              import('sonner').then(m => m.toast.success("Copied to clipboard"));
            }}
            className="flex items-center gap-1.5 text-[12px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy Text
          </button>
          
          <button 
            onClick={() => {
              const blob = new Blob([message.content], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `chat-${message.id.slice(0, 8)}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex items-center gap-1.5 text-[12px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export MD
          </button>
          
          <button 
            onClick={async () => {
              try {
                import('sonner').then(m => m.toast.info("Generating PDF..."));
                const html2pdf = (await import('html2pdf.js')).default;
                
                // Create a temporary container for formatting
                const container = document.createElement('div');
                container.style.padding = '20px';
                container.style.fontFamily = 'sans-serif';
                container.style.color = '#000';
                container.style.backgroundColor = '#fff';
                
                // Replace basic markdown for PDF (bold and code)
                let formattedText = message.content
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/`(.*?)`/g, '<code style="background:#f4f4f5;padding:2px 4px;border-radius:4px;font-family:monospace;">$1</code>')
                  .replace(/\n/g, '<br/>');
                  
                container.innerHTML = `
                  <h2 style="margin-bottom: 20px; font-size: 18px;">CodeBase AI - Chat Export</h2>
                  <div style="font-size: 14px; line-height: 1.6;">${formattedText}</div>
                `;
                
                const opt = {
                  margin:       0.5,
                  filename:     `chat-${message.id.slice(0, 8)}.pdf`,
                  image:        { type: 'jpeg', quality: 0.98 },
                  html2canvas:  { scale: 2 },
                  jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
                };
                
                html2pdf().set(opt).from(container).save().then(() => {
                  import('sonner').then(m => m.toast.success("PDF exported successfully"));
                });
              } catch (e) {
                console.error(e);
                import('sonner').then(m => m.toast.error("Failed to generate PDF"));
              }
            }}
            className="flex items-center gap-1.5 text-[12px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}
