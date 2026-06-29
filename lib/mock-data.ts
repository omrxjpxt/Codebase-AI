// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RepoStatus = "indexed" | "indexing" | "error";

export interface Repository {
  id: string;
  name: string;
  description: string;
  languages: string[];
  fileCount: number;
  status: RepoStatus;
  branch: string;
  lastUpdated: string;
  size: string;
}

export interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  language?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceFile[];
  sections?: ChatSection[];
  timestamp: string;
}

export interface ChatSection {
  title: string;
  content: string;
  items?: string[];
}

export interface SourceFile {
  name: string;
  path: string;
  language: string;
}

export interface ActivityItem {
  id: string;
  text: string;
  time: string;
  type: "indexed" | "refactored" | "summarized" | "asked";
}

export interface Question {
  id: string;
  text: string;
  repoId?: string;
  repoName?: string;
  timestamp?: string;
}

// ─────────────────────────────────────────────
// Repositories
// ─────────────────────────────────────────────

export const repositories: Repository[] = [
  {
    id: "",
    name: "SmartSpend AI",
    description:
      "AI-powered personal finance tracker with expense categorization, budget forecasting, and investment insights.",
    languages: ["Python", "TypeScript"],
    fileCount: 142,
    status: "indexed",
    branch: "main",
    lastUpdated: "2 hours ago",
    size: "4.2 MB",
  },
  {
    id: "",
    name: "CodeBase-Core",
    description:
      "Core backend service for CodeBase AI — handles repository ingestion, vector indexing, and semantic search.",
    languages: ["Python", "Go"],
    fileCount: 89,
    status: "indexed",
    branch: "main branch",
    lastUpdated: "1 day ago",
    size: "2.1 MB",
  },
  {
    id: "",
    name: "DataGen-Utility",
    description:
      "CLI utility for generating synthetic datasets for ML model training and testing.",
    languages: ["Python"],
    fileCount: 34,
    status: "indexing",
    branch: "dev",
    lastUpdated: "3 days ago",
    size: "860 KB",
  },
];

// ─────────────────────────────────────────────
// Files
// ─────────────────────────────────────────────

export const repoFiles: Record<string, FileNode[]> = {
  "": [
    {
      name: "src",
      type: "folder",
      children: [
        {
          name: "auth",
          type: "folder",
          children: [
            { name: "auth.py", type: "file", language: "Python" },
            { name: "jwt_service.py", type: "file", language: "Python" },
            { name: "middleware.py", type: "file", language: "Python" },
          ],
        },
        {
          name: "api",
          type: "folder",
          children: [
            { name: "api-gateway.py", type: "file", language: "Python" },
            { name: "routes.py", type: "file", language: "Python" },
          ],
        },
        {
          name: "services",
          type: "folder",
          children: [
            { name: "user_service.py", type: "file", language: "Python" },
            { name: "expense_service.py", type: "file", language: "Python" },
            { name: "budget_service.py", type: "file", language: "Python" },
          ],
        },
        {
          name: "models",
          type: "folder",
          children: [
            { name: "database.py", type: "file", language: "Python" },
            { name: "user.py", type: "file", language: "Python" },
            { name: "expense.py", type: "file", language: "Python" },
          ],
        },
      ],
    },
    {
      name: "frontend",
      type: "folder",
      children: [
        { name: "app.tsx", type: "file", language: "TypeScript" },
        { name: "dashboard.tsx", type: "file", language: "TypeScript" },
        { name: "auth.tsx", type: "file", language: "TypeScript" },
      ],
    },
    { name: "requirements.txt", type: "file", language: "Text" },
    { name: "README.md", type: "file", language: "Markdown" },
    { name: "docker-compose.yml", type: "file", language: "YAML" },
  ],
};

// ─────────────────────────────────────────────
// Chat Messages
// ─────────────────────────────────────────────

export const chatHistory: Record<string, ChatMessage[]> = {
  "": [
    {
      id: "msg-1",
      role: "user",
      content: "How does authentication work?",
      timestamp: "2024-01-15T10:00:00Z",
    },
    {
      id: "msg-2",
      role: "assistant",
      content:
        "Authentication is implemented using **JWT (JSON Web Tokens)** to ensure stateless security across the service. The system follows a modular architecture for handling user identity and session persistence.",
      sources: [
        { name: "auth.py", path: "src/auth/auth.py", language: "Python" },
        {
          name: "jwt_service.py",
          path: "src/auth/jwt_service.py",
          language: "Python",
        },
        {
          name: "middleware.py",
          path: "src/auth/middleware.py",
          language: "Python",
        },
      ],
      sections: [
        {
          title: "Overview",
          content:
            "Authentication is implemented using **JWT (JSON Web Tokens)** to ensure stateless security across the service. The system follows a modular architecture for handling user identity and session persistence.",
        },
        {
          title: "Implementation Flow",
          items: [
            "The login flow starts in `auth.py`, where credentials are validated against the database.",
            "JWT generation occurs in `jwt_service.py` using an HS256 algorithm with a high-entropy secret key.",
            "Protected routes are validated in `middleware.py`, which intercepts incoming requests to check for a valid Bearer token in the header.",
          ],
        },
        {
          title: "Key Files",
          content: "Source files referenced above.",
        },
      ],
      timestamp: "2024-01-15T10:00:05Z",
    },
  ],
};

// ─────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────

export const recentActivity: ActivityItem[] = [
  {
    id: "act-1",
    text: "Finished indexing SmartSpend AI",
    time: "2M AGO",
    type: "indexed",
  },
  {
    id: "act-2",
    text: "Refactored 12 functions in api-gateway.py",
    time: "1H AGO",
    type: "refactored",
  },
  {
    id: "act-3",
    text: "Summarized project architectural decisions",
    time: "3H AGO",
    type: "summarized",
  },
  {
    id: "act-4",
    text: "Indexed CodeBase-Core repository",
    time: "1D AGO",
    type: "indexed",
  },
];

// ─────────────────────────────────────────────
// Questions
// ─────────────────────────────────────────────

export const recentQuestions: Question[] = [
  {
    id: "q-1",
    text: "How does authentication work?",
    repoId: "",
    repoName: "SmartSpend AI",
  },
  {
    id: "q-2",
    text: "Explain the database schema.",
    repoId: "",
    repoName: "SmartSpend AI",
  },
  {
    id: "q-3",
    text: "Show all Redis usage.",
    repoId: "",
    repoName: "CodeBase-Core",
  },
  {
    id: "q-4",
    text: "Where is payment processing implemented?",
    repoId: "",
    repoName: "SmartSpend AI",
  },
];

export const followUpQuestions: Record<string, string[]> = {
  "": [
    "Explain registration flow",
    "Show all protected routes",
    "Where is the secret key stored?",
    "List all dependencies in requirements.txt",
    "How is the database connection pooled?",
  ],
};

export const suggestedQuestions = [
  "How does authentication work?",
  "Explain the database schema",
  "Show all Redis usage",
  "Where is payment processing implemented?",
  "List all API endpoints",
  "How are environment variables managed?",
];

// ─────────────────────────────────────────────
// Stats (Landing page)
// ─────────────────────────────────────────────

export const landingStats = [
  { value: "10,000+", label: "Questions Answered" },
  { value: "1M+", label: "Lines of Code Indexed" },
  { value: "25+", label: "Languages Supported" },
];

export const landingFeatures = [
  {
    icon: "GitBranch",
    title: "Repository Understanding",
    description:
      "Connect your project or paste a GitHub URL. Support for Python, JS, Go, Rust, and more. It creates a semantic map of your code, understanding context beyond just keywords.",
  },
  {
    icon: "Search",
    title: "AI-Powered Search",
    description:
      "Find function logic, hidden flows, and trace the dependencies via natural language. No more file-hopping.",
  },
  {
    icon: "FileCheck",
    title: "Source-Cited Answers",
    description:
      "Every answer comes with full file references and line-number citations, ensuring you can always verify the facts.",
  },
];

export const workflowSteps = [
  {
    step: 1,
    title: "Upload Repository",
    description:
      "Upload your project or create a GitHub URL. Support for Python, JS, Go, Rust, and more.",
  },
  {
    step: 2,
    title: "Processing & Vector Indexing",
    description:
      "We create a semantic map of your code, understanding context beyond just keywords.",
  },
  {
    step: 3,
    title: "Ask Questions",
    description:
      "Query your codebase right now. 'How are refunds calculated?' or 'What is the DB schema?'",
  },
  {
    step: 4,
    title: "Get Context-Aware Answers",
    description:
      "Receive clear explanations with specific code references to help you navigate faster.",
  },
];
