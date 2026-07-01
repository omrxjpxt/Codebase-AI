"use client";

import { useState, useEffect } from "react";
import { Folder, FolderOpen, File as FileIcon, FileText, FileCode, Search, ChevronRight, ChevronDown } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface FileNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  language?: string;
  size?: number;
}

export default function FileExplorer({ repositoryId, onFileClick }: { repositoryId: string, onFileClick: (fileId: string) => void }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["/"]));

  useEffect(() => {
    const loadFiles = async () => {
      try {
        const files = await fetchApi(`/repositories/${repositoryId}/files`);
        setTree(buildTree(files));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadFiles();
  }, [repositoryId]);

  const buildTree = (files: any[]): FileNode[] => {
    const root: FileNode = { id: "root", name: "root", path: "/", type: "directory", children: [] };

    files.forEach(file => {
      const parts = file.path.split("/");
      let currentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          currentNode.children!.push({
            id: file.id,
            name: part,
            path: file.path,
            type: "file",
            language: file.language,
            size: file.size
          });
        } else {
          let nextNode = currentNode.children!.find(c => c.name === part && c.type === "directory");
          if (!nextNode) {
            nextNode = {
              id: `${currentNode.path}${part}/`,
              name: part,
              path: `${currentNode.path}${part}/`,
              type: "directory",
              children: []
            };
            currentNode.children!.push(nextNode);
          }
          currentNode = nextNode;
        }
      }
    });

    return sortTree(root.children!);
  };

  const sortTree = (nodes: FileNode[]): FileNode[] => {
    return nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "directory" ? -1 : 1;
    }).map(node => {
      if (node.children) node.children = sortTree(node.children);
      return node;
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const getFileIcon = (filename: string, language?: string) => {
    if (language === 'typescript' || language === 'javascript' || filename.endsWith('.tsx') || filename.endsWith('.ts')) return <FileCode size={14} className="text-[#3b82f6]" />;
    if (filename.endsWith('.md') || filename.endsWith('.txt')) return <FileText size={14} className="text-[#A1A1AA]" />;
    if (filename.endsWith('.json')) return <FileCode size={14} className="text-[#eab308]" />;
    return <FileIcon size={14} className="text-[#A1A1AA]" />;
  };

  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.filter(node => {
      if (searchQuery) return node.path.toLowerCase().includes(searchQuery.toLowerCase());
      return true;
    }).map(node => {
      if (node.type === "directory") {
        const isExpanded = expandedFolders.has(node.path) || searchQuery;
        return (
          <div key={node.path} className="w-full">
            <div 
              className="flex items-center gap-1.5 py-1.5 px-2 hover:bg-[#111113] cursor-pointer rounded-md text-[13px] text-[#A1A1AA] transition-colors"
              style={{ paddingLeft: `${level * 12 + 8}px` }}
              onClick={() => toggleFolder(node.path)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {isExpanded ? <FolderOpen size={14} className="text-blue-400" /> : <Folder size={14} className="text-blue-400" />}
              <span className="truncate">{node.name}</span>
            </div>
            {isExpanded && node.children && (
              <div>{renderTree(node.children, level + 1)}</div>
            )}
          </div>
        );
      }

      return (
        <div 
          key={node.path}
          className="flex items-center justify-between py-1.5 px-2 hover:bg-[#111113] cursor-pointer rounded-md text-[13px] text-[#FAFAFA] transition-colors group"
          style={{ paddingLeft: `${level * 12 + 24}px` }}
          onClick={() => onFileClick(node.id)}
        >
          <div className="flex items-center gap-2 truncate">
            {getFileIcon(node.name, node.language)}
            <span className="truncate group-hover:text-blue-400 transition-colors">{node.name}</span>
          </div>
          {node.size && (
            <span className="text-[11px] text-[#52525b] opacity-0 group-hover:opacity-100 transition-opacity">
              {(node.size / 1024).toFixed(1)} KB
            </span>
          )}
        </div>
      );
    });
  };

  if (isLoading) {
    return <div className="p-8 text-[#A1A1AA] text-[13px] text-center">Loading files...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#09090B] border border-[#27272A] rounded-xl overflow-hidden max-w-3xl mx-auto w-full">
      <div className="p-3 border-b border-[#27272A] bg-[#111113]">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#52525b]" />
          <input 
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#09090B] border border-[#27272A] rounded-md py-1.5 pl-8 pr-3 text-[13px] text-[#FAFAFA] focus:outline-none focus:border-[#52525b] transition-colors"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tree.length === 0 ? (
          <p className="text-center text-[#52525b] text-[13px] mt-10">No files found.</p>
        ) : (
          renderTree(tree)
        )}
      </div>
    </div>
  );
}
