'use strict';
const $ = (id) => document.getElementById(id);
const dialog = $('contact-dialog');
const form = $('contact-form');
let contacts = [];
let editingId = null;

function showError(element, message) { element.textContent = message; element.hidden = !message; }
function safeError(error) {
  const text = String(error?.message || 'Une erreur est survenue.');
  if (text.includes('Ce numéro existe déjà')) return 'Ce numéro existe déjà dans les contacts.';
  if (text.includes('Téléphone doit contenir')) return 'Indiquez un numéro de téléphone.';
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
    actions.append(action('Modifier', () => openForm(contact)), action('Supprimer', () => removeContact(contact))); row.append(actions); body.append(row);
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
  if (!window.confirm(`Supprimer ${contact.name || contact.phone} ? Cette action est définitive.`)) return;
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
$('new-contact').addEventListener('click', () => openForm());
$('empty-add').addEventListener('click', () => openForm());
$('cancel').addEventListener('click', () => dialog.close());
$('close-dialog').addEventListener('click', () => dialog.close());
$('search').addEventListener('input', render);
refresh();
