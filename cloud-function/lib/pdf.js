const PDFDocument = require('pdfkit');

// Lighthouse's own colours for good (90-100), needs improvement (50-89) and poor (0-49) scores
const SCORE_COLOURS = { good: '#008800', average: '#C33300', poor: '#CC0000', none: '#555555' };

const METRICS = [
    { field: 'firstContentfulPaintMs', label: 'First Contentful Paint', format: seconds },
    { field: 'largestContentfulPaintMs', label: 'Largest Contentful Paint', format: seconds },
    { field: 'totalBlockingTimeMs', label: 'Total Blocking Time', format: milliseconds },
    { field: 'cumulativeLayoutShift', label: 'Cumulative Layout Shift', format: value => value.toFixed(3) },
    { field: 'speedIndexMs', label: 'Speed Index', format: seconds },
];

/**
 * Builds the PDF report in memory
 * @param results - Results from analyseUrls
 * @param failures - URLs that could not be analysed, with the reason
 * @param generatedAt - Date shown on the report
 * @returns {Promise<Buffer>}
 */
function buildPdf(results, failures = [], generatedAt = new Date()) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Lighthouse Report' } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.font('Helvetica-Bold').fontSize(22).fillColor('black').text('Lighthouse Report');
        doc.font('Helvetica').fontSize(10).fillColor(SCORE_COLOURS.none)
            .text(`Performance results from PageSpeed Insights, generated ${generatedAt.toUTCString()}`);
        doc.moveDown(1.5);

        for (const result of results) {
            writeResult(doc, result);
        }

        if (failures.length > 0) {
            doc.font('Helvetica-Bold').fontSize(14).fillColor('black').text('Could not be analysed');
            doc.moveDown(0.3);
            for (const failure of failures) {
                doc.font('Helvetica-Bold').fontSize(10).fillColor('black').text(failure.url);
                doc.font('Helvetica').fillColor(SCORE_COLOURS.poor).text(failure.error);
                doc.moveDown(0.5);
            }
        }

        doc.end();
    });
}

function writeResult(doc, result) {
    // Keep each URL's block on one page
    if (doc.y > doc.page.height - 230) doc.addPage();

    doc.font('Helvetica-Bold').fontSize(14).fillColor('black').text(result.url);
    doc.font('Helvetica').fontSize(10).fillColor(SCORE_COLOURS.none);
    if (result.finalUrl && result.finalUrl !== result.url) {
        doc.text(`Redirected to ${result.finalUrl}`);
    }
    doc.text(`${capitalise(result.strategy)} · tested ${new Date(result.fetchedAt).toUTCString()} · Lighthouse ${result.lighthouseVersion || 'unknown'}`);
    doc.moveDown(0.5);

    const score = result.performanceScore;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(SCORE_COLOURS[rating(score)])
        .text(`Performance score: ${score === null ? 'n/a' : `${score} / 100`}`);
    doc.moveDown(0.3);

    for (const metric of METRICS) {
        const value = result[metric.field];
        const y = doc.y;
        doc.font('Helvetica').fontSize(10).fillColor('black').text(metric.label, doc.page.margins.left, y, { width: 220 });
        doc.text(typeof value === 'number' ? metric.format(value) : 'n/a', doc.page.margins.left + 230, y);
    }
    doc.x = doc.page.margins.left;
    doc.moveDown(1.5);
}

function rating(score) {
    if (score === null || score === undefined) return 'none';
    if (score >= 90) return 'good';
    if (score >= 50) return 'average';
    return 'poor';
}

function seconds(ms) {
    return `${(ms / 1000).toFixed(1)} s`;
}

function milliseconds(ms) {
    return `${Math.round(ms)} ms`;
}

function capitalise(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

module.exports = { buildPdf };
