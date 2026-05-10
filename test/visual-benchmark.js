/**
 * Aurora visual benchmark.
 * Renders a small fixed set of frames into visual-benchmark/ for manual review.
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'visual-benchmark');
const SYSTEM_CHROME_PATHS = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/google/chrome/chrome',
];
const PORT = 3457;

const CONFIG = {
    width: 1600,
    height: 1000,
    frames: [
        { time: 0, name: 'review_000_arrival' },
        { time: 6, name: 'review_006_flap' },
        { time: 13, name: 'review_013_radial_curtains' },
        { time: 21, name: 'review_021_breakup' },
        { time: 34, name: 'review_034_late_motion' },
    ],
};

async function startServer() {
    const { spawn } = await import('child_process');
    const server = spawn('npx', ['serve', ROOT_DIR, '-p', String(PORT), '-s'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
    });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server timeout')), 10000);

        const probe = setInterval(async () => {
            try {
                const response = await fetch(`http://localhost:${PORT}/index.html`);
                if (response.ok) {
                    clearInterval(probe);
                    clearTimeout(timeout);
                    resolve();
                }
            } catch {
                // Server is not accepting connections yet.
            }
        }, 150);

        const cleanupAndResolve = () => {
            clearInterval(probe);
            clearTimeout(timeout);
            resolve();
        };

        server.stdout.on('data', (data) => {
            if (data.toString().includes('Accepting connections')) {
                cleanupAndResolve();
            }
        });

        server.stderr.on('data', (data) => console.error(`Server stderr: ${data}`));
        server.on('error', (error) => {
            clearInterval(probe);
            clearTimeout(timeout);
            reject(error);
        });
    });

    return server;
}

async function renderFrame(page, frame) {
    await page.evaluate((time) => {
        window.setShaderTime?.(time);
    }, frame.time);

    await page.waitForTimeout(140);
    const screenshotPath = path.join(OUTPUT_DIR, `${frame.name}.png`);
    await page.screenshot({
        path: screenshotPath,
        type: 'png',
        clip: {
            x: 0,
            y: 0,
            width: CONFIG.width,
            height: CONFIG.height,
        },
    });

    console.log(`  Rendered: ${frame.name}.png (t=${frame.time}s)`);
    return screenshotPath;
}

async function runBenchmark() {
    console.log('Aurora Visual Benchmark');
    console.log('=======================\n');

    if (!existsSync(OUTPUT_DIR)) {
        await mkdir(OUTPUT_DIR, { recursive: true });
    }

    let server;
    let browser;

    try {
        console.log('Starting server...');
        server = await startServer();
        console.log(`Server ready on port ${PORT}`);

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                `--window-size=${CONFIG.width},${CONFIG.height}`,
            ],
        };

        const systemChrome = SYSTEM_CHROME_PATHS.find((chromePath) => existsSync(chromePath));
        if (systemChrome) {
            launchOptions.executablePath = systemChrome;
        }

        console.log('Launching browser...');
        browser = await puppeteer.launch(launchOptions);
        console.log('Opening page...');
        const page = await browser.newPage();
        await page.setViewport({
            width: CONFIG.width,
            height: CONFIG.height,
            deviceScaleFactor: 1,
        });

        await page.goto(`http://localhost:${PORT}/index.html`, {
            waitUntil: 'load',
            timeout: 60000,
        });
        console.log('Page loaded.');
        await page.waitForTimeout(1000);

        const results = [];
        for (const frame of CONFIG.frames) {
            results.push({ ...frame, path: await renderFrame(page, frame) });
        }

        await writeFile(
            path.join(OUTPUT_DIR, 'visual-benchmark-report.json'),
            JSON.stringify({ timestamp: new Date().toISOString(), config: CONFIG, results }, null, 2)
        );

        console.log(`\nRendered ${results.length} visual benchmark frames to visual-benchmark/`);
    } finally {
        if (browser) await browser.close();
        if (server) server.kill();
    }
}

runBenchmark().then(() => process.exit(0));
