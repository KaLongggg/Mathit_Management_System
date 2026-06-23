// Turns a visual "audience" config into a recipient SQL query for the WhatsApp
// scheduler. The scheduler only needs a SELECT that returns `phone_number`
// (plus optional columns used as message template variables).

const qv = (v) => `'${String(v).replace(/'/g, "''")}'`;

export function parsePhones(text) {
  return (text || '').split(/[\s,]+/).map((p) => p.replace(/\s+/g, '').trim()).filter(Boolean);
}

const STUDENT_SELECT =
  'SELECT s.student_id, s.first_name, s.last_name, s.full_name, s.phone_number,\n' +
  '       s.dse_year, s.dse_aim, s.current_level\n';

export function buildAudienceSql(a) {
  if (!a || !a.type) return '';

  if (a.type === 'course') {
    if (!a.courseId) return '';
    let sql =
      STUDENT_SELECT +
      'FROM student s\n' +
      'JOIN enrolments e ON e.student_id = s.student_id\n' +
      `WHERE e.course_id = ${qv(a.courseId)}\n` +
      "  AND s.phone_number IS NOT NULL AND s.phone_number <> ''";
    if (a.statuses?.length) sql += `\n  AND e.status IN (${a.statuses.map(qv).join(', ')})`;
    if (a.dseYears?.length) sql += `\n  AND s.dse_year IN (${a.dseYears.map(qv).join(', ')})`;
    if (a.levels?.length) sql += `\n  AND s.current_level IN (${a.levels.map(qv).join(', ')})`;
    return sql;
  }

  if (a.type === 'students') {
    let sql = STUDENT_SELECT + 'FROM student s\n' + "WHERE s.phone_number IS NOT NULL AND s.phone_number <> ''";
    if (a.dseYears?.length) sql += `\n  AND s.dse_year IN (${a.dseYears.map(qv).join(', ')})`;
    if (a.levels?.length) sql += `\n  AND s.current_level IN (${a.levels.map(qv).join(', ')})`;
    return sql;
  }

  if (a.type === 'leads') {
    let sql =
      'SELECT full_name, phone_number, dse_year, campaign\n' +
      'FROM marketing_leads\n' +
      "WHERE phone_number IS NOT NULL AND phone_number <> ''\n" +
      '  AND consent_marketing IS TRUE';
    if (a.campaigns?.length) sql += `\n  AND campaign IN (${a.campaigns.map(qv).join(', ')})`;
    return sql;
  }

  if (a.type === 'manual') {
    const phones = parsePhones(a.phonesText);
    if (!phones.length) return '';
    return `SELECT * FROM (VALUES ${phones.map((p) => `(${qv(p)})`).join(', ')}) AS t(phone_number)`;
  }

  return '';
}

// Template variables available for each audience type (for the placeholder pills).
export function audienceFields(type) {
  switch (type) {
    case 'course':
    case 'students':
      return ['student_id', 'first_name', 'last_name', 'full_name', 'phone_number', 'dse_year', 'dse_aim', 'current_level'];
    case 'leads':
      return ['full_name', 'phone_number', 'dse_year', 'campaign'];
    case 'manual':
      return ['phone_number'];
    default:
      return [];
  }
}

export const AUDIENCE_DEFAULT = {
  type: 'course',
  courseId: '',
  courseName: '',
  statuses: [],
  dseYears: [],
  levels: [],
  campaigns: [],
  phonesText: '',
};
