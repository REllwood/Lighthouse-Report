const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../index');
const { fakeFetch } = require('./helpers');

const API_KEY = 'test-api-key-123';
const ENV = { PSI_API_KEY: API_KEY };
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
    };
}

/**
 * Runs the handler once with a fake PageSpeed Insights and returns the response and the requests made
 */
async function run({ env = ENV, req = { method: 'POST', body: BODY }, psi } = {}) {
    const { fetchImpl, calls: psiCalls } = fakeFetch(psi);
    const res = fakeResponse();
    await createHandler({ env, fetchImpl })(req, res);

    assert.equal(res.sends, 1, 'the handler must respond exactly once');
    assert.doesNotMatch(JSON.stringify(res.body), new RegExp(API_KEY), 'the response must never contain the API key');
    return { res, psiCalls };
}

test('returns one 502 listing every failed URL, without the API key', async () => {
    const { res, psiCalls } = await run({
        psi: () => ({ status: 403, body: { error: { message: 'API key not valid. Please pass a valid API key.' } } }),
    });

    assert.equal(psiCalls.length, 2);
    assert.ok(psiCalls.every(call => call.url.searchParams.get('key') === API_KEY));
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, {
        error: 'None of the URLs could be analysed',
        failures: BODY.urls.map(url => ({ url, error: 'PageSpeed Insights returned 403: API key not valid. Please pass a valid API key.' })),
    });
});

test('turns an unexpected error into a single 500 response', async () => {
    const req = { method: 'POST', get body() { throw new Error('boom'); } };
    const { res } = await run({ req });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Something went wrong while generating the report' });
});
