'use strict';

/* Test de fumée complet : visiteur, cotation Ro-Ro, connexion admin, modules admin. */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const errors = [];

function log(...args) {
  console.log(...args);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createDom() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (!/Not implemented/.test(error.message)) errors.push(`jsdom: ${error.message}`);
  });
  virtualConsole.on('error', (...args) => {
    const text = args.map(String).join(' ');
    if (!/Not implemented/.test(text)) errors.push(`console: ${text}`);
  });
  const dom = await JSDOM.fromURL(BASE, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      let cookie = '';
      window.fetch = async (url, options = {}) => {
        const target = new URL(url, BASE).href;
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.cookie = cookie;
        const response = await fetch(target, { ...options, headers });
        const setCookie = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
        if (setCookie.length) cookie = setCookie.map((item) => item.split(';')[0]).join('; ');
        return response;
      };
    },
  });
  return dom;
}

async function main() {
  /* ------------------------------ Visiteur ------------------------------ */
  const visitorDom = await createDom();
  const vwindow = visitorDom.window;
  await wait(2000);
  const vdoc = vwindow.document;
  vdoc.getElementById('btn-visitor').click();
  await wait(500);

  vwindow.location.hash = '#/roro';
  await wait(900);
  if (!vdoc.getElementById('roro-form')) throw new Error('Formulaire Ro-Ro absent');

  // Remplissage sans GPS : la ville est saisie manuellement, distance non calculée.
  vdoc.getElementById('roro-brand').value = 'Toyota';
  vdoc.getElementById('roro-model').value = 'Hilux';
  vdoc.getElementById('roro-vin').value = 'MR0AB3CD200000099';
  vdoc.getElementById('roro-type').value = 'Pick-up';
  vdoc.getElementById('roro-year').value = '2022';
  vdoc.getElementById('roro-name').value = 'Test Visiteur';
  vdoc.getElementById('roro-phone').value = '+237600112233';
  vdoc.getElementById('roro-email').value = 'visiteur.test@example.cm';
  vdoc.getElementById('roro-address').value = 'Yaoundé, Cameroun';
  vdoc.getElementById('roro-form').dispatchEvent(new vwindow.Event('submit', { bubbles: true, cancelable: true }));
  await wait(2500);
  const confirmation = vdoc.querySelector('.confirm-card');
  if (!confirmation) throw new Error('Page de confirmation absente après envoi Ro-Ro');
  const number = vdoc.querySelector('.quote-ref strong').textContent.trim();
  log('✓ Cotation Ro-Ro visiteur créée :', number);
  if (!/^RR-\d{4}-\d{4}$/.test(number)) throw new Error(`Numéro de demande inattendu : ${number}`);
  if (!/2 450|-distance/i.test(confirmation.textContent)) {
    log('  (distance non calculée : attendu sans GPS dans jsdom)');
  }
  vwindow.close();

  /* -------------------------------- Admin -------------------------------- */
  const adminDom = await createDom();
  const awindow = adminDom.window;
  await wait(2000);
  const adoc = awindow.document;
  const demoAdmin = adoc.querySelector('[data-demo="admin"]');
  if (!demoAdmin) throw new Error('Bouton démo admin absent');
  demoAdmin.click();
  await wait(1800);
  if (!/admin-shell/.test(adoc.getElementById('app').innerHTML)) throw new Error('Espace admin non rendu');
  log('✓ Connexion admin réussie');
  if (adoc.querySelectorAll('.stat-card').length !== 4) throw new Error('Statistiques admin incomplètes');
  log('✓ Tableau de bord admin rendu');

  const sections = ['quotes', 'departures', 'ports', 'containers', 'slider', 'services', 'users', 'notifications', 'dashboard'];
  for (const section of sections) {
    awindow.location.hash = `#/admin/${section}`;
    await wait(900);
    const html = adoc.getElementById('admin-content').innerHTML;
    if (!html || html.length < 100) throw new Error(`Section admin vide : ${section}`);
    if (/loading-block/.test(html)) throw new Error(`Section admin encore en chargement : ${section}`);
    log(`✓ Admin / ${section} (${html.length} caractères)`);
  }

  // Vérifie que la demande visiteur apparaît dans les cotations.
  awindow.location.hash = '#/admin/quotes';
  await wait(900);
  if (!/visiteur.test@example.cm|Test Visiteur/.test(adoc.getElementById('admin-content').innerHTML)) {
    throw new Error('Demande visiteur absente de la liste admin');
  }
  log('✓ Demande visiteur visible côté admin');
  awindow.close();

  if (errors.length) {
    console.log('\nErreurs JavaScript :');
    for (const error of errors) console.log(' -', error);
    process.exitCode = 1;
  } else {
    console.log('\nAucune erreur JavaScript détectée.');
  }
}

main().catch((error) => {
  console.error('\nÉCHEC :', error.message);
  if (errors.length) for (const item of errors) console.error(' -', item);
  process.exit(1);
});
