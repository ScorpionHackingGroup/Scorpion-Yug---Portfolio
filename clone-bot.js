/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║        Website Cloner — Telegram Bot v3.0                       ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  SETUP:                                                         ║
 * ║    npm install node-telegram-bot-api puppeteer-core fs-extra    ║
 * ║                                                                 ║
 * ║  CONFIG (edit below OR use env vars):                           ║
 * ║    BOT_TOKEN  — from @BotFather on Telegram                     ║
 * ║    CHROME_PATH — path to chrome/chromium binary                 ║
 * ║                                                                 ║
 * ║  RUN:                                                           ║
 * ║    BOT_TOKEN=xxx node clone-bot.js                              ║
 * ║                                                                 ║
 * ║  TELEGRAM COMMANDS:                                             ║
 * ║    /clone https://example.com   → clones site, sends ZIP        ║
 * ║    /start                       → welcome message               ║
 * ║    /help                        → usage guide                   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * ZIP: Uses system `zip` binary — no archiver/adm-zip needed.
 * CLEANUP: After ZIP is sent to Telegram, all temp files deleted.
 */

'use strict';

const TelegramBot = require('node-telegram-bot-api');
const puppeteer   = require('puppeteer-core');
const fs          = require('fs-extra');
const path        = require('path');
const { URL }     = require('url');
const crypto      = require('crypto');
const { spawn, spawnSync } = require('child_process');
const os          = require('os');

// ════════════════════════════════════════════
//  CONFIG — edit here or use env vars
// ════════════════════════════════════════════
const BOT_TOKEN   = process.env.BOT_TOKEN   || '7641661416:AAE2ZROiVSebP7_E0Yh0XoQjAuc3f42STYE';
const CHROME_PATH = process.env.CHROME_PATH || '';   // auto-detected if blank

const CONCURRENCY  = 8;     // parallel asset downloads
const MAX_PAGES    = 100;   // max HTML pages to crawl per site
const MAX_DEPTH    = 4;     // max link depth from root
const PAGE_TIMEOUT = 40000; // ms per page load
const ASSET_TIMEOUT= 12000; // ms per asset download
const MAX_ZIP_MB   = 48;    // Telegram file limit is 50MB; keep margin
// ════════════════════════════════════════════

// ─── Find Chrome ─────────────────────────────────────────────────────────────
function findChromePath() {
    if (CHROME_PATH && fs.existsSync(CHROME_PATH)) return CHROME_PATH;

    const candidates = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    try { return require('puppeteer').executablePath(); } catch {}
    throw new Error(
        'Chrome/Chromium not found.\n' +
        'Install: sudo apt install chromium-browser\n' +
        'Or set CHROME_PATH=/path/to/chrome'
    );
}

