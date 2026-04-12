/**
 * Generate HTML visual report from test results
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const RESULTS_DIR = path.join(ROOT_DIR, 'results');
const REFERENCES_DIR = path.join(ROOT_DIR, 'references');

function generateReport() {
    console.log('Generating HTML Report...\n');

    // Load reports if they exist
    let renderReport = null;
    let comparisonReport = null;

    const renderReportPath = path.join(RESULTS_DIR, 'render-report.json');
    const comparisonReportPath = path.join(RESULTS_DIR, 'comparison-report.json');

    if (existsSync(renderReportPath)) {
        renderReport = JSON.parse(readFileSync(renderReportPath, 'utf8'));
    }

    if (existsSync(comparisonReportPath)) {
        comparisonReport = JSON.parse(readFileSync(comparisonReportPath, 'utf8'));
    }

    // Get all rendered images
    const renderedImages = existsSync(RESULTS_DIR)
        ? readdirSync(RESULTS_DIR).filter(f => f.endsWith('.png') && !f.includes('diff_'))
        : [];

    // Get reference images
    const referenceImages = existsSync(REFERENCES_DIR)
        ? readdirSync(REFERENCES_DIR).filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
        : [];

    // Get diff images
    const diffDir = path.join(RESULTS_DIR, 'diffs');
    const diffImages = existsSync(diffDir)
        ? readdirSync(diffDir).filter(f => f.endsWith('.png'))
        : [];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aurora Borealis Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0f;
            color: #e0e0e0;
            padding: 20px;
            line-height: 1.6;
        }
        h1, h2, h3 { color: #4ade80; margin-bottom: 15px; }
        h1 { font-size: 2em; border-bottom: 2px solid #4ade80; padding-bottom: 10px; }
        h2 { font-size: 1.5em; margin-top: 30px; }
        h3 { font-size: 1.2em; color: #60a5fa; }

        .container { max-width: 1400px; margin: 0 auto; }

        .summary-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }

        .card {
            background: #1a1a2e;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
        }

        .card .value {
            font-size: 2.5em;
            font-weight: bold;
            color: #4ade80;
        }

        .card .label { color: #888; font-size: 0.9em; }

        .card.pass { border-left: 4px solid #4ade80; }
        .card.fail { border-left: 4px solid #f87171; }
        .card.neutral { border-left: 4px solid #60a5fa; }

        .image-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }

        .image-card {
            background: #1a1a2e;
            border-radius: 10px;
            overflow: hidden;
        }

        .image-card img {
            width: 100%;
            height: 200px;
            object-fit: cover;
        }

        .image-card .info {
            padding: 15px;
        }

        .image-card .title {
            font-weight: bold;
            color: #60a5fa;
            margin-bottom: 10px;
        }

        .metrics {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            font-size: 0.85em;
        }

        .metric {
            background: #252540;
            padding: 6px 10px;
            border-radius: 5px;
        }

        .metric .label { color: #888; }
        .metric .value { color: #4ade80; font-weight: bold; }

        .comparison-section {
            margin: 30px 0;
        }

        .comparison-row {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
            background: #1a1a2e;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
        }

        .comparison-row img {
            width: 100%;
            border-radius: 5px;
        }

        .comparison-row .label {
            text-align: center;
            font-size: 0.85em;
            color: #888;
            margin-top: 8px;
        }

        .color-bar {
            display: flex;
            height: 20px;
            border-radius: 5px;
            overflow: hidden;
            margin: 10px 0;
        }

        .color-bar .segment {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: #fff;
            text-shadow: 0 0 2px #000;
        }

        .timestamp {
            color: #666;
            font-size: 0.85em;
            text-align: right;
            margin-top: 30px;
        }

        .status-badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .status-badge.pass { background: #065f46; color: #4ade80; }
        .status-badge.fail { background: #7f1d1d; color: #f87171; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Aurora Borealis Shader Test Report</h1>

        ${comparisonReport?.summary ? `
        <div class="summary-cards">
            <div class="card ${comparisonReport.summary.passesAuroraTest ? 'pass' : 'fail'}">
                <div class="value">${comparisonReport.summary.averageAuroraScore}%</div>
                <div class="label">Aurora Color Score</div>
            </div>
            <div class="card ${comparisonReport.summary.passesCurtainTest ? 'pass' : 'fail'}">
                <div class="value">${comparisonReport.summary.averageVerticalRatio}%</div>
                <div class="label">Curtain Structure</div>
            </div>
            <div class="card neutral">
                <div class="value">${comparisonReport.summary.totalImagesAnalyzed}</div>
                <div class="label">Frames Rendered</div>
            </div>
            <div class="card neutral">
                <div class="value">${comparisonReport.summary.totalComparisons}</div>
                <div class="label">Comparisons Made</div>
            </div>
        </div>

        <div style="margin: 20px 0;">
            <span class="status-badge ${comparisonReport.summary.passesAuroraTest ? 'pass' : 'fail'}">
                Aurora Colors: ${comparisonReport.summary.passesAuroraTest ? 'PASS' : 'FAIL'}
            </span>
            <span class="status-badge ${comparisonReport.summary.passesCurtainTest ? 'pass' : 'fail'}">
                Curtain Structure: ${comparisonReport.summary.passesCurtainTest ? 'PASS' : 'FAIL'}
            </span>
        </div>
        ` : '<p>No comparison data available. Run npm run test:compare</p>'}

        <h2>Rendered Frames</h2>
        <div class="image-grid">
            ${renderedImages.map(img => {
                const analysis = comparisonReport?.renderedAnalysis?.find(a => a.image === img);
                return `
                <div class="image-card">
                    <img src="${img}" alt="${img}">
                    <div class="info">
                        <div class="title">${img}</div>
                        ${analysis ? `
                        <div class="color-bar">
                            <div class="segment" style="width: ${analysis.colorAnalysis.colorPercentages.green}%; background: #22c55e;">G</div>
                            <div class="segment" style="width: ${analysis.colorAnalysis.colorPercentages.blue}%; background: #3b82f6;">B</div>
                            <div class="segment" style="width: ${analysis.colorAnalysis.colorPercentages.purple}%; background: #a855f7;">P</div>
                            <div class="segment" style="width: ${analysis.colorAnalysis.colorPercentages.dark}%; background: #1f2937;">Dark</div>
                        </div>
                        <div class="metrics">
                            <div class="metric">
                                <span class="label">Aurora:</span>
                                <span class="value">${analysis.colorAnalysis.auroraScore}%</span>
                            </div>
                            <div class="metric">
                                <span class="label">Dominant:</span>
                                <span class="value">${analysis.colorAnalysis.dominantAuroraColor}</span>
                            </div>
                            <div class="metric">
                                <span class="label">Vertical:</span>
                                <span class="value">${analysis.structureAnalysis.verticalRatio}%</span>
                            </div>
                            <div class="metric">
                                <span class="label">Curtains:</span>
                                <span class="value">${analysis.structureAnalysis.hasCurtainStructure ? 'Yes' : 'No'}</span>
                            </div>
                        </div>
                        ` : '<p>No analysis data</p>'}
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        ${referenceImages.length > 0 ? `
        <h2>Reference Images</h2>
        <div class="image-grid">
            ${referenceImages.map(img => `
            <div class="image-card">
                <img src="../references/${img}" alt="${img}">
                <div class="info">
                    <div class="title">${img}</div>
                </div>
            </div>
            `).join('')}
        </div>
        ` : ''}

        ${comparisonReport?.comparisons?.length > 0 ? `
        <h2>Comparisons with References</h2>
        ${comparisonReport.comparisons.map(c => `
        <div class="comparison-row">
            <div>
                <img src="${c.rendered}" alt="Rendered">
                <div class="label">Rendered: ${c.rendered}</div>
            </div>
            <div>
                <img src="../references/${c.reference}" alt="Reference">
                <div class="label">Reference: ${c.reference}</div>
            </div>
            <div>
                <img src="${c.diffImage}" alt="Diff">
                <div class="label">
                    Pixel: ${c.pixelSimilarity}% | Histogram: ${c.histogramSimilarity}%
                </div>
            </div>
        </div>
        `).join('')}
        ` : ''}

        <div class="timestamp">
            Generated: ${new Date().toISOString()}
        </div>
    </div>
</body>
</html>`;

    const reportPath = path.join(RESULTS_DIR, 'report.html');
    writeFileSync(reportPath, html);

    console.log(`Report generated: ${reportPath}`);
    console.log(`Open in browser: file://${reportPath}`);
}

generateReport();
