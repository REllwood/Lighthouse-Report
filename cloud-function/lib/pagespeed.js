const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
// PageSpeed Insights usually takes 10-40 seconds per URL
const REQUEST_TIMEOUT_MS = 120000;

// Result field -> Lighthouse audit it comes from
const METRIC_AUDITS = {
    firstContentfulPaintMs: 'first-contentful-paint',
    largestContentfulPaintMs: 'largest-contentful-paint',
    totalBlockingTimeMs: 'total-blocking-time',
    speedIndexMs: 'speed-index',
    cumulativeLayoutShift: 'cumulative-layout-shift',
};

/**
 * Runs every URL through PageSpeed Insights at the same time and waits for all of them to finish
 * @param urls - The URLs to analyse
 * @param options.apiKey - PageSpeed Insights API key
 * @param options.strategy - "mobile" or "desktop"
 * @param options.fetchImpl - fetch function, only replaced in tests
 * @returns {Promise<{results: object[], failures: {url: string, error: string}[]}>}
 */
async function analyseUrls(urls, { apiKey, strategy, fetchImpl = fetch }) {
    const outcomes = await Promise.allSettled(
        urls.map(async url => summarise(url, strategy, await fetchReport(url, { apiKey, strategy, fetchImpl })))
    );

    const results = [];
    const failures = [];
    outcomes.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
            results.push(outcome.value);
        } else {
            failures.push({ url: urls[i], error: outcome.reason.message });
        }
    });
    return { results, failures };
}

/**
 * Calls the PageSpeed Insights v5 API for one URL. The API key goes in the `key` query parameter, it is not a Bearer token
 * @returns {Promise<object>} The raw runPagespeed response
 */
async function fetchReport(url, { apiKey, strategy, fetchImpl = fetch }) {
    const params = new URLSearchParams({ url, key: apiKey, strategy: strategy.toUpperCase(), category: 'PERFORMANCE' });

    let response;
    try {
        response = await fetchImpl(`${PSI_ENDPOINT}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
        // Only the error name goes back, never the request URL (it contains the API key)
        if (err.name === 'TimeoutError') {
            throw new Error(`PageSpeed Insights did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds`);
        }
        throw new Error('Could not reach PageSpeed Insights');
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const reason = body?.error?.message || response.statusText || 'unknown error';
        throw new Error(`PageSpeed Insights returned ${response.status}: ${reason}`);
    }
    if (!body?.lighthouseResult) {
        throw new Error('PageSpeed Insights returned no Lighthouse result');
    }
    return body;
}

/**
 * Pulls the performance score and core metrics out of a PageSpeed Insights v5 response
 * @param url - The URL that was requested
 * @param strategy - "mobile" or "desktop"
 * @param response - The raw runPagespeed response
 * @returns {object}
 */
function summarise(url, strategy, response) {
    const lhr = response.lighthouseResult;
    if (lhr.runtimeError && lhr.runtimeError.code !== 'NO_ERROR') {
        throw new Error(`Lighthouse could not analyse the page: ${lhr.runtimeError.message}`);
    }

    const score = lhr.categories?.performance?.score;
    const result = {
        url,
        finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl || url,
        strategy,
        fetchedAt: lhr.fetchTime || response.analysisUTCTimestamp || new Date().toISOString(),
        lighthouseVersion: lhr.lighthouseVersion || null,
        performanceScore: typeof score === 'number' ? Math.round(score * 100) : null,
    };
    for (const [field, auditId] of Object.entries(METRIC_AUDITS)) {
        const value = lhr.audits?.[auditId]?.numericValue;
        result[field] = typeof value === 'number' ? value : null;
    }
    return result;
}

module.exports = { analyseUrls, fetchReport, summarise, PSI_ENDPOINT };
