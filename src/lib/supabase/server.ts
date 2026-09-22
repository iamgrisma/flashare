
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const isConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('http') &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const serverStore = new Map<string, any>();
const serverStats = {
  total_files_transferred: 0,
  total_bytes_transferred: 0,
  file_types: {} as Record<string, number>,
  transfer_modes: {} as Record<string, number>
};

function createMockServerClient(): any {
  return {
    from(table: string) {
      if (table === 'transfer_stats') {
        return {
          select(_fields?: string) {
            return {
              eq(_col: string, _val: any) {
                return {
                  single: async () => ({
                    data: { ...serverStats, date: new Date().toISOString().split('T')[0] },
                    error: null
                  })
                };
              }
            };
          }
        };
      }

      return {
        select(_fields?: string) {
          const filters: Array<{ col: string; val: any }> = [];
          const query = {
            eq(col: string, val: any) {
              filters.push({ col, val });
              return query;
            },
            single: async () => {
              for (const record of serverStore.values()) {
                if (filters.every(f => record[f.col] === f.val)) {
                  return { data: record, error: null };
                }
              }
              return { data: null, error: { message: 'Not found', code: 'PGRST116' } };
            }
          };
          return query;
        },
        update(patch: any) {
          return {
            eq: async (col: string, val: any) => {
              for (const [key, record] of serverStore.entries()) {
                if (record[col] === val) {
                  serverStore.set(key, { ...record, ...patch });
                }
              }
              return { data: null, error: null };
            }
          };
        },
        delete() {
          return {
            lt: (_col: string, _val: any) => ({
              select: async (_fields?: string) => ({ data: [], error: null })
            })
          };
        }
      };
    },
    rpc(fnName: string, args: any) {
      if (fnName === 'update_transfer_stats') {
        serverStats.total_files_transferred += args?.p_files_transferred || 0;
        serverStats.total_bytes_transferred += args?.p_bytes_transferred || 0;
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
  };
}

let serverClientInstance: any = null;

// Create a singleton Supabase client for the server
export const createClient = (): any => {
  if (!isConfigured) {
    if (!serverClientInstance) {
      serverClientInstance = createMockServerClient();
    }
    return serverClientInstance;
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
};
