/**
 * Aurora Borealis Image Comparison
 * Compares rendered frames against reference aurora images
 * Uses multiple metrics: pixelmatch, color histogram, structural similarity
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const RESULTS_DIR = path.join(ROOT_DIR, 'results');
const REFERENCES_DIR = path.join(ROOT_DIR, 'references');

/**
 * Aurora-specific color palette for analysis
 * These are the characteristic colors of aurora borealis
 */
const AURORA_COLORS = {
    green: { h: [80, 160], s: [0.3, 1.0], l: [0.2, 0.8] },      // Primary aurora green
    blue: { h: [180, 250], s: [0.3, 1.0], l: [0.1, 0.6] },      // Blue-violet
    purple: { h: [250, 320], s: [0.2, 0.8], l: [0.1, 0.5] },    // Purple/magenta
    red: { h: [0, 30], s: [0.3, 0.9], l: [0.2, 0.5] },          // Rare red aurora
    pink: { h: [320, 360], s: [0.2, 0.7], l: [0.3, 0.6] }       // Pink edges
};

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
            case g: h = ((b - r) / d + 2) * 60; break;
            case b: h = ((r - g) / d + 4) * 60; break;
        }
    }
    return { h, s, l };
}

/**
 * Analyze aurora color presence in an image
 */
async function analyzeAuroraColors(imagePath) {
    const { data, info } = await sharp(imagePath)
        .raw()
        .toBuffer({ resolveWithObject: true });

    const colorCounts = {
        green: 0,
        blue: 0,
        purple: 0,
        red: 0,
        pink: 0,
        dark: 0,  // Night sky
        other: 0
    };

    const totalPixels = info.width * info.height;

    for (let i = 0; i < data.length; i += 3) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hsl = rgbToHsl(r, g, b);

        // Check if pixel is dark (night sky)
        if (hsl.l < 0.1) {
            colorCounts.dark++;
            continue;
        }

        // Check against aurora color ranges
        let matched = false;
        for (const [colorName, range] of Object.entries(AURORA_COLORS)) {
            const hInRange = (hsl.h >= range.h[0] && hsl.h <= range.h[1]) ||
                (range.h[0] > range.h[1] && (hsl.h >= range.h[0] || hsl.h <= range.h[1]));
            const sInRange = hsl.s >= range.s[0] && hsl.s <= range.s[1];
            const lInRange = hsl.l >= range.l[0] && hsl.l <= range.l[1];

            if (hInRange && sInRange && lInRange) {
                colorCounts[colorName]++;
                matched = true;
                break;
            }
        }

        if (!matched) colorCounts.other++;
    }

    // Convert to percentages
    const colorPercentages = {};
    for (const [color, count] of Object.entries(colorCounts)) {
        colorPercentages[color] = (count / totalPixels * 100).toFixed(2);
    }

    // Calculate aurora authenticity score
    const auroraPixels = colorCounts.green + colorCounts.blue +
        colorCounts.purple + colorCounts.red + colorCounts.pink;
    const auroraScore = (auroraPixels / totalPixels * 100).toFixed(2);

    return {
        colorPercentages,
        auroraScore: parseFloat(auroraScore),
        dominantAuroraColor: Object.entries(colorCounts)
            .filter(([k]) => k !== 'dark' && k !== 'other')
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'
    };
}

/**
 * Calculate color histogram similarity
 */
