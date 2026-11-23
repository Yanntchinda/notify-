'use strict';

/* Test UI complet jsdom : GPS simulé, distance, cotations, réponses admin. */
const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const errors = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const json = (data) =>
        new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      window.fetch = async (url, options = {}) => {
        const href = new URL(url, BASE).href;
        if (href.startsWith('https://nominatim.openstreetmap.org/search')) {
          return json([
            {
              lat: '3.848',
              lon: '11.502',
              display_name: 'Yaoundé, Cameroun',
              name: 'Yaoundé',
              address: { city: 'Yaoundé', country: 'Cameroun', country_code: 'cm' },
            },
          ]);
        }
        if (href.startsWith('https://router.project-osrm.org/route')) {
          return json({
            code: 'Ok',
            routes: [
              {
                distance: 247400,
                duration: 15900,
                geometry: { coordinates: [[11.502, 3.848], [10.6, 4.0], [9.7005, 4.0443]] },
              },
            ],
          });
        }
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.cookie = cookie;
        const response = await fetch(href, { ...options, headers });
        const setCookie = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
        if (setCookie.length) cookie = setCookie.map((item) => item.split(';')[0]).join('; ');
        return response;
      };
    },
  });
  return dom;
}

async function main() {
  /* ----------------------- Visiteur : Ro-Ro avec distance ----------------------- */
  const visitorDom = await createDom();
  const vwindow = visitorDom.window;
  const vdoc = vwindow.document;
  await wait(1800);
  vdoc.getElementById('btn-visitor').click();
  await wait(500);
  vwindow.location.hash = '#/roro';
  await wait(900);

  const address = vdoc.getElementById('roro-address');
  address.value = 'Yaoundé, Cameroun';
  vdoc.getElementById('roro-search').click();
  await wait(1200);
  const distancePanel = vdoc.getElementById('roro-distance').textContent;
  if (!/247/.test(distancePanel)) throw new Error(`Distance non affichée : ${distancePanel}`);
  console.log('✓ Distance GPS simulée affichée :', distancePanel.replace(/\s+/g, ' ').trim().slice(0, 100));

  vdoc.getElementById('roro-brand').value = 'Toyota';
  vdoc.getElementById('roro-model').value = 'Land Cruiser';
  vdoc.getElementById('roro-vin').value = 'UITEST0000000001';
  vdoc.getElementById('roro-type').value = '4x4';
  vdoc.getElementById('roro-year').value = '2020';
  vdoc.getElementById('roro-name').value = 'Utilisateur UI';
  vdoc.getElementById('roro-phone').value = '+237699000111';
  vdoc.getElementById('roro-email').value = 'ui.test@example.cm';
  vdoc.getElementById('roro-form').dispatchEvent(new vwindow.Event('submit', { bubbles: true, cancelable: true }));
  await wait(2500);
  if (!vdoc.querySelector('.confirm-card')) throw new Error('Confirmation Ro-Ro absente');
  const confirmText = vdoc.querySelector('.confirm-card').textContent.replace(/\s+/g, ' ');
  if (!/247/.test(confirmText)) throw new Error('Distance absente de la confirmation');
  console.log('✓ Demande Ro-Ro avec distance confirmée :', vdoc.querySelector('.quote-ref strong').textContent.trim());
  vwindow.close();

  /* ----------------------------- Conteneur avec distance ----------------------------- */
  const ctDom = await createDom();
  const cwindow = ctDom.window;
  const cdoc = cwindow.document;
  await wait(1800);
  cdoc.getElementById('btn-visitor').click();
  await wait(500);
  cwindow.location.hash = '#/containers';
  await wait(900);
  cdoc.getElementById('ct-type').value = 'c40';
  cdoc.getElementById('ct-quantity').value = '2';
  cdoc.querySelector('input[name="ct-condition"][value="occasion"]').checked = true;
  cdoc.getElementById('ct-country').value = 'Cameroun';
  cdoc.getElementById('ct-city').value = 'Douala';
  cdoc.getElementById('ct-name').value = 'Client Conteneur';
  cdoc.getElementById('ct-phone').value = '+237699000222';
  cdoc.getElementById('ct-email').value = 'container.ui@example.cm';
  cdoc.getElementById('ct-address').value = 'Douala, Cameroun';
  cdoc.getElementById('ct-search').click();
  await wait(1200);
  const ctDistance = cdoc.getElementById('ct-distance').textContent;
  if (!/247/.test(ctDistance)) throw new Error(`Distance conteneur non affichée : ${ctDistance}`);
  cdoc.getElementById('container-form-el').dispatchEvent(new cwindow.Event('submit', { bubbles: true, cancelable: true }));
  await wait(2500);
  if (!cdoc.querySelector('.confirm-card')) throw new Error('Confirmation conteneur absente');
  console.log('✓ Demande conteneur confirmée :', cdoc.querySelector('.quote-ref strong').textContent.trim());
  cwindow.close();

  /* ------------------------------- Admin : réponse ------------------------------- */
  const adminDom = await createDom();
  const awindow = adminDom.window;
  const adoc = awindow.document;
  await wait(1800);
  adoc.querySelector('[data-demo="admin"]').click();
  await wait(1600);
  awindow.location.hash = '#/admin/quotes';
  await wait(1000);
  const firstQuote = adoc.querySelector('[data-quote-id]');
  if (!firstQuote) throw new Error('Aucune cotation dans la liste admin');
  firstQuote.click();
  await wait(500);
  if (!adoc.querySelector('#respond-form')) throw new Error('Formulaire de réponse absent');
  adoc.querySelector('#rsp-price').value = '3 100 000 FCFA';
  adoc.querySelector('#rsp-message').value = 'Réponse de test UI.';
  adoc.querySelector('#respond-form').dispatchEvent(new awindow.Event('submit', { bubbles: true, cancelable: true }));
  await wait(1500);
  if (adoc.querySelector('#respond-form')) throw new Error('La modale de réponse ne s’est pas fermée');
  console.log('✓ Réponse administrateur envoyée depuis la modale');

  /* ------------------------------ Admin : nouveau départ ------------------------------ */
  awindow.location.hash = '#/admin/departures';
  await wait(900);
  adoc.getElementById('add-departure').click();
  await wait(400);
  adoc.getElementById('dep-ship').value = 'MV UI Test';
  adoc.getElementById('dep-from').value = 'port_douala';
  adoc.getElementById('dep-to').value = 'port_antwerp';
  adoc.getElementById('dep-date').value = '2027-04-01';
  adoc.getElementById('dep-deposit').value = '2027-03-27';
  adoc.getElementById('dep-status').value = 'open';
  adoc.querySelector('[data-save]').click();
  await wait(1400);
  if (!/MV UI Test/.test(adoc.getElementById('admin-content').textContent)) throw new Error('Départ créé non visible');
  console.log('✓ Départ créé depuis l’administration');

  /* ------------------------------- Compte client ------------------------------- */
  const accountDom = await createDom();
  const accwindow = accountDom.window;
  const accdoc = accwindow.document;
  await wait(1800);
  accdoc.querySelector('[data-demo="client"]').click();
  await wait(1600);
  accwindow.location.hash = '#/account';
  await wait(1200);
  if (!/Mes demandes/.test(accdoc.getElementById('account-content').textContent)) throw new Error('Historique client absent');
  console.log('✓ Espace client et historique affichés');
  accwindow.location.hash = '#/account';
  accdoc.querySelector('[data-account-tab="references"]').click();
  await wait(1200);
  if (!/Mes véhicules/.test(accdoc.getElementById('account-content').textContent)) throw new Error('Références client absentes');
  console.log('✓ Références client affichées');
  accwindow.close();
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
  for (const item of errors) console.error(' -', item);
  process.exit(1);
});
