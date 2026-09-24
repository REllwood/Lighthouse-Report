const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig, missingSettings, bigQueryEnabled } = require('../lib/config');

test('BigQuery is off when neither BQ_DATASET nor BQ_TABLE is set', () => {
    const config = loadConfig({ PSI_API_KEY: 'key' });
    assert.equal(config.psiApiKey, 'key');
    assert.equal(bigQueryEnabled(config), false);
    assert.deepEqual(missingSettings(config), []);
});

test('loadConfig reads the BigQuery dataset and table', () => {
    const config = loadConfig({ BQ_DATASET: 'web', BQ_TABLE: 'lighthouse' });
    assert.deepEqual(config.bigQuery, { datasetId: 'web', tableId: 'lighthouse' });
    assert.equal(bigQueryEnabled(config), true);
    assert.deepEqual(missingSettings(config), []);
});

test('missingSettings asks for the other half of a partial BigQuery setup', () => {
    assert.deepEqual(missingSettings(loadConfig({ BQ_DATASET: 'web' })), ['BQ_TABLE']);
    assert.deepEqual(missingSettings(loadConfig({ BQ_TABLE: 'lighthouse' })), ['BQ_DATASET']);
});