async function compareColorHistograms(img1Path, img2Path) {
    const getHistogram = async (imagePath) => {
        const { data } = await sharp(imagePath)
            .resize(256, 256)  // Normalize size
            .raw()
            .toBuffer({ resolveWithObject: true });

        const histogram = { r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0) };

        for (let i = 0; i < data.length; i += 3) {
            histogram.r[data[i]]++;
            histogram.g[data[i + 1]]++;
            histogram.b[data[i + 2]]++;
        }

        return histogram;
    };

    const hist1 = await getHistogram(img1Path);
    const hist2 = await getHistogram(img2Path);

    // Calculate histogram intersection (Bhattacharyya coefficient)
    let similarity = 0;
    for (const channel of ['r', 'g', 'b']) {
        const sum1 = hist1[channel].reduce((a, b) => a + b, 0);
        const sum2 = hist2[channel].reduce((a, b) => a + b, 0);

        for (let i = 0; i < 256; i++) {
            const p1 = hist1[channel][i] / sum1;
            const p2 = hist2[channel][i] / sum2;
            similarity += Math.sqrt(p1 * p2);
        }
    }

    return (similarity / 3 * 100).toFixed(2);
}

/**
 * Pixel-level comparison using pixelmatch
 */
async function comparePixels(img1Path, img2Path, diffOutputPath) {
    // Read and resize images to same dimensions
    const targetSize = { width: 800, height: 450 };

    const [buf1, buf2] = await Promise.all([
        sharp(img1Path).resize(targetSize.width, targetSize.height).png().toBuffer(),
        sharp(img2Path).resize(targetSize.width, targetSize.height).png().toBuffer()
    ]);

    const img1 = PNG.sync.read(buf1);
    const img2 = PNG.sync.read(buf2);

    const diff = new PNG({ width: targetSize.width, height: targetSize.height });

    const mismatchedPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        targetSize.width,
        targetSize.height,
        { threshold: 0.3, includeAA: true }
    );

    const totalPixels = targetSize.width * targetSize.height;
    const similarity = ((1 - mismatchedPixels / totalPixels) * 100).toFixed(2);

    // Save diff image
    if (diffOutputPath) {
        writeFileSync(diffOutputPath, PNG.sync.write(diff));
    }

    return {
        similarity: parseFloat(similarity),
        mismatchedPixels,
        totalPixels
    };
}

/**
 * Analyze vertical structure (aurora curtains)
 */
async function analyzeVerticalStructure(imagePath) {
    const { data, info } = await sharp(imagePath)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Calculate vertical edge strength
    let verticalEdgeSum = 0;
    let horizontalEdgeSum = 0;

    for (let y = 1; y < info.height - 1; y++) {
        for (let x = 1; x < info.width - 1; x++) {
            const idx = y * info.width + x;
            const left = data[idx - 1];
            const right = data[idx + 1];
            const up = data[(y - 1) * info.width + x];
            const down = data[(y + 1) * info.width + x];

            verticalEdgeSum += Math.abs(left - right);
            horizontalEdgeSum += Math.abs(up - down);
        }
    }

    // Aurora should have more vertical structure (curtains)
    const verticalRatio = verticalEdgeSum / (verticalEdgeSum + horizontalEdgeSum);

    return {
        verticalEdgeStrength: verticalEdgeSum,
        horizontalEdgeStrength: horizontalEdgeSum,
        verticalRatio: (verticalRatio * 100).toFixed(2),
        hasCurtainStructure: verticalRatio > 0.45  // Aurora typically has slight vertical bias
    };
}

/**
 * Main comparison function
 */
