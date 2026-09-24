const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPdf } = require('../lib/pdf');
const { summarise } = require('../lib/pagespeed');
const { psiFixture, pdfText } = require('./helpers');

const result = summarise('https://example.com/', 'mobile', psiFixture());

test('buildPdf returns a complete PDF in memory', async () => {
    const pdf = await buildPdf([result]);
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdf.subarray(-10).toString(), /%%EOF/);
});

test('buildPdf shows the score and metrics for each URL', async () => {
    const text = pdfText(await buildPdf([result], [], new Date('2026-09-24T01:00:00Z')));

    assert.match(text, /Lighthouse Report/);
    assert.match(text, /generated Thu, 24 Sep 2026 01:00:00 GMT/);
    assert.match(text, /https:\/\/example\.com\//);
    assert.match(text, /Redirected to https:\/\/www\.example\.com\//);
    assert.match(text, /Performance score: 87 \/ 100/);
    assert.match(text, /Largest Contentful Paint\n2\.8 s/);
    assert.match(text, /Total Blocking Time\n312 ms/);
    assert.match(text, /Cumulative Layout Shift\n0\.042/);
    assert.doesNotMatch(text, /undefined/);
});

test('buildPdf lists the URLs that could not be analysed', async () => {
    const text = pdfText(await buildPdf([result], [{ url: 'https://broken.example/', error: 'PageSpeed Insights returned 500: boom' }]));
    assert.match(text, /Could not be analysed/);
    assert.match(text, /https:\/\/broken\.example\//);
    assert.match(text, /PageSpeed Insights returned 500: boom/);
});

test('buildPdf shows n/a instead of undefined for missing values', async () => {
    const text = pdfText(await buildPdf([{ ...result, performanceScore: null, speedIndexMs: null }]));
    assert.match(text, /Performance score: n\/a/);
    assert.match(text, /Speed Index\nn\/a/);
});

test('buildPdf adds pages for longer lists of URLs', async () => {
    const results = Array.from({ length: 12 }, (_, i) => ({ ...result, url: `https://example.com/page-${i}` }));
    const pdf = await buildPdf(results);
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) || [];
    assert.ok(pages.length > 1, `expected more than one page, got ${pages.length}`);
});
