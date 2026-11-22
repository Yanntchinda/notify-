'use strict';
const { _electron: electron } = require('playwright-core');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

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
    let page = await launch();
    await page.getByRole('button', { name: 'Nouveau contact' }).click();
    await page.locator('#name').fill('Alice');
    await page.locator('#phone').fill('+237600000000');
    await page.locator('#email').fill('alice@example.test');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Alice', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Nouveau contact' }).click();
    await page.locator('#phone').fill('+237600000000');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Ce numéro existe déjà dans les contacts.').waitFor();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await app.close(); app = null;

    page = await launch();
    await page.getByText('Alice', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.locator('#name').fill('Alice modifiée');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.getByText('Alice modifiée', { exact: true }).waitFor();
    await page.locator('#search').fill('absent');
    await page.getByText('Aucun résultat').waitFor();
    await page.locator('#search').clear();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Supprimer' }).click();
    await page.getByText('Aucun contact pour le moment').waitFor();
    assert.equal(await page.locator('#contact-count').textContent(), '0');
    await app.close(); app = null;
    console.log('Parcours local Electron : création, doublon, persistance, modification, recherche et suppression OK.');
  } finally {
    if (app) await app.close();
    await rm(profile, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
