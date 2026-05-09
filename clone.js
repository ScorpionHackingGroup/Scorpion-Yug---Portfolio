/**
 * Website Cloner - Fixed & Production Ready
 * 
 * BUGS FIXED:
 * 1. `puppeteer` → `puppeteer-core` (with auto chromium path detection)
 * 2. `getNestedResources()` used `page.goto()` on JS files — this destroys
 *    the current page context. Fixed to use `fetch()` directly.
 * 3. `response.text()` called on a Puppeteer response (not a fetch response)
 *    — was using the wrong API. Now uses node fetch properly.
 * 4. `headless: 'new'` is deprecated in newer Puppeteer — changed to `true`.
 * 5. No `await` on `archive.finalize()` race condition — wrapped in Promise.
 * 6. ZIP written to CWD but OUTPUT_DIR deleted first could break relative paths
 *    — ZIP now written outside OUTPUT_DIR safely.
 * 7. `Set` serialization issue: page.evaluate() can't return Sets → already
 *    returned arrays (was OK), but forEach on Sets in outer scope had no issue.
 * 8. No graceful browser close on error — added try/finally.
 * 9. Concurrent downloads: sequential loop was very slow — added concurrency.
 * 10. `downloadResource` accepted `page` param but never used it — removed.
 * 11. Invalid URL strings (e.g. "data:..." or "blob:...") crashed new URL() —
 *     added proper filtering.
 * 12. `allAssets.size` used after Set converted — now tracks correctly.
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { URL } = require('url');

// ========== CONFIG ==========
const TARGET_URL = 'https://example.com'; // 🔁 Yahan apni URL daal
const OUTPUT_DIR = './cloned_site';
const ZIP_NAME = 'cloned_website.zip';
const CONCURRENCY = 5;      // Parallel downloads at once
const JS_PARSE_LIMIT = 10;  // Max JS files to scan for nested assets
// ============================

/** Find installed Chromium/Chrome path automatically */
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
        // Windows (common paths)
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];

    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return p;
        } catch {}
    }

    // Try puppeteer's own bundled browser if available
    try {
        const pup = require('puppeteer');
        return pup.executablePath();
    } catch {}

    throw new Error(
        '❌ No Chrome/Chromium found.\n' +
        '   Install it: sudo apt install chromium-browser\n' +
        '   Or set CHROME_PATH env variable.'
    );
}

/** Pause execution for ms milliseconds */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Download a URL and save to disk. Returns true on success. */
async function downloadResource(url, outputPath) {
    try {
        // Skip non-HTTP resources
        if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteCloner/1.0)' }
        });
        clearTimeout(timeout);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = await response.arrayBuffer();
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, Buffer.from(buffer));
        console.log(`  ✅ ${url}`);
        return true;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log(`  ⏱️  Timeout: ${url}`);
        } else {
            console.log(`  ❌ Failed: ${url} — ${err.message}`);
        }
        return false;
    }
}

/** Run downloads with limited concurrency */
async function downloadAll(items, concurrency = CONCURRENCY) {
    let index = 0;
    let completed = 0;
    const total = items.length;

    async function worker() {
        while (index < items.length) {
            const { url, filePath } = items[index++];
            await downloadResource(url, filePath);
            completed++;
            if (completed % 20 === 0) {
                console.log(`\n📥 Progress: ${completed}/${total}\n`);
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
    await Promise.all(workers);
    return completed;
}

/** Extract all asset URLs from the page DOM */
async function getAllAssets(page) {
    return page.evaluate(() => {
        const add = (set, url) => { if (url && url.startsWith('http')) set.add(url); };

        const scripts = new Set();
        const styles  = new Set();
        const images  = new Set();
        const fonts   = new Set();

        document.querySelectorAll('script[src]').forEach(el => add(scripts, el.src));
        document.querySelectorAll('link[rel="stylesheet"]').forEach(el => add(styles, el.href));
        document.querySelectorAll('img[src]').forEach(el => add(images, el.src));
        document.querySelectorAll('img[data-src]').forEach(el => add(images, el.dataset.src));
        document.querySelectorAll('source[src]').forEach(el => add(images, el.src));

        document.querySelectorAll('[srcset]').forEach(el => {
            el.srcset.split(',').forEach(part => {
                const url = part.trim().split(/\s+/)[0];
                if (url) add(images, url);
            });
        });

        document.querySelectorAll('link[rel="preload"]').forEach(el => {
            if (el.getAttribute('as') === 'font') add(fonts, el.href);
        });

        // Background images from computed styles (sample top 200 elements for perf)
        const els = Array.from(document.querySelectorAll('*')).slice(0, 200);
        els.forEach(el => {
            const bg = getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') {
                const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (m && m[1].startsWith('http')) add(images, m[1]);
            }
        });

        return {
            scripts: [...scripts],
            styles:  [...styles],
            images:  [...images],
            fonts:   [...fonts],
        };
    });
}

/**
 * FIX: Original used page.goto() to fetch JS content — this destroyed the
 * loaded page. Now uses fetch() directly to read JS text and extract URLs.
 */
async function getNestedAssetsFromJS(jsUrl) {
    const found = new Set();
    try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 10000);

        const res = await fetch(jsUrl, { signal: controller.signal });
        if (!res.ok) return found;

        const text = await res.text();

        // Extract any absolute URLs pointing to assets
        const urlPattern = /https?:\/\/[^\s"'`()<>{}|\\^[\]]+/g;
        for (const match of text.matchAll(urlPattern)) {
            const u = match[0].replace(/[,;)]+$/, ''); // strip trailing punctuation
            if (/\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico)(\?|$)/i.test(u)) {
                found.add(u);
            }
        }

        // Also extract relative paths that look like assets
        const relPattern = /["'`](\/[^"'`\s]+\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|eot)(\?[^"'`\s]*)?)["'`]/g;
        const base = new URL(jsUrl);
        for (const match of text.matchAll(relPattern)) {
            try {
                found.add(new URL(match[1], base.origin).href);
            } catch {}
        }

        console.log(`  🔍 ${found.size} nested assets in ${jsUrl.split('/').pop()}`);
    } catch (err) {
        // Non-fatal — just skip this JS file
    }
    return found;
}

