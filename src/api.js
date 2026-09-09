const jsonHeaders = { "Content-Type": "application/json" };

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function fetchStandards() {
  return parse(await fetch("/api/standards"));
}

export async function analyzeText(text) {
  return parse(await fetch("/api/analyze", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
  }));
}

export async function fetchSession() {
  const res = await fetch("/api/session");
  if (!res.ok) return null;
  return res.json();
}

export async function fetchAnalyses() {
  const res = await fetch("/api/analyses");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchAnalysis(analysisId) {
  return parse(await fetch(`/api/analyses/${encodeURIComponent(analysisId)}`));
}

export async function saveDecision(analysisId, standardId, decision) {
  return parse(await fetch("/api/decisions", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ analysisId, standardId, decision }),
  }));
}

export async function updateStandard(id, patch) {
  return parse(await fetch(`/api/standards/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(patch),
  }));
}

export async function extractUpload(file) {
  const body = new FormData();
  body.append("file", file);
  return parse(await fetch("/api/extract-text", { method: "POST", body }));
}
