const _cache = new Map<string, { data: any; expiresAt: number }>();
export const KANBAN_CACHE_TTL_MS = 60_000;

export const kanbanCacheGet = (key: string): any | null => {
  const entry = _cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
};

export const kanbanCacheSet = (key: string, data: any) => {
  _cache.set(key, { data, expiresAt: Date.now() + KANBAN_CACHE_TTL_MS });
};

export const invalidateKanbanCache = () => _cache.clear();
