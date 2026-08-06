import type { AppRole } from "@/lib/access";

export type DocumentScope = "organization" | "team" | "user";
export type ExtractionStatus = "uploading" | "pending" | "processing" | "ready" | "failed" | "unsupported";
export type DocumentOption = { id: string; name: string; scope?: DocumentScope; teamId?: string | null; userId?: string | null };

export type DocumentListItem = {
  id: string; title: string; scope: DocumentScope; scopeName: string; folderName: string | null;
  status: "active" | "archived"; updatedAt: string; canManage: boolean;
  currentVersion: null | { id: string; versionNo: number; fileName: string; mimeType: string; sizeBytes: number; extractionStatus: ExtractionStatus };
};

export type DocumentVersion = {
  id: string; versionNo: number; fileName: string; mimeType: string; sizeBytes: number;
  extractionStatus: ExtractionStatus; extractionError: string | null; createdAt: string; uploaderName: string;
};

export type DocumentsWorkspace = {
  viewer: { id: string; role: AppRole; teamId: string | null };
  documents: DocumentListItem[]; selected: DocumentListItem | null; versions: DocumentVersion[];
  teams: DocumentOption[]; users: DocumentOption[]; folders: DocumentOption[];
};

