export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Repository {
  id: string;
  user_id: string;
  name: string;
  status: string; // "processing", "embedding", "indexed", "failed"
  error_message?: string;
  upload_date: string;
  github_url: string | null;
  file_count?: number; // Might need to compute this based on backend response
}

export interface RepositoryDetail extends Repository {
  file_count: number;
  chunk_count: number;
  languages: string[];
}

export interface File {
  id: string;
  repository_id: string;
  path: string;
  language: string;
  size: number;
}

export interface Chunk {
  id: string;
  repository_id: string;
  file_id: string;
  content: string;
  metadata_: any;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  chat_session_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  repository_id: string;
  title: string;
  created_at: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

export interface ChatMessageType {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sections?: { title: string; content?: string; items?: string[] }[];
  sources?: any[];
}

export async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Set default content type if not FormData
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
            localStorage.removeItem("token");
            window.location.href = "/login";
        }
      }
      
      const errorData = await response.json().catch(() => ({}));
      const detailStr = errorData.detail 
        ? (typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail))
        : `API Error: ${response.status}`;
      throw new Error(detailStr);
    }

    // Some endpoints might return 204 No Content
    if (response.status === 204) {
        return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`API Request failed for ${endpoint}:`, error);
    throw error;
  }
}

export async function askRepositoryQuestion(id: string, question: string): Promise<{ answer: string; sources?: any[] }> {
  return await fetchApi(`/repositories/${id}/ask`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function reindexRepository(id: string): Promise<Repository> {
  return await fetchApi(`/repositories/${id}/reindex`, {
    method: "POST",
  });
}

export async function createChatSession(repositoryId: string, title: string = "New Chat"): Promise<ChatSession> {
  return await fetchApi(`/repositories/${repositoryId}/chat-sessions`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function getChatSessions(repositoryId: string): Promise<ChatSession[]> {
  return await fetchApi(`/repositories/${repositoryId}/chat-sessions`);
}

export async function getChatSessionDetail(sessionId: string): Promise<ChatSessionDetail> {
  return await fetchApi(`/repositories/chat-sessions/${sessionId}`);
}

export async function updateChatSession(sessionId: string, title: string): Promise<ChatSession> {
  return await fetchApi(`/repositories/chat-sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await fetchApi(`/repositories/chat-sessions/${sessionId}`, {
    method: "DELETE",
  });
}
