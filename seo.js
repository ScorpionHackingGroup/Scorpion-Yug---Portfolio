(function () {
  if (document.getElementById('_seo_panel')) return;

  /* ═══════════════════════════════════════════════════
     ADVANCED SEO CHECKER v3 — by scorpion-yug.netlify
  ═══════════════════════════════════════════════════ */

  const checks = [];
  const cats = ['Core Meta', 'Social & OG', 'Content', 'Technical', 'Accessibility'];
  const catMap = {};
  cats.forEach(c => (catMap[c] = []));

  function chk(cat, name, pass, tip, weight, detail) {
    const item = { cat, name, passed: !!pass, tip, weight: weight || 1, detail: detail || '' };
    checks.push(item);
    catMap[cat].push(item);
  }

  /* ── CORE META ─────────────────────────────────── */
  const title = document.title || '';
  chk('Core Meta', 'Title Tag', title.length >= 30 && title.length <= 60,
    title ? `${title.length} chars · ideal 30–60` : '⚠ MISSING title tag', 3, title.slice(0, 65) || '');

  const desc = document.querySelector('meta[name="description"]')?.content || '';
  chk('Core Meta', 'Meta Description', desc.length >= 120 && desc.length <= 160,
    desc ? `${desc.length} chars · ideal 120–160` : '⚠ MISSING meta description', 3, desc.slice(0, 80) || '');

  const canon = document.querySelector('link[rel="canonical"]')?.href || '';
  chk('Core Meta', 'Canonical URL', !!canon,
    canon ? 'Canonical set correctly' : '⚠ Missing canonical tag', 2.5, canon.slice(0, 70));

  const keys = document.querySelector('meta[name="keywords"]')?.content || '';
  chk('Core Meta', 'Meta Keywords', keys.length > 0,
    keys ? `${keys.split(',').length} keywords` : 'No keywords meta (minor ranking signal)', 0.5, keys.slice(0, 80));

  const lang = document.documentElement.getAttribute('lang') || '';
  chk('Core Meta', 'HTML lang=""', !!lang,
    lang ? `lang="${lang}"` : '⚠ Missing lang attribute on <html>', 1.5, lang);

  const charset = document.querySelector('meta[charset]')?.getAttribute('charset') || '';
  chk('Core Meta', 'Charset Meta', !!charset,
    charset ? `charset="${charset}"` : '⚠ No charset meta', 1, charset);

  /* ── SOCIAL & OG ────────────────────────────────── */
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  chk('Social & OG', 'OG Title', ogTitle.length > 0,
    ogTitle ? ogTitle.slice(0, 50) : '⚠ Missing og:title', 1.5, ogTitle.slice(0, 60));

  const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
  chk('Social & OG', 'OG Description', ogDesc.length > 0,
    ogDesc ? `${ogDesc.length} chars` : '⚠ Missing og:description', 1.5);

  const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
  chk('Social & OG', 'OG Image', ogImg.length > 0,
    ogImg ? ogImg.slice(0, 55) : '⚠ Missing og:image — social previews will be blank', 2, ogImg.slice(0, 60));

  const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
  chk('Social & OG', 'OG URL', ogUrl.length > 0,
    ogUrl ? ogUrl.slice(0, 55) : '⚠ Missing og:url', 1);

  const ogType = document.querySelector('meta[property="og:type"]')?.content || '';
  chk('Social & OG', 'OG Type', ogType.length > 0,
    ogType ? `type="${ogType}"` : '⚠ Missing og:type (e.g. website, article)', 1);

  const twCard = document.querySelector('meta[name="twitter:card"]')?.content || '';
  chk('Social & OG', 'Twitter Card', twCard.length > 0,
    twCard ? `card="${twCard}"` : '⚠ Missing twitter:card meta', 1, twCard);

  const twTitle = document.querySelector('meta[name="twitter:title"]')?.content || '';
  chk('Social & OG', 'Twitter Title', twTitle.length > 0,
    twTitle ? 'Present' : 'Missing twitter:title', 0.5);

  /* ── CONTENT ────────────────────────────────────── */
  const h1s = [...document.querySelectorAll('h1')];
  const h2s = document.querySelectorAll('h2');
  const h3s = document.querySelectorAll('h3');
  chk('Content', 'Single H1', h1s.length === 1,
    `Found ${h1s.length} H1(s) — exactly 1 required`, 3, h1s[0]?.textContent.trim().slice(0, 60) || '');

  chk('Content', 'H2 Subheadings', h2s.length >= 1,
    `H2: ${h2s.length} · H3: ${h3s.length} — add subheadings to structure content`, 1.5,
    `H1:${h1s.length}  H2:${h2s.length}  H3:${h3s.length}`);

  const words = (document.body?.innerText || '').trim().split(/\s+/).filter(Boolean).length;
  chk('Content', 'Word Count', words >= 600,
    `~${words.toLocaleString()} words · aim for 600 min, 1000+ ideal`, 2);

  const titleKws = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const bodyTxt = (document.body?.innerText || '').toLowerCase();
  const kwInBody = titleKws.length > 0 && titleKws.some(kw => bodyTxt.includes(kw));
  chk('Content', 'Keyword in Body', kwInBody,
    kwInBody ? 'Title keywords found in body text' : 'Title keywords not detected in body', 1.5);

  const pCount = document.querySelectorAll('p').length;
  chk('Content', 'Paragraph Tags', pCount >= 3,
    `${pCount} <p> tags found · use paragraphs for readable content`, 1);

  /* ── TECHNICAL ──────────────────────────────────── */
  const vp = document.querySelector('meta[name="viewport"]')?.content || '';
  chk('Technical', 'Viewport Meta', /width=device-width/i.test(vp),
    vp || '⚠ Missing viewport meta — critical for mobile SEO', 2, vp);

  const robots = document.querySelector('meta[name="robots"]')?.content || '';
  const robotsOk = !robots || !/(noindex|nofollow)/i.test(robots);
  chk('Technical', 'Robots Meta', robotsOk,
    robots ? `robots="${robots}"` : 'No robots meta · default allows indexing', 2, robots);

  const fav = document.querySelector('link[rel~="icon"]');
  chk('Technical', 'Favicon', !!fav,
    fav ? fav.href || 'Favicon present' : '⚠ No favicon detected', 1);

  const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
  chk('Technical', 'Structured Data', jsonLd.length > 0,
    jsonLd.length > 0 ? `${jsonLd.length} JSON-LD schema block(s)` : '⚠ No JSON-LD structured data found', 2);

  chk('Technical', 'HTTPS', location.protocol === 'https:',
    location.protocol === 'https:' ? 'Secure HTTPS ✓' : '⚠ Not on HTTPS — critical ranking signal', 2.5);

  const hreflang = document.querySelector('link[rel="alternate"][hreflang]');
  chk('Technical', 'Hreflang', !!hreflang,
    hreflang ? 'International targeting set' : 'No hreflang (only needed for multi-language sites)', 0.5);

  const rss = document.querySelector('link[type="application/rss+xml"]');
  chk('Technical', 'RSS Feed', !!rss,
    rss ? rss.href : 'No RSS feed link detected', 0.5);

  /* ── ACCESSIBILITY ──────────────────────────────── */
  const imgs = [...document.querySelectorAll('img')];
  const noAlt = imgs.filter(i => !i.hasAttribute('alt')).length;
  chk('Accessibility', 'Image Alt Text', noAlt === 0,
    `${imgs.length} images · ${noAlt} missing alt=""`, 2,
    noAlt > 0 ? `Fix ${noAlt} image(s)` : 'All images have alt attributes');

  const links = [...document.querySelectorAll('a[href]')];
  const emptyL = links.filter(a => !a.href || a.href.endsWith('#') || a.href.startsWith('javascript:')).length;
  chk('Accessibility', 'Link Quality', emptyL === 0,
    `${links.length} links · ${emptyL} empty or broken`, 1.5);

  const extL = links.filter(a => { try { return new URL(a.href).hostname !== location.hostname; } catch { return false; } });
  const noRel = extL.filter(a => !a.rel?.includes('noopener') && !a.rel?.includes('noreferrer')).length;
  chk('Accessibility', 'External Link Security', noRel === 0,
    `${extL.length} external links · ${noRel} missing rel="noopener"`, 1);

  const skip = document.querySelector('a[href="#main"],a[href="#content"],a[href="#skip"]');
  chk('Accessibility', 'Skip Nav Link', !!skip,
    skip ? 'Skip-to-content link found' : 'Add a skip link for keyboard users', 0.5);

  const ariaLm = document.querySelectorAll('[role="main"],[role="navigation"],[role="banner"]').length;
  chk('Accessibility', 'ARIA Landmarks', ariaLm >= 1,
    `${ariaLm} ARIA landmark role(s) found`, 1);

  /* ═══ SCORE ══════════════════════════════════════ */
  let totW = 0, earnW = 0;
  checks.forEach(c => { totW += c.weight; if (c.passed) earnW += c.weight; });
  const score = Math.round((earnW / totW) * 100);
  const passes = checks.filter(c => c.passed).length;
  const fails = checks.filter(c => !c.passed).length;
  const scoreClr = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const scoreLbl = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Work' : 'Poor';

  /* ═══ PAGE STATS ════════════════════════════════ */
  const stats = [
    ['Words', words.toLocaleString()],
    ['Images', imgs.length],
    ['Links', links.length],
    ['H Tags', h1s.length + h2s.length + h3s.length],
    ['Scripts', document.scripts.length],
    ['HTTPS', location.protocol === 'https:' ? 'Yes' : 'No'],
  ];

  /* ═══ REPORT TEXT ═══════════════════════════════ */
  function buildReport() {
    const lines = [
      `SEO Analyzer Report`,
      `URL: ${location.href}`,
      `Score: ${score}% — ${scoreLbl}  |  ${passes} passed · ${fails} failed`,
      `Weighted: ${earnW.toFixed(1)} / ${totW.toFixed(1)} pts`,
      '',
    ];
    cats.forEach(cat => {
      lines.push(`▸ ${cat}`);
      catMap[cat].forEach(i => lines.push(`  ${i.passed ? '✓' : '✗'} ${i.name}: ${i.tip}`));
      lines.push('');
    });
    return lines.join('\n');
  }

  /* ═══ UI ════════════════════════════════════════ */
  const circ = 2 * Math.PI * 28; // r=28
  const offset = circ - (circ * score / 100);

  function rowsHtml(list) {
    if (!list.length) return '<div style="padding:20px 16px;color:#4b5563;font-size:.8rem;text-align:center;">No items in this category.</div>';
    return list.map(c => `
      <div class="sr ${c.passed ? 'sp' : 'sf'}">
        <span class="si">${c.passed ? '✓' : '✗'}</span>
        <div class="sd">
          <div class="sn">${c.name}<span class="sw">×${c.weight}</span></div>
          <div class="st">${c.tip}</div>
          ${c.detail ? `<div class="sdet">${c.detail}</div>` : ''}
        </div>
      </div>`).join('');
  }

  const panel = document.createElement('div');
  panel.id = '_seo_panel';
  panel.innerHTML = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Mono:wght@400;500&family=Outfit:wght@400;500;600;700;800&display=swap');
#_seo_panel{
  all:initial;
  position:fixed;top:14px;right:14px;
  width:430px;max-width:97vw;max-height:94vh;
  background:#0b0f15;color:#dde4ee;
  font-family:'Outfit',system-ui,sans-serif;font-size:13.5px;line-height:1.5;
  border-radius:20px;
  border:1px solid #1e2733;
  box-shadow:0 40px 80px -10px rgba(0,0,0,.85),0 0 0 1px rgba(255,255,255,.04) inset;
  z-index:2147483647;
  display:flex;flex-direction:column;overflow:hidden;
  animation:_seo_in .35s cubic-bezier(.16,1,.3,1);
}
@keyframes _seo_in{from{opacity:0;transform:translateX(30px) scale(.95)}to{opacity:1;transform:none}}
#_seo_panel *{box-sizing:border-box;margin:0;padding:0;font-family:inherit;}

/* HEADER */
._sh{padding:18px 20px 16px;background:linear-gradient(160deg,#111827 0%,#0b0f15 100%);border-bottom:1px solid #1e2733;flex-shrink:0;}
._str{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
._stitle{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#4b6585;display:flex;align-items:center;gap:8px;}
._stitle svg{opacity:.6;}
._sx{background:#1e2733;border:none;color:#6b7a8d;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center;transition:.15s;}
._sx:hover{background:#2a3545;color:#dde4ee;}
._sga{display:flex;align-items:center;gap:18px;}
._sring{position:relative;width:80px;height:80px;flex-shrink:0;}
._sring svg{transform:rotate(-90deg);}
._strk{fill:none;stroke:#1e2733;stroke-width:7;}
._sfill{fill:none;stroke:${scoreClr};stroke-width:7;stroke-linecap:round;
  stroke-dasharray:${circ.toFixed(1)};stroke-dashoffset:${offset.toFixed(1)};
  filter:drop-shadow(0 0 6px ${scoreClr}90);
  transition:stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1);}
._snum{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:1.45rem;color:${scoreClr};line-height:1;}
._snum small{font-size:.5rem;font-weight:600;color:#4b6585;margin-top:1px;}
._sinfo{}
._slbl{font-size:1.6rem;font-weight:800;letter-spacing:-.04em;color:${scoreClr};font-family:'Instrument Serif',serif;font-style:italic;}
._ssub{font-size:.75rem;color:#4b6585;margin-top:1px;}
._spills{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;}
._spill{padding:3px 11px;border-radius:30px;font-size:.7rem;font-weight:600;}
._spp{background:#052813;color:#34d399;border:1px solid #064e29;}
._spf{background:#2d0e0e;color:#f87171;border:1px solid #5a1b1b;}

/* STATS BAR */
._sstats{display:flex;border-top:1px solid #1e2733;border-bottom:1px solid #1e2733;flex-shrink:0;background:#0e1520;}
._sstat{flex:1;text-align:center;padding:9px 4px;border-right:1px solid #1e2733;}
._sstat:last-child{border-right:none;}
._ssv{font-weight:800;font-size:.95rem;color:#dde4ee;font-family:'DM Mono',monospace;}
._ssl{font-size:.58rem;color:#3d4f62;text-transform:uppercase;letter-spacing:.08em;margin-top:1px;}

/* TABS */
._stabs{display:flex;padding:10px 16px 0;border-bottom:1px solid #1e2733;overflow-x:auto;flex-shrink:0;scrollbar-width:none;background:#0b0f15;gap:2px;}
._stabs::-webkit-scrollbar{display:none;}
._stab{padding:6px 13px 9px;font-size:.7rem;font-weight:600;color:#4b6585;cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;white-space:nowrap;transition:.15s;text-transform:uppercase;letter-spacing:.05em;}
._stab:hover{color:#9db4cc;}
._stab._sta{color:#60a5fa;border-bottom-color:#60a5fa;}

/* LIST */
._sbody{overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:#1e2733 transparent;}
._sbody::-webkit-scrollbar{width:3px;}
._sbody::-webkit-scrollbar-thumb{background:#1e2733;border-radius:2px;}

.sr{display:flex;align-items:flex-start;gap:10px;padding:11px 16px;border-bottom:1px solid #111827;transition:background .12s;}
.sr:hover{background:#111827;}
.sr:last-child{border-bottom:none;}
.si{width:22px;height:22px;min-width:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:800;margin-top:1px;font-family:'DM Mono',monospace;}
.sp .si{background:#052813;color:#34d399;}
.sf .si{background:#2d0e0e;color:#f87171;}
.sd{flex:1;min-width:0;}
.sn{font-weight:600;color:#dde4ee;font-size:.82rem;display:flex;align-items:center;justify-content:space-between;gap:6px;}
.sw{font-size:.6rem;color:#2a3e55;font-weight:600;flex-shrink:0;font-family:'DM Mono',monospace;}
.st{font-size:.75rem;color:#4b6585;margin-top:2px;line-height:1.45;word-break:break-word;}
.sdet{font-size:.68rem;color:#3b82f6;margin-top:4px;font-family:'DM Mono',monospace;background:#0e1a2e;padding:3px 8px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:1px solid #1e3a5f;}

/* FOOTER */
._sfoot{padding:12px 16px;display:flex;gap:8px;border-top:1px solid #1e2733;flex-shrink:0;background:#0b0f15;}
._sbtn{flex:1;padding:9px 12px;border-radius:10px;border:none;cursor:pointer;font-size:.78rem;font-weight:600;transition:.15s;display:flex;align-items:center;justify-content:center;gap:5px;font-family:'Outfit',sans-serif;}
._sbtn-g{background:#1e2733;color:#6b7a8d;border:1px solid #2a3545;}
._sbtn-g:hover{background:#2a3545;color:#dde4ee;}
._sbtn-p{background:#065f46;color:#6ee7b7;}
._sbtn-p:hover{background:#047857;}
._sbtn-b{background:#1d4ed8;color:#bfdbfe;}
._sbtn-b:hover{background:#2563eb;}

/* URL bar */
._surl{padding:6px 16px;font-size:.62rem;color:#2a3e55;border-top:1px solid #111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;font-family:'DM Mono',monospace;}

/* Toast */
._stoast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#065f46;color:#6ee7b7;padding:9px 20px;border-radius:30px;font-size:.78rem;font-weight:700;z-index:2147483647;pointer-events:none;border:1px solid #047857;animation:_stin .2s ease,_stout .3s 1.6s ease forwards;white-space:nowrap;}
@keyframes _stin{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@keyframes _stout{to{opacity:0;transform:translateX(-50%) translateY(8px)}}
</style>

<!-- HEADER -->
<div class="_sh">
  <div class="_str">
    <div class="_stitle">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      SEO Analyzer
    </div>
    <button class="_sx" id="_sclose">✕</button>
  </div>
  <div class="_sga">
    <div class="_sring">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle class="_strk" cx="40" cy="40" r="28"/>
        <circle class="_sfill" cx="40" cy="40" r="28"/>
      </svg>
      <div class="_snum">${score}<small>%</small></div>
    </div>
    <div class="_sinfo">
      <div class="_slbl">${scoreLbl}</div>
      <div class="_ssub">${earnW.toFixed(1)} / ${totW.toFixed(1)} weighted pts</div>
      <div class="_spills">
        <span class="_spill _spp">✓ ${passes} passed</span>
        <span class="_spill _spf">✗ ${fails} failed</span>
      </div>
    </div>
  </div>
</div>

<!-- STATS BAR -->
<div class="_sstats">
  ${stats.map(([l, v]) => `<div class="_sstat"><div class="_ssv">${v}</div><div class="_ssl">${l}</div></div>`).join('')}
</div>

<!-- TABS -->
<div class="_stabs">
  <button class="_stab _sta" data-t="All">All&nbsp;${checks.length}</button>
  ${cats.map(c => `<button class="_stab" data-t="${c}">${c}&nbsp;${catMap[c].length}</button>`).join('')}
  <button class="_stab" data-t="Fails">⚠&nbsp;${fails}</button>
</div>

<!-- LIST -->
<div class="_sbody" id="_slist">${rowsHtml(checks)}</div>

<!-- FOOTER -->
<div class="_sfoot">
  <button class="_sbtn _sbtn-g" id="_scopy">📋 Copy</button>
  <button class="_sbtn _sbtn-p" id="_sreload">↻ Re-check</button>
  <button class="_sbtn _sbtn-b" id="_sexport">⬇ Export</button>
</div>
<div class="_surl">🌐 ${location.href}</div>
`;

  document.body.appendChild(panel);

  /* ── tab switching ── */
  panel.querySelectorAll('._stab').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('._stab').forEach(b => b.classList.remove('_sta'));
      btn.classList.add('_sta');
      const t = btn.dataset.t;
      const list = panel.querySelector('#_slist');
      if (t === 'All') list.innerHTML = rowsHtml(checks);
      else if (t === 'Fails') list.innerHTML = rowsHtml(checks.filter(c => !c.passed));
      else list.innerHTML = rowsHtml(catMap[t] || []);
    });
  });

  /* ── close ── */
  panel.querySelector('#_sclose').addEventListener('click', () => panel.remove());

  /* ── toast helper ── */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = '_stoast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  /* ── copy ── */
  panel.querySelector('#_scopy').addEventListener('click', () => {
    navigator.clipboard.writeText(buildReport())
      .then(() => toast('✓ Report copied to clipboard!'))
      .catch(() => toast('⚠ Copy failed — try Export'));
  });

  /* ── re-check ── */
  panel.querySelector('#_sreload').addEventListener('click', () => { panel.remove(); location.reload(); });

  /* ── export .txt ── */
  panel.querySelector('#_sexport').addEventListener('click', () => {
    const blob = new Blob([buildReport()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seo-${location.hostname}-${Date.now()}.txt`;
    a.click();
    toast('✓ Report downloaded!');
  });

  /* ── click outside to close ── */
  setTimeout(() => {
    const out = e => { if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('click', out, true); } };
    document.addEventListener('click', out, true);
  }, 400);
})();
