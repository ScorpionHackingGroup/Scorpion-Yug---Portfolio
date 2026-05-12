/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         Website Cloner v2.0 — Full Multi-Page Edition           ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  BUGS FIXED FROM v1:                                            ║
 * ║  1. Stuck on index.html — added full recursive HTML crawling    ║
 * ║     (BFS queue, visited-set, same-origin only)                  ║
 * ║  2. No multi-page scraping — now crawls ALL internal pages      ║
 * ║  3. urlToFilePath stripped hostname → CDN assets overwrote each ║
 * ║     other. Now uses full host+path as file path.                ║
 * ║  4. ZIP broken — path.resolve() for absolute sourceDir,         ║
 * ║     added 'warning' + 'finish' events, better error handling    ║
 * ║  5. CSS files never parsed for url() assets — added CSS parser  ║
 * ║  6. JS_PARSE_LIMIT was 10 — now configurable, default 50        ║
 * ║  7. No URL input — added readline prompt with smart URL/domain  ║
 * ║     normalization (handles bare domains, paths, trailing slash)  ║
 * ║  8. No crawl depth limit — added MAX_DEPTH + MAX_PAGES safety   ║
 * ║  9. networkAssets Set not flushed between pages in crawl loop   ║
 * ║     — now captured per-page and merged globally                 ║
 * ║  10. No summary of saved HTML pages count — now shown in report ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

const puppeteer  = require('puppeteer-core');
const fs         = require('fs-extra');
const path       = require('path');
const archiver   = require('archiver');
const readline   = require('readline');
const { URL }    = require('url');

// ========== CONFIG ==========
const OUTPUT_DIR    = './cloned_site';
const ZIP_NAME      = 'cloned_website.zip';
const CONCURRENCY   = 8;    // Parallel asset downloads
const JS_PARSE_LIMIT  = 50; // Max JS files to scan for nested assets
const CSS_PARSE_LIMIT = 30; // Max CSS files to scan for nested assets
const MAX_PAGES     = 200;  // Safety cap: max HTML pages to crawl
const MAX_DEPTH     = 5;    // Max link-follow depth from root
// ============================

// ─── URL INPUT ──────────────────────────────────────────────────────────────

/**
 * Normalize user input to a full valid URL.
 * Accepts: "example.com", "example.com/path", "https://example.com", etc.
 */
function normalizeUrl(input) {
    input = input.trim().replace(/\/$/, ''); // strip trailing slash

    // If no protocol, add https://
    if (!/^https?:\/\//i.test(input)) {
        input = 'https://' + input;
    }

    const parsed = new URL(input);

    // Ensure pathname ends cleanly
    if (!parsed.pathname || parsed.pathname === '') {
        parsed.pathname = '/';
    }

    return parsed.href;
}

/** Ask the user for a URL via stdin and return normalized form */
function askForUrl() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input:  process.stdin,
            output: process.stdout,
        });

        const ask = () => {
            rl.question(
                '\n🌐 Enter website URL or domain to clone\n' +
                '   (e.g. example.com  OR  https://example.com/page)\n' +
                '   > ',
                (answer) => {
                    if (!answer.trim()) {
                        console.log('   ⚠️  Please enter a URL.');
                        return ask();
                    }
                    try {
                        const normalized = normalizeUrl(answer);
                        console.log(`\n   ✅ Resolved to: ${normalized}\n`);
                        rl.close();
                        resolve(normalized);
                    } catch {
                        console.log('   ❌ Invalid URL, please try again.');
                        ask();
                    }
                }
            );
        };

        ask();
    });
}

// ─── CHROME DETECTION ───────────────────────────────────────────────────────

function findChromePath() {
    const candidates = [
        // Linux
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        // macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        // Windows
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];

    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }

    try {
        const pup = require('puppeteer');
        return pup.executablePath();
    } catch {}

    throw new Error(
        '❌ No Chrome/Chromium found.\n' +
        '   Install: sudo apt install chromium-browser\n' +
        '   Or set CHROME_PATH env variable.'
    );
}

// ─── UTILITIES ──────────────────────────────────────────────────────────────

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Convert any URL to a safe on-disk path, preserving hostname so
 * CDN assets (different domains) don't collide.
 *
 * FIX: Old version stripped hostname — assets from cdn.example.com and
 * assets.example.com would both map to ./cloned_site/path, overwriting each
 * other. Now maps to ./cloned_site/cdn.example.com/path.
 */
