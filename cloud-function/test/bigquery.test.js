const { test } = require('node:test');
const assert = require('node:assert/strict');
const { saveResults, toRow } = require('../lib/bigquery');
const { summarise } = require('../lib/pagespeed');
const schema = require('../bigquery-schema.json');
const { psiFixture } = require('./helpers');

const result = summarise('https://example.com/', 'mobile', psiFixture());

function fakeBigQuery(insert) {
    const calls = [];
    return {
        calls,
        dataset: datasetId => ({
            table: tableId => ({
                insert: async rows => {
                    calls.push({ datasetId, tableId, rows });
                    if (insert) await insert(rows);
                },
            }),
        }),
    };
}

test('toRow has exactly the columns in bigquery-schema.json', () => {
    assert.deepEqual(Object.keys(toRow(result)).sort(), schema.map(field => field.name).sort());
});

test('toRow fills every REQUIRED column', () => {
    const row = toRow(result);
    for (const field of schema.filter(f => f.mode === 'REQUIRED')) {
        assert.ok(row[field.name] !== null && row[field.name] !== undefined, `${field.name} is empty`);
    }
    assert.equal(row.performance_score, 87);
    assert.equal(row.largest_contentful_paint_ms, 2830.5);
});

test('saveResults inserts one row per result into the configured table', async () => {
    const bigquery = fakeBigQuery();
    await saveResults([result, { ...result, url: 'https://example2.com/' }], { datasetId: 'web', tableId: 'lighthouse' }, bigquery);

    assert.equal(bigquery.calls.length, 1);
    assert.equal(bigquery.calls[0].datasetId, 'web');
    assert.equal(bigquery.calls[0].tableId, 'lighthouse');
    assert.deepEqual(bigquery.calls[0].rows.map(row => row.url), ['https://example.com/', 'https://example2.com/']);
});

test('saveResults explains which rows BigQuery rejected', async () => {
    const bigquery = fakeBigQuery(() => {
        const err = new Error('A failure occurred during this request.');
        err.name = 'PartialFailureError';
        err.errors = [{ row: {}, errors: [{ reason: 'invalid', message: 'no such field: extra_column.' }] }];
        throw err;
    });

    await assert.rejects(
        saveResults([result], { datasetId: 'web', tableId: 'lighthouse' }, bigquery),
        { message: 'BigQuery insert into web.lighthouse failed: no such field: extra_column.' }
    );
});
