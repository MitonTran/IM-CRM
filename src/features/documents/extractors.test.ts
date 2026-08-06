import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { chunkSections, extractDocument, fullExtractedText } from "./extractors";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function onePagePdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((body, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(pdf);
}

describe("document extraction", () => {
  it("extracts PDF text with page citations", async () => {
    const sections = await extractDocument(onePagePdf("Hello IM CRM"), "application/pdf");
    expect(sections[0]).toMatchObject({ text: "Hello IM CRM", metadata: { page: 1 } });
  });

  it("extracts DOCX paragraphs without rendering uploaded HTML", async () => {
    const file = zipSync({ "word/document.xml": strToU8('<w:document><w:body><w:p><w:r><w:t>Quy trình &amp; bán hàng</w:t></w:r></w:p><w:p><w:r><w:t>Bước hai</w:t></w:r></w:p></w:body></w:document>') });
    const sections = await extractDocument(file, DOCX);
    expect(sections.map((item) => item.text)).toEqual(["Quy trình & bán hàng", "Bước hai"]);
    expect(sections[0].metadata).toEqual({ paragraph: 1 });
  });

  it("extracts XLSX cells with sheet and range citations", async () => {
    const file = zipSync({
      "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Doanh thu" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      "xl/sharedStrings.xml": strToU8('<sst><si><t>Khách A</t></si></sst>'),
      "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>12000000</v></c></row></sheetData></worksheet>'),
    });
    const sections = await extractDocument(file, XLSX);
    expect(sections[0]).toMatchObject({ text: "A1: Khách A | B1: 12000000", metadata: { sheet: "Doanh thu", range: "A1:B1" } });
  });

  it("extracts PPTX text in slide order", async () => {
    const file = zipSync({ "ppt/slides/slide2.xml": strToU8('<p:sld><a:t>Slide hai</a:t></p:sld>'), "ppt/slides/slide1.xml": strToU8('<p:sld><a:t>Slide một</a:t></p:sld>') });
    const sections = await extractDocument(file, PPTX);
    expect(sections.map((item) => item.text)).toEqual(["Slide một", "Slide hai"]); expect(sections[1].metadata).toEqual({ slide: 2 });
  });

  it("creates bounded overlapping chunks with citation metadata", () => {
    const text = Array.from({ length: 200 }, (_, index) => `từ-${index}`).join(" "); const chunks = chunkSections([{ text, metadata: { page: 3 } }], 400, 50);
    expect(chunks.length).toBeGreaterThan(1); expect(chunks[0]).toMatchObject({ chunk_index: 0, metadata: { page: 3, char_start: 0 } }); expect(chunks.every((item) => item.content.length <= 400 && item.token_count > 0)).toBe(true);
    expect(fullExtractedText([{ text: "Nội dung", metadata: { page: 3 } }])).toContain("[page=3]");
  });

  it("rejects unsupported image extraction until OCR is configured", async () => {
    await expect(extractDocument(new Uint8Array([1, 2, 3]), "image/png")).rejects.toThrow("requires_ocr");
  });
});