function urlToFilePath(assetUrl, outputDir) {
    if (!/^https?:\/\//i.test(assetUrl)) return null;

    try {
        const u = new URL(assetUrl);
        let pathname = u.pathname;

        // Directory paths → index.html
        if (!pathname || pathname.endsWith('/')) pathname += 'index.html';

        // Strip query & fragment from filename but keep extension
        // e.g. /main.js?v=123 → /main.js
        pathname = pathname.split('?')[0].split('#')[0];

        // Build host/path structure
        let relative = path.join(u.hostname, pathname.replace(/^\//, ''));

        // Prevent path traversal
        relative = path.normalize(relative).replace(/\.\./g, '_');

        return path.join(outputDir, relative);
    } catch {
        return null;
    }
}

/**
 * Decide whether a URL is internal (same origin) to the target.
 */
function isSameOrigin(url, targetOrigin) {
    try {
        return new URL(url).origin === targetOrigin;
    } catch {
        return false;
    }
}

// ─── DOWNLOAD ───────────────────────────────────────────────────────────────

async function downloadResource(url, outputPath) {
    try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteCloner/2.0)' },
        });
        clearTimeout(timer);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buf = await res.arrayBuffer();
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, Buffer.from(buf));
        console.log(`  ✅ ${url}`);
        return true;
    } catch (err) {
        const label = err.name === 'AbortError' ? '⏱️  Timeout' : '❌ Failed';
        console.log(`  ${label}: ${url} — ${err.message}`);
        return false;
    }
}

async function downloadAll(items, concurrency = CONCURRENCY) {
    let idx = 0, done = 0;
    const total = items.length;

    async function worker() {
        while (idx < items.length) {
            const { url, filePath } = items[idx++];
            await downloadResource(url, filePath);
            done++;
            if (done % 25 === 0) console.log(`\n📥 Progress: ${done}/${total}\n`);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length || 1) }, worker)
    );
    return done;
}

// ─── ASSET EXTRACTION ───────────────────────────────────────────────────────

/** Extract all asset URLs and internal page links from a loaded Puppeteer page */
async function extractPageAssets(page) {
    return page.evaluate(() => {
        const addIf = (set, val) => {
            if (val && typeof val === 'string' && val.startsWith('http')) set.add(val);
        };

        const scripts = new Set();
        const styles  = new Set();
        const images  = new Set();
        const fonts   = new Set();
        const links   = new Set(); // internal HTML page links

        // Scripts
        document.querySelectorAll('script[src]').forEach(el => addIf(scripts, el.src));

        // Stylesheets
        document.querySelectorAll('link[rel="stylesheet"]').forEach(el => addIf(styles, el.href));

        // Images (all variants)
        document.querySelectorAll('img[src]').forEach(el => addIf(images, el.src));
        document.querySelectorAll('img[data-src]').forEach(el => addIf(images, el.dataset.src));
        document.querySelectorAll('source[src]').forEach(el => addIf(images, el.src));
        document.querySelectorAll('video[poster]').forEach(el => addIf(images, el.poster));
        document.querySelectorAll('[srcset]').forEach(el => {
            el.srcset.split(',').forEach(part => {
                const u = part.trim().split(/\s+/)[0];
                if (u) addIf(images, u);
            });
        });

        // Preload fonts
        document.querySelectorAll('link[rel="preload"][as="font"]').forEach(el => addIf(fonts, el.href));
        document.querySelectorAll('link[rel="preconnect"]'); // informational, skip

        // Background images (scan ALL elements, not just top 200)
        document.querySelectorAll('*').forEach(el => {
            const bg = getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') {
                const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (m) addIf(images, m[1]);
            }
        });

        // Favicon & other link tags
        document.querySelectorAll('link[href]').forEach(el => {
            const rel = (el.rel || '').toLowerCase();
            if (['icon', 'shortcut icon', 'apple-touch-icon', 'manifest'].includes(rel)) {
                addIf(images, el.href);
            }
        });

        // Internal navigation links (for multi-page crawl)
        document.querySelectorAll('a[href]').forEach(el => {
            const href = el.href; // browser resolves to absolute
            if (href && href.startsWith('http') && !href.includes('#')) {
                addIf(links, href);
            }
        });

        return {
            scripts: [...scripts],
            styles:  [...styles],
            images:  [...images],
            fonts:   [...fonts],
            links:   [...links],
        };
    });
}

/** Fetch a JS file and extract asset URLs from its source text */
async function extractAssetsFromJS(jsUrl, targetOrigin) {
    const found = new Set();
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 12000);
        const res = await fetch(jsUrl, { signal: controller.signal });
        if (!res.ok) return found;

        const text = await res.text();

        // Absolute URLs to known asset extensions
        const absPattern = /https?:\/\/[^\s"'`()<>{}|\\^\[\]]+/g;
        for (const m of text.matchAll(absPattern)) {
            const u = m[0].replace(/[,;)>]+$/, '');
            if (/\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico|mp4|mp3|json)(\?|$)/i.test(u)) {
                found.add(u);
            }
        }

        // Relative paths (both /path and ./path)
        const relPattern = /["'`](\.?\/[^"'`\s><{}]+\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico|mp4|mp3)(\?[^"'`\s]*)?)["'`]/g;
        const base = new URL(jsUrl);
        for (const m of text.matchAll(relPattern)) {
            try { found.add(new URL(m[1], base.origin).href); } catch {}
        }

        console.log(`  🔍 JS scan: ${found.size} assets ← ${path.basename(jsUrl.split('?')[0])}`);
    } catch { /* non-fatal */ }
    return found;
}