// ─── Normalize any URL input ──────────────────────────────────────────────────
function normalizeUrl(input) {
    let u = input.trim().replace(/^['"`]+|['"`]+$/g, '');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const parsed = new URL(u);
    if (!parsed.pathname || parsed.pathname === '') parsed.pathname = '/';
    return parsed.href;
}

// ─── delay helper ─────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

// ─── Convert URL → safe local file path ──────────────────────────────────────
function urlToFilePath(assetUrl, baseUrl, outputDir) {
    if (!/^https?:\/\//i.test(assetUrl)) return null;
    try {
        const obj = new URL(assetUrl, baseUrl);
        let p = obj.pathname;

        if (!p || p.endsWith('/')) {
            p += 'index.html';
        } else if (!path.extname(p)) {
            p += '/index.html';
        }

        // Unique suffix for query strings (avoid collisions)
        if (obj.search) {
            const ext  = path.extname(p);
            const base = p.slice(0, ext ? -ext.length : undefined);
            const h    = crypto.createHash('md5').update(obj.search).digest('hex').slice(0, 6);
            p = `${base}_${h}${ext}`;
        }

        p = p.replace(/^\//, '');
        const safe = path.normalize(p).replace(/\.\./g, '_').replace(/:/g, '_');
        return path.join(outputDir, safe);
    } catch {
        return null;
    }
}

// ─── Download one asset file ──────────────────────────────────────────────────
async function downloadResource(url, outputPath) {
    try {
        if (!/^https?:\/\//i.test(url)) return false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ASSET_TIMEOUT);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteCloner/3.0)' }
        });
        clearTimeout(timer);
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, Buffer.from(buf));
        return true;
    } catch {
        return false;
    }
}

// ─── Concurrent download queue ────────────────────────────────────────────────
async function downloadAll(items, onProgress) {
    if (!items.length) return 0;
    let idx = 0, done = 0;
    async function worker() {
        while (idx < items.length) {
            const { url, filePath } = items[idx++];
            if (await downloadResource(url, filePath)) done++;
            if (onProgress) onProgress(idx, items.length);
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
    return done;
}

// ─── Extract DOM assets + links from a loaded page ───────────────────────────
async function getPageAssets(page) {
    return page.evaluate(() => {
        const add = (set, url) => {
            if (url && /^https?:\/\//i.test(url)) set.add(url.split('#')[0]);
        };
        const scripts = new Set(), styles = new Set(),
              images = new Set(), fonts = new Set(), links = new Set();

        document.querySelectorAll('script[src]').forEach(el => add(scripts, el.src));
        document.querySelectorAll('link[rel="stylesheet"]').forEach(el => add(styles, el.href));
        document.querySelectorAll('img[src], img[data-src]')
            .forEach(el => add(images, el.src || el.dataset.src));
        document.querySelectorAll('source[src], video[src], audio[src]')
            .forEach(el => add(images, el.src));
        document.querySelectorAll('[srcset]').forEach(el => {
            el.srcset.split(',').forEach(part => {
                const u = part.trim().split(/\s+/)[0];
                if (u) add(images, u);
            });
        });
        document.querySelectorAll('link[rel="preload"], link[rel="prefetch"]').forEach(el => {
            const as = el.getAttribute('as');
            if (as === 'font') add(fonts, el.href);
            else if (as === 'script') add(scripts, el.href);
            else if (as === 'style') add(styles, el.href);
        });
        document.querySelectorAll('link[rel~="icon"], link[rel="manifest"]')
            .forEach(el => add(images, el.href));

        // BFS: collect all same-page anchor hrefs
        document.querySelectorAll('a[href]').forEach(el => {
            const h = el.href;
            if (h && /^https?:\/\//i.test(h)) add(links, h.split('?')[0].split('#')[0]);
        });

        // CSS background images
        Array.from(document.querySelectorAll('*')).forEach(el => {
            const bg = getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') {
                const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
                if (m) add(images, m[1]);
            }
        });

        return {
            scripts: [...scripts], styles: [...styles],
            images: [...images],   fonts: [...fonts], links: [...links]
        };
    });
}

// ─── Parse CSS for nested url() / @import ────────────────────────────────────
async function getAssetsFromCSS(cssUrl) {
    const found = new Set();
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(cssUrl, { signal: ctrl.signal });
        if (!res.ok) return found;
        const text = await res.text();

        for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
            const u = m[1].trim();
            if (!u.startsWith('data:')) {
                try { found.add(new URL(u, cssUrl).href); } catch {}
            }
        }
        for (const m of text.matchAll(/@import\s+["']([^"']+)["']/gi)) {
            try { found.add(new URL(m[1], cssUrl).href); } catch {}
        }
    } catch {}
    return found;
}

// ─── Parse JS for embedded asset paths ───────────────────────────────────────
async function getAssetsFromJS(jsUrl) {
    const found = new Set();
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(jsUrl, { signal: ctrl.signal });
        if (!res.ok) return found;
        const text = await res.text();

        for (const m of text.matchAll(/https?:\/\/[^\s"'`()<>{}|\\^[\]]+/g)) {
            const u = m[0].replace(/[,;)'"]+$/, '');
            if (/\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico|json)(\?|$)/i.test(u)) {
                found.add(u);
            }
        }
        const base = new URL(jsUrl);
        for (const m of text.matchAll(/["'`](\/[^"'`\s]{3,}\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|eot|ico)(\?[^"'`\s]*)?)["'`]/g)) {
            try { found.add(new URL(m[1], base.origin).href); } catch {}
        }
    } catch {}
    return found;
}

// ─── Scrape one page → returns html, assets, networkAssets ───────────────────
async function scrapePage(browser, pageUrl) {
    const page = await browser.newPage();
    const networkAssets = new Set();
    try {
        await page.setViewport({ width: 1440, height: 900 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['script','stylesheet','image','font','media','manifest'].includes(req.resourceType())) {
                networkAssets.add(req.url().split('#')[0]);
            }
            req.continue();
        });

        await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
        await delay(1200);

        // Trigger lazy-loads via scroll
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let y = 0;
                const tick = () => {
                    window.scrollBy(0, 400);
                    y += 400;
                    if (y >= document.body.scrollHeight) return resolve();
                    setTimeout(tick, 60);
                };
                tick();
            });
        }).catch(() => {});
        await delay(600);

        const html   = await page.content();
        const assets = await getPageAssets(page);
        return { html, assets, networkAssets: [...networkAssets] };
    } finally {
        await page.close().catch(() => {});
    }
}

