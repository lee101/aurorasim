/**
 * Aurora Borealis Render Test Suite
 * Renders frames from the shader at various time points and saves to results/
 */

import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const RESULTS_DIR = path.join(ROOT_DIR, 'results');
const SYSTEM_CHROME = '/opt/google/chrome/chrome';

// Test configuration
const CONFIG = {
    width: 1920,
    height: 1080,
    frames: [
        { time: 0, name: 'frame_000_initial' },
        { time: 2, name: 'frame_002_early' },
        { time: 5, name: 'frame_005_mid' },
        { time: 10, name: 'frame_010_developed' },
        { time: 20, name: 'frame_020_late' },
        { time: 30, name: 'frame_030_full' },
    ],
    // Additional test cases for specific aurora features
    featureTests: [
        { time: 7, name: 'feature_curtain_wave' },
        { time: 15, name: 'feature_color_blend' },
        { time: 25, name: 'feature_glow_intensity' },
    ]
};

async function startServer() {
    const { spawn } = await import('child_process');

    // Start a simple HTTP server
    const server = spawn('npx', ['serve', ROOT_DIR, '-p', '3456', '-s'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server timeout')), 10000);

        server.stdout.on('data', (data) => {
            if (data.toString().includes('Accepting connections')) {
                clearTimeout(timeout);
                resolve();
            }
        });

        server.stderr.on('data', (data) => {
            console.error(`Server stderr: ${data}`);
        });

        server.on('error', reject);
    });

    return server;
}

async function renderFrame(page, time, name) {
    // Set the shader time uniform
    await page.evaluate((t) => {
        if (window.setShaderTime) {
            window.setShaderTime(t);
        }
    }, time);

    // Wait for render
    await page.waitForTimeout(100);

    // Capture screenshot
    const screenshotPath = path.join(RESULTS_DIR, `${name}.png`);
    await page.screenshot({
        path: screenshotPath,
        type: 'png',
        clip: {
            x: 0,
            y: 0,
            width: CONFIG.width,
            height: CONFIG.height
        }
    });

    console.log(`  Rendered: ${name}.png (t=${time}s)`);
    return screenshotPath;
}

async function runTests() {
    console.log('Aurora Borealis Render Test Suite');
    console.log('==================================\n');

    // Ensure results directory exists
    if (!existsSync(RESULTS_DIR)) {
        await mkdir(RESULTS_DIR, { recursive: true });
    }

    let server;
    let browser;

    try {
        // Start server
        console.log('Starting local server...');
        server = await startServer();
        console.log('Server started on port 3456\n');

        // Launch browser
        console.log('Launching headless browser...');
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                `--window-size=${CONFIG.width},${CONFIG.height}`
            ]
        };

        if (existsSync(SYSTEM_CHROME)) {
            launchOptions.executablePath = SYSTEM_CHROME;
        }

        browser = await puppeteer.launch(launchOptions);

        const page = await browser.newPage();
        await page.setViewport({
            width: CONFIG.width,
            height: CONFIG.height,
            deviceScaleFactor: 1
        });

        // Navigate to the page
        console.log('Loading aurora shader...\n');
        await page.goto('http://localhost:3456/index.html', {
            waitUntil: 'load',
            timeout: 60000
        });

        // Wait for shader to initialize
        await page.waitForTimeout(1000);

        // Render standard frames
        console.log('Rendering standard frames:');
        const results = [];

        for (const frame of CONFIG.frames) {
            const result = await renderFrame(page, frame.time, frame.name);
            results.push({ ...frame, path: result });
        }

        // Render feature test frames
        console.log('\nRendering feature test frames:');
        for (const frame of CONFIG.featureTests) {
            const result = await renderFrame(page, frame.time, frame.name);
            results.push({ ...frame, path: result });
        }

        // Generate test report
        const report = {
            timestamp: new Date().toISOString(),
            config: CONFIG,
            results: results,
            status: 'success'
        };

        await writeFile(
            path.join(RESULTS_DIR, 'render-report.json'),
            JSON.stringify(report, null, 2)
        );

        console.log('\n==================================');
        console.log(`Rendered ${results.length} frames to results/`);
        console.log('Report saved to results/render-report.json');

    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        if (server) server.kill();
    }
}

runTests().then(() => process.exit(0));
