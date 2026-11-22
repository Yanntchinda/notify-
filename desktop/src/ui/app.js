'use strict';
const $ = (id) => document.getElementById(id);
const dialog = $('contact-dialog');
const form = $('contact-form');
let contacts = [];
let editingId = null;
let notesContact = null;
let conversations = [];
let currentView = 'contacts';
let selectedConversation = null;
let savedDraft = '';
let draftDirty = false;

function showError(element, message) { element.textContent = message; element.hidden = !message; }
function safeError(error) {
  const text = String(error?.message || 'Une erreur est survenue.');
  if (text.includes('Ce numéro existe déjà')) return 'Ce numéro existe déjà dans les contacts.';
  if (text.includes('Téléphone doit contenir')) return 'Indiquez un numéro de téléphone.';
  if (text.includes('Note doit contenir')) return 'Saisissez une note.';
  if (text.includes('Ce fichier existe déjà')) return 'Ce fichier existe déjà. Choisissez un nouveau nom.';
  if (text.includes('Restauration impossible')) return 'Restauration impossible. Vérifiez le fichier : les données actuelles ont été conservées.';
  if (text.includes('Ce livreur possède des comptes rendus')) return 'Ce livreur possède des comptes rendus. Supprimez-les avant de supprimer ce contact.';
  if (text.includes('date de début doit précéder')) return 'La date de début doit précéder la date de fin.';
  if (text.includes('Quantité invalide')) return 'Quantité invalide : utilisez au plus trois décimales.';
  if (text.includes('quantité doit être positive')) return 'La quantité doit être positive.';
  if (text.includes('montant doit être')) return 'Le montant doit être un nombre entier positif en FCFA.';
  if (text.includes('au moins un produit')) return 'Ajoutez au moins un produit.';
  return 'Une erreur est survenue. Veuillez réessayer.';
}
function cell(row, value) { const element = document.createElement('td'); element.textContent = value || '—'; row.append(element); }
function action(label, onClick) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'table-action'; button.textContent = label; button.addEventListener('click', onClick); return button;
}
function render() {
  const query = $('search').value.trim().toLocaleLowerCase('fr');
  const visible = contacts.filter((c) => [c.name, c.phone, c.email, c.company].some((value) => value?.toLocaleLowerCase('fr').includes(query)));
  $('contact-count').textContent = String(contacts.length);
  const body = $('contacts'); body.replaceChildren();
  for (const contact of visible) {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.className = 'name-cell';
    const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = (contact.name || contact.phone).trim().slice(0, 1).toUpperCase();
    const label = document.createElement('span'); label.textContent = contact.name || 'Sans nom'; name.append(avatar, label); row.append(name);
    cell(row, contact.phone); cell(row, contact.email); cell(row, contact.company);
    const actions = document.createElement('td'); actions.className = 'actions';
    actions.append(action('Conversation', () => startConversation(contact)), action('Notes', () => openNotes(contact)), action('Modifier', () => openForm(contact)), action('Supprimer', () => removeContact(contact))); row.append(actions); body.append(row);
  }
  $('empty').hidden = visible.length > 0;
  $('empty').querySelector('h3').textContent = contacts.length ? 'Aucun résultat' : 'Aucun contact pour le moment';
  $('empty').querySelector('p').textContent = contacts.length ? 'Essayez une autre recherche.' : 'Ajoutez votre premier contact pour commencer.';
  $('empty-add').hidden = contacts.length > 0;
}
async function refresh() {
  try { contacts = await window.localContacts.list(); showError($('load-error'), ''); render(); }
  catch (error) { showError($('load-error'), safeError(error)); }
}
function openForm(contact = null) {
  editingId = contact?.id || null;
  form.reset(); showError($('form-error'), '');
  $('dialog-title').textContent = editingId ? 'Modifier le contact' : 'Nouveau contact';
  for (const field of ['name', 'phone', 'email', 'company']) $(field).value = contact?.[field] || '';
  dialog.showModal(); $('name').focus();
}
async function removeContact(contact) {
  if (!window.confirm(`Supprimer ${contact.name || contact.phone}, ses notes et son brouillon ? Cette action est définitive.`)) return;
  try { await window.localContacts.remove(contact.id); await refresh(); }
  catch (error) { showError($('load-error'), safeError(error)); }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault(); showError($('form-error'), '');
  const input = Object.fromEntries(['name', 'phone', 'email', 'company'].map((field) => [field, $(field).value]));
  $('save').disabled = true;
  try {
    if (editingId) {
      const updated = await window.localContacts.update(editingId, input);
      if (!updated) throw new Error('Contact introuvable.');
    } else await window.localContacts.create(input);
    dialog.close(); await refresh();
  } catch (error) { showError($('form-error'), safeError(error)); }
  finally { $('save').disabled = false; }
});
async function refreshNotes() {
  try {
    const notes = await window.localContacts.listNotes(notesContact.id);
    const list = $('notes-list'); list.replaceChildren(); $('notes-empty').hidden = notes.length > 0;
    for (const note of notes) {
      const item = document.createElement('article'); item.className = 'note-item';
      const content = document.createElement('p'); content.className = 'note-content'; content.textContent = note.content;
      const meta = document.createElement('div'); meta.className = 'note-meta';
      const date = document.createElement('time'); date.dateTime = note.created_at; date.textContent = new Date(note.created_at).toLocaleString('fr');
      meta.append(date, action('Supprimer la note', async () => {
        if (!window.confirm('Supprimer cette note ?')) return;
        try { await window.localContacts.removeNote(notesContact.id, note.id); await refreshNotes(); }
        catch (error) { showError($('note-error'), safeError(error)); }
      }));
      item.append(content, meta); list.append(item);
    }
  } catch (error) { showError($('note-error'), safeError(error)); }
}
async function openNotes(contact) {
  notesContact = contact; $('notes-title').textContent = `Notes · ${contact.name || contact.phone}`;
  $('note-form').reset(); showError($('note-error'), ''); $('notes-list').replaceChildren();
  $('notes-empty').hidden = true; $('notes-dialog').showModal(); await refreshNotes();
}
$('note-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('save-note').disabled = true; showError($('note-error'), '');
  try { await window.localContacts.addNote(notesContact.id, $('note-content').value); $('note-content').value = ''; await refreshNotes(); }
  catch (error) { showError($('note-error'), safeError(error)); }
  finally { $('save-note').disabled = false; }
});
$('close-notes').addEventListener('click', () => $('notes-dialog').close());
$('backup').addEventListener('click', async () => {
  const status = $('backup-status'); status.hidden = true; $('backup').disabled = true;
  try { if (await window.localContacts.exportBackup()) { status.textContent = 'Sauvegarde créée. Elle contient vos contacts, notes, brouillons et comptes rendus et n’est pas chiffrée.'; status.hidden = false; } }
  catch (error) { status.textContent = safeError(error); status.hidden = false; }
  finally { $('backup').disabled = false; }
});
$('restore').addEventListener('click', async () => {
  const status = $('backup-status'); status.hidden = true; $('restore').disabled = true; $('backup').disabled = true;
  try {
    if (await window.localContacts.restoreBackup()) {
      selectedConversation = null; draftDirty = false; await refresh(); status.textContent = 'Sauvegarde restaurée. Une copie automatique des données précédentes est conservée sur ce PC.'; status.hidden = false;
    }
  } catch (error) { status.textContent = safeError(error); status.hidden = false; }
  finally { $('restore').disabled = false; $('backup').disabled = false; }
});
function canDiscardDraft() {
  return !draftDirty || window.confirm('Le brouillon n’est pas enregistré. Voulez-vous quitter sans enregistrer ?');
}
function setView(view) {
  currentView = view;
  $('contacts-view').hidden = view !== 'contacts'; $('inbox-view').hidden = view !== 'inbox'; $('dashboard-view').hidden = view !== 'dashboard';
  $('page-title').textContent = ({ contacts: 'Contacts', inbox: 'Boîte de réception', dashboard: 'Statistiques' })[view];
  for (const [id, name] of [['nav-contacts', 'contacts'], ['nav-inbox', 'inbox'], ['nav-dashboard', 'dashboard']]) {
    $(id).classList.toggle('nav-selected', view === name);
    if (view === name) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
  }
}
function renderConversations() {
  const list = $('conversation-list'); list.replaceChildren(); $('no-conversations').hidden = conversations.length > 0;
  for (const item of conversations) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'conversation-entry';
    button.classList.toggle('selected', item.id === selectedConversation?.id);
    const title = document.createElement('strong'); title.textContent = item.contact_name || item.contact_phone;
    const preview = document.createElement('span'); preview.textContent = `${item.status === 'closed' ? 'Clôturée' : 'Ouverte'} · ${item.draft ? 'Brouillon enregistré' : 'Aucun brouillon'}`;
    button.append(title, preview); button.addEventListener('click', () => selectConversation(item.id)); list.append(button);
  }
}
async function loadConversations() {
  conversations = await window.localContacts.listConversations();
  renderConversations();
}
function showConversation(item) {
  selectedConversation = item || null; draftDirty = false;
  $('conversation-placeholder').hidden = Boolean(item); $('conversation-detail').hidden = !item;
  if (!item) { renderConversations(); return; }
  $('conversation-name').textContent = item.contact_name || item.contact_phone;
  $('conversation-phone').textContent = item.contact_phone;
  $('conversation-status').textContent = item.status === 'closed' ? 'Rouvrir' : 'Clore';
  $('draft').value = item.draft; savedDraft = item.draft; $('draft-dirty').hidden = true;
  $('draft-feedback').textContent = 'Ce texte n’est pas envoyé.'; showError($('inbox-error'), ''); renderConversations();
}
async function selectConversation(id) {
  if (selectedConversation?.id === id && currentView === 'inbox') return;
  if (!canDiscardDraft()) return;
  try { await loadConversations(); showConversation(conversations.find((item) => item.id === id)); setView('inbox'); }
  catch (error) { showError($('inbox-error'), safeError(error)); setView('inbox'); }
}
async function startConversation(contact) {
  if (!canDiscardDraft()) return;
  try { const item = await window.localContacts.openConversation(contact.id); draftDirty = false; await selectConversation(item.id); }
  catch (error) { showError($('load-error'), safeError(error)); }
}
$('nav-contacts').addEventListener('click', async () => {
  if (currentView === 'contacts' || !canDiscardDraft()) return;
  draftDirty = false; setView('contacts'); await refresh();
});
$('nav-dashboard').addEventListener('click', async () => {
  if (currentView === 'dashboard' || !canDiscardDraft()) return;
  draftDirty = false; setView('dashboard'); await refresh(); populateDrivers(); await loadDashboard();
});
$('nav-inbox').addEventListener('click', async () => {
  if (currentView === 'inbox') return;
  try { await loadConversations(); showConversation(conversations.find((item) => item.id === selectedConversation?.id)); setView('inbox'); }
  catch (error) { setView('inbox'); showError($('inbox-error'), safeError(error)); }
});
$('draft').addEventListener('input', () => {
  draftDirty = $('draft').value !== savedDraft; $('draft-dirty').hidden = !draftDirty;
  $('draft-feedback').textContent = draftDirty ? 'Pensez à enregistrer votre brouillon.' : 'Ce texte n’est pas envoyé.';
});
$('draft-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!selectedConversation) return;
  const text = $('draft').value; $('save-draft').disabled = true; $('draft').disabled = true;
  try {
    const result = await window.localContacts.saveDraft(selectedConversation.id, text);
    if (!result) throw new Error('Conversation introuvable.');
    savedDraft = text; draftDirty = false; $('draft-dirty').hidden = true;
    $('draft-feedback').textContent = 'Brouillon enregistré sur ce PC. Aucun message envoyé.';
    await loadConversations();
  } catch (error) { showError($('inbox-error'), safeError(error)); }
  finally { $('save-draft').disabled = false; $('draft').disabled = false; }
});
$('conversation-status').addEventListener('click', async () => {
  if (!selectedConversation) return;
  const button = $('conversation-status'); button.disabled = true;
  try {
    const status = selectedConversation.status === 'closed' ? 'open' : 'closed';
    const result = await window.localContacts.setConversationStatus(selectedConversation.id, status);
    if (!result) throw new Error('Conversation introuvable.');
    selectedConversation.status = status; button.textContent = status === 'closed' ? 'Rouvrir' : 'Clore'; await loadConversations();
  } catch (error) { showError($('inbox-error'), safeError(error)); }
  finally { button.disabled = false; }
});
function populateDrivers() {
  for (const id of ['filter-driver', 'report-driver']) {
    const select = $(id); const previous = select.value;
    select.replaceChildren(); const first = document.createElement('option'); first.value = ''; first.textContent = id === 'filter-driver' ? 'Tous les livreurs' : 'Sélectionner un contact'; select.append(first);
    for (const contact of contacts) {
      const option = document.createElement('option'); option.value = contact.id; option.textContent = contact.name ? `${contact.name} · ${contact.phone}` : contact.phone; select.append(option);
    }
    select.value = contacts.some((c) => c.id === previous) ? previous : '';
  }
}
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
function money(value, count = 1) { return count ? `${numberFormat.format(value)} FCFA` : 'Non renseigné'; }
function renderRows(id, rows, emptyId, cells) {
  const body = $(id); body.replaceChildren(); $(emptyId).hidden = rows.length > 0;
  for (const item of rows) { const row = document.createElement('tr'); cells(row, item); body.append(row); }
}
async function loadDashboard() {
  try {
    const stats = await window.localContacts.deliveryStatistics({ from: $('filter-from').value, to: $('filter-to').value, contactId: $('filter-driver').value });
    showError($('dashboard-error'), '');
    $('metric-reports').textContent = numberFormat.format(stats.summary.report_count);
    $('metric-collected').textContent = money(stats.summary.collected_total, stats.summary.collected_count);
    $('metric-collected-count').textContent = `${stats.summary.collected_count} montant(s) renseigné(s)`;
    $('metric-paid').textContent = money(stats.summary.paid_total, stats.summary.paid_count);
    $('metric-paid-count').textContent = `${stats.summary.paid_count} montant(s) renseigné(s)`;
    renderRows('stats-products', stats.products, 'stats-products-empty', (row, p) => { cell(row, p.product); cell(row, numberFormat.format(p.quantity_milli / 1000)); cell(row, p.unit); });
    renderRows('stats-drivers', stats.drivers, 'stats-drivers-empty', (row, d) => { cell(row, d.name || d.phone); cell(row, String(d.report_count)); cell(row, money(d.collected_total, d.collected_count)); cell(row, money(d.paid_total, d.paid_count)); });
    renderRows('stats-reports', stats.reports, 'stats-reports-empty', (row, report) => {
      cell(row, report.report_date); cell(row, report.driver_name || report.driver_phone);
      cell(row, money(report.collected, report.collected !== null)); cell(row, money(report.paid, report.paid !== null));
      const actions = document.createElement('td'); actions.className = 'actions';
      actions.append(action('Voir', () => showReportDetail(report)), action('Supprimer', async () => {
        if (!window.confirm('Supprimer définitivement ce compte rendu ?')) return;
        try { await window.localContacts.deleteDeliveryReport(report.id); await loadDashboard(); } catch (error) { showError($('dashboard-error'), safeError(error)); }
      })); row.append(actions);
    });
  } catch (error) { showError($('dashboard-error'), safeError(error)); }
}
async function showReportDetail(report) {
  try {
    const lines = await window.localContacts.deliveryReportLines(report.id);
    $('report-detail-title').textContent = `${report.driver_name || report.driver_phone} · ${report.report_date}`;
    const body = $('report-detail-lines'); body.replaceChildren();
    for (const line of lines) { const row = document.createElement('tr'); cell(row, line.product); cell(row, numberFormat.format(line.quantity_milli / 1000)); cell(row, line.unit); body.append(row); }
    $('report-detail-dialog').showModal();
  } catch (error) { showError($('dashboard-error'), safeError(error)); }
}
function addReportLine() {
  const row = document.createElement('div'); row.className = 'report-line';
  for (const [labelText, cls, placeholder] of [['Produit', 'product', 'Ex. Riz'], ['Quantité', 'quantity', 'Ex. 2,5'], ['Unité', 'unit', 'Ex. sac']]) {
    const label = document.createElement('label'); label.textContent = labelText;
    const input = document.createElement('input'); input.className = cls; input.placeholder = placeholder; input.required = true;
    if (cls === 'quantity') input.inputMode = 'decimal';
    label.append(input); row.append(label);
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button secondary'; remove.textContent = 'Retirer'; remove.setAttribute('aria-label', 'Retirer le produit'); remove.addEventListener('click', () => row.remove()); row.append(remove);
  $('report-lines').append(row);
}
$('filter-apply').addEventListener('click', loadDashboard);
$('filter-clear').addEventListener('click', async () => { $('filter-from').value = ''; $('filter-to').value = ''; $('filter-driver').value = ''; await loadDashboard(); });
$('new-report').addEventListener('click', () => {
  if (!contacts.length) { showError($('dashboard-error'), 'Ajoutez d’abord un livreur dans Contacts.'); return; }
  showError($('dashboard-error'), ''); showError($('report-error'), ''); $('report-form').reset(); populateDrivers();
  $('report-date').value = new Date().toLocaleDateString('sv-SE'); $('report-lines').replaceChildren(); addReportLine(); $('report-dialog').showModal();
});
$('add-line').addEventListener('click', addReportLine);
$('report-close').addEventListener('click', () => $('report-dialog').close());
$('report-cancel').addEventListener('click', () => $('report-dialog').close());
$('report-detail-close').addEventListener('click', () => $('report-detail-dialog').close());
$('report-form').addEventListener('submit', async (event) => {
  event.preventDefault(); showError($('report-error'), '');
  const lines = Array.from(document.querySelectorAll('#report-lines .report-line'), (row) => ({ product: row.querySelector('.product').value, quantity: row.querySelector('.quantity').value, unit: row.querySelector('.unit').value }));
  $('report-save').disabled = true;
  try {
    await window.localContacts.createDeliveryReport({ contactId: $('report-driver').value, date: $('report-date').value, collected: $('report-collected').value, paid: $('report-paid').value, lines });
    $('report-dialog').close(); await loadDashboard();
  } catch (error) { showError($('report-error'), safeError(error)); }
  finally { $('report-save').disabled = false; }
});
window.addEventListener('beforeunload', (event) => { if (draftDirty) { event.preventDefault(); event.returnValue = ''; } });
$('new-contact').addEventListener('click', () => openForm());
$('empty-add').addEventListener('click', () => openForm());
$('cancel').addEventListener('click', () => dialog.close());
$('close-dialog').addEventListener('click', () => dialog.close());
$('search').addEventListener('input', render);
refresh();
