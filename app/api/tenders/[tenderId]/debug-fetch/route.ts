import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ tenderId: string }>;
}

export interface DiagnosticStep {
  label: string;
  status: "ok" | "fail" | "skip";
  detail: string;
}

export interface DiagnosticResult {
  tenderUrl: string;
  steps: DiagnosticStep[];
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; Tenderloin/1.0; +https://github.com/garciaandsmith/tenderloin)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es,en;q=0.5",
};

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { tenderId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenderIdNum = Number(tenderId);
  if (isNaN(tenderIdNum))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { data: tender } = await supabase
    .from("tenders_raw")
    .select("id, link")
    .eq("id", tenderIdNum)
    .single();

  if (!tender?.link)
    return NextResponse.json({ error: "Licitación no encontrada" }, { status: 404 });

  const steps = await runDiagnostics(tender.link);
  return NextResponse.json({ tenderUrl: tender.link, steps } satisfies DiagnosticResult);
}

// ─── diagnostic steps ──────────────────────────────────────────────────────────

async function runDiagnostics(tenderUrl: string): Promise<DiagnosticStep[]> {
  const steps: DiagnosticStep[] = [];

  // Step 1 — fetch tender page
  let html = "";
  try {
    const resp = await fetch(tenderUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
    html = await resp.text();
    steps.push({
      label: "Abrir página de licitación",
      status: "ok",
      detail: `HTTP ${resp.status} · ${html.length.toLocaleString("es")} caracteres`,
    });
  } catch (err) {
    steps.push({ label: "Abrir página de licitación", status: "fail", detail: String(err) });
    return [
      ...steps,
      skip("Localizar tabla de documentos"),
      skip("Localizar fila del Pliego"),
      skip("Abrir XML del Pliego"),
      skip("Enlace al documento técnico (PPT)"),
      skip("Enlace al documento administrativo (PCAP)"),
    ];
  }

  // Step 2 — find table by ID
  const tableIdx = html.search(/id=["']myTablaDetalleVISUOE["']/i);
  if (tableIdx === -1) {
    steps.push({
      label: "Localizar tabla de documentos",
      status: "fail",
      detail: 'El elemento con id="myTablaDetalleVISUOE" no está presente en la página',
    });
    return [
      ...steps,
      skip("Localizar fila del Pliego"),
      skip("Abrir XML del Pliego"),
      skip("Enlace al documento técnico (PPT)"),
      skip("Enlace al documento administrativo (PCAP)"),
    ];
  }
  steps.push({ label: "Localizar tabla de documentos", status: "ok", detail: "myTablaDetalleVISUOE encontrada" });

  // Step 3 — find pliego row + XML link
  const tableChunk = html.slice(tableIdx, tableIdx + 60_000);
  const { hasPliego, xmlHref } = findPliegoXmlLink(tableChunk);

  if (!hasPliego) {
    steps.push({
      label: "Localizar fila del Pliego",
      status: "fail",
      detail: "No se encontró ninguna fila con la palabra 'pliego' en la tabla",
    });
    return [
      ...steps,
      skip("Abrir XML del Pliego"),
      skip("Enlace al documento técnico (PPT)"),
      skip("Enlace al documento administrativo (PCAP)"),
    ];
  }
  if (!xmlHref) {
    steps.push({
      label: "Localizar fila del Pliego",
      status: "fail",
      detail: "Fila 'Pliego' encontrada pero no contiene ningún enlace XML",
    });
    return [
      ...steps,
      skip("Abrir XML del Pliego"),
      skip("Enlace al documento técnico (PPT)"),
      skip("Enlace al documento administrativo (PCAP)"),
    ];
  }
  const xmlUrl = new URL(xmlHref, tenderUrl).href;
  steps.push({ label: "Localizar fila del Pliego", status: "ok", detail: xmlUrl });

  // Step 4 — fetch XML
  let xmlText = "";
  try {
    const resp = await fetch(xmlUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
    xmlText = await resp.text();
    steps.push({
      label: "Abrir XML del Pliego",
      status: "ok",
      detail: `HTTP ${resp.status} · ${xmlText.length.toLocaleString("es")} caracteres`,
    });
  } catch (err) {
    steps.push({ label: "Abrir XML del Pliego", status: "fail", detail: String(err) });
    return [
      ...steps,
      skip("Enlace al documento técnico (PPT)"),
      skip("Enlace al documento administrativo (PCAP)"),
    ];
  }

  // Step 5 — find document references (reported separately per type)
  const techUrls = extractDocUrls(xmlText, "TechnicalDocumentReference");
  const adminUrls = extractDocUrls(xmlText, "LegalDocumentReference");

  steps.push(
    techUrls.length > 0
      ? { label: "Enlace al documento técnico (PPT)", status: "ok", detail: techUrls[0] }
      : { label: "Enlace al documento técnico (PPT)", status: "fail", detail: "No se encontró ningún elemento TechnicalDocumentReference en el XML" },
  );
  steps.push(
    adminUrls.length > 0
      ? { label: "Enlace al documento administrativo (PCAP)", status: "ok", detail: adminUrls[0] }
      : { label: "Enlace al documento administrativo (PCAP)", status: "fail", detail: "No se encontró ningún elemento LegalDocumentReference en el XML" },
  );

  return steps;
}

// ─── parsing helpers ───────────────────────────────────────────────────────────

function skip(label: string): DiagnosticStep {
  return { label, status: "skip", detail: "" };
}

function findPliegoXmlLink(html: string): { hasPliego: boolean; xmlHref: string | null } {
  let pos = 0;
  while (true) {
    const trStart = html.indexOf("<tr", pos);
    if (trStart === -1) break;
    const trEnd = html.indexOf("</tr>", trStart);
    if (trEnd === -1) break;
    const row = html.slice(trStart, trEnd + 5);
    pos = trEnd + 5;

    if (!/pliego/i.test(row)) continue;

    // Found a pliego row — look for an href containing "xml"
    const hrefs = [...row.matchAll(/href=["']([^"']+)["']/gi)];
    for (const h of hrefs) {
      if (/xml/i.test(h[1])) return { hasPliego: true, xmlHref: h[1] };
    }
    return { hasPliego: true, xmlHref: null };
  }
  return { hasPliego: false, xmlHref: null };
}

function extractDocUrls(xml: string, tagName: string): string[] {
  const urls: string[] = [];
  // Match the tag with optional namespace prefix (e.g. <cac:TechnicalDocumentReference>)
  const tagRe = new RegExp(
    `<(?:[^>:]*:)?${tagName}[\\s>][\\s\\S]*?</(?:[^>:]*:)?${tagName}>`,
    "gi",
  );
  for (const m of xml.matchAll(tagRe)) {
    const inner = m[0];
    const uri = inner.match(/<(?:[^>:]*:)?URI[^>]*>([^<]+)<\/(?:[^>:]*:)?URI>/i);
    if (uri) {
      const url = uri[1].trim();
      if (url && !urls.includes(url)) urls.push(url);
    }
  }
  return urls;
}
