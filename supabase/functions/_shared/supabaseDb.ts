// Datenbank-Anbindung der Edge Functions mit der Service Role (nur serverseitig).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { DataRow, Db, StoredTokens, WhoopStatus, WhoopTable } from './handlers.ts'
import type { WebhookDb } from './webhook.ts'

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY fehlen')
  return createClient(url, key, { auth: { persistSession: false } })
}

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export class SupabaseDb implements Db, WebhookDb {
  private sb: SupabaseClient
  constructor(sb: SupabaseClient) {
    this.sb = sb
  }

  async getTokens(userId: string): Promise<StoredTokens | null> {
    const { data, error } = await this.sb.from('whoop_tokens').select('*').eq('user_id', userId).maybeSingle()
    check(error, 'Tokens lesen')
    if (!data) return null
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      ...(data.scope ? { scope: data.scope } : {}),
      ...(data.whoop_user_id !== null ? { whoopUserId: Number(data.whoop_user_id) } : {}),
    }
  }
  async saveTokens(userId: string, t: StoredTokens): Promise<void> {
    const { error } = await this.sb.from('whoop_tokens').upsert({
      user_id: userId,
      access_token: t.accessToken,
      refresh_token: t.refreshToken,
      expires_at: t.expiresAt,
      scope: t.scope ?? null,
      whoop_user_id: t.whoopUserId ?? null,
      updated_at: new Date().toISOString(),
    })
    check(error, 'Tokens speichern')
  }
  async deleteTokens(userId: string): Promise<void> {
    const { error } = await this.sb.from('whoop_tokens').delete().eq('user_id', userId)
    check(error, 'Tokens löschen')
  }
  async createState(state: string, userId: string, expiresAt: string): Promise<void> {
    const { error } = await this.sb.from('whoop_oauth_states').insert({ state, user_id: userId, expires_at: expiresAt })
    check(error, 'State speichern')
  }
  async consumeState(state: string, now: Date): Promise<string | null> {
    const { data, error } = await this.sb.from('whoop_oauth_states').delete().eq('state', state).select('user_id, expires_at').maybeSingle()
    check(error, 'State prüfen')
    if (!data || Date.parse(data.expires_at) <= now.getTime()) return null
    return data.user_id as string
  }
  async upsertRows(table: WhoopTable, userId: string, rows: DataRow[]): Promise<void> {
    if (rows.length === 0) return
    const { error } = await this.sb
      .from(table)
      .upsert(rows.map((r) => ({ user_id: userId, id: r.id, data: r.data, raw: r.raw, deleted: false })), { onConflict: 'user_id,id' })
    check(error, `${table} speichern`)
  }
  async getStatus(userId: string): Promise<WhoopStatus | null> {
    const { data, error } = await this.sb.from('whoop_status').select('data').eq('user_id', userId).maybeSingle()
    check(error, 'Status lesen')
    return (data?.data as WhoopStatus | undefined) ?? null
  }
  async saveStatus(userId: string, s: WhoopStatus): Promise<void> {
    const { error } = await this.sb.from('whoop_status').upsert({ user_id: userId, key: 'whoop', data: s, deleted: false })
    check(error, 'Status speichern')
  }

  async findUserByWhoopId(whoopUserId: number): Promise<string | null> {
    const { data, error } = await this.sb.from('whoop_tokens').select('user_id').eq('whoop_user_id', whoopUserId).maybeSingle()
    check(error, 'Nutzer suchen')
    return (data?.user_id as string | undefined) ?? null
  }
  async markDeleted(table: WhoopTable, userId: string, id: string): Promise<void> {
    const { error } = await this.sb.from(table).update({ deleted: true }).eq('user_id', userId).eq('id', id)
    check(error, `${table} löschen`)
  }
  async listConnectedUsers(): Promise<string[]> {
    const { data, error } = await this.sb.from('whoop_tokens').select('user_id')
    check(error, 'Nutzer auflisten')
    return (data ?? []).map((r) => r.user_id as string)
  }
}
