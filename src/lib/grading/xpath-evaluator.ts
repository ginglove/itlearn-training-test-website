import { JSDOM } from "jsdom";

export type XPathResult = {
  status: "AC" | "WA" | "CE";
  message: string;
  matchedCount: number;
  referenceCount: number;
  snippets: string[];
};

const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/169\.254\./,
  /^https?:\/\/\[::1\]/,
];

async function fetchHtml(url: string): Promise<string> {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      throw new Error("SSRF_BLOCKED: Target URL resolves to a private network address.");
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching target URL`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function evaluateXPath(doc: Document, xpath: string): Element[] {
  const result = doc.evaluate(xpath, doc, null, 5 /* ORDERED_NODE_ITERATOR_TYPE */, null);
  const nodes: Element[] = [];
  let node = result.iterateNext();
  while (node) {
    nodes.push(node as Element);
    node = result.iterateNext();
  }
  return nodes;
}

export async function evaluateXPathQuestion({
  targetType,
  targetPayload,
  referenceXpath,
  studentXpath,
}: {
  targetType: "URL" | "HTML";
  targetPayload: string;
  referenceXpath: string;
  studentXpath: string;
}): Promise<XPathResult> {
  let html: string;
  try {
    if (targetType === "URL") {
      html = await fetchHtml(targetPayload);
    } else {
      html = targetPayload;
    }
  } catch (err: any) {
    return {
      status: "CE",
      message: err.message ?? "Failed to load target",
      matchedCount: 0,
      referenceCount: 0,
      snippets: [],
    };
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  let refNodes: Element[];
  try {
    refNodes = evaluateXPath(doc, referenceXpath);
  } catch {
    return {
      status: "CE",
      message: "Reference XPath is invalid — contact your instructor.",
      matchedCount: 0,
      referenceCount: 0,
      snippets: [],
    };
  }

  let studentNodes: Element[];
  try {
    studentNodes = evaluateXPath(doc, studentXpath);
  } catch (err: any) {
    return {
      status: "CE",
      message: `XPath syntax error: ${err.message}`,
      matchedCount: 0,
      referenceCount: refNodes.length,
      snippets: [],
    };
  }

  const snippets = studentNodes.slice(0, 5).map((n) => n.outerHTML ?? String(n));

  if (studentNodes.length !== refNodes.length) {
    return {
      status: "WA",
      message: `Selected ${studentNodes.length} element(s), expected ${refNodes.length}.`,
      matchedCount: studentNodes.length,
      referenceCount: refNodes.length,
      snippets,
    };
  }

  // Check that every student node is also in the reference set (by DOM identity)
  const refSet = new Set(refNodes);
  const allMatch = studentNodes.every((n) => refSet.has(n));

  if (!allMatch) {
    return {
      status: "WA",
      message: "Count matches but the selected elements differ from the expected elements.",
      matchedCount: studentNodes.length,
      referenceCount: refNodes.length,
      snippets,
    };
  }

  return {
    status: "AC",
    message: `Correct! Your XPath selected ${studentNodes.length} element(s).`,
    matchedCount: studentNodes.length,
    referenceCount: refNodes.length,
    snippets,
  };
}

// Verify only the reference XPath (for teacher pre-flight check)
export async function verifyReferenceXPath({
  targetType,
  targetPayload,
  referenceXpath,
}: {
  targetType: "URL" | "HTML";
  targetPayload: string;
  referenceXpath: string;
}): Promise<{ ok: boolean; matchedCount: number; message: string }> {
  let html: string;
  try {
    if (targetType === "URL") {
      html = await fetchHtml(targetPayload);
    } else {
      html = targetPayload;
    }
  } catch (err: any) {
    return { ok: false, matchedCount: 0, message: err.message ?? "Failed to load target" };
  }

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  try {
    const nodes = evaluateXPath(doc, referenceXpath);
    if (nodes.length === 0) {
      return { ok: false, matchedCount: 0, message: "Reference XPath matched 0 elements." };
    }
    return { ok: true, matchedCount: nodes.length, message: `Verified — matched ${nodes.length} element(s).` };
  } catch (err: any) {
    return { ok: false, matchedCount: 0, message: `Invalid XPath: ${err.message}` };
  }
}
