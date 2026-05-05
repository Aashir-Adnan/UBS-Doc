import { API_BASE_URL } from '@site/src/components/portal/config';

const BASE = `${API_BASE_URL}/api`;

export async function mwGet(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(await r.text());
  const json = await r.json();
  return json.payload?.return ?? json.payload ?? json;
}

export async function mwPost(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  if (!r.ok) throw new Error(data.error || text || r.statusText);
  return data.payload?.return ?? data.payload ?? data;
}

export async function mwPostForm(path, formData) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', body: formData });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(text || r.statusText); }
  if (!r.ok) throw new Error(data.error || text || r.statusText);
  return data.payload?.return ?? data.payload ?? data;
}
