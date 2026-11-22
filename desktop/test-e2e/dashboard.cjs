'use strict';
const { _electron: electron } = require('playwright-core');
const { mkdtemp, rm } = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const traceFile = path.join(__dirname, '..', 'e2e-trace.txt');
function trace(s) { if (process.env.GITHUB_ACTIONS) fs.appendFileSync(traceFile, `${s}\n`); }
(async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'wacrm-stats-'));
  let app;
  const launch = async () => {
    app = await electron.launch({ args: ['.'], cwd: path.join(__dirname, '..'), env: { ...process.env, WACRM_E2E_DATA_DIR: profile } });
    const page = await app.firstWindow(); await page.waitForSelector('#new-contact'); return page;
  };
  try {
    let page = await launch();
    await page.locator('#new-contact').click();
    await page.locator('#name').fill('Jean livreur'); await page.locator('#phone').fill('+237699000000');
    await page.locator('#save').click(); await page.locator('#contacts').getByText('Jean livreur').waitFor();
    await page.locator('#nav-dashboard').click();
    await page.locator('#new-report').click();
    await page.locator('#report-driver').selectOption({ label: 'Jean livreur · +237699000000' });
    await page.locator('#report-date').fill('2026-11-22');
    await page.locator('#report-collected').fill('80000'); await page.locator('#report-paid').fill('70000');
    const first = page.locator('.report-line').nth(0);
    await first.locator('.product').fill('Riz'); await first.locator('.quantity').fill('2,5'); await first.locator('.unit').fill('sac');
    await page.locator('#add-line').click();
    const second = page.locator('.report-line').nth(1);
    await second.locator('.product').fill('Huile'); await second.locator('.quantity').fill('3'); await second.locator('.unit').fill('carton');
    await page.locator('#report-save').click();
    await page.locator('#stats-products').getByText('Riz', { exact: true }).waitFor();
    assert.equal(await page.locator('#metric-reports').textContent(), '1');
    assert.match((await page.locator('#metric-collected').textContent()).replace(/\s/g, ''), /80000FCFA/);
    assert.match((await page.locator('#metric-paid').textContent()).replace(/\s/g, ''), /70000FCFA/);
    assert.equal(await page.locator('#stats-products tr').count(), 2);
    await page.locator('#stats-reports').getByRole('button', { name: 'Voir' }).click();
    assert.equal(await page.locator('#report-detail-lines tr').count(), 2);
    await page.locator('#report-detail-close').click();
    await page.locator('#filter-from').fill('2026-11-23'); await page.locator('#filter-apply').click();
    await page.getByText('Aucun produit pour cette période.').waitFor();
    assert.equal(await page.locator('#metric-reports').textContent(), '0');
    await page.locator('#filter-clear').click(); await page.locator('#stats-products').getByText('Riz', { exact: true }).waitFor();
    await page.locator('#nav-contacts').click();
    page.once('dialog', (dialog) => { void dialog.accept().catch((e) => trace(String(e))); });
    await page.locator('#contacts').getByRole('button', { name: 'Supprimer', exact: true }).click();
    await page.getByText('Ce livreur possède des comptes rendus. Supprimez-les avant de supprimer ce contact.').waitFor();
    const backup = path.join(profile, 'rapports.sqlite');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, backup);
    await page.locator('#backup').click(); await page.getByText(/Sauvegarde créée/).waitFor();
    const { DatabaseSync } = require('node:sqlite');
    const snapshot = new DatabaseSync(backup, { readOnly: true });
    try { assert.equal(snapshot.prepare('SELECT COUNT(*) AS n FROM delivery_lines').get().n, 2); } finally { snapshot.close(); }
    await app.close(); app = null;
    page = await launch(); await page.locator('#nav-dashboard').click();
    await page.locator('#stats-products').getByText('Riz', { exact: true }).waitFor();
    assert.equal(await page.locator('#metric-reports').textContent(), '1');
    await app.close(); app = null;
    console.log('Statistiques : saisie multi-produits, filtres, montants, sauvegarde et persistance vérifiés.');
  } catch (error) { trace(String(error.stack || error)); throw error; }
  finally { if (app) await app.close(); await rm(profile, { recursive: true, force: true }); }
})().catch((error) => { trace(String(error.stack || error)); console.error(error); process.exitCode = 1; });
