"use client";

import AppSidebar from "@/components/layout/AppSidebar";

export default function DocsPage() {
  return (
    <div className="flex h-screen bg-[#09090B] overflow-hidden">
      <AppSidebar />
      <div className="flex-1 overflow-y-auto p-12 ml-14">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-3xl font-bold text-[#FAFAFA] mb-6">Documentation</h1>
          <div className="prose prose-invert prose-zinc max-w-none">
            <p className="text-[#A1A1AA] text-[15px] leading-relaxed">
              Welcome to the CodeBase AI documentation. Here you can learn how to upload your repositories, chat with your codebase, and manage your settings.
            </p>
            
            <h2 className="text-xl font-semibold text-[#FAFAFA] mt-10 mb-4">Getting Started</h2>
            <p className="text-[#A1A1AA] text-[15px] leading-relaxed">
              To begin, upload a repository from your dashboard using the <strong>Upload Repository</strong> button. 
              The system will automatically index your codebase and generate embeddings.
            </p>
            
            <h2 className="text-xl font-semibold text-[#FAFAFA] mt-10 mb-4">Chatting with your Code</h2>
            <p className="text-[#A1A1AA] text-[15px] leading-relaxed">
              Once indexed, you can click on any repository to start a chat session. Ask questions about architecture, 
              where specific features are implemented, or how to use internal APIs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
