// Glow & Go Rewards — Glow Days tab (bonus-multiplier events).
import { supabase } from '/admin/js/supabase-client.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toDateTimeLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); if (Number.isNaN(d.valueOf())) return ''; const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const formatRange = (start, end) => { const f = (v) => new Date(v).toLocaleString('en-JM', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); return `${f(start)} → ${f(end)}`; };

function toast(message, type = 'success') {
  window.showRewardsToast ? window.showRewardsToast(message, type) : alert(message);
}

function panelMarkup() {
  return `
    <section class="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden mb-6">
      <div class="px-6 py-4 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50">
        <div><h2 class="font-bold text-stone-800">Glow Days</h2><p class="text-xs text-stone-500 mt-1">Bonus-credit events, e.g. "2X Glow Credits Weekend" or "Bonus 500 credits when you spend J$5,000+".</p></div>
        <button id="gd_addBtn" class="small-btn" type="button"><i class="fas fa-plus mr-1"></i>New Glow Day</button>
      </div>
      <div id="gd_form" class="p-6 border-b border-stone-100 bg-amber-50/40" hidden>
        <input type="hidden" id="gd_id">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label class="label">Name</label><input id="gd_name" class="input" placeholder="2X Glow Credits Weekend"></div>
          <div><label class="label">Scope</label><select id="gd_scope" class="input">
            <option value="all">All purchases</option>
            <option value="min_spend">Minimum spend bonus</option>
            <option value="category">Specific product category</option>
          </select></div>
          <div><label class="label">Multiplier (1 = normal, 2 = double)</label><input id="gd_multiplier" type="number" min="1" step="0.1" class="input" value="2"></div>
          <div><label class="label">Flat bonus credits (optional)</label><input id="gd_bonusFlat" type="number" min="0" class="input" value="0"></div>
          <div><label class="label">Minimum spend (J$, for min-spend scope)</label><input id="gd_minSpend" type="number" min="0" class="input" value="0"></div>
          <div><label class="label">Category (for category scope)</label><input id="gd_category" class="input" placeholder="e.g. Body Care"></div>
          <div><label class="label">Starts</label><input id="gd_startsAt" type="datetime-local" class="input"></div>
          <div><label class="label">Ends</label><input id="gd_endsAt" type="datetime-local" class="input"></div>
          <div class="md:col-span-2"><label class="label">Description (optional, internal note)</label><input id="gd_description" class="input"></div>
        </div>
        <div class="flex gap-3 mt-4">
          <button id="gd_saveBtn" class="px-4 py-2.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-white font-semibold text-sm" type="button">Save Glow Day</button>
          <button id="gd_cancelBtn" class="px-4 py-2.5 text-sm text-stone-600 font-semibold" type="button">Cancel</button>
        </div>
      </div>
      <div id="gd_list" class="divide-y divide-stone-100"></div>
    </section>`;
}

function rowMarkup(gd) {
  const now = new Date();
  const isLive = gd.active && new Date(gd.starts_at) <= now && new Date(gd.ends_at) >= now;
  const isPast = new Date(gd.ends_at) < now;
  const badge = !gd.active ? '<span class="px-2 py-1 text-xs rounded-full bg-stone-100 text-stone-500 font-bold">Off</span>'
    : isLive ? '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-bold">Live now</span>'
    : isPast ? '<span class="px-2 py-1 text-xs rounded-full bg-stone-100 text-stone-500 font-bold">Ended</span>'
    : '<span class="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800 font-bold">Scheduled</span>';
  const bonusText = [gd.multiplier > 1 ? `${gd.multiplier}× credits` : null, Number(gd.bonus_flat_credits) > 0 ? `+${gd.bonus_flat_credits} flat` : null].filter(Boolean).join(' · ') || 'Standard earning';
  return `<div class="p-5 flex flex-col md:flex-row md:items-center justify-between gap-3" data-gd-row="${gd.id}">
    <div>
      <div class="flex items-center gap-2 flex-wrap"><strong class="text-stone-800">${escapeHtml(gd.name)}</strong>${badge}</div>
      <p class="text-xs text-stone-500 mt-1">${formatRange(gd.starts_at, gd.ends_at)} · ${bonusText}${gd.scope === 'min_spend' ? ` on orders J$${Number(gd.min_spend_jmd).toLocaleString()}+` : ''}${gd.scope === 'category' && gd.category ? ` on ${escapeHtml(gd.category)}` : ''}</p>
    </div>
    <div class="flex gap-2">
      <button class="small-btn" type="button" data-edit-gd="${gd.id}"><i class="fas fa-pen mr-1"></i>Edit</button>
      <button class="danger-btn" type="button" data-toggle-gd="${gd.id}" data-active="${gd.active}">${gd.active ? 'Deactivate' : 'Activate'}</button>
    </div>
  </div>`;
}

