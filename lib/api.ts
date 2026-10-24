export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Repository {
  id: string;
  user_id: string;
  name: string;
  status: string; // "pending", "processing", "completed", "indexing", "partially_indexed", "indexed", "failed"
  error_message?: string;
  summary?: string | null;
  upload_date: string;
  github_url: string | null;
  file_count?: number;
  chunk_count?: number;
  indexed_chunk_count?: number;
  is_indexed?: boolean;
}

export interface RepositoryDetail extends Repository {
  file_count: number;
  chunk_count: number;
  indexed_chunk_count?: number;
  is_indexed?: boolean;
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
  sources?: any[] | null;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  repository_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface SearchResults {
  repositories: Array<{ id: string; name: string; type: string }>;
  files: Array<{ id: string; path: string; repository_id: string; repository_name: string; type: string }>;
  chunks: Array<{ id: string; content_preview: string; path: string; repository_id: string; repository_name: string; type: string }>;
  chats: Array<{ id: string; title: string; repository_id: string; repository_name: string; type: string }>;
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
      credentials: "include",
    });

    if (!response.ok) {
      if (response.status === 401) {
        if (typeof window !== 'undefined' && !['/login', '/signup', '/'].includes(window.location.pathname)) {
            localStorage.removeItem("token");
            window.location.href = "/login";
        }
      }
      
      const errorData = await response.json().catch(() => ({}));
      const detailStr = errorData.detail 
        ? (typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail))
        : `API Error: ${response.status}`;
      throw new ApiError(detailStr, response.status);
    }

    // Some endpoints might return 204 No Content
    if (response.status === 204) {
        return null;
    }

    return await response.json();
  } catch (error: any) {
    // Only log actual unexpected errors, avoid logging expected 401s which trigger Next.js error overlays in dev
    if (!(error instanceof ApiError && error.status === 401)) {
      console.error(`API Request failed for ${endpoint}:`, error);
    }
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

export interface ChatSessionWithRepo extends ChatSession {
  repository_name: string;
  last_message_preview?: string | null;
}

export async function getAllChatSessions(): Promise<ChatSessionWithRepo[]> {
  return await fetchApi(`/chat-sessions`);
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

export async function globalSearch(query: string): Promise<SearchResults> {
  return fetchApi(`/search?q=${encodeURIComponent(query)}`);
}

export interface DirectDependent {
  path: string;
  file_id?: string;
  line_number: number;
  imported_symbols: string[];
  is_type_only: boolean;
  is_dynamic: boolean;
  references: Record<string, number[]>;
}

export interface TransitiveDependent {
  path: string;
  file_id?: string;
  depth: number;
  dependency_path: string[];
  via: string;
  imported_symbols: string[];
  line_number?: number;
}

export interface ImpactTarget {
  path: string;
  file_id: string;
  symbol?: string | null;
  language: string;
  exported_symbols: string[];
}

export interface ImpactSummary {
  direct_count: number;
  transitive_count: number;
  total_affected: number;
  suggested_tests_count: number;
  max_depth_reached: number;
}

export interface UnresolvedDependency {
  source_file: string;
  specifier: string;
  line: number;
  reason: string;
}

export interface ImpactAnalysisResult {
  target: ImpactTarget;
  summary: ImpactSummary;
  direct_dependents: DirectDependent[];
  transitive_dependents: TransitiveDependent[];
  suggested_tests: string[];
  unresolved_dependencies: UnresolvedDependency[];
  ai_explanation?: {
    overall_impact: string;
    affected_components: Array<{
      name: string;
      impact_type: string;
      details: string;
    }>;
    potential_breaking_changes: string[];
    recommended_verification: string[];
  } | null;
  limitations: string[];
}

export interface ImpactAnalysisRequest {
  file_path: string;
  symbol_name?: string | null;
  max_depth?: number;
  include_ai_explanation?: boolean;
}

export async function analyzeChangeImpact(
  repositoryId: string,
  request: ImpactAnalysisRequest
): Promise<ImpactAnalysisResult> {
  return await fetchApi(`/repositories/${repositoryId}/impact-analysis`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export interface ChangeSetSummary {
  changed_files_count: number;
  direct_dependents_count: number;
  transitive_dependents_count: number;
  total_blast_radius: number;
  suggested_tests_count: number;
  unresolved_count: number;
}

export interface ChangedFileDetail {
  path: string;
  change_type: "modified" | "added" | "deleted" | "renamed";
  changed_symbols: string[];
  modified_lines_count: number;
  is_public_api_modified: boolean;
  diff_snippet?: string | null;
}

export interface RiskFactor {
  factor: string;
  points: number;
  reason: string;
}

export interface RiskPrioritization {
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  factors: RiskFactor[];
  summary_headline: string;
}

export interface MergedCausalLink {
  changed_file: string;
  changed_symbols: string[];
  relationship: "direct" | "transitive";
  depth: number;
  import_line: number;
}

export interface MergedDependentFile {
  path: string;
  file_id?: string;
  relationship: "direct" | "transitive";
  min_depth: number;
  caused_by: MergedCausalLink[];
  imported_symbols: string[];
  import_lines: number[];
  dependency_path: string[];
}

export interface SuggestedTest {
  path: string;
  reason: string;
  status: string;
}

export interface AiChangeSetExplanation {
  summary: string;
  breaking_risks: string[];
  component_impacts: Array<{
    component: string;
    risk: string;
  }>;
  verification_checklist: string[];
}

export interface ChangeSetAnalysisResponse {
  repository_id: string;
  summary: ChangeSetSummary;
  risk_prioritization: RiskPrioritization;
  changed_files: ChangedFileDetail[];
  merged_dependents: MergedDependentFile[];
  suggested_tests: SuggestedTest[];
  unresolved_dependencies: UnresolvedDependency[];
  ai_explanation?: AiChangeSetExplanation | null;
  limitations: string[];
}

export interface ChangeSetAnalysisRequest {
  diff_text?: string;
  changed_files?: Array<{
    path: string;
    change_type?: string;
    symbols?: string[];
  }>;
  max_depth?: number;
  include_ai_explanation?: boolean;
}

export async function analyzeChangeSetImpact(
  repositoryId: string,
  request: ChangeSetAnalysisRequest
): Promise<ChangeSetAnalysisResponse> {
  return await fetchApi(`/repositories/${repositoryId}/change-set-impact`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

