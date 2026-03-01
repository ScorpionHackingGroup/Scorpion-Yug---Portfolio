javascript:(function(){
  // ---------- ADVANCED SEO CHECKER ----------
  const checks = [];
  const important = { 'Title':2, 'Meta Description':2, 'H1 Tag':2, 'Canonical':2 };
  
  function addCheck(name, condition, tip, weight=1) {
    const passed = condition();
    checks.push({ name, passed, tip, weight });
  }

  // 1. Title
  const title = document.title;
  addCheck('Title', () => title.length >= 30 && title.length <= 60, 
           `Length: ${title.length} chars (should be 30‑60). ${!title ? 'MISSING!' : ''}`, 2);

  // 2. Meta Description
  const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
  addCheck('Meta Description', () => metaDesc.length >= 120 && metaDesc.length <= 160,
           `Length: ${metaDesc.length} chars (best 120‑160). ${!metaDesc ? 'MISSING!' : ''}`, 2);

  // 3. Meta Keywords (optional, but often used)
  const metaKeys = document.querySelector('meta[name="keywords"]')?.content || '';
  addCheck('Meta Keywords', () => metaKeys.length > 0, 'Consider adding relevant keywords (comma separated).', 0.5);

  // 4. Canonical Tag
  const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
  addCheck('Canonical URL', () => !!canonical, canonical ? `Current: ${canonical}` : 'Missing canonical tag!', 2);

  // 5. Viewport
  const viewport = document.querySelector('meta[name="viewport"]')?.content || '';
  addCheck('Viewport', () => /width=device-width/i.test(viewport) && /initial-scale=1/i.test(viewport),
           'Set <meta name="viewport" content="width=device-width, initial-scale=1">', 1.5);

  // 6. Meta Robots
  const robots = document.querySelector('meta[name="robots"]')?.content || '';
  addCheck('Robots Meta', () => robots && !/(noindex|nofollow)/i.test(robots),
           robots ? `Current: ${robots} – ensure it allows indexing.` : 'Missing robots meta (default allows indexing).', 1.5);

  // 7. H1 Tags
  const h1s = document.querySelectorAll('h1');
  addCheck('H1 Tag', () => h1s.length === 1, 
           `Found ${h1s.length} H1 tags (exactly 1 required).`, 2);

  // 8. H2 Presence (structure)
  const h2s = document.querySelectorAll('h2');
  addCheck('H2 Headings', () => h2s.length >= 1, 'Add H2 subheadings to structure content.', 1);

  // 9. Image Alt Texts
  const imgs = document.querySelectorAll('img');
  const missingAlt = [...imgs].filter(img => !img.alt).length;
  addCheck('Image Alt', () => missingAlt === 0, 
           `${missingAlt} images missing alt text (out of ${imgs.length}).`, 1.5);

  // 10. Word Count (content)
  const words = document.body.innerText.trim().split(/\s+/).length;
  addCheck('Content Length', () => words >= 600,
           `~${words} words. For trends/guides aim for 1000+.`, 1.5);

  // 11. Internal/External Links (basic)
  const links = document.querySelectorAll('a[href]');
  const brokenLinks = [...links].filter(a => !a.href || a.href.startsWith('javascript:') || a.href === '#').length;
  addCheck('Broken/Empty Links', () => brokenLinks === 0,
           `${brokenLinks} links have href="#" or are empty.`, 1);

  // 12. Open Graph Title
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  addCheck('Open Graph Title', () => ogTitle.length > 0, ogTitle ? `OK: "${ogTitle.slice(0,30)}…"` : 'Missing og:title for social sharing.', 1);

  // 13. Open Graph Description
  const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
  addCheck('Open Graph Description', () => ogDesc.length > 0, ogDesc ? 'Present' : 'Missing og:description.', 1);

  // 14. Twitter Card
  const twitterCard = document.querySelector('meta[name="twitter:card"]')?.content || '';
  addCheck('Twitter Card', () => twitterCard.length > 0, 'Add twitter:card meta for better Twitter previews.', 0.5);

  // 15. Favicon
  const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
  addCheck('Favicon', () => !!favicon, 'Add a favicon to improve brand recognition.', 0.5);

  // ---------- SCORE CALCULATION (weighted) ----------
  let totalWeight = 0, earnedWeight = 0;
  checks.forEach(c => {
    totalWeight += c.weight;
    if (c.passed) earnedWeight += c.weight;
  });
  const score = Math.round((earnedWeight / totalWeight) * 100);

  // ---------- RESPONSIVE OVERLAY UI ----------
  const overlay = document.createElement('div');
  overlay.id = 'seo-checker-panel';
  overlay.innerHTML = `
    <style>
      #seo-checker-panel {
        position: fixed;
        top: 20px; right: 20px;
        width: 380px; max-width: 95vw;
        max-height: 90vh;
        overflow-y: auto;
        background: #ffffff;
        color: #1e293b;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        border-radius: 20px;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
        z-index: 2147483647;
        padding: 20px;
        box-sizing: border-box;
        border: 1px solid #e2e8f0;
        transition: all 0.2s;
      }
      #seo-checker-panel * { box-sizing: border-box; margin: 0; }
      #seo-checker-panel h2 {
        font-size: 1.6rem;
        font-weight: 700;
        margin: 0 0 5px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .score-badge {
        font-size: 2rem;
        font-weight: 800;
        padding: 5px 15px;
        border-radius: 60px;
        background: ${score >= 80 ? '#22c55e' : (score >= 50 ? '#eab308' : '#ef4444')};
        color: white;
        display: inline-block;
      }
      .summary { margin: 15px 0 10px; font-size: 0.9rem; opacity: 0.8; }
      .check-list {
        list-style: none;
        padding: 0;
        margin: 15px 0;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        overflow: hidden;
      }
      .check-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 15px;
        border-bottom: 1px solid #e2e8f0;
        background: #fafafa;
      }
      .check-item:last-child { border-bottom: none; }
      .status-icon {
        font-size: 1.2rem;
        min-width: 24px;
        text-align: center;
      }
      .check-content { flex: 1; }
      .check-title {
        font-weight: 600;
        display: flex;
        justify-content: space-between;
      }
      .check-tip {
        color: #475569;
        font-size: 0.85rem;
        margin-top: 4px;
        word-break: break-word;
      }
      .weight-pill {
        background: #cbd5e1;
        color: #0f172a;
        border-radius: 30px;
        padding: 2px 10px;
        font-size: 0.7rem;
        font-weight: 600;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        margin-top: 15px;
        gap: 10px;
      }
      .btn {
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 40px;
        padding: 8px 16px;
        font-weight: 500;
        cursor: pointer;
        font-size: 0.85rem;
        box-shadow: 0 4px 6px -1px rgba(59,130,246,0.3);
      }
      .btn:hover { background: #2563eb; }
      .btn-outline {
        background: transparent;
        color: #1e293b;
        border: 1px solid #cbd5e1;
        box-shadow: none;
      }
      .btn-outline:hover { background: #f1f5f9; }
      .small { font-size: 0.75rem; color: #64748b; margin-top: 10px; text-align: center; }
    </style>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
      <h2>🔍 SEO Report</h2>
      <span class="score-badge">${score}%</span>
    </div>
    <div class="summary">Weighted score – ${earnedWeight.toFixed(1)}/${totalWeight.toFixed(1)} points</div>
    <ul class="check-list">
      ${checks.map(c => `
        <li class="check-item">
          <span class="status-icon">${c.passed ? '✅' : '❌'}</span>
          <div class="check-content">
            <div class="check-title">
              <span>${c.name}</span>
              <span class="weight-pill">w: ${c.weight}</span>
            </div>
            <div class="check-tip">${c.tip}</div>
          </div>
        </li>
      `).join('')}
    </ul>
    <div class="footer">
      <button class="btn btn-outline" id="seo-close">Close</button>
      <button class="btn" id="seo-reload">↻ Re‑check</button>
    </div>
    <div class="small">Advanced SEO Checker • Click outside to close</div>
  `;

  document.body.appendChild(overlay);

  // Close handlers
  document.getElementById('seo-close').addEventListener('click', () => overlay.remove());
  document.getElementById('seo-reload').addEventListener('click', () => { overlay.remove(); location.reload(); });
  overlay.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', function closeOnOutside(e) {
    if (!overlay.contains(e.target)) {
      overlay.remove();
      document.removeEventListener('click', closeOnOutside);
    }
  });
})();
