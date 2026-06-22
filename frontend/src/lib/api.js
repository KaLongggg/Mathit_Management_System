import { supabase } from './supabase.js';

// Calls the thinkific-admin edge function and surfaces a clean error message
// whether the failure came back as a non-2xx response or a 200 with { error }.
export async function callAdmin(body) {
  const { data, error } = await supabase.functions.invoke('thinkific-admin', { body });
  if (error) {
    let msg = error.message || 'Request failed';
    try {
      const ctx = await error.context?.json?.();
      if (ctx?.error) {
        msg = ctx.error;
        if (ctx.detail) msg += ` — ${typeof ctx.detail === 'string' ? ctx.detail : JSON.stringify(ctx.detail)}`;
      }
    } catch {
      /* keep default message */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const createStudent = (fields) => callAdmin({ action: 'create_student', ...fields });
export const updateStudent = (student_id, fields) => callAdmin({ action: 'update_student', student_id, ...fields });
export const enrolStudent = (student_id, course_id) => callAdmin({ action: 'enrol', student_id, course_id });
