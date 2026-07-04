import { JSDOM } from "jsdom";

export type SelectorType = "XPATH" | "CSS";

export type CaseResult = {
  caseIndex: number;
  status: "AC" | "WA" | "CE";
  message: string;
  matchedCount: number;
  referenceCount: number;
  snippets: string[];
};

export type XPathGradeResult = {
  status: "AC" | "WA" | "CE";
  message: string;
  scorePercentage: number;
  caseResults: CaseResult[];
};

export type VerifyResult = {
  ok: boolean;
  matchedCount: number;
  message: string;
  snippets: string[];
};

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_SELECTOR_LENGTH = 500;

const PRIVATE_IP_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/10\./,
  /^https?:\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[fc/i,
  /^https?:\/\/\[fd/i,
];

const MAX_REDIRECTS = 3;

/** True if the (already resolved) IP address falls in a private/loopback/link-local range. */
function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) {
    return true;
  }
  // Handle IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4 = ip.includes(":") ? ip.split(":").pop() ?? "" : ip;
  const parts = v4.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    // Non-IPv4 (pure IPv6 public) — allow unless matched above
    return false;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Resolve the hostname via DNS and reject private/loopback targets (DNS-rebinding guard). */
async function assertPublicTarget(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("SSRF_BLOCKED: Only http:// and https:// URLs are permitted.");
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error("SSRF_BLOCKED: Target URL resolves to a private network address.");
    }
  }
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  // Literal IPs are checked directly; hostnames are resolved before fetching
  let addresses: string[];
  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    addresses = [hostname];
  } else {
    const dns = await import("dns");
    const results = await dns.promises.lookup(hostname, { all: true }).catch(() => {
      throw new Error("SSRF_BLOCKED: Target hostname could not be resolved.");
    });
    addresses = results.map((r) => r.address);
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new Error("SSRF_BLOCKED: Target URL resolves to a private network address.");
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // Follow redirects manually (max 3), re-validating every hop against SSRF
    let currentUrl = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicTarget(currentUrl);
      res = await fetch(currentUrl, { signal: controller.signal, redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new Error("SSRF_BLOCKED: Redirect without location header.");
        if (hop === MAX_REDIRECTS) {
          throw new Error("SSRF_BLOCKED: Too many redirects (max 3).");
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      break;
    }
    if (!res) throw new Error("SSRF_BLOCKED: Fetch failed.");
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching target URL`);

    // Text/HTML only — media and binary downloads are rejected
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml|text\/plain|text\/xml|application\/xml/i.test(contentType)) {
      throw new Error("SSRF_BLOCKED: Target is not an HTML/text document.");
    }

    const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_RESPONSE_BYTES) {
      throw new Error("SSRF_BLOCKED: Response too large.");
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("SSRF_BLOCKED: Response too large.");
    }
    return new TextDecoder().decode(buffer);
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateSelector(doc: Document, selector: string, selectorType: SelectorType): Element[] {
  if (selector.length > MAX_SELECTOR_LENGTH) {
    throw new Error(`Selector exceeds maximum length of ${MAX_SELECTOR_LENGTH} characters.`);
  }
  if (selectorType === "CSS") {
    try {
      return Array.from(doc.querySelectorAll(selector));
    } catch (err: any) {
      throw new Error(`CSS selector error: ${err.message}`);
    }
  }
  const result = doc.evaluate(selector, doc, null, 5, null);
  const nodes: Element[] = [];
  let node = result.iterateNext();
  while (node) {
    nodes.push(node as Element);
    node = result.iterateNext();
  }
  return nodes;
}

async function loadDocument(
  targetType: "URL" | "HTML",
  targetPayload: string
): Promise<{ doc: Document } | { error: string }> {
  try {
    const html = targetType === "URL" ? await fetchHtml(targetPayload) : targetPayload;
    const dom = new JSDOM(html);
    return { doc: dom.window.document };
  } catch (err: any) {
    return { error: err.message ?? "Failed to load target" };
  }
}

export async function verifyReferenceSelector({
  selectorType,
  targetType,
  targetPayload,
  referenceSelector,
}: {
  selectorType: SelectorType;
  targetType: "URL" | "HTML";
  targetPayload: string;
  referenceSelector: string;
}): Promise<VerifyResult> {
  const loaded = await loadDocument(targetType, targetPayload);
  if ("error" in loaded) {
    return { ok: false, matchedCount: 0, message: loaded.error, snippets: [] };
  }
  const { doc } = loaded;

  try {
    const nodes = evaluateSelector(doc, referenceSelector.trim(), selectorType);
    if (nodes.length === 0) {
      return {
        ok: false,
        matchedCount: 0,
        message:
          targetType === "URL"
            ? "Selector matched 0 elements. The page may render content via JavaScript (jsdom uses static HTML only). Try switching to HTML mode and pasting the rendered HTML from your browser DevTools."
            : "Selector matched 0 elements. Check that the selector and HTML snippet are correct.",
        snippets: [],
      };
    }
    const snippets = nodes.slice(0, 5).map((n) => n.outerHTML ?? String(n));
    return {
      ok: true,
      matchedCount: nodes.length,
      message: `Verified — matched ${nodes.length} element(s).`,
      snippets,
    };
  } catch (err: any) {
    return { ok: false, matchedCount: 0, message: err.message, snippets: [] };
  }
}

export async function gradeXPathQuestion({
  selectorType,
  testCases,
  studentSelector,
}: {
  selectorType?: SelectorType;
  testCases: Array<{
    targetType: "URL" | "HTML";
    targetPayload: string;
    referenceSelector: string;
    selectorType?: SelectorType;
  }>;
  studentSelector: string;
}): Promise<XPathGradeResult> {
  if (testCases.length === 0) {
    return {
      status: "CE",
      message: "No test cases configured for this question.",
      scorePercentage: 0,
      caseResults: [],
    };
  }

  const trimmedSelector = studentSelector.trim();
  const caseResults: CaseResult[] = [];
  let passedCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const loaded = await loadDocument(tc.targetType, tc.targetPayload);

    if ("error" in loaded) {
      caseResults.push({
        caseIndex: i,
        status: "CE",
        message: loaded.error,
        matchedCount: 0,
        referenceCount: 0,
        snippets: [],
      });
      continue;
    }

    const { doc } = loaded;

    const caseSelectorType: SelectorType = tc.selectorType ?? selectorType ?? "XPATH";

    const studentHasPrefix = studentSelector.startsWith("css:") || studentSelector.startsWith("xpath:");
    const studentChosenType: SelectorType = studentSelector.startsWith("css:") 
      ? "CSS" 
      : studentSelector.startsWith("xpath:") 
      ? "XPATH" 
      : caseSelectorType;
    
    const trimmedStudentSelector = studentHasPrefix
      ? (studentSelector.startsWith("css:") ? studentSelector.substring(4).trim() : studentSelector.substring(6).trim())
      : studentSelector.trim();

    let refNodes: Element[];
    try {
      refNodes = evaluateSelector(doc, tc.referenceSelector.trim(), caseSelectorType);
    } catch {
      caseResults.push({
        caseIndex: i,
        status: "CE",
        message: "Reference selector is invalid — contact your instructor.",
        matchedCount: 0,
        referenceCount: 0,
        snippets: [],
      });
      continue;
    }

    let studentNodes: Element[];
    try {
      studentNodes = evaluateSelector(doc, trimmedStudentSelector, studentChosenType);
    } catch (err: any) {
      caseResults.push({
        caseIndex: i,
        status: "CE",
        message: `Selector syntax error: ${err.message}`,
        matchedCount: 0,
        referenceCount: refNodes.length,
        snippets: [],
      });
      continue;
    }

    const snippets = studentNodes.slice(0, 5).map((n) => n.outerHTML ?? String(n));

    // #6: Vacuous match (both select 0 elements) is always WA
    if (studentNodes.length === 0 && refNodes.length === 0) {
      caseResults.push({
        caseIndex: i,
        status: "WA",
        message: "Both selectors matched 0 elements — a vacuous match is not accepted.",
        matchedCount: 0,
        referenceCount: 0,
        snippets: [],
      });
      continue;
    }

    if (studentNodes.length !== refNodes.length) {
      caseResults.push({
        caseIndex: i,
        status: "WA",
        message: `Selected ${studentNodes.length} element(s), expected ${refNodes.length}.`,
        matchedCount: studentNodes.length,
        referenceCount: refNodes.length,
        snippets,
      });
      continue;
    }

    // #6: XPATH uses DOM reference comparison (same jsdom instance); CSS uses outerHTML string comparison
    let allMatch: boolean;
    if (caseSelectorType === "CSS") {
      const refHtmls = refNodes.map(n => n.outerHTML);
      const studentHtmls = studentNodes.map(n => n.outerHTML);
      allMatch = studentHtmls.every((h, idx) => h === refHtmls[idx]);
    } else {
      const refSet = new Set(refNodes);
      allMatch = studentNodes.every((n) => refSet.has(n));
    }

    if (!allMatch) {
      caseResults.push({
        caseIndex: i,
        status: "WA",
        message: "Count matches but the selected elements differ from the expected elements.",
        matchedCount: studentNodes.length,
        referenceCount: refNodes.length,
        snippets,
      });
      continue;
    }

    passedCount++;
    caseResults.push({
      caseIndex: i,
      status: "AC",
      message: `Correct! Matched ${studentNodes.length} element(s).`,
      matchedCount: studentNodes.length,
      referenceCount: refNodes.length,
      snippets,
    });
  }

  const scorePercentage = (passedCount / testCases.length) * 100;
  const overallStatus: "AC" | "WA" | "CE" =
    passedCount === testCases.length
      ? "AC"
      : caseResults.some((r) => r.status === "CE")
      ? "CE"
      : "WA";

  return {
    status: overallStatus,
    message: `Passed ${passedCount}/${testCases.length} test case(s).`,
    scorePercentage,
    caseResults,
  };
}
