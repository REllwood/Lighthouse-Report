const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyseUrls, fetchReport, summarise, PSI_ENDPOINT } = require('../lib/pagespeed');
const { psiFixture, fakeFetch } = require('./helpers');

const API_KEY = 'test-api-key-123';

test('fetchReport sends the API key as the key query parameter, not as a Bearer token', async () => {
    const { fetchImpl, calls } = fakeFetch();
    await fetchReport('https://example.com/', { apiKey: API_KEY, strategy: 'mobile', fetchImpl });

    assert.equal(calls.length, 1);
    const { url, init } = calls[0];
    assert.equal(`${url.origin}${url.pathname}`, PSI_ENDPOINT);
    assert.equal(url.searchParams.get('key'), API_KEY);
    assert.equal(url.searchParams.get('strategy'), 'MOBILE');
    assert.equal(url.searchParams.get('category'), 'PERFORMANCE');
    assert.equal(init.headers, undefined);
});

test('fetchReport encodes URLs that contain their own query string', async () => {
    const { fetchImpl, calls } = fakeFetch();
    const target = 'https://example.com/search?q=shoes&page=2#top';
    await fetchReport(target, { apiKey: API_KEY, strategy: 'desktop', fetchImpl });

    assert.equal(calls[0].url.searchParams.get('url'), target);
    assert.equal(calls[0].url.searchParams.get('strategy'), 'DESKTOP');
    assert.equal(calls[0].url.searchParams.getAll('page').length, 0);
});

test('fetchReport reports the PageSpeed Insights error message without the API key', async () => {
    const { fetchImpl } = fakeFetch(() => ({
        status: 400,
        body: { error: { code: 400, message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page you requested.' } },
    }));

    await assert.rejects(
        fetchReport('https://example.com/', { apiKey: API_KEY, strategy: 'mobile', fetchImpl }),
        err => {
            assert.match(err.message, /^PageSpeed Insights returned 400: Lighthouse returned error: FAILED_DOCUMENT_REQUEST/);
            assert.doesNotMatch(err.message, new RegExp(API_KEY));
            return true;
        }
    );
});

test('fetchReport hides network error details, which can include the request URL and key', async () => {
    const fetchImpl = async url => {
        throw new TypeError(`fetch failed for ${url}`);
    };
    await assert.rejects(
        fetchReport('https://example.com/', { apiKey: API_KEY, strategy: 'mobile', fetchImpl }),
        { message: 'Could not reach PageSpeed Insights' }
    );
});

test('fetchReport gives a clear message when PageSpeed Insights times out', async () => {
    const fetchImpl = async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    };
    await assert.rejects(
        fetchReport('https://example.com/', { apiKey: API_KEY, strategy: 'mobile', fetchImpl }),
        { message: 'PageSpeed Insights did not respond within 120 seconds' }
    );
});

test('summarise reads the score and metrics from the v5 lighthouseResult', () => {
    const result = summarise('https://example.com/', 'mobile', psiFixture());
    assert.deepEqual(result, {
        url: 'https://example.com/',
        finalUrl: 'https://www.example.com/',
        strategy: 'mobile',
        fetchedAt: '2026-09-24T01:00:00.000Z',
        lighthouseVersion: '13.5.0',
        performanceScore: 87,
        firstContentfulPaintMs: psiFixture().lighthouseResult.audits['first-contentful-paint'].numericValue,
        largestContentfulPaintMs: 2830.5,
        totalBlockingTimeMs: 312,
        speedIndexMs: psiFixture().lighthouseResult.audits['speed-index'].numericValue,
        cumulativeLayoutShift: 0.0421,
    });
});

test('summarise copes with a missing score or metric', () => {
    const response = psiFixture();
    response.lighthouseResult.categories.performance.score = null;
    delete response.lighthouseResult.audits['speed-index'];

    const result = summarise('https://example.com/', 'mobile', response);
    assert.equal(result.performanceScore, null);
    assert.equal(result.speedIndexMs, null);
});

test('summarise fails when Lighthouse hit a runtime error', () => {
    const response = psiFixture();
    response.lighthouseResult.runtimeError = { code: 'NO_FCP', message: 'The page did not paint any content.' };
    assert.throws(() => summarise('https://example.com/', 'mobile', response), /could not analyse the page: The page did not paint any content/);
});

test('analyseUrls waits for every URL, even when the last one answers first', async () => {
    const delays = { 'https://a.example/': 60, 'https://b.example/': 30, 'https://c.example/': 0 };
    const { fetchImpl } = fakeFetch(async url => {
        await new Promise(resolve => setTimeout(resolve, delays[url]));
        return { status: 200, body: psiFixture() };
    });

    const { results, failures } = await analyseUrls(Object.keys(delays), { apiKey: API_KEY, strategy: 'mobile', fetchImpl });
    assert.deepEqual(results.map(result => result.url), Object.keys(delays));
    assert.deepEqual(failures, []);
});

test('analyseUrls keeps going when some URLs fail', async () => {
    const { fetchImpl } = fakeFetch(url => url === 'https://broken.example/'
        ? { status: 500, body: { error: { message: 'Lighthouse returned error: ERRORED_DOCUMENT_REQUEST' } } }
        : { status: 200, body: psiFixture() });

    const { results, failures } = await analyseUrls(
        ['https://ok.example/', 'https://broken.example/'],
        { apiKey: API_KEY, strategy: 'mobile', fetchImpl }
    );
    assert.deepEqual(results.map(result => result.url), ['https://ok.example/']);
    assert.deepEqual(failures, [{
        url: 'https://broken.example/',
        error: 'PageSpeed Insights returned 500: Lighthouse returned error: ERRORED_DOCUMENT_REQUEST',
    }]);
});
