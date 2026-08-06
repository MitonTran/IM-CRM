import { strFromU8, unzipSync } from "fflate";
import { extractText } from "unpdf";

export type ExtractedSection = { text: string; metadata: Record<string, string | number> };
export type ExtractedChunk = { chunk_index: number; content: string; token_count: number; metadata: Record<string, string | number> };

const MAX_EXPANDED_XML_BYTES = 50 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MAX_CHUNKS = 1500;

function decodeXml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

function cleanText(value: string) {
  return value.replace(/\r/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function xmlText(xml: string, tag: string) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return cleanText(Array.from(xml.matchAll(pattern), (match) => decodeXml(match[1].replace(/<[^>]+>/g, ""))).join(" "));
}

function unzipOffice(data: Uint8Array, wanted: (name: string) => boolean) {
  let expanded = 0; let exceeded = false;
  const files = unzipSync(data, { filter(file) { if (!wanted(file.name)) return false; expanded += file.originalSize; if (expanded > MAX_EXPANDED_XML_BYTES) { exceeded = true; return false; } return true; } });
  if (exceeded) throw new Error("office_archive_too_large");
  return files;
}

function extractDocx(data: Uint8Array): ExtractedSection[] {
  const files = unzipOffice(data, (name) => name === "word/document.xml"); const raw = files["word/document.xml"];
  if (!raw) throw new Error("docx_document_missing"); const xml = strFromU8(raw); const paragraphs = Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi));
  return paragraphs.map((match, index) => ({ text: xmlText(match[1].replace(/<w:tab\s*\/>/gi, "\t").replace(/<w:br\s*\/>/gi, "\n"), "w:t"), metadata: { paragraph: index + 1 } })).filter((item) => item.text);
}

function numberedFile(name: string) { return Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0); }
function extractPptx(data: Uint8Array): ExtractedSection[] {
  const files = unzipOffice(data, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  return Object.entries(files).sort(([a], [b]) => numberedFile(a) - numberedFile(b)).map(([name, raw]) => ({ text: xmlText(strFromU8(raw), "a:t"), metadata: { slide: numberedFile(name) } })).filter((item) => item.text);
}

function attribute(source: string, name: string) { return decodeXml(source.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1] ?? ""); }
function extractXlsx(data: Uint8Array): ExtractedSection[] {
  const files = unzipOffice(data, (name) => name === "xl/sharedStrings.xml" || name === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sharedXml = files["xl/sharedStrings.xml"] ? strFromU8(files["xl/sharedStrings.xml"]) : "";
  const shared = Array.from(sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi), (match) => xmlText(match[1], "t"));
  const workbookXml = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  const sheetNames = Array.from(workbookXml.matchAll(/<sheet\s[^>]*name="([^"]+)"[^>]*\/>/gi), (match) => decodeXml(match[1]));
  const sections: ExtractedSection[] = [];
  for (const [name, raw] of Object.entries(files).filter(([entry]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry)).sort(([a], [b]) => numberedFile(a) - numberedFile(b))) {
    const sheetNumber = numberedFile(name); const sheet = sheetNames[sheetNumber - 1] || `Sheet ${sheetNumber}`; const xml = strFromU8(raw);
    for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi)) {
      const cells: Array<{ ref: string; value: string }> = [];
      for (const cell of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const ref = attribute(cell[1], "r"); const kind = attribute(cell[1], "t"); const body = cell[2]; let value = "";
        if (kind === "inlineStr") value = xmlText(body, "t");
        else { const rawValue = decodeXml(body.match(/<v>([\s\S]*?)<\/v>/i)?.[1] ?? ""); value = kind === "s" ? shared[Number(rawValue)] ?? "" : rawValue; }
        if (value) cells.push({ ref, value });
      }
      if (cells.length) sections.push({ text: cells.map((cell) => `${cell.ref}: ${cell.value}`).join(" | "), metadata: { sheet, range: `${cells[0].ref}:${cells.at(-1)!.ref}` } });
    }
  }
  return sections;
}

export async function extractDocument(data: Uint8Array, mimeType: string): Promise<ExtractedSection[]> {
  let sections: ExtractedSection[];
  if (mimeType === "application/pdf") {
    const result = await extractText(data, { mergePages: false });
    sections = result.text.map((text, index) => ({ text: cleanText(text), metadata: { page: index + 1 } })).filter((item) => item.text);
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") sections = extractDocx(data);
  else if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") sections = extractXlsx(data);
  else if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") sections = extractPptx(data);
  else throw new Error("document_type_requires_ocr_or_is_unsupported");
  let characters = 0;
  return sections.flatMap((section) => { const remaining = MAX_EXTRACTED_CHARACTERS - characters; if (remaining <= 0) return []; const text = section.text.slice(0, remaining); characters += text.length; return text ? [{ ...section, text }] : []; });
}

export function chunkSections(sections: ExtractedSection[], targetSize = 1800, overlap = 200): ExtractedChunk[] {
  if (targetSize < 300 || overlap < 0 || overlap >= targetSize) throw new Error("chunk_settings_invalid");
  const chunks: ExtractedChunk[] = [];
  for (const section of sections) {
    const text = cleanText(section.text); if (!text) continue; let start = 0;
    while (start < text.length && chunks.length < MAX_CHUNKS) {
      let end = Math.min(start + targetSize, text.length);
      if (end < text.length) { const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end)); if (boundary > start + targetSize * 0.6) end = boundary; }
      const content = text.slice(start, end).trim();
      if (content) chunks.push({ chunk_index: chunks.length, content, token_count: Math.ceil(content.length / 4), metadata: { ...section.metadata, char_start: start, char_end: end } });
      if (end >= text.length) break; start = Math.max(start + 1, end - overlap);
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }
  return chunks;
}

export function fullExtractedText(sections: ExtractedSection[]) {
  return sections.map((section) => { const location = Object.entries(section.metadata).map(([key, value]) => `${key}=${value}`).join(", "); return `${location ? `[${location}]\n` : ""}${cleanText(section.text)}`; }).filter(Boolean).join("\n\n");
}
