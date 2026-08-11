"use client";

import { useActionState, useRef, useState } from "react";
import { FileText, FileUp, FolderPlus, LoaderCircle, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createFolderAction, deleteDocumentAction, finalizeDocumentUpload, prepareDocumentUpload, prepareDocumentVersionUpload, processDocumentNowAction, retryDocumentEmbeddingAction } from "./actions";
import type { DocumentOption } from "./types";
import { documentFileSizeError } from "./upload-validation";

const accepted = ".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.webp";
async function sha256(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function DocumentUploadForm({ role, teamId, teams, users, folders }: { role: "admin" | "leader"; teamId: string | null; teams: DocumentOption[]; users: DocumentOption[]; folders: DocumentOption[] }) {
  const formRef = useRef<HTMLFormElement>(null); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [ok, setOk] = useState(false);
  const scopes = role === "leader" && teamId ? [{ value: `team:${teamId}`, label: "Team của tôi" }] : [
    { value: "organization:", label: "Toàn công ty" },
    ...teams.map((item) => ({ value: `team:${item.id}`, label: `Team · ${item.name}` })),
    ...users.map((item) => ({ value: `user:${item.id}`, label: `Cá nhân · ${item.name}` })),
  ];
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("file");
    if (!(file instanceof File) || !file.size) { setOk(false); setMessage("Hãy chọn một file."); return; }
    const sizeError = documentFileSizeError(file.size); if (sizeError) { setOk(false); setMessage(sizeError); return; }
    const [scope, subject = ""] = String(form.get("scopeSubject")).split(":") as ["organization" | "team" | "user", string];
    setPending(true); setMessage("Đang kiểm tra file...");
    const prepared = await prepareDocumentUpload({ title: form.get("title"), fileName: file.name, mimeType: file.type, sizeBytes: file.size, scope, teamId: scope === "team" ? subject : null, userId: scope === "user" ? subject : null, folderId: form.get("folderId") || null });
    if (!prepared.ok || !prepared.storagePath || !prepared.versionId) { setPending(false); setOk(false); setMessage(prepared.message); return; }
    const checksum = await sha256(file); setMessage("Đang tải file vào kho private...");
    const { error } = await createClient().storage.from("documents").upload(prepared.storagePath, file, { contentType: file.type, upsert: false });
    if (error) { setPending(false); setOk(false); setMessage("Không thể tải file. Phiên metadata vẫn ở trạng thái đang tải để quản trị viên kiểm tra."); return; }
    const finalized = await finalizeDocumentUpload(prepared.versionId, checksum); setPending(false); setOk(finalized.ok); setMessage(finalized.message); if (finalized.ok) formRef.current?.reset();
  }
  return <form ref={formRef} onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-bold text-[#617168] sm:col-span-2">Tên tài liệu<input name="title" required maxLength={200} className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-[#d8e2dc] px-3 text-sm" placeholder="Ví dụ: Quy trình chăm sóc khách hàng" /></label>
    <label className="text-xs font-bold text-[#617168]">Phạm vi<select name="scopeSubject" className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm" required>{scopes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <label className="text-xs font-bold text-[#617168]">Thư mục<select name="folderId" className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm"><option value="">Không có thư mục</option>{folders.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.scope === "organization" ? "Công ty" : item.scope === "team" ? "Team" : "Cá nhân"}</option>)}</select></label>
    <label className="text-xs font-bold text-[#617168] sm:col-span-2">File tối đa 25 MB<input name="file" type="file" accept={accepted} required className="focus-ring mt-1 block min-h-11 w-full rounded-xl border border-dashed border-[#bfcfc5] bg-[#f7f9f7] p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#e4edda] file:px-3 file:py-2 file:font-bold file:text-[#315d49]" /></label>
    <button disabled={pending || !scopes.length} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{pending ? <LoaderCircle className="animate-spin" size={17} /> : <UploadCloud size={17} />}{pending ? "Đang xử lý..." : "Tải tài liệu"}</button>
    {message ? <p aria-live="polite" className={`text-sm font-semibold sm:col-span-2 ${ok ? "text-emerald-700" : "text-rose-700"}`}>{message}</p> : null}
  </form>;
}

export function VersionUploadForm({ documentId }: { documentId: string }) {
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); const file = form.get("file"); if (!(file instanceof File) || !file.size) return;
    const sizeError = documentFileSizeError(file.size); if (sizeError) { setMessage(sizeError); return; }
    setPending(true); setMessage("Đang chuẩn bị phiên bản..."); const prepared = await prepareDocumentVersionUpload({ documentId, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
    if (!prepared.ok || !prepared.storagePath || !prepared.versionId) { setPending(false); setMessage(prepared.message); return; }
    const checksum = await sha256(file); const { error } = await createClient().storage.from("documents").upload(prepared.storagePath, file, { contentType: file.type, upsert: false });
    if (error) { setPending(false); setMessage("Không thể tải phiên bản mới."); return; }
    const result = await finalizeDocumentUpload(prepared.versionId, checksum); setPending(false); setMessage(result.message); if (result.ok) formElement.reset();
  }
  return <form onSubmit={submit} className="mt-4"><input name="file" type="file" accept={accepted} required className="block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-[#edf3e3] file:px-3 file:py-2 file:font-bold file:text-[#426043]" /><button disabled={pending} className="focus-ring mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#cbd8d0] text-sm font-bold text-[#315d49] disabled:opacity-50">{pending ? <LoaderCircle className="animate-spin" size={15} /> : <FileUp size={15} />}Tạo phiên bản mới</button>{message ? <p aria-live="polite" className="mt-2 text-xs font-semibold text-[#66766e]">{message}</p> : null}</form>;
}

export function FolderForm({ role, teamId, teams, users }: { role: "admin" | "leader"; teamId: string | null; teams: DocumentOption[]; users: DocumentOption[] }) {
  const [state, action, pending] = useActionState(createFolderAction, { ok: false, message: "" });
  const options = role === "leader" && teamId ? [{ scope: "team", id: teamId, label: "Team của tôi" }] : [{ scope: "organization", id: "", label: "Toàn công ty" }, ...teams.map((item) => ({ scope: "team", id: item.id, label: `Team · ${item.name}` })), ...users.map((item) => ({ scope: "user", id: item.id, label: `Cá nhân · ${item.name}` }))];
  const first = options[0];
  return <form action={action} className="mt-4 grid gap-2"><input name="name" required maxLength={120} placeholder="Tên thư mục" className="focus-ring min-h-10 rounded-xl border border-[#d8e2dc] px-3 text-sm" /><select name="combined" defaultValue={`${first?.scope}:${first?.id}`} onChange={(event) => { const [scope, id] = event.currentTarget.value.split(":"); const form = event.currentTarget.form; if (form) { (form.elements.namedItem("scope") as HTMLInputElement).value = scope; (form.elements.namedItem("subjectId") as HTMLInputElement).value = id; } }} className="focus-ring min-h-10 rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm">{options.map((item) => <option key={`${item.scope}:${item.id}`} value={`${item.scope}:${item.id}`}>{item.label}</option>)}</select><input type="hidden" name="scope" defaultValue={first?.scope} /><input type="hidden" name="subjectId" defaultValue={first?.id} /><button disabled={pending || !options.length} className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#cbd8d0] text-sm font-bold text-[#315d49]"><FolderPlus size={15} />{pending ? "Đang tạo..." : "Tạo thư mục"}</button>{state.message ? <p className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}</form>;
}

export function DeleteDocumentForm({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState(deleteDocumentAction, { ok: false, message: "" });
  return <form action={action} className="mt-4 border-t border-[#eadfd9] pt-4"><input type="hidden" name="documentId" value={documentId} /><label className="text-xs font-bold text-[#7d6158]">Lý do xóa mềm<input name="reason" required minLength={3} maxLength={500} className="focus-ring mt-1 min-h-10 w-full rounded-xl border border-[#dfcfc8] px-3 text-sm" /></label><button disabled={pending} className="focus-ring mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#8b4f40] px-3 text-sm font-bold text-white"><Trash2 size={15} />{pending ? "Đang xóa..." : "Xóa tài liệu"}</button>{state.message ? <p className="mt-2 text-xs font-semibold text-[#7d6158]">{state.message}</p> : null}</form>;
}

export function ExtractionActionForm({ versionId, status }: { versionId: string; status: "pending" | "failed" }) {
  const [state, action, pending] = useActionState(processDocumentNowAction, { ok: false, message: "" });
  return <form action={action} className="mt-3"><input type="hidden" name="versionId" value={versionId} /><button disabled={pending} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#edf3e3] px-3 text-xs font-bold text-[#426043] disabled:opacity-50">{pending ? <LoaderCircle className="animate-spin" size={14} /> : <FileText size={14} />}{pending ? "Đang trích xuất..." : status === "failed" ? "Thử trích xuất lại" : "Trích xuất ngay"}</button>{state.message ? <p aria-live="polite" className={`mt-2 text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}</form>;
}

export function EmbeddingRetryForm({ versionId }: { versionId: string }) {
  const [state, action, pending] = useActionState(retryDocumentEmbeddingAction, { ok: false, message: "" });
  return <form action={action} className="mt-3"><input type="hidden" name="versionId" value={versionId} /><button disabled={pending} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#f4ead7] px-3 text-xs font-bold text-[#7d5b2a] disabled:opacity-50">{pending ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}{pending ? "Đang xếp hàng..." : "Thử lập chỉ mục lại"}</button>{state.message ? <p aria-live="polite" className={`mt-2 text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null}</form>;
}
