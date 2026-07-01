"use client";

import { useEffect, useState, useRef } from "react";
import { X, Loader2, FileCode2 } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface SourceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositoryId: string;
  fileId: string;
  startLine?: number;
  endLine?: number;
}

interface FileContent {
  filename: string;
  language: string;
  content: string;
}

export default function SourceViewerModal({
  isOpen,
  onClose,
  repositoryId,
  fileId,
  startLine,
  endLine
}: SourceViewerModalProps) {
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && repositoryId && fileId) {
      loadContent();
    } else {
      setFileContent(null);
    }
  }, [isOpen, repositoryId, fileId]);

  const loadContent = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await fetchApi(`/repositories/${repositoryId}/files/${fileId}/content`);
      setFileContent(data);
    } catch (err: any) {
      setError(err.message || "Failed to load file content.");
    } finally {
      setIsLoading(false);
    }
  };

  // Map backend language extensions to SyntaxHighlighter languages
  const mapLanguage = (ext: string) => {
    const map: Record<string, string> = {
      "js": "javascript",
      "jsx": "jsx",
      "ts": "typescript",
      "tsx": "tsx",
      "py": "python",
      "html": "html",
      "css": "css",
      "json": "json",
      "md": "markdown"
    };
    const cleanExt = ext.replace(".", "").toLowerCase();
    return map[cleanExt] || "javascript";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-8">
      <div className="bg-[#09090B] border border-[#27272A] rounded-[12px] w-full max-w-5xl h-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden shadow-black/50">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A] bg-[#111113]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[#27272A]/50 flex items-center justify-center">
              <FileCode2 size={16} className="text-[#A1A1AA]" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-[#FAFAFA]">
                {fileContent?.filename || "Loading..."}
              </h2>
              {startLine && endLine && (
                <p className="text-[12px] text-[#A1A1AA]">
                  Lines {startLine} - {endLine}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-[#09090B] relative p-4" ref={contentRef}>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="animate-spin text-[#52525b]" size={32} />
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <p className="text-red-400 font-medium text-[14px] mb-2">Failed to load source</p>
                <p className="text-[13px] text-[#A1A1AA]">{error}</p>
              </div>
            </div>
          )}

          {fileContent && (
            <SyntaxHighlighter
              language={mapLanguage(fileContent.language)}
              style={vscDarkPlus}
              showLineNumbers={true}
              wrapLines={true}
              customStyle={{
                margin: 0,
                padding: "1rem",
                background: "transparent",
                fontSize: "13px",
                lineHeight: "1.5"
              }}
              lineProps={(lineNumber) => {
                const style: React.CSSProperties = { display: "block", padding: "0 4px" };
                if (startLine && endLine && lineNumber >= startLine && lineNumber <= endLine) {
                  style.backgroundColor = "rgba(255, 255, 255, 0.1)"; // Highlight block
                  style.borderLeft = "2px solid #FAFAFA";
                }
                return { style };
              }}
            >
              {fileContent.content}
            </SyntaxHighlighter>
          )}
        </div>
      </div>
    </div>
  );
}
