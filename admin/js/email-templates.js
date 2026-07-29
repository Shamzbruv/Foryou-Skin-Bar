import { supabase, checkAuth } from '/admin/js/supabase-client.js';

let adminSession = null;
let templates = [];
let activeTemplate = null;
let activeCategory = 'All';
let quill = null;
let sourceMode = false;
let dirty = false;
let suppressChanges = false;
let toastTimer = null;

const elements = {
    list: document.getElementById('templateList'), search: document.getElementById('templateSearch'), filters: document.getElementById('categoryFilters'),
    empty: document.getElementById('editorEmpty'), content: document.getElementById('editorContent'), name: document.getElementById('templateName'),
    category: document.getElementById('templateCategory'), audience: document.getElementById('templateAudience'), description: document.getElementById('templateDescription'),
    subject: document.getElementById('subjectInput'), html: document.getElementById('htmlEditor'), variables: document.getElementById('variableList'),
    variableSelect: document.getElementById('variableSelect'), visualMode: document.getElementById('visualModeBtn'), htmlMode: document.getElementById('htmlModeBtn'),
    save: document.getElementById('saveBtn'), preview: document.getElementById('previewBtn'), test: document.getElementById('testBtn'), reset: document.getElementById('resetBtn'),
    status: document.getElementById('saveStatus'), updatedAt: document.getElementById('updatedAt'), previewDialog: document.getElementById('previewDialog'),
    previewFrame: document.getElementById('previewFrame'), previewTitle: document.getElementById('previewTitle'), testDialog: document.getElementById('testDialog'),
    testForm: document.getElementById('testForm'), testRecipient: document.getElementById('testRecipient'), confirmTest: document.getElementById('confirmTestBtn')
};

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toastIcon').className = type === 'error' ? 'fas fa-circle-exclamation' : 'fas fa-circle-check';
    toast.classList.toggle('error', type === 'error');
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

async function apiRequest(path, options = {}) {
    if (!adminSession?.access_token) adminSession = await checkAuth();
    const response = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.access_token}`, ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
}

function currentBody() {
    return sourceMode ? elements.html.value : quill.root.innerHTML;
}

function setDirty(value) {
    dirty = value;
    elements.status.classList.toggle('unsaved', value);
    elements.status.innerHTML = value
        ? '<i class="fas fa-circle" aria-hidden="true"></i><span>Unsaved changes</span>'
        : '<i class="fas fa-circle-check" aria-hidden="true"></i><span>Saved</span>';
}

function markDirty() {
    if (!suppressChanges && activeTemplate) setDirty(true);
}

function formatUpdatedAt(value) {
    if (!value) return 'Using the original template';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `Updated ${new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Jamaica' }).format(date)}`;
}

function renderFilters() {
    const categories = ['All', ...new Set(templates.map((template) => template.category))];
    elements.filters.innerHTML = categories.map((category) => `<button type="button" data-category="${escapeHtml(category)}" class="${category === activeCategory ? 'active' : ''}">${escapeHtml(category)}</button>`).join('');
}

function renderList() {
    const query = elements.search.value.trim().toLowerCase();
    const visible = templates.filter((template) => (activeCategory === 'All' || template.category === activeCategory)
        && `${template.name} ${template.description} ${template.audience}`.toLowerCase().includes(query));
    elements.list.innerHTML = visible.length ? visible.map((template) => `
        <button class="template-item ${template.template_key === activeTemplate?.template_key ? 'active' : ''}" type="button" data-template-key="${template.template_key}">
            <span class="template-item-top"><strong>${escapeHtml(template.name)}</strong><span class="audience-dot" aria-hidden="true"></span></span>
            <small>${escapeHtml(template.audience)} &middot; ${escapeHtml(template.category)}</small>
        </button>`).join('') : '<div class="editor-empty"><p>No matching templates.</p></div>';
}

function renderVariables(template) {
    const options = template.variables.map((variable) => `<option value="${escapeHtml(variable.token)}">${escapeHtml(variable.label)}</option>`).join('');
    elements.variableSelect.innerHTML = `<option value="">Insert variable</option>${options}`;
    elements.variables.innerHTML = template.variables.map((variable) => `
        <button class="variable-chip" type="button" data-token="${escapeHtml(variable.token)}" title="${escapeHtml(variable.description)}">${escapeHtml(variable.token)}</button>`).join('');
}

function selectTemplate(templateKey, force = false) {
    const next = templates.find((template) => template.template_key === templateKey);
    if (!next || next === activeTemplate) return;
    if (!force && dirty && !window.confirm('Discard the unsaved changes to this email?')) return;
    activeTemplate = next;
    suppressChanges = true;
    elements.empty.hidden = true;
    elements.content.hidden = false;
    elements.name.textContent = next.name;
    elements.category.textContent = next.category;
    elements.audience.textContent = next.audience;
    elements.description.textContent = next.description;
    elements.subject.value = next.subject_template;
    quill.clipboard.dangerouslyPasteHTML(next.body_html);
    elements.html.value = next.body_html;
    elements.updatedAt.textContent = formatUpdatedAt(next.updated_at);
    renderVariables(next);
    elements.save.disabled = false;
    elements.preview.disabled = false;
    elements.test.disabled = false;
    setEditorMode(false);
    setDirty(false);
    suppressChanges = false;
    renderList();
}