// ─── ZIP using system `zip` binary (no archiver package needed) ───────────────
function createZipFromDir(sourceDir, zipPath) {
    return new Promise((resolve, reject) => {
        const absSource = path.resolve(sourceDir);
        const absZip    = path.resolve(zipPath);

        if (!fs.existsSync(absSource)) {
            return reject(new Error('Source directory not found: ' + absSource));
        }

        // Remove old zip if exists
        try { fs.removeSync(absZip); } catch {}

        // Use system zip: cd into parent, zip the folder
        const parent  = path.dirname(absSource);
        const dirName = path.basename(absSource);

        const proc = spawn('zip', ['-r', absZip, dirName], {
            cwd: parent,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());

        proc.on('close', code => {
            if (code !== 0) return reject(new Error('zip failed: ' + stderr));
            if (!fs.existsSync(absZip)) return reject(new Error('ZIP not created'));
            const size = fs.statSync(absZip).size;
            resolve(size);
        });

        proc.on('error', reject);
    });
}

// ─── Main clone function ──────────────────────────────────────────────────────
async function cloneSite(targetUrl, onStatus) {
    const log = msg => { console.log(msg); if (onStatus) onStatus(msg); };

    const parsed      = new URL(targetUrl);
    const safeDomain  = parsed.hostname.replace(/[^a-z0-9.-]/gi, '_');
    const workDir     = path.join(os.tmpdir(), `clone_${safeDomain}_${Date.now()}`);
    const outputDir   = path.join(workDir, 'site');
    const zipPath     = path.join(workDir, `${safeDomain}.zip`);

    await fs.ensureDir(outputDir);

    const chromePath = findChromePath();
    log(`🌐 Chrome: ${path.basename(chromePath)}`);

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    });

    const visitedPages = new Set();
    const allAssetUrls = new Set();
    const allCSSUrls   = new Set();
    const allJSUrls    = new Set();
    const downloadList = [];

    const queue = [{ url: targetUrl, depth: 0 }];
    let pageCount = 0;

    try {
        // ── BFS Page Crawl ───────────────────────────────────────────────────
        while (queue.length > 0) {
            if (MAX_PAGES > 0 && pageCount >= MAX_PAGES) break;

            const { url: pageUrl, depth } = queue.shift();
            const cleanUrl = pageUrl.split('#')[0];
            if (visitedPages.has(cleanUrl)) continue;
            visitedPages.add(cleanUrl);
            pageCount++;

            log(`📄 [${pageCount}] ${cleanUrl}`);

            let result;
            try {
                result = await scrapePage(browser, cleanUrl);
            } catch (err) {
                log(`  ⚠️ Skip (load failed): ${err.message.slice(0, 60)}`);
                continue;
            }

            const { html, assets, networkAssets } = result;

            // Save HTML
            const htmlPath = urlToFilePath(cleanUrl, parsed.origin, outputDir);
            if (htmlPath) {
                await fs.ensureDir(path.dirname(htmlPath));
                await fs.writeFile(htmlPath, html, 'utf8');
            }

            // Queue same-domain links
            if (depth < MAX_DEPTH) {
                for (const link of assets.links) {
                    try {
                        if (new URL(link).origin === parsed.origin && !visitedPages.has(link)) {
                            queue.push({ url: link, depth: depth + 1 });
                        }
                    } catch {}
                }
            }

            // Collect assets
            assets.scripts.forEach(u => allJSUrls.add(u));
            assets.styles.forEach(u => allCSSUrls.add(u));
            assets.images.forEach(u => allAssetUrls.add(u));
            assets.fonts.forEach(u => allAssetUrls.add(u));
            networkAssets.forEach(u => {
                allAssetUrls.add(u);
                if (/\.js(\?|$)/i.test(u)) allJSUrls.add(u);
                if (/\.css(\?|$)/i.test(u)) allCSSUrls.add(u);
            });
        }

        log(`\n✅ Crawled ${visitedPages.size} pages`);

        // ── Parse CSS for nested assets ──────────────────────────────────────
        log(`🎨 Scanning ${allCSSUrls.size} CSS files...`);
        const cssResults = await Promise.all([...allCSSUrls].map(u => getAssetsFromCSS(u)));
        cssResults.forEach(s => s.forEach(u => allAssetUrls.add(u)));
        allCSSUrls.forEach(u => allAssetUrls.add(u));

        // ── Parse JS for nested assets ───────────────────────────────────────
        log(`📜 Scanning ${allJSUrls.size} JS files...`);
        const jsResults = await Promise.all([...allJSUrls].map(u => getAssetsFromJS(u)));
        jsResults.forEach(s => s.forEach(u => allAssetUrls.add(u)));
        allJSUrls.forEach(u => allAssetUrls.add(u));

        // ── Build download list ──────────────────────────────────────────────
        for (const url of allAssetUrls) {
            const fp = urlToFilePath(url, parsed.origin, outputDir);
            if (fp) downloadList.push({ url, filePath: fp });
        }

        log(`📦 Downloading ${downloadList.length} assets...`);

        let lastReport = 0;
        await downloadAll(downloadList, (done, total) => {
            const pct = Math.floor(done / total * 100);
            if (pct - lastReport >= 20) {
                lastReport = pct;
                log(`  ↳ ${done}/${total} (${pct}%)`);
            }
        });

    } finally {
        await browser.close().catch(() => {});
    }

    // ── Create ZIP ────────────────────────────────────────────────────────────
    log(`🗜️  Creating ZIP...`);
    const zipSize = await createZipFromDir(outputDir, zipPath);
    const sizeMB  = (zipSize / 1024 / 1024).toFixed(2);
    log(`✅ ZIP ready — ${sizeMB} MB`);

    if (zipSize > MAX_ZIP_MB * 1024 * 1024) {
        throw new Error(
            `ZIP is ${sizeMB} MB which exceeds Telegram's ${MAX_ZIP_MB} MB limit.\n` +
            `Try reducing MAX_PAGES or MAX_DEPTH in config.`
        );
    }

    return { zipPath, workDir, pages: visitedPages.size, assets: downloadList.length, sizeMB };
}