let glowDays = [];

async function loadGlowDays() {
  const list = $('gd_list');
  list.innerHTML = `<div class="p-8 text-center text-stone-500">Loading Glow Days…</div>`;
  const { data, error } = await supabase.from('glow_days').select('*').order('starts_at', { ascending: false });
  if (error) { list.innerHTML = `<div class="p-4 text-red-600">${escapeHtml(error.message)}</div>`; return; }
  glowDays = data || [];
  if (!glowDays.length) { list.innerHTML = `<div class="p-8 text-center text-stone-500">No Glow Days scheduled yet.</div>`; return; }
  list.innerHTML = glowDays.map(rowMarkup).join('');
  list.querySelectorAll('[data-edit-gd]').forEach((btn) => btn.addEventListener('click', () => openForm(glowDays.find((g) => g.id === btn.dataset.editGd))));
  list.querySelectorAll('[data-toggle-gd]').forEach((btn) => btn.addEventListener('click', () => toggleActive(btn.dataset.toggleGd, btn.dataset.active !== 'true')));
}

function openForm(gd = null) {
  $('gd_form').hidden = false;
  $('gd_id').value = gd?.id || '';
  $('gd_name').value = gd?.name || '';
  $('gd_scope').value = gd?.scope || 'all';
  $('gd_multiplier').value = gd?.multiplier ?? 2;
  $('gd_bonusFlat').value = gd?.bonus_flat_credits ?? 0;
  $('gd_minSpend').value = gd?.min_spend_jmd ?? 0;
  $('gd_category').value = gd?.category || '';
  $('gd_startsAt').value = toDateTimeLocal(gd?.starts_at) || toDateTimeLocal(new Date().toISOString());
  $('gd_endsAt').value = toDateTimeLocal(gd?.ends_at);
  $('gd_description').value = gd?.description || '';
  $('gd_form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveGlowDay() {
  const id = $('gd_id').value;
  const startsAt = $('gd_startsAt').value;
  const endsAt = $('gd_endsAt').value;
  const name = $('gd_name').value.trim();
  if (!name || !startsAt || !endsAt) { toast('Name, start, and end are required.', 'error'); return; }
  if (new Date(endsAt) <= new Date(startsAt)) { toast('End time must be after the start time.', 'error'); return; }

  const record = {
    name, description: $('gd_description').value.trim() || null,
    scope: $('gd_scope').value, multiplier: Number($('gd_multiplier').value) || 1,
    bonus_flat_credits: Number($('gd_bonusFlat').value) || 0, min_spend_jmd: Number($('gd_minSpend').value) || 0,
    category: $('gd_category').value.trim() || null,
    starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(),
    active: true
  };
  const button = $('gd_saveBtn');
  button.disabled = true;
  try {
    const { error } = id ? await supabase.from('glow_days').update(record).eq('id', id) : await supabase.from('glow_days').insert(record);
    if (error) throw error;
    toast('Glow Day saved.');
    $('gd_form').hidden = true;
    await loadGlowDays();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function toggleActive(id, nextActive) {
  const { error } = await supabase.from('glow_days').update({ active: nextActive }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast(nextActive ? 'Glow Day activated.' : 'Glow Day deactivated.');
  await loadGlowDays();
}

export async function initRewardsGlowDaysTab() {
  const panel = document.getElementById('rewardsPanel-glowdays');
  if (!panel) return;
  panel.innerHTML = panelMarkup();
  $('gd_addBtn').addEventListener('click', () => openForm());
  $('gd_cancelBtn').addEventListener('click', () => { $('gd_form').hidden = true; });
  $('gd_saveBtn').addEventListener('click', saveGlowDay);
  await loadGlowDays();
}
