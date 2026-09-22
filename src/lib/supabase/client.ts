
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http') &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class MockRealtimeChannel {
  private channelName: string;
  private bc: BroadcastChannel | null = null;
  private listeners: Map<string, Array<(msg: any) => void>> = new Map();

  constructor(name: string) {
    this.channelName = name;
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.bc = new BroadcastChannel(`ft_supabase_${name}`);
        this.bc.onmessage = (event) => {
          const { evt, payload } = event.data || {};
          const callbacks = this.listeners.get(evt);
          if (callbacks) {
            callbacks.forEach(cb => cb({ payload }));
          }
        };
      } catch (err) {
        console.warn('Mock BroadcastChannel error:', err);
      }
    }
  }

  on(_type: string, filter: { event: string }, callback: (msg: any) => void) {
    const list = this.listeners.get(filter.event) || [];
    list.push(callback);
    this.listeners.set(filter.event, list);
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED'), 10);
    }
    return this;
  }

  send(msg: { type: string; event: string; payload: any }) {
    if (this.bc) {
      try {
        this.bc.postMessage({ evt: msg.event, payload: msg.payload });
      } catch (err) {
        console.warn('Mock BroadcastChannel send error:', err);
      }
    }
    return Promise.resolve({ error: null });
  }

  unsubscribe() {
    if (this.bc) {
      try {
        this.bc.close();
      } catch {
        // ignore
      }
      this.bc = null;
    }
    this.listeners.clear();
  }
}

function getLocalStore(key: string): Record<string, any> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`ft_mock_${key}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalStore(key: string, data: Record<string, any>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`ft_mock_${key}`, JSON.stringify(data));
  } catch {}
}

function createMockClient(): any {
  return {
    channel(name: string) {
      return new MockRealtimeChannel(name);
    },
    from(table: string) {
      return {
        insert(items: any[]) {
          const records = getLocalStore(table);
          const first = items[0] || {};
          const id = first.id || ('share_' + Math.random().toString(36).substring(2, 9));
          const created = { ...first, id, created_at: new Date().toISOString() };
          records[id] = created;
          saveLocalStore(table, records);

          return {
            select(_fields?: string) {
              return {
                single: async () => ({ data: created, error: null })
              };
            }
          };
        },
        select(_fields?: string) {
          const filters: Array<{ col: string; val: any }> = [];
          const query = {
            eq(col: string, val: any) {
              filters.push({ col, val });
              return query;
            },
            single: async () => {
              const records = getLocalStore(table);
              const items = Object.values(records);
              const match = items.find(item =>
                filters.every(f => item[f.col] === f.val)
              );
              if (!match) {
                return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
              }
              return { data: match, error: null };
            }
          };
          return query;
        },
        update(patch: any) {
          return {
            eq: async (col: string, val: any) => {
              const records = getLocalStore(table);
              for (const [id, item] of Object.entries(records)) {
                if (item[col] === val) {
                  records[id] = { ...item, ...patch };
                }
              }
              saveLocalStore(table, records);
              return { data: null, error: null };
            }
          };
        }
      };
    }
  };
}

let clientInstance: any = null;

// Create a singleton Supabase client for the browser
export const createClient = (): any => {
  if (!isConfigured) {
    if (!clientInstance) {
      clientInstance = createMockClient();
    }
    return clientInstance;
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
};