async function runComparison() {
    console.log('Aurora Borealis Image Comparison');
    console.log('=================================\n');

    // Check for results
    if (!existsSync(RESULTS_DIR)) {
        console.error('No results directory found. Run render tests first.');
        process.exit(1);
    }

    const renderedImages = readdirSync(RESULTS_DIR)
        .filter(f => f.endsWith('.png') && !f.includes('diff_'));

    if (renderedImages.length === 0) {
        console.error('No rendered images found. Run render tests first.');
        process.exit(1);
    }

    // Check for reference images
    const referenceImages = existsSync(REFERENCES_DIR)
        ? readdirSync(REFERENCES_DIR).filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
        : [];

    console.log(`Found ${renderedImages.length} rendered images`);
    console.log(`Found ${referenceImages.length} reference images\n`);

    const report = {
        timestamp: new Date().toISOString(),
        renderedAnalysis: [],
        comparisons: [],
        summary: {}
    };

    // Analyze each rendered image
    console.log('Analyzing rendered images:');
    console.log('--------------------------');

    for (const img of renderedImages) {
        const imgPath = path.join(RESULTS_DIR, img);
        console.log(`\n${img}:`);

        const colorAnalysis = await analyzeAuroraColors(imgPath);
        const structureAnalysis = await analyzeVerticalStructure(imgPath);

        console.log(`  Aurora Score: ${colorAnalysis.auroraScore}%`);
        console.log(`  Dominant Color: ${colorAnalysis.dominantAuroraColor}`);
        console.log(`  Green: ${colorAnalysis.colorPercentages.green}%`);
        console.log(`  Vertical Structure: ${structureAnalysis.verticalRatio}%`);
        console.log(`  Has Curtains: ${structureAnalysis.hasCurtainStructure}`);

        report.renderedAnalysis.push({
            image: img,
            colorAnalysis,
            structureAnalysis
        });
    }

    // Compare against reference images if available
    if (referenceImages.length > 0) {
        console.log('\n\nComparing against references:');
        console.log('-----------------------------');

        // Create diff directory
        const diffDir = path.join(RESULTS_DIR, 'diffs');
        if (!existsSync(diffDir)) {
            await mkdir(diffDir, { recursive: true });
        }

        for (const rendered of renderedImages) {
            for (const reference of referenceImages) {
                const renderedPath = path.join(RESULTS_DIR, rendered);
                const referencePath = path.join(REFERENCES_DIR, reference);
                const diffPath = path.join(diffDir, `diff_${rendered}_vs_${reference}.png`);

                console.log(`\n${rendered} vs ${reference}:`);

                const [pixelComparison, histogramSimilarity] = await Promise.all([
                    comparePixels(renderedPath, referencePath, diffPath),
                    compareColorHistograms(renderedPath, referencePath)
                ]);

                console.log(`  Pixel Similarity: ${pixelComparison.similarity}%`);
                console.log(`  Histogram Similarity: ${histogramSimilarity}%`);

                report.comparisons.push({
                    rendered,
                    reference,
                    pixelSimilarity: pixelComparison.similarity,
                    histogramSimilarity: parseFloat(histogramSimilarity),
                    diffImage: `diffs/diff_${rendered}_vs_${reference}.png`
                });
            }
        }
    }

    // Calculate summary statistics
    const avgAuroraScore = report.renderedAnalysis.reduce(
        (sum, r) => sum + r.colorAnalysis.auroraScore, 0
    ) / report.renderedAnalysis.length;

    const avgVerticalRatio = report.renderedAnalysis.reduce(
        (sum, r) => sum + parseFloat(r.structureAnalysis.verticalRatio), 0
    ) / report.renderedAnalysis.length;

    report.summary = {
        averageAuroraScore: avgAuroraScore.toFixed(2),
        averageVerticalRatio: avgVerticalRatio.toFixed(2),
        totalImagesAnalyzed: renderedImages.length,
        totalComparisons: report.comparisons.length,
        passesAuroraTest: avgAuroraScore > 5,  // At least 5% aurora colors
        passesCurtainTest: avgVerticalRatio > 45
    };

    // Save report
    writeFileSync(
        path.join(RESULTS_DIR, 'comparison-report.json'),
        JSON.stringify(report, null, 2)
    );

    console.log('\n\n=================================');
    console.log('Summary:');
    console.log(`  Average Aurora Score: ${report.summary.averageAuroraScore}%`);
    console.log(`  Average Vertical Structure: ${report.summary.averageVerticalRatio}%`);
    console.log(`  Passes Aurora Color Test: ${report.summary.passesAuroraTest}`);
    console.log(`  Passes Curtain Structure Test: ${report.summary.passesCurtainTest}`);
    console.log('\nReport saved to results/comparison-report.json');
}

runComparison().catch(console.error);
