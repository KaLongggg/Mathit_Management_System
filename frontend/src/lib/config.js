import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

// Small app-wide settings store backed by the `app_config` (key -> jsonb) table.
// Values are plain JSON (number/string/array). A tiny in-memory cache avoids
// refetching within a session.

const DEFAULTS = {
  enrolment_expiry_months: 12,
  invoice_prefix: 'MIT-',
  expiry_reminder_days: 14,
  course_class_options: ['All-in-one', '補底班', '常規班', '精讀班', 'By topic', 'Give away'],
  delivery_mode_options: ['Zoom', 'Tuen Mun', 'Mong Kok', 'Video'],
};

let cache = null;

export async function loadConfig() {
  const { data, error } = await supabase.from('app_config').select('key, value');
  if (error) return { ...DEFAULTS };
  cache = { ...DEFAULTS, ...Object.fromEntries((data || []).map((r) => [r.key, r.value])) };
  return cache;
}

// Cached read (call loadConfig() first); falls back to the built-in default.
export function configValue(key) {
  if (cache && key in cache) return cache[key];
  return DEFAULTS[key];
}

// One-off async read of a single key (does not require loadConfig()).
export async function getConfig(key) {
  const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
  return data ? data.value : DEFAULTS[key];
}

export async function setConfig(key, value) {
  const { error } = await supabase.from('app_config').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  if (cache) cache[key] = value;
}

// React hook: returns the loaded config (merged over defaults), loading once.
export function useConfig() {
  const [cfg, setCfg] = useState(cache || { ...DEFAULTS });
  useEffect(() => {
    let active = true;
    if (cache) { setCfg(cache); return; }
    loadConfig().then((c) => { if (active) setCfg(c); });
    return () => { active = false; };
  }, []);
  return cfg;
}

export { DEFAULTS as CONFIG_DEFAULTS };
