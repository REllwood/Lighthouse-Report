const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../index');
const { fakeFetch, pdfText } = require('./helpers');

const API_KEY = 'test-api-key-123';
const ENV = {
    PSI_API_KEY: API_KEY,
    SMTP_USER: 'reports@example.com',
    SMTP_PASS: 'app-password',
    BQ_DATASET: 'web',
    BQ_TABLE: 'lighthouse',
};
const BODY = { urls: ['https://example.com/', 'https://example2.com/'], email: 'someone@example.com' };

function fakeResponse() {
    return {
        statusCode: null,
        body: undefined,
        headers: {},
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
        set(name, value) {
            this.headers[name] = value;
            return this;
        },
    };
}

/**
 * Runs the handler once with fake PageSpeed Insights, BigQuery and email, and returns everything they received
 */
async function run({ env = ENV, req = { method: 'POST', body: BODY }, psi, insert, sendMail } = {}) {
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
    const transporterFactory = smtp => ({
        sendMail: async options => {
            if (sendMail) await sendMail(options);
            emails.push({ smtp, options });
        },
    });

    const res = fakeResponse();
    await createHandler({ env, fetchImpl, bigquery, transporterFactory })(req, res);

    assert.equal(res.sends, 1, 'the handler must respond exactly once');
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(API_KEY), 'the response must never contain the API key');
    return { res, psiCalls, inserted, emails };
}

test('runs every URL, loads BigQuery, emails the PDF and returns the results', async () => {
    const { res, psiCalls, inserted, emails } = await run();

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, 'Lighthouse report sent to someone@example.com');
    assert.deepEqual(res.body.results.map(result => result.url), ['https://example.com/', 'https://example2.com/']);
    assert.equal(res.body.results[0].performanceScore, 87);
    assert.deepEqual(res.body.failures, []);

    assert.deepEqual(psiCalls.map(call => call.url.searchParams.get('url')), ['https://example.com/', 'https://example2.com/']);
    assert.ok(psiCalls.every(call => call.url.searchParams.get('key') === API_KEY));

    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].datasetId, 'web');
    assert.equal(inserted[0].tableId, 'lighthouse');
    assert.equal(inserted[0].rows.length, 2);

    assert.equal(emails.length, 1);
    const { smtp, options } = emails[0];
    assert.deepEqual(smtp, { host: 'smtp.gmail.com', port: 465, user: 'reports@example.com', pass: 'app-password' });
    assert.equal(options.to, 'someone@example.com');
    assert.equal(options.from, 'reports@example.com');
    const pdf = options.attachments[0].content;
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdfText(pdf), /Performance score: 87 \/ 100/);
});

test('still sends the report when some URLs fail, and lists them', async () => {
    const { res, inserted, emails } = await run({
        psi: url => url === 'https://example2.com/'
            ? { status: 500, body: { error: { message: 'Lighthouse returned error: ERRORED_DOCUMENT_REQUEST' } } }
            : undefined,
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.results.map(result => result.url), ['https://example.com/']);
    assert.deepEqual(res.body.failures, [{ url: 'https://example2.com/', error: 'PageSpeed Insights returned 500: Lighthouse returned error: ERRORED_DOCUMENT_REQUEST' }]);
    assert.equal(inserted[0].rows.length, 1);
    assert.match(emails[0].options.text, /Could not be analysed/);
});

test('returns 502 without emailing when no URL could be analysed', async () => {
    const { res, inserted, emails } = await run({
        psi: () => ({ status: 403, body: { error: { message: 'API key not valid. Please pass a valid API key.' } } }),
    });

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'None of the URLs could be analysed');
    assert.equal(res.body.failures.length, 2);
    assert.equal(inserted.length, 0);
    assert.equal(emails.length, 0);
});

test('skips BigQuery when it is not configured', async () => {
    const { res, inserted, emails } = await run({ env: { PSI_API_KEY: API_KEY, SMTP_USER: 'u@example.com', SMTP_PASS: 'p' } });
    assert.equal(res.statusCode, 200);
    assert.equal(inserted.length, 0);
    assert.equal(emails.length, 1);
});

test('returns 500 and does not email when the BigQuery insert fails', async () => {
    const { res, emails } = await run({ insert: () => { throw new Error('Not found: Table my-project:web.lighthouse'); } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Could not save the results to BigQuery' });
    assert.equal(emails.length, 0);
});

test('returns 500 when the email cannot be sent, instead of leaving the request hanging', async () => {
    const { res } = await run({ sendMail: () => { throw new Error('Invalid login: 535-5.7.8 Username and Password not accepted'); } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'The report was generated but the email could not be sent' });
});

test('returns 500 without using any quota when settings are missing', async () => {
    const { res, psiCalls } = await run({ env: {} });
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /not configured/);
    assert.equal(psiCalls.length, 0);
});

test('turns an unexpected error into a single 500 response', async () => {
    const req = { method: 'POST', get body() { throw new Error('boom'); } };
    const { res } = await run({ req });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Something went wrong while generating the report' });
});
