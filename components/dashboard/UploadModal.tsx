"use client";

import { useState } from "react";
import { UploadCloud, X, Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError("");
    }
  };

  const handleUpload = async () => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111113] border border-[#27272A] rounded-[14px] w-full max-w-[480px] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-[#FAFAFA]">Upload Repository</h2>
          <button 
            onClick={onClose} 
            className="text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
            disabled={isUploading}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-[8px] bg-red-500/10 border border-red-500/20 text-red-500 text-[13px]">
            {error}
          </div>
        )}

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

        <div className="mt-6 flex justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 text-[13px] font-medium text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#FAFAFA] text-[#09090B] text-[13px] font-semibold rounded-[8px] hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
          >
            {isUploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
