import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import puppeteer from 'puppeteer-core';

const reportsDir = process.env.REPORTS_DIR || 'Reports';
// Extra Chrome flags, eg. CHROME_FLAGS="--no-sandbox" when running as root in a container
const extraChromeFlags = (process.env.CHROME_FLAGS || '').split(' ').filter(Boolean);

/**
 * This is used to kick off the report function, it takes in an array of URL/s and runs a Lighthouse report on each one in turn.
 * A failed URL is logged and skipped so the rest still run.
 * @param urlArray - Array of URL/s to run the report on
 * @returns {Promise<Array<{url: string, file?: string, score?: number|null, error?: string}>>}
 */
export async function start(urlArray) {
    fs.mkdirSync(reportsDir, { recursive: true });

    const results = [];
    for (const url of urlArray) {
        try {
            results.push(await runReport(url));
        } catch (err) {
            console.error(`Report failed for ${url}: ${err.message}`);
            results.push({ url, error: err.message });
        }
    }
    return results;
}

/**
 * Runs a Lighthouse performance report on a URL in headless Chrome, then uses the same Chrome to save the HTML report as a PDF
 * @param url - The URL to run the lighthouse report on
 * @returns {Promise<{url: string, file: string, score: number|null}>}
 */
export async function runReport(url) {
    if (!isHttpUrl(url)) {
        throw new Error('Not a valid http(s) URL');
    }

    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', ...extraChromeFlags] });
    try {
        const options = { logLevel: 'error', output: 'html', onlyCategories: ['performance'], port: chrome.port };
        const runnerResult = await lighthouse(url, options);

        // `lhr` stands for the Light House Result as a JS object
        const { lhr } = runnerResult;
        if (lhr.runtimeError) {
            throw new Error(lhr.runtimeError.message);
        }
        const performanceScore = lhr.categories.performance.score;
        const score = performanceScore === null ? null : Math.round(performanceScore * 100);
        console.log(`Report is done for ${url}, performance score was ${score ?? 'n/a'}`);

        // `report` is the HTML report as a string
        const file = path.join(reportsDir, `${reportName(url)}.pdf`);
        fs.writeFileSync(file, await htmlToPdf(chrome.port, runnerResult.report));
        console.log(`Saved ${file}`);

        return { url, file, score };
    } finally {
        await chrome.kill();
    }
}

/**
 * Connects to the Chrome that Lighthouse used and prints the HTML report to an A4 PDF
 * @param port - Chrome's remote debugging port
 * @param html - The Lighthouse HTML report
 * @returns {Promise<Uint8Array>}
 */
async function htmlToPdf(port, html) {
    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}` });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        await page.close();
        return pdf;
    } finally {
        await browser.disconnect();
    }
}

/**
 * Turns a URL into a safe file name, eg. https://example.com/ becomes example.com and https://example.com/a/b?c=1 becomes example.com_a_b_c_1
 * @param url - The URL the report was run on
 * @returns {string}
 */
export function reportName(url) {
    const { host, pathname, search } = new URL(url);
    const name = `${host}${pathname}${search}`
        .replace(/[^a-zA-Z0-9.-]+/g, '_')
        .replace(/^[_.]+|[_.]+$/g, '')
        .slice(0, 150);
    return name || 'report';
}

/**
 * Checks a value is an absolute http:// or https:// URL
 * @param value - The value to check
 * @returns {boolean}
 */
export function isHttpUrl(value) {
    try {
        const { protocol } = new URL(value);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

// Run from the command line, eg. node main.js https://example.com https://example2.com
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const urls = process.argv.slice(2);
    if (urls.length === 0) {
        console.error('Usage: node main.js <url> [url ...]');
        process.exit(1);
    }

    const results = await start(urls);
    const failed = results.filter(result => result.error);
    console.log(`Finished: ${results.length - failed.length} of ${results.length} report(s) saved to ${reportsDir}/`);
    process.exitCode = failed.length > 0 ? 1 : 0;
}
