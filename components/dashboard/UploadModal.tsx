"use client";

import { useState } from "react";
import { UploadCloud, X, Loader2, Github } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [tab, setTab] = useState<"zip" | "github">("zip");
  
  // ZIP State
  const [file, setFile] = useState<File | null>(null);
  
  // GitHub State
  const [githubUrl, setGithubUrl] = useState("");
  
  // Shared State
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleUploadZip = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!file.name.endsWith(".zip")) {
      setError("Only .zip files are supported.");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      await fetchApi("/repositories/upload", {
        method: "POST",
        body: formData,
      });

      setFile(null);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to upload repository.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleImportGithub = async () => {
    if (!githubUrl.trim()) {
      setError("Please enter a GitHub URL.");
      return;
    }

    if (!githubUrl.includes("github.com/")) {
      setError("Please enter a valid GitHub URL (e.g., https://github.com/owner/repo)");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      await fetchApi("/repositories/github-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ github_url: githubUrl }),
      });

      setGithubUrl("");
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to import GitHub repository.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = () => {
    if (tab === "zip") handleUploadZip();
    else handleImportGithub();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111113] border border-[#27272A] rounded-[14px] w-full max-w-[480px] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b border-[#27272A]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[18px] font-semibold text-[#FAFAFA]">Add Repository</h2>
            <button 
              onClick={onClose} 
              className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
              disabled={isUploading}
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex p-1 bg-[#09090B] border border-[#27272A] rounded-lg">
            <button 
              onClick={() => { setTab("zip"); setError(""); }}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${tab === "zip" ? "bg-[#27272A] text-white" : "text-[#A1A1AA] hover:text-white"}`}
              disabled={isUploading}
            >
              Upload ZIP
            </button>
            <button 
              onClick={() => { setTab("github"); setError(""); }}
              className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-colors ${tab === "github" ? "bg-[#27272A] text-white" : "text-[#A1A1AA] hover:text-white"}`}
              disabled={isUploading}
            >
              GitHub Import
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-[8px] bg-red-500/10 border border-red-500/20 text-red-500 text-[13px]">
              {error}
            </div>
          )}

          {tab === "zip" && (
            <div>
              <div className="border-2 border-dashed border-[#27272A] rounded-[10px] p-8 flex flex-col items-center justify-center text-center hover:border-[#3f3f46] transition-colors bg-[#09090B]">
                <UploadCloud size={32} className="text-[#A1A1AA] mb-3" />
                <p className="text-[14px] font-medium text-[#FAFAFA] mb-1">
                  Click to upload or drag and drop
                </p>
                <p className="text-[12px] text-[#52525b] mb-4">
                  ZIP archive containing your codebase
                </p>
                <label className="cursor-pointer">
                  <span className="px-4 py-2 bg-[#FAFAFA] text-[#09090B] text-[13px] font-semibold rounded-[8px] hover:bg-white transition-colors">
                    Select ZIP File
                  </span>
                  <input 
                    type="file" 
                    accept=".zip" 
                    className="hidden" 
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                </label>
              </div>

              {file && (
                <div className="mt-4 p-3 rounded-[8px] bg-[#09090B] border border-[#27272A] flex items-center justify-between">
                  <span className="text-[13px] text-[#FAFAFA] truncate">{file.name}</span>
                  <span className="text-[12px] text-[#A1A1AA]">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              )}
            </div>
          )}

          {tab === "github" && (
            <div>
              <label className="block text-[13px] font-medium text-[#A1A1AA] mb-2">
                Public GitHub Repository URL
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b]">
                  <Github size={16} />
                </div>
                <input 
                  type="text"
                  placeholder="https://github.com/facebook/react"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  disabled={isUploading}
                  className="w-full pl-9 pr-4 py-2 bg-[#09090B] border border-[#27272A] rounded-[8px] text-[14px] text-white focus:outline-none focus:border-[#52525b] transition-colors"
                />
              </div>
              <p className="mt-2 text-[12px] text-[#52525b]">
                Only public repositories are supported in this phase. The repository will be downloaded and indexed.
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button 
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={isUploading || (tab === "zip" ? !file : !githubUrl.trim())}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#FAFAFA] text-[#09090B] text-[13px] font-semibold rounded-[8px] hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
            >
              {isUploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {tab === "github" ? "Importing..." : "Uploading..."}
                </>
              ) : (
                tab === "github" ? "Import" : "Upload"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