/** Convert a URL to a safe output file path */
function urlToFilePath(assetUrl, baseUrl) {
    // Filter out non-HTTP, data URIs, blob URIs
    if (!/^https?:\/\//i.test(assetUrl)) return null;

    try {
        const urlObj = new URL(assetUrl, baseUrl);
        let pathname = urlObj.pathname;

        // Add index.html for directory paths
        if (!pathname || pathname.endsWith('/')) pathname += 'index.html';

        // Strip leading slash and sanitize
        pathname = pathname.replace(/^\//, '');

        // Avoid path traversal
        const safe = path.normalize(pathname).replace(/\.\./g, '_');
        return path.join(OUTPUT_DIR, safe);
    } catch {
        return null;
    }
}

/** Wrap archiver zip in a Promise so we can await it properly */
function createZip(sourceDir, zipPath) {
    return new Promise((resolve, reject) => {
        const output  = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(archive.pointer()));
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

/** Main entry point */
async function cloneWebsite() {
    console.log('🚀 Starting website clone...');
    console.log(`🎯 Target: ${TARGET_URL}\n`);

    // Fresh output directory
    await fs.remove(OUTPUT_DIR);
    await fs.ensureDir(OUTPUT_DIR);

    const chromePath = process.env.CHROME_PATH || findChromePath();
    console.log(`🌐 Using Chrome: ${chromePath}\n`);

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,           // FIX: 'new' is deprecated
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Capture all network asset URLs via request interception
        await page.setRequestInterception(true);
        const networkAssets = new Set();

        page.on('request', req => {
            const type = req.resourceType();
            if (['script','stylesheet','image','font','media'].includes(type)) {
                networkAssets.add(req.url());
            }
            req.continue();
        });

        // Navigate to the page
        console.log(`📡 Loading ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(2000); // Let lazy-loaded content settle

        // Save HTML
        const html = await page.content();
        await fs.writeFile(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');
        console.log('✅ Saved index.html\n');

        // Collect DOM assets
        const domAssets = await getAllAssets(page);
        console.log(
            `📋 DOM assets — JS: ${domAssets.scripts.length}, ` +
            `CSS: ${domAssets.styles.length}, ` +
            `Images: ${domAssets.images.length}, ` +
            `Fonts: ${domAssets.fonts.length}`
        );
        console.log(`🌐 Network captured: ${networkAssets.size} assets\n`);

        // Scan JS files for nested assets
        // FIX: No longer navigates page — uses fetch() instead
        const allJsUrls = [...new Set([
            ...domAssets.scripts,
            ...[...networkAssets].filter(u => /\.js(\?|$)/i.test(u))
        ])].slice(0, JS_PARSE_LIMIT);

        console.log(`📜 Scanning ${allJsUrls.length} JS files for nested assets...`);
        const nestedAssets = new Set();
        await Promise.all(allJsUrls.map(async jsUrl => {
            const found = await getNestedAssetsFromJS(jsUrl);
            found.forEach(u => nestedAssets.add(u));
        }));
        console.log(`🔗 Found ${nestedAssets.size} nested assets\n`);

        // Merge everything
        const allUrls = new Set([
            ...domAssets.scripts,
            ...domAssets.styles,
            ...domAssets.images,
            ...domAssets.fonts,
            ...networkAssets,
            ...nestedAssets,
        ]);

        // Build download list, filtering invalid URLs
        const downloadList = [];
        for (const url of allUrls) {
            const filePath = urlToFilePath(url, TARGET_URL);
            if (filePath) downloadList.push({ url, filePath });
        }

        console.log(`📦 Total assets to download: ${downloadList.length}\n`);

        // Download with concurrency
        await downloadAll(downloadList);

        console.log(`\n✅ Download complete!\n`);

    } finally {
        // FIX: Always close browser even if errors occur
        await browser.close();
    }

    // Create ZIP
    console.log('🗜️  Creating ZIP archive...');
    const bytes = await createZip(OUTPUT_DIR, ZIP_NAME); // FIX: properly awaited
    const sizeMB = (bytes / 1024 / 1024).toFixed(2);
    console.log(`\n🎉 Done!`);
    console.log(`   📦 ZIP:     ${ZIP_NAME} (${sizeMB} MB)`);
    console.log(`   📁 Files:   ${OUTPUT_DIR}/`);
}

// Run with top-level error handling
cloneWebsite().catch(err => {
    console.error('\n💥 Fatal error:', err.message);
    process.exit(1);
});
