require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { Client } = require('pg');

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const sourcePath = args.find((value) => !value.startsWith('--'));
const batchKey = 'legacy-customer-import-2026-08-08';

if (!sourcePath) {
  console.error('Usage: node scripts/import-legacy-customers.js <contacts.tsv> [--apply]');
  process.exit(1);
}

const clean = (value) => String(value || '').trim();
const normalizedEmail = (value) => clean(value).toLowerCase();
const normalizedPhone = (value) => clean(value).replace(/[^0-9+]/g, '');
const unique = (values) => [...new Set(values.filter(Boolean))];

function status(value) {
  const normalized = clean(value).toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'subscribed') return 'subscribed';
  if (normalized === 'unsubscribed') return 'unsubscribed';
  if (normalized === 'never_subscribed') return 'never_subscribed';
  return 'unknown';
}

function timestamp(value) {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? '' : 'Z'));
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function address(row, index) {
  const prefix = `Address ${index} - `;
  const result = {
    type: clean(row[`${prefix}Type`]),
    street: clean(row[`${prefix}Street`]),
    street_line_2: clean(row[`${prefix}Street Line 2`]),
    city: clean(row[`${prefix}City`]),
    state_region: clean(row[`${prefix}State/Region`]),
    postal_code: clean(row[`${prefix}Zip`]),
    country: clean(row[`${prefix}Country`])
  };
  return Object.values(result).some(Boolean) ? result : null;
}

function emailQuality(email) {
  if (!email) return 'missing';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'needs_review';
  if (/@(?:gmaill\.com|gmail\.con)$/i.test(email)) return 'needs_review';
  return 'valid';
}

function rowKey(row, index) {
  return crypto.createHash('sha256').update(`${index}|${JSON.stringify(row)}`).digest('hex');
}

function contactKey(row, index) {
  const email = normalizedEmail(row['Email 1']);
  if (email) return `email:${email}`;
  const phone = normalizedPhone(row['Phone 1']);
  if (phone) return `phone:${phone}`;
  return `row:${index}`;
}

function aggregateRows(rows) {
  const contacts = new Map();
  rows.forEach((row, index) => {
    const key = contactKey(row, index);
    if (!contacts.has(key)) contacts.set(key, []);
    contacts.get(key).push({ row, index });
  });

  return [...contacts.values()].map((entries) => {
    const sorted = [...entries].sort((left, right) => {
      const leftDate = timestamp(left.row['Last Activity Date (UTC+0)']) || timestamp(left.row['Created At (UTC+0)']) || '';
      const rightDate = timestamp(right.row['Last Activity Date (UTC+0)']) || timestamp(right.row['Created At (UTC+0)']) || '';
      return rightDate.localeCompare(leftDate);
    });
    const latest = sorted[0].row;
    const allRows = entries.map(({ row }) => row);
    const firstName = clean(latest['First Name']) || clean(allRows.find((row) => clean(row['First Name']))?.['First Name']);
    const lastName = clean(latest['Last Name']) || clean(allRows.find((row) => clean(row['Last Name']))?.['Last Name']);
    const email = normalizedEmail(latest['Email 1']) || normalizedEmail(allRows.find((row) => normalizedEmail(row['Email 1']))?.['Email 1']);
    const phones = unique(allRows.flatMap((row) => [1, 2, 3, 4].map((number) => normalizedPhone(row[`Phone ${number}`]))));
    const addresses = allRows.flatMap((row) => [1, 2, 3].map((number) => address(row, number))).filter(Boolean);
    const emailStatus = status(latest['Email subscriber status']);
    const smsStatus = status(latest['SMS subscriber status']);
    return {
      entries,
      firstName,
      lastName,
      fullName: clean(`${firstName} ${lastName}`) || email.split('@')[0] || phones[0] || 'Imported Contact',
      email: email || null,
      phones,
      addresses,
      labels: unique(allRows.flatMap((row) => clean(row.Labels).split(',').map(clean))),
      sources: unique(allRows.map((row) => clean(row.Source))),
      language: clean(latest.Language) || null,
      emailStatus,
      smsStatus,
      quality: emailQuality(email),
      legacyCreatedAt: sorted.map(({ row }) => timestamp(row['Created At (UTC+0)'])).filter(Boolean).sort()[0] || null,
      lastActivity: clean(latest['Last Activity']) || null,
      lastActivityAt: timestamp(latest['Last Activity Date (UTC+0)']),
      newsletterActive: emailStatus === 'subscribed' && emailQuality(email) === 'valid'
    };
  });
}

async function findCustomer(client, contact) {
  if (contact.email) {
    const byEmail = await client.query('select * from public.customers where lower(email) = lower($1) order by created_at limit 1', [contact.email]);
    if (byEmail.rows[0]) return byEmail.rows[0];
  }
  if (contact.phones[0]) {
    const digits = contact.phones[0].replace(/\D/g, '');
    const byPhone = await client.query("select * from public.customers where regexp_replace(coalesce(phone,''), '\\D', '', 'g') = $1 order by created_at limit 1", [digits]);
    if (byPhone.rows[0]) return byPhone.rows[0];
  }
  return null;
}