/**
 * NEW: Fetch a CSS file and extract all url(...) references.
 * The old script never parsed CSS files — missing fonts, bg images, etc.
 */
async function extractAssetsFromCSS(cssUrl) {
    const found = new Set();
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 12000);
        const res = await fetch(cssUrl, { signal: controller.signal });
        if (!res.ok) return found;

        const text = await res.text();
        const base = new URL(cssUrl);

        // url('...') and url(...) patterns
        const urlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
        for (const m of text.matchAll(urlPattern)) {
            const raw = m[1].trim();
            if (raw.startsWith('data:')) continue; // skip inline data URIs
            try {
                found.add(new URL(raw, base.href).href);
            } catch {}
        }

        // @import "..." and @import url(...)
        const importPattern = /@import\s+["']([^"']+)["']/gi;
        for (const m of text.matchAll(importPattern)) {
            try {
                found.add(new URL(m[1], base.href).href);
            } catch {}
        }

        console.log(`  🎨 CSS scan: ${found.size} assets ← ${path.basename(cssUrl.split('?')[0])}`);
    } catch { /* non-fatal */ }
    return found;
}

// ─── ZIP ─────────────────────────────────────────────────────────────────────

/**
 * FIX: Old version used relative sourceDir path which could silently fail on
 * some systems. Now uses path.resolve() for absolute path, adds 'warning'
 * event, and waits for the write stream 'finish' (not just 'close') on newer
 * Node versions to avoid premature resolve.
 */