// ════════════════════════════════════════════════════════════════════
//  TELEGRAM BOT
// ════════════════════════════════════════════════════════════════════

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ Set BOT_TOKEN env variable or edit config at top of file.');
    console.error('   Get a token from @BotFather on Telegram.\n');
    console.error('   Run: BOT_TOKEN=123456:ABC-xyz node clone-bot.js');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Track active jobs to prevent spam
const activeJobs = new Set();

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        `👋 *Website Cloner Bot*\n\n` +
        `I can clone any public website and send you a ZIP file with all its HTML, CSS, JS, and images.\n\n` +
        `*Usage:*\n` +
        `\`/clone https://example.com\`\n` +
        `\`/clone example.com\`\n\n` +
        `Type /help for more info.`,
        { parse_mode: 'Markdown' }
    );
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, msg => {
    bot.sendMessage(msg.chat.id,
        `📖 *Help — Website Cloner Bot*\n\n` +
        `*Command:*\n\`/clone <url>\`\n\n` +
        `*Examples:*\n` +
        `• \`/clone https://example.com\`\n` +
        `• \`/clone example.com\`\n` +
        `• \`/clone https://docs.example.com/guide\`\n\n` +
        `*What it does:*\n` +
        `• Crawls up to ${MAX_PAGES} pages (BFS, depth ${MAX_DEPTH})\n` +
        `• Downloads all HTML, CSS, JS, images, fonts\n` +
        `• Packs everything into a ZIP file\n` +
        `• Sends ZIP to you, then deletes temp files\n\n` +
        `*Limits:*\n` +
        `• Max ZIP size: ${MAX_ZIP_MB} MB (Telegram limit)\n` +
        `• One clone job per user at a time`,
        { parse_mode: 'Markdown' }
    );
});