async function saveContact(client, contact) {
  const existing = await findCustomer(client, contact);
  const primaryAddress = contact.addresses[0] || {};
  const currentOrigin = existing?.customer_origin || 'system';
  const origin = existing ? currentOrigin : 'imported';
  const values = [
    contact.fullName, contact.firstName || null, contact.lastName || null, contact.email,
    contact.phones[0] || null, contact.phones, JSON.stringify(contact.addresses), contact.labels,
    contact.sources, contact.language, origin, true, batchKey, contact.emailStatus,
    contact.smsStatus, contact.legacyCreatedAt, contact.lastActivity, contact.lastActivityAt,
    contact.quality, primaryAddress.country || null, primaryAddress.street || null,
    primaryAddress.street_line_2 || null, primaryAddress.city || null,
    primaryAddress.state_region || null, primaryAddress.postal_code || null
  ];

  let customer;
  if (existing) {
    const result = await client.query(`
      update public.customers set
        full_name = coalesce(nullif(full_name, ''), $1), first_name = coalesce(first_name, $2), last_name = coalesce(last_name, $3),
        email = coalesce(email, $4), phone = coalesce(phone, $5), alternate_phones = $6, alternate_addresses = $7::jsonb,
        labels = $8, legacy_sources = $9, preferred_language = coalesce(preferred_language, $10), customer_origin = $11,
        was_imported = $12, imported_at = coalesce(imported_at, now()), import_batch = $13,
        email_marketing_status = $14, sms_marketing_status = $15, legacy_created_at = $16,
        legacy_last_activity = $17, legacy_last_activity_at = $18, email_quality_status = $19,
        default_country = coalesce(default_country, $20), default_address_line1 = coalesce(default_address_line1, $21),
        default_address_line2 = coalesce(default_address_line2, $22), default_city = coalesce(default_city, $23),
        default_state_province = coalesce(default_state_province, $24), default_postal_code = coalesce(default_postal_code, $25),
        updated_at = now()
      where id = $26 returning *`, [...values, existing.id]);
    customer = result.rows[0];
  } else {
    const result = await client.query(`
      insert into public.customers (
        full_name, first_name, last_name, email, phone, alternate_phones, alternate_addresses, labels,
        legacy_sources, preferred_language, customer_origin, was_imported, imported_at, import_batch,
        email_marketing_status, sms_marketing_status, legacy_created_at, legacy_last_activity,
        legacy_last_activity_at, email_quality_status, default_country, default_address_line1,
        default_address_line2, default_city, default_state_province, default_postal_code, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,now(),$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,coalesce($16,now()))
      returning *`, values);
    customer = result.rows[0];
  }

  for (const { row, index } of contact.entries) {
    await client.query(`
      insert into public.customer_import_history (
        customer_id, batch_key, source_row_key, source, imported_email_status, imported_sms_status, raw_data
      ) values ($1,$2,$3,$4,$5,$6,$7::jsonb)
      on conflict (batch_key, source_row_key) do update set customer_id = excluded.customer_id, raw_data = excluded.raw_data`, [
      customer.id, batchKey, rowKey(row, index), clean(row.Source) || null,
      status(row['Email subscriber status']), status(row['SMS subscriber status']), JSON.stringify(row)
    ]);
  }

  if (contact.email) {
    const current = await client.query('select id from public.newsletter_subscribers where lower(email) = lower($1) limit 1', [contact.email]);
    if (!current.rows[0]) {
      await client.query(`
        insert into public.newsletter_subscribers (
          email, source, is_active, customer_id, consent_status, consent_source, subscribed_at, unsubscribed_at, updated_at
        ) values ($1,'legacy-contact-import',$2,$3,$4,'legacy-contact-import',case when $2 then now() else null end,case when $4 = 'unsubscribed' then now() else null end,now())`,
      [contact.email, contact.newsletterActive, customer.id, contact.emailStatus]);
    } else {
      await client.query('update public.newsletter_subscribers set customer_id = coalesce(customer_id,$1), updated_at = now() where id = $2', [customer.id, current.rows[0].id]);
    }
  }
  return { inserted: !existing, customer };
}

async function main() {
  const rows = parse(fs.readFileSync(sourcePath, 'utf8'), {
    columns: true,
    delimiter: '\t',
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true
  });
  const contacts = aggregateRows(rows);
  const summary = {
    source_rows: rows.length,
    merged_contacts: contacts.length,
    newsletter_subscribed: contacts.filter((contact) => contact.newsletterActive).length,
    preserved_unsubscribed: contacts.filter((contact) => contact.emailStatus === 'unsubscribed').length,
    never_subscribed: contacts.filter((contact) => contact.emailStatus === 'never_subscribed').length,
    missing_email: contacts.filter((contact) => !contact.email).length,
    email_needs_review: contacts.filter((contact) => contact.quality === 'needs_review').map((contact) => contact.email)
  };
  console.log(JSON.stringify({ mode: applyChanges ? 'apply' : 'dry-run', batchKey, ...summary }, null, 2));
  if (!applyChanges) return;

  const client = new Client({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query('begin');
    let inserted = 0;
    let updated = 0;
    for (const contact of contacts) {
      const result = await saveContact(client, contact);
      if (result.inserted) inserted += 1;
      else updated += 1;
    }
    await client.query('commit');
    console.log(JSON.stringify({ completed: true, inserted, updated }, null, 2));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Customer import failed: ${error.message}`);
  process.exit(1);
});
