const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../index');
const { fakeFetch, pdfText } = require('./helpers');

const API_KEY = 'test-api-key-123';
const ENV = { PSI_API_KEY: API_KEY, BQ_DATASET: 'web', BQ_TABLE: 'lighthouse' };
const BODY = { urls: ['https://example.com/', 'https://example2.com/'], email: 'someone@example.com' };

function fakeResponse() {
    return {
        statusCode: null,
        body: undefined,
        headersSent: false,
        sends: 0,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.sends += 1;
            this.body = body;
            this.headersSent = true;
            return this;
        },
        send(body) {
            return this.json(body);
        },
    };
}

/**
 * Runs the handler once with fake PageSpeed Insights, BigQuery and email, and returns everything they received
 */
async function run({ env = ENV, req = { method: 'POST', body: BODY }, psi, insert } = {}) {
    const { fetchImpl, calls: psiCalls } = fakeFetch(psi);
    const inserted = [];
    const bigquery = {
        dataset: datasetId => ({
            table: tableId => ({
                insert: async rows => {
                    if (insert) await insert(rows);
                    inserted.push({ datasetId, tableId, rows });
                },
            }),
        }),
    };

    const emails = [];
    const transporterFactory = () => ({
        sendMail: async options => {
            emails.push(options);
            return { response: '250 OK' };
        },
    });

    const res = fakeResponse();
    await createHandler({ env, fetchImpl, bigquery, transporterFactory })(req, res);

    assert.equal(res.sends, 1, 'the handler must respond exactly once');
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(API_KEY), 'the response must never contain the API key');
    return { res, psiCalls, inserted, emails };
}

test('loads one row per analysed URL into the configured BigQuery table', async () => {
    const { inserted } = await run();

    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].datasetId, 'web');
    assert.equal(inserted[0].tableId, 'lighthouse');
    assert.deepEqual(inserted[0].rows.map(row => [row.url, row.performance_score]), [['https://example.com/', 87], ['https://example2.com/', 87]]);
});

test('emails a finished PDF showing the score and metrics for each URL', async () => {
    const { res, emails } = await run();

    assert.equal(res.body, 'Lighthouse report generated and sent to someone@example.com');
    assert.equal(emails.length, 1);
    const [attachment] = emails[0].attachments;
    assert.equal(attachment.filename, 'lighthouse-report.pdf');
    assert.equal(attachment.contentType, 'application/pdf');
    assert.equal(attachment.content.subarray(0, 5).toString(), '%PDF-');

    const text = pdfText(attachment.content);
    assert.match(text, /https:\/\/example\.com\/\n[\s\S]*Performance score: 87 \/ 100/);
    assert.match(text, /https:\/\/example2\.com\//);
    assert.match(text, /Largest Contentful Paint\n2\.8 s/);
    assert.doesNotMatch(text, /undefined/);
});

test('lists the URLs that could not be analysed in the PDF', async () => {
    const { emails } = await run({
        psi: url => url === 'https://example2.com/'
            ? { status: 500, body: { error: { message: 'Lighthouse returned error: ERRORED_DOCUMENT_REQUEST' } } }
            : undefined,
    });

    const text = pdfText(emails[0].attachments[0].content);
    assert.match(text, /Could not be analysed\nhttps:\/\/example2\.com\/\nPageSpeed Insights returned 500: Lighthouse returned error: ERRORED_DOCUMENT_REQUEST/);
});

test('skips BigQuery when it is not configured', async () => {
    const { inserted } = await run({ env: { PSI_API_KEY: API_KEY } });
    assert.equal(inserted.length, 0);
});

test('returns 500 and stops when the BigQuery insert fails', async () => {
    const { res, emails } = await run({ insert: () => { throw new Error('Not found: Table my-project:web.lighthouse'); } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Could not save the results to BigQuery' });
    assert.equal(emails.length, 0);
});

test('returns 500 without using any quota when BigQuery is half configured', async () => {
    const { res, psiCalls } = await run({ env: { PSI_API_KEY: API_KEY, BQ_DATASET: 'web' } });
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /not configured/);
    assert.equal(psiCalls.length, 0);
});

test('returns one 502 listing every failed URL, without the API key', async () => {
    const { res, psiCalls, inserted } = await run({
        psi: () => ({ status: 403, body: { error: { message: 'API key not valid. Please pass a valid API key.' } } }),
    });

    assert.equal(psiCalls.length, 2);
    assert.ok(psiCalls.every(call => call.url.searchParams.get('key') === API_KEY));
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, {
        error: 'None of the URLs could be analysed',
        failures: BODY.urls.map(url => ({ url, error: 'PageSpeed Insights returned 403: API key not valid. Please pass a valid API key.' })),
    });
    assert.equal(inserted.length, 0);
});

test('turns an unexpected error into a single 500 response', async () => {
    const req = { method: 'POST', get body() { throw new Error('boom'); } };
    const { res } = await run({ req });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Something went wrong while generating the report' });
});
