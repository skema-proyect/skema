// ── Inline formatting ─────────────────────────────────────────────────────────
function fmt(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false, inOl = false, inTable = false, inThead = true;

  const flush = () => {
    if (inUl)    { out.push("</ul>");                        inUl = false; }
    if (inOl)    { out.push("</ol>");                        inOl = false; }
    if (inTable) { out.push("</tbody></table>");              inTable = false; inThead = true; }
  };

  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) { flush(); out.push(`<h${h[1].length}>${fmt(h[2])}</h${h[1].length}>`); continue; }

    if (/^---+$/.test(line.trim())) { flush(); out.push("<hr>"); continue; }

    if (/^\|/.test(line)) {
      if (!inTable) {
        out.push('<table style="border-collapse:collapse;width:100%;margin:1em 0"><thead>');
        inTable = true; inThead = true;
      }
      if (/^\|[-:| ]+\|$/.test(line)) { out.push("</thead><tbody>"); inThead = false; continue; }
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      const t = inThead ? "th" : "td";
      const s = `style="border:1px solid #ccc;padding:6px 10px;${inThead ? "background:#f5f5f5;font-weight:600;" : ""}"`;
      out.push(`<tr>${cells.map(c => `<${t} ${s}>${fmt(c)}</${t}>`).join("")}</tr>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) { if (!inUl) { flush(); out.push("<ul>"); inUl = true; } out.push(`<li>${fmt(ul[1])}</li>`); continue; }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) { if (!inOl) { flush(); out.push("<ol>"); inOl = true; } out.push(`<li>${fmt(ol[1])}</li>`); continue; }

    if (!line.trim()) { flush(); out.push(""); continue; }

    flush();
    out.push(`<p>${fmt(line)}</p>`);
  }

  flush();
  return out.join("\n");
}

// ── Shared document CSS ───────────────────────────────────────────────────────
const DOC_CSS = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; padding: 2cm; line-height: 1.6; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 18pt; margin-top: 0; border-bottom: 2px solid #000; padding-bottom: 6pt; }
  h2 { font-size: 14pt; margin-top: 1.5em; }
  h3 { font-size: 12pt; margin-top: 1em; }
  p  { margin: 0.5em 0; }
  ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
  li { margin: 0.25em 0; }
  hr { border: none; border-top: 1px solid #000; margin: 1.5em 0; }
  code { font-family: monospace; background: #f0f0f0; padding: 1px 4px; font-size: 10pt; }
  strong { font-weight: 700; }
  @media print { body { padding: 0; } }
`;

// ── Exportar como PDF (ventana de impresión del navegador) ────────────────────
export function downloadPDF(content: string, title: string): void {
  const html = markdownToHtml(content);
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "1px", height: "1px", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${DOC_CSS}</style></head><body>${html}</body></html>`);
  doc.close();
  iframe.contentWindow!.focus();
  setTimeout(() => {
    iframe.contentWindow!.print();
    setTimeout(() => document.body.removeChild(iframe), 3000);
  }, 350);
}

// ── Exportar como Word (.doc via HTML con MIME msword) ────────────────────────
export function downloadWord(content: string, title: string): void {
  const html = markdownToHtml(content);
  const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>${DOC_CSS}</style></head>
<body>${html}</body></html>`;
  const blob = new Blob([wordHtml], { type: "application/msword" });
  trigger(blob, `${title}.doc`);
}

// ── Exportar tabla como CSV (Excel la abre directamente) ──────────────────────
export function downloadCSV(content: string, title: string): void {
  const rows = content.split("\n")
    .filter(l => /^\|/.test(l.trim()) && !/^\|[-:| ]+\|$/.test(l.trim()))
    .map(line =>
      line.split("|").slice(1, -1).map(cell => {
        const v = cell.trim().replace(/\*\*/g, "").replace(/\*/g, "");
        return v.includes(",") || v.includes('"') || v.includes("\n")
          ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")
    );
  if (!rows.length) return;
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  trigger(blob, `${title}.csv`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function hasTable(md: string): boolean {
  return /^\|.+\|/m.test(md);
}

export function extractDocTitle(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "Documento";
}

function trigger(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
