'use strict';
const { _electron: electron } = require('playwright-core');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const traceFile = path.join(__dirname, '..', 'e2e-trace.txt');
const trace = (message) => { if (process.env.GITHUB_ACTIONS) fs.appendFileSync(traceFile, `${message}\n`); };

(async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'wacrm-e2e-'));
  let app;
  const launch = async () => {
    app = await electron.launch({ args: ['.'], cwd: path.join(__dirname, '..'), env: { ...process.env, WACRM_E2E_DATA_DIR: profile } });
    const page = await app.firstWindow();
    await page.waitForSelector('#new-contact');
    return page;
  };
  try {
    trace('étape 0');
    let page = await launch();
    await page.getByRole('button', { name: 'Nouveau contact' }).click();
    await page.locator('#name').fill('Alice');
    await page.locator('#phone').fill('+237600000000');
    await page.locator('#email').fill('alice@example.test');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.locator('#contacts').getByText('Alice', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Conversation', exact: true }).click();
    await page.locator('#inbox-view').getByText('WhatsApp n’est pas connecté', { exact: true }).waitFor();
    await page.locator('#draft').fill('Réponse en attente de connexion');
    page.once('dialog', async (confirm) => { await confirm.dismiss(); });
    await page.locator('#nav-contacts').click();
    assert.equal(await page.locator('#inbox-view').isVisible(), true);
    assert.equal(await page.locator('#draft').inputValue(), 'Réponse en attente de connexion');
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await page.getByText('Brouillon enregistré sur ce PC. Aucun message envoyé.').waitFor();
    await page.getByRole('button', { name: 'Clore', exact: true }).click();
    await page.getByRole('button', { name: 'Rouvrir', exact: true }).waitFor();
    await page.locator('#nav-contacts').click();
    trace('étape 1');
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.locator('#note-content').fill('Appel prévu demain');
    await page.getByRole('button', { name: 'Ajouter la note' }).click();
    await page.getByText('Appel prévu demain').waitFor();
    await page.getByRole('button', { name: 'Fermer les notes' }).click();
    trace('étape 2');
    const backup = path.join(profile, 'sauvegarde.sqlite');
    trace('étape 5');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, backup);
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    await page.getByText(/Sauvegarde créée/).waitFor();
    const { DatabaseSync } = require('node:sqlite');
    const backupDb = new DatabaseSync(backup, { readOnly: true });
    try {
      assert.equal(backupDb.prepare('SELECT name FROM contacts').get().name, 'Alice');
      assert.equal(backupDb.prepare('SELECT content FROM contact_notes').get().content, 'Appel prévu demain');
      assert.equal(backupDb.prepare('SELECT draft FROM conversations').get().draft, 'Réponse en attente de connexion');
    } finally { backupDb.close(); }
    await page.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    await page.getByText('Ce fichier existe déjà. Choisissez un nouveau nom.').waitFor();
    await page.getByRole('button', { name: 'Nouveau contact' }).click();
    await page.locator('#phone').fill('+237600000000');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Ce numéro existe déjà dans les contacts.').waitFor();
    await page.getByRole('button', { name: 'Annuler' }).click();
    trace('étape 3');
    await app.close(); app = null;

    trace('étape 4');
    page = await launch();
    await page.locator('#contacts').getByText('Alice', { exact: true }).waitFor();
    await page.locator('#nav-inbox').click();
    await page.getByRole('button', { name: /Alice/ }).click();
    assert.equal(await page.locator('#draft').inputValue(), 'Réponse en attente de connexion');
    await page.getByRole('button', { name: 'Rouvrir', exact: true }).waitFor();
    await page.locator('#nav-contacts').click();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByText('Appel prévu demain').waitFor();
    await page.getByRole('button', { name: 'Fermer les notes' }).click();
    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.locator('#name').fill('Alice modifiée');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Alice modifiée', { exact: true }).waitFor();
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      const originalMessageBox = dialog.showMessageBox;
      dialog.showMessageBox = async () => { dialog.showMessageBox = originalMessageBox; return { response: 1 }; };
    }, backup);
    trace('étape 6');
    await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
    trace('étape 7');
    await page.locator('#backup-status:not([hidden])').waitFor();
    trace('étape 8');
    assert.match(await page.locator('#backup-status').textContent(), /Sauvegarde restaurée/);
    await page.locator('#contacts').getByText('Alice', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await page.getByText('Appel prévu demain').waitFor();
    await page.getByRole('button', { name: 'Fermer les notes' }).click();
    await page.locator('#nav-inbox').click();
    await page.getByRole('button', { name: /Alice/ }).click();
    assert.equal(await page.locator('#draft').inputValue(), 'Réponse en attente de connexion');
    await page.locator('#nav-contacts').click();
    trace('étape 9');
    await page.locator('#search').fill('absent');
    trace('recherche saisie');
    await page.getByText('Aucun résultat').waitFor();
    trace('aucun résultat affiché');
    await page.locator('#search').clear();
    trace('recherche effacée');
    page.once('dialog', async (dialog) => {
      trace(`dialogue de type ${dialog.type()}`);
      try { await dialog.accept(); trace('dialogue accepté'); }
      catch (error) { trace(`échec dialogue: ${String(error.stack || error)}`); }
    });
    await page.getByRole('button', { name: 'Supprimer' }).click();
    trace('suppression cliquée');
    await page.getByText('Aucun contact pour le moment').waitFor();
    trace('contact supprimé');
    assert.equal(await page.locator('#contact-count').textContent(), '0');
    await app.close(); app = null;
    console.log('Parcours local Electron : création, doublon, persistance, modification, recherche et suppression OK.');
  } catch (error) {
    trace(String(error.stack || error));
    throw error;
  } finally {
    if (app) await app.close();
    await rm(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  trace(String(error.stack || error));
  console.error(error);
  if (process.env.GITHUB_ACTIONS) {
    const message = String(error.stack || error).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Electron E2E::${message}`);
  }
  process.exitCode = 1;
});
