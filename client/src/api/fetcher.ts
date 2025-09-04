export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('VITE_API_URL is missing');
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    credentials: 'include', // cookie auth; remove if you use bearer tokens
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }

  if (!res.ok) {
    const msg = data?.message || data?.error || text || `HTTP ${res.status}`;
    const e: any = new Error(msg);
    e.status = res.status;
    e.body = data ?? text;
    throw e;
  }
  return data as T;
}