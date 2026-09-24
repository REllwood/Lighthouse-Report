const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, missingSettings, bigQueryEnabled } = require('../lib/config');

test('loadConfig applies defaults and missingSettings lists what is required', () => {
    const config = loadConfig({});
    assert.equal(config.smtp.host, 'smtp.gmail.com');
    assert.equal(config.smtp.port, 465);
    assert.equal(bigQueryEnabled(config), false);
    assert.deepEqual(missingSettings(config), ['SMTP_USER', 'SMTP_PASS']);
});

test('loadConfig reads every setting from the environment', () => {
    const config = loadConfig({
        PSI_API_KEY: 'key', BQ_DATASET: 'web', BQ_TABLE: 'lighthouse',
        SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'user@example.com', SMTP_PASS: 'pass', MAIL_FROM: 'Reports <reports@example.com>',
    });
    assert.equal(config.psiApiKey, 'key');
    assert.deepEqual(config.bigQuery, { datasetId: 'web', tableId: 'lighthouse' });
    assert.deepEqual(config.smtp, { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'pass' });
    assert.equal(config.mailFrom, 'Reports <reports@example.com>');
    assert.equal(bigQueryEnabled(config), true);
    assert.deepEqual(missingSettings(config), []);
});

test('MAIL_FROM defaults to the SMTP user', () => {
    assert.equal(loadConfig({ SMTP_USER: 'user@example.com' }).mailFrom, 'user@example.com');
});

test('missingSettings asks for the other half of a partial BigQuery setup', () => {
    const base = { PSI_API_KEY: 'key', SMTP_USER: 'u', SMTP_PASS: 'p' };
    assert.deepEqual(missingSettings(loadConfig({ ...base, BQ_DATASET: 'web' })), ['BQ_TABLE']);
    assert.deepEqual(missingSettings(loadConfig({ ...base, BQ_TABLE: 'lighthouse' })), ['BQ_DATASET']);
});
