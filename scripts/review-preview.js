(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  let preview = false;
  let confirmed = false;
  const blocked = () => new Response(JSON.stringify({ code: 'review_preview_isolated', error: 'Use the synthetic sample review. Uploads, customer records, payments, email and printing are disabled.' }), { status: 403, headers: { 'Content-Type':'application/json' } });
  const ready = nativeFetch('/api/review-preview-status', { cache:'no-store' }).then(async response => {
    if (response.status === 404) { confirmed = true; return false; }
    if (!response.ok) return false;
    const status = await response.json();
    preview = status.synthetic === true && status.isolated === true;
    confirmed = preview;
    return preview;
  }).catch(() => false);
  // Existing page scripts must wait for mode detection before sending credentials,
  // form values, or upload content. Preview requests are reconstructed, not proxied.
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    await ready;
    if (!confirmed) return blocked();
    if (!preview) return nativeFetch(input, init);
    if (url.pathname === '/api/storybook-interest' && (!init.method || init.method === 'GET') && [null,'stories','orders','monsters'].includes(url.searchParams.get('resource'))) return nativeFetch(url.pathname + url.search, { cache:'no-store' });
    if (url.pathname === '/api/halloween-proof' && init.method === 'POST') {
      let payload = {}; try { payload = JSON.parse(init.body || '{}'); } catch {}
      const id = payload.personalization?.childCharacter?.id || payload.personalization?.childCharacter;
      return nativeFetch(url.pathname, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({format:payload.format === 'hardcover' ? 'hardcover':'softcover',personalization:{childCharacter:{id}}}) });
    }
    return blocked();
  };
  async function initialize() {
    const sensitive = [...document.querySelectorAll('input[type="file"],input[type="email"],input[type="password"],input[type="text"],input:not([type]),textarea')];
    const prior = sensitive.map(element => ({ element, disabled:element.disabled }));
    sensitive.forEach(element => { element.disabled = true; });
    await ready;
    if (!preview && confirmed) { prior.forEach(({element,disabled}) => { element.disabled = disabled; }); return; }
    const notice = document.createElement('section'); notice.id = 'review-preview-notice'; notice.setAttribute('role','status');
    notice.style.cssText = 'margin:16px auto;padding:18px 22px;border:3px solid #0d7773;border-radius:14px;background:#fff8de;color:#173f43;max-width:1100px;position:relative;z-index:20;';
    const heading = document.createElement('strong'); heading.textContent = preview ? 'Synthetic review preview' : 'Review mode could not be verified';
    const text = document.createElement('p'); text.textContent = preview ? 'Choose any illustrated child and open the sample book starring Sample and Fizz. Real names, drawings, emails, passwords, customer records, payments and printing are disabled.' : 'Personal information fields and service actions are temporarily disabled. Reload once the preview service is available.';
    notice.append(heading,text); (document.querySelector('main') || document.body).prepend(notice);
    if (!preview) return;
    document.documentElement.dataset.reviewPreview = 'synthetic';
    sensitive.forEach(element => { element.value = element.id === 'child-name' ? 'Sample' : element.id === 'monster-name' ? 'Fizz' : element.id === 'interest-email' ? 'sample@example.test' : element.id === 'admin-password' ? 'synthetic-review-only-no-customer-access' : ''; element.autocomplete = 'off'; });
    document.addEventListener('submit', event => { if (event.target.id !== 'admin-login-form') { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    const adminSubmit = document.querySelector('#admin-login-form button[type="submit"]');
    if (adminSubmit) adminSubmit.textContent = 'Open sample admin';
    const picker = document.querySelector('[data-child-character-options]');
    if (picker) {
      const format = document.createElement('select'); format.id = 'review-preview-format'; format.setAttribute('aria-label','Sample book format');
      for (const [value,label] of [['softcover','Softcover sample'],['hardcover','Hardcover sample']]) { const option = document.createElement('option'); option.value=value; option.textContent=label; format.append(option); }
      const open = document.createElement('button'); open.id='open-sample-book'; open.type='button'; open.className='button primary'; open.textContent='Open sample book'; open.style.marginLeft='12px';
      const state = document.createElement('p'); state.setAttribute('aria-live','polite');
      notice.append(format,open,state);
      open.addEventListener('click',async () => {
        open.disabled=true; state.textContent='Building the synthetic 32-page sample…';
        try {
          const selected = picker.querySelector('input:checked'); const id = selected?.value || 'none';
          const response = await window.fetch('/api/halloween-proof',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:format.value,personalization:{childCharacter:{id}}})});
          const result=await response.json(); if (!response.ok) throw new Error(result.error || 'Sample book could not be opened.');
          sessionStorage.setItem('monstersnow_halloween_test_proof',JSON.stringify({...result,submission:{personalization:{childName:'Sample',monsterName:'Fizz',childCharacter:{id}},format:format.value,testMode:false}}));
          window.location.assign('halloween-proof.html');
        } catch(error) { state.textContent=error.message; open.disabled=false; }
      });
    } else { const link=document.createElement('a'); link.href='create.html'; link.textContent='Choose a child and open a sample book'; notice.append(link); }
    const checkout = document.querySelector('#proof-checkout'); if(checkout) checkout.hidden=true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true}); else initialize();
})();
