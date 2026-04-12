/**
 * Fetch reference aurora borealis images for comparison
 * Uses public domain / CC0 images from NASA and other sources
 */

import { writeFileSync, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCES_DIR = path.join(__dirname, '..', 'references');

// Public domain aurora images (NASA, NOAA - public domain as US government works)
const REFERENCE_IMAGES = [
    {
        name: 'nasa_aurora_iss_green.jpg',
        url: 'https://images-assets.nasa.gov/image/iss029e008433/iss029e008433~thumb.jpg',
        description: 'ISS view of aurora - green dominant'
    },
    {
        name: 'nasa_aurora_iss_curtain.jpg',
        url: 'https://images-assets.nasa.gov/image/iss030e031276/iss030e031276~thumb.jpg',
        description: 'ISS aurora with curtain structure'
    },
    {
        name: 'noaa_aurora_forecast.jpg',
        url: 'https://services.swpc.noaa.gov/images/aurora-forecast-northern-hemisphere.jpg',
        description: 'NOAA aurora forecast visualization'
    }
];

function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = (urlToFetch, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('Too many redirects'));
                return;
            }

            protocol.get(urlToFetch, (response) => {
                // Handle redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    request(response.headers.location, redirectCount + 1);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    writeFileSync(destPath, buffer);
                    resolve();
                });
                response.on('error', reject);
            }).on('error', reject);
        };

        request(url);
    });
}

async function fetchReferences() {
    console.log('Fetching Aurora Reference Images');
    console.log('=================================\n');

    if (!existsSync(REFERENCES_DIR)) {
        await mkdir(REFERENCES_DIR, { recursive: true });
    }

    let successCount = 0;
    let failCount = 0;

    for (const img of REFERENCE_IMAGES) {
        const destPath = path.join(REFERENCES_DIR, img.name);

        if (existsSync(destPath)) {
            console.log(`  [SKIP] ${img.name} - already exists`);
            successCount++;
            continue;
        }

        try {
            console.log(`  [DOWNLOADING] ${img.name}...`);
            await downloadImage(img.url, destPath);
            console.log(`  [OK] ${img.name} - ${img.description}`);
            successCount++;
        } catch (err) {
            console.log(`  [FAIL] ${img.name} - ${err.message}`);
            failCount++;
        }
    }

    // Create a README for references
    const readme = `# Aurora Reference Images

These images are used for comparing the rendered aurora simulation against real aurora borealis.

## Sources
All images are from public domain sources (NASA, NOAA - US government works are public domain).

## Adding Custom References
You can add your own reference images to this directory. Supported formats: PNG, JPG

## Recommended Reference Characteristics
For best comparison results, use images that show:
- Clear aurora curtain structures
- Dominant green coloration (557.7nm oxygen emission line)
- Blue/purple edges (nitrogen emissions)
- Dark night sky background
- Visible vertical ray structures

## Current References
${REFERENCE_IMAGES.map(img => `- ${img.name}: ${img.description}`).join('\n')}

## Usage
After adding references, run:
\`\`\`
npm run test:compare
\`\`\`
`;

    writeFileSync(path.join(REFERENCES_DIR, 'README.md'), readme);

    console.log('\n=================================');
    console.log(`Downloaded: ${successCount} images`);
    console.log(`Failed: ${failCount} images`);
    console.log(`References saved to: references/`);

    if (failCount > 0) {
        console.log('\nNote: Some NASA/NOAA URLs may change. You can manually add');
        console.log('aurora images to the references/ directory for comparison.');
    }
}

fetchReferences().catch(console.error);
