import type { Backend } from './backend';
import { createLocalBackend } from './local';
import { createSupabaseBackend } from './supabase';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Supabase when configured, otherwise the on-device demo backend. */
export const api: Backend = url && key ? createSupabaseBackend(url, key) : createLocalBackend();

export * from './backend';