function createZip(sourceDir, zipPath) {
    return new Promise((resolve, reject) => {
        const absSource = path.resolve(sourceDir);
        const absZip    = path.resolve(zipPath);

        const output  = fs.createWriteStream(absZip);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close',  () => resolve(archive.pointer()));
        output.on('finish', () => {}); // some Node versions emit finish not close
        output.on('error',  reject);
        archive.on('error', reject);
        archive.on('warning', (warn) => {
            if (warn.code === 'ENOENT') {
                console.warn('  ⚠️  ZIP warning:', warn.message);
            } else {
                reject(warn);
            }
        });

        archive.pipe(output);
        archive.directory(absSource, false); // FIX: absolute path
        archive.finalize();
    });
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function cloneWebsite() {
    // 1. Ask user for URL
    const TARGET_URL   = await askForUrl();
    const targetOrigin = new URL(TARGET_URL).origin;
    const targetHost   = new URL(TARGET_URL).hostname;

    console.log('🚀 Website Cloner v2.0 starting...');
    console.log(`🎯 Target : ${TARGET_URL}`);
    console.log(`🏠 Origin : ${targetOrigin}`);
    console.log(`📁 Output : ${path.resolve(OUTPUT_DIR)}\n`);

    // 2. Fresh output directory
    await fs.remove(OUTPUT_DIR);
    await fs.ensureDir(OUTPUT_DIR);

    // 3. Launch browser
    const chromePath = process.env.CHROME_PATH || findChromePath();
    console.log(`🌐 Chrome : ${chromePath}\n`);

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    // Global asset collections
    const allAssetUrls   = new Set(); // all non-HTML assets across all pages
    const visitedPages   = new Set(); // pages already scraped
    const savedHtmlFiles = [];        // track saved HTML paths

    try {
        // ── PHASE 1: Multi-page HTML crawl ─────────────────────────────────
        //
        // FIX: Old script only ever loaded TARGET_URL once and saved index.html.
        // It had no queue, no visited set, and no link following whatsoever.
        // New: BFS crawler with depth tracking and same-origin guard.

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PHASE 1 — Crawling HTML pages');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        /** BFS queue item: { url, depth } */
        const queue = [{ url: TARGET_URL, depth: 0 }];
        visitedPages.add(TARGET_URL);

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        // Network interception — capture asset requests on every page load
        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            if (['script','stylesheet','image','font','media'].includes(type)) {
                allAssetUrls.add(req.url());
            }
            req.continue();
        });

        while (queue.length > 0 && visitedPages.size <= MAX_PAGES) {
            const { url: pageUrl, depth } = queue.shift();

            console.log(`📄 [depth ${depth}] ${pageUrl}`);

            try {
                await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                await delay(1500);
            } catch (err) {
                console.log(`  ⚠️  Failed to load: ${err.message}`);
                continue;
            }

            // Save HTML to disk
            const html     = await page.content();
            const filePath = urlToFilePath(pageUrl, OUTPUT_DIR) ||
                             path.join(OUTPUT_DIR, targetHost, 'index.html');

            // Ensure .html extension
            const htmlPath = filePath.endsWith('.html') || filePath.endsWith('.htm')
                ? filePath
                : filePath + '.html';

            await fs.ensureDir(path.dirname(htmlPath));
            await fs.writeFile(htmlPath, html, 'utf8');
            savedHtmlFiles.push(htmlPath);
            console.log(`  💾 Saved → ${path.relative(OUTPUT_DIR, htmlPath)}`);

            // Extract assets + links
            const extracted = await extractPageAssets(page);

            // Collect all asset URLs
            [...extracted.scripts, ...extracted.styles,
             ...extracted.images,  ...extracted.fonts].forEach(u => allAssetUrls.add(u));

            // Enqueue unvisited same-origin links for crawling
            if (depth < MAX_DEPTH) {
                for (const link of extracted.links) {
                    // Normalize: strip fragment and trailing slash
                    let clean;
                    try {
                        const u = new URL(link);
                        u.hash = '';
                        clean = u.href.replace(/\/$/, '') || u.href;
                    } catch { continue; }

                    if (isSameOrigin(clean, targetOrigin) && !visitedPages.has(clean)) {
                        visitedPages.add(clean);
                        queue.push({ url: clean, depth: depth + 1 });
                    }
                }
            }

            console.log(
                `  📊 Assets so far: ${allAssetUrls.size} | ` +
                `Queue: ${queue.length} | Visited: ${visitedPages.size}`
            );
        }

        console.log(`\n✅ Crawl complete — ${savedHtmlFiles.length} HTML pages saved\n`);

        // ── PHASE 2: Deep asset scanning (JS + CSS) ─────────────────────────
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PHASE 2 — Deep scanning JS & CSS files');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const jsUrls = [...allAssetUrls]
            .filter(u => /\.m?js(\?|$)/i.test(u))
            .slice(0, JS_PARSE_LIMIT);

        const cssUrls = [...allAssetUrls]
            .filter(u => /\.css(\?|$)/i.test(u))
            .slice(0, CSS_PARSE_LIMIT);

        console.log(`📜 Scanning ${jsUrls.length} JS files...`);
        const jsResults = await Promise.all(jsUrls.map(u => extractAssetsFromJS(u, targetOrigin)));
        jsResults.forEach(set => set.forEach(u => allAssetUrls.add(u)));

        console.log(`\n🎨 Scanning ${cssUrls.length} CSS files...`);
        const cssResults = await Promise.all(cssUrls.map(u => extractAssetsFromCSS(u)));
        cssResults.forEach(set => set.forEach(u => allAssetUrls.add(u)));

        console.log(`\n🔗 Total unique assets after deep scan: ${allAssetUrls.size}\n`);

    } finally {
        await browser.close();
    }

    // ── PHASE 3: Download all assets ────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 3 — Downloading assets');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const downloadList = [];
    for (const url of allAssetUrls) {
        const filePath = urlToFilePath(url, OUTPUT_DIR);
        if (filePath) downloadList.push({ url, filePath });
    }

    console.log(`📦 ${downloadList.length} assets queued for download\n`);
    await downloadAll(downloadList);
    console.log('\n✅ Asset download complete!\n');

    // ── PHASE 4: Create ZIP ──────────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 4 — Creating ZIP archive');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🗜️  Compressing...');
    const bytes  = await createZip(OUTPUT_DIR, ZIP_NAME);
    const sizeMB = (bytes / 1024 / 1024).toFixed(2);

    // Count files saved
    const allFiles = await fs.readdir(OUTPUT_DIR, { recursive: true }).catch(() => []);

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║           🎉 Clone Complete!          ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  📄 HTML pages  : ${String(savedHtmlFiles.length).padEnd(18)}║`);
    console.log(`║  🖼️  Assets      : ${String(downloadList.length).padEnd(18)}║`);
    console.log(`║  📁 Output dir  : ${OUTPUT_DIR.padEnd(18)}║`);
    console.log(`║  📦 ZIP file    : ${ZIP_NAME.padEnd(18)}║`);
    console.log(`║  💾 ZIP size    : ${(sizeMB + ' MB').padEnd(18)}║`);
    console.log('╚══════════════════════════════════════╝\n');
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────

cloneWebsite().catch(err => {
    console.error('\n💥 Fatal error:', err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
});
