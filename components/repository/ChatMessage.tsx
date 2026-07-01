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
              {message.sources.map((source, sIdx) => (
                <SourcePill key={sIdx} source={source} onClick={onSourceClick} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