function setEditorMode(showSource) {
    if (!quill) return;
    if (showSource && !sourceMode) elements.html.value = quill.root.innerHTML;
    if (!showSource && sourceMode) {
        suppressChanges = true;
        quill.clipboard.dangerouslyPasteHTML(elements.html.value);
        suppressChanges = false;
    }
    sourceMode = showSource;
    document.querySelector('.ql-toolbar').hidden = showSource;
    document.querySelector('.ql-container').hidden = showSource;
    elements.html.hidden = !showSource;
    elements.visualMode.classList.toggle('active', !showSource);
    elements.htmlMode.classList.toggle('active', showSource);
    elements.visualMode.setAttribute('aria-pressed', String(!showSource));
    elements.htmlMode.setAttribute('aria-pressed', String(showSource));
}

function insertVariable(token) {
    if (!token || !activeTemplate) return;
    if (document.activeElement === elements.subject) {
        const start = elements.subject.selectionStart ?? elements.subject.value.length;
        const end = elements.subject.selectionEnd ?? start;
        elements.subject.setRangeText(token, start, end, 'end');
        elements.subject.focus();
    } else if (sourceMode) {
        const start = elements.html.selectionStart ?? elements.html.value.length;
        const end = elements.html.selectionEnd ?? start;
        elements.html.setRangeText(token, start, end, 'end');
        elements.html.focus();
    } else {
        const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
        quill.insertText(range.index, token, 'user');
        quill.setSelection(range.index + token.length, 0, 'silent');
        quill.focus();
    }
    markDirty();
}

function editorPayload() {
    return { subject_template: elements.subject.value.trim(), body_html: currentBody() };
}

async function saveTemplate() {
    if (!activeTemplate) return;
    const original = elements.save.innerHTML;
    elements.save.disabled = true;
    elements.save.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Saving</span>';
    try {
        const result = await apiRequest(`/api/admin/email-templates/${activeTemplate.template_key}`, { method: 'PUT', body: JSON.stringify(editorPayload()) });
        Object.assign(activeTemplate, result.template);
        elements.updatedAt.textContent = formatUpdatedAt(activeTemplate.updated_at);
        setDirty(false);
        showToast(`${activeTemplate.name} saved.`);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.save.disabled = false;
        elements.save.innerHTML = original;
    }
}

async function previewTemplate() {
    if (!activeTemplate) return;
    elements.preview.disabled = true;
    try {
        const result = await apiRequest(`/api/admin/email-templates/${activeTemplate.template_key}/preview`, { method: 'POST', body: JSON.stringify(editorPayload()) });
        elements.previewTitle.textContent = result.subject;
        elements.previewFrame.srcdoc = result.html;
        elements.previewDialog.showModal();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.preview.disabled = false;
    }
}

async function resetTemplate() {
    if (!activeTemplate || !window.confirm(`Restore ${activeTemplate.name} to its original subject and content?`)) return;
    try {
        const result = await apiRequest(`/api/admin/email-templates/${activeTemplate.template_key}/reset`, { method: 'POST', body: '{}' });
        Object.assign(activeTemplate, result.template);
        selectTemplate(activeTemplate.template_key, true);
        suppressChanges = true;
        elements.subject.value = activeTemplate.subject_template;
        quill.clipboard.dangerouslyPasteHTML(activeTemplate.body_html);
        elements.html.value = activeTemplate.body_html;
        elements.updatedAt.textContent = formatUpdatedAt(activeTemplate.updated_at);
        setDirty(false);
        suppressChanges = false;
        showToast(`${activeTemplate.name} restored.`);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function sendTest(event) {
    event.preventDefault();
    if (!activeTemplate) return;
    const original = elements.confirmTest.innerHTML;
    elements.confirmTest.disabled = true;
    elements.confirmTest.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending</span>';
    try {
        const result = await apiRequest(`/api/admin/email-templates/${activeTemplate.template_key}/test`, {
            method: 'POST', body: JSON.stringify({ ...editorPayload(), recipient: elements.testRecipient.value.trim() })
        });
        elements.testDialog.close();
        showToast(`Test email ${result.email_status} to ${result.recipient}.`);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        elements.confirmTest.disabled = false;
        elements.confirmTest.innerHTML = original;
    }
}

async function initialize() {
    adminSession = await checkAuth();
    if (!adminSession) return;
    elements.testRecipient.value = adminSession.user.email || '';
    quill = new Quill('#quillEditor', {
        theme: 'snow',
        modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }
    });
    quill.on('text-change', markDirty);
    try {
        const result = await apiRequest('/api/admin/email-templates');
        templates = result.templates || [];
        renderFilters();
        renderList();
        if (templates.length) selectTemplate(templates[0].template_key, true);
    } catch (error) {
        elements.list.innerHTML = `<div class="editor-empty"><p>${escapeHtml(error.message)}</p></div>`;
        showToast(error.message, 'error');
    }
}

elements.filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (!button) return;
    activeCategory = button.dataset.category;
    renderFilters();
    renderList();
});
elements.list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-template-key]');
    if (button) selectTemplate(button.dataset.templateKey);
});
elements.search.addEventListener('input', renderList);
elements.subject.addEventListener('input', markDirty);
elements.html.addEventListener('input', markDirty);
elements.visualMode.addEventListener('click', () => setEditorMode(false));
elements.htmlMode.addEventListener('click', () => setEditorMode(true));
elements.variableSelect.addEventListener('change', () => { insertVariable(elements.variableSelect.value); elements.variableSelect.value = ''; });
elements.variables.addEventListener('click', (event) => { const chip = event.target.closest('[data-token]'); if (chip) insertVariable(chip.dataset.token); });
elements.save.addEventListener('click', saveTemplate);
elements.preview.addEventListener('click', previewTemplate);
elements.test.addEventListener('click', () => elements.testDialog.showModal());
elements.reset.addEventListener('click', resetTemplate);
elements.testForm.addEventListener('submit', sendTest);
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog)?.close()));
window.addEventListener('beforeunload', (event) => { if (dirty) event.preventDefault(); });

initialize();