// ─── /clone ───────────────────────────────────────────────────────────────────
bot.onText(/\/clone(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const input = match && match[1] ? match[1].trim() : null;

    if (!input) {
        return bot.sendMessage(chatId,
            '❌ Please provide a URL.\n\nExample:\n`/clone https://example.com`',
            { parse_mode: 'Markdown' }
        );
    }

    if (activeJobs.has(userId)) {
        return bot.sendMessage(chatId, '⏳ You already have a clone job running. Please wait for it to finish.');
    }

    let targetUrl;
    try {
        targetUrl = normalizeUrl(input);
    } catch {
        return bot.sendMessage(chatId, `❌ Invalid URL: \`${input}\`\n\nTry: \`/clone https://example.com\``, { parse_mode: 'Markdown' });
    }

    activeJobs.add(userId);

    // Send initial status message
    let statusMsg;
    try {
        statusMsg = await bot.sendMessage(chatId,
            `🚀 *Starting clone...*\n\n🎯 Target: \`${targetUrl}\`\n\n_This may take a few minutes..._`,
            { parse_mode: 'Markdown' }
        );
    } catch {}

    const logs = [];
    let lastEdit = Date.now();

    const updateStatus = async (line) => {
        logs.push(line);
        // Throttle Telegram edits to avoid rate limiting
        if (Date.now() - lastEdit > 3000 && statusMsg) {
            lastEdit = Date.now();
            const preview = logs.slice(-10).join('\n');
            try {
                await bot.editMessageText(
                    `🔄 *Cloning...*\n\`\`\`\n${preview}\n\`\`\``,
                    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
                );
            } catch {}
        }
    };

    let workDir = null;
    try {
        const result = await cloneSite(targetUrl, updateStatus);
        workDir = result.workDir;

        // Final status update
        if (statusMsg) {
            await bot.editMessageText(
                `📤 *Uploading ZIP to Telegram...*\n\n` +
                `📄 Pages: ${result.pages}\n` +
                `📦 Assets: ${result.assets}\n` +
                `💾 Size: ${result.sizeMB} MB`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
            ).catch(() => {});
        }

        // Send the ZIP file
        await bot.sendDocument(chatId, result.zipPath, {
            caption:
                `✅ *Clone Complete!*\n\n` +
                `🌐 Site: \`${targetUrl}\`\n` +
                `📄 Pages crawled: *${result.pages}*\n` +
                `📦 Assets saved: *${result.assets}*\n` +
                `💾 ZIP size: *${result.sizeMB} MB*`,
            parse_mode: 'Markdown'
        });

        // Delete status message after successful send
        if (statusMsg) {
            await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        }

        console.log(`✅ Sent ZIP to ${chatId} for ${targetUrl}`);

    } catch (err) {
        console.error('Clone error:', err.message);
        const errMsg = err.message.length > 300 ? err.message.slice(0, 300) + '...' : err.message;
        if (statusMsg) {
            await bot.editMessageText(
                `❌ *Clone failed*\n\n\`${errMsg}\``,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
            ).catch(() => {
                bot.sendMessage(chatId, `❌ Clone failed: ${errMsg}`);
            });
        } else {
            bot.sendMessage(chatId, `❌ Clone failed: ${errMsg}`);
        }
    } finally {
        activeJobs.delete(userId);

        // ── CLEANUP: Delete all temp files after sending ──────────────────
        if (workDir) {
            try {
                await fs.remove(workDir);
                console.log(`🗑️  Cleaned up: ${workDir}`);
            } catch (cleanErr) {
                console.error('Cleanup error:', cleanErr.message);
            }
        }
    }
});

// ─── Handle unknown commands ──────────────────────────────────────────────────
bot.on('message', msg => {
    if (msg.text && msg.text.startsWith('/') &&
        !['/start','/help','/clone'].some(c => msg.text.startsWith(c))) {
        bot.sendMessage(msg.chat.id, `❓ Unknown command. Try /help`);
    }
});

// ─── Error handling ───────────────────────────────────────────────────────────
bot.on('polling_error', err => {
    console.error('Polling error:', err.message);
});

process.on('unhandledRejection', err => {
    console.error('Unhandled rejection:', err?.message || err);
});

console.log('╔══════════════════════════════════════════╗');
console.log('║   Website Cloner — Telegram Bot v3.0    ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`✅ Bot started! Send /clone <url> on Telegram.\n`);
