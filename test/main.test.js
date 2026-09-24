import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportName, isHttpUrl, runReport } from '../main.js';

test('reportName keeps a bare domain as its own name', () => {
    assert.equal(reportName('https://example.com'), 'example.com');
    assert.equal(reportName('https://example.com/'), 'example.com');
    assert.equal(reportName('http://www.example.com.au/'), 'www.example.com.au');
});

test('reportName flattens paths, query strings and ports into one safe file name', () => {
    assert.equal(reportName('https://example.com/a/b/'), 'example.com_a_b');
    assert.equal(reportName('https://example.com/search?q=shoes&page=2'), 'example.com_search_q_shoes_page_2');
    assert.equal(reportName('http://localhost:8080/'), 'localhost_8080');
    assert.doesNotMatch(reportName('https://example.com/../../etc/passwd'), /[\\/]/);
});

test('reportName caps very long names', () => {
    assert.ok(reportName(`https://example.com/${'a'.repeat(500)}`).length <= 150);
});

test('isHttpUrl only accepts absolute http and https URLs', () => {
    assert.equal(isHttpUrl('https://example.com'), true);
    assert.equal(isHttpUrl('http://localhost:3000/page'), true);
    assert.equal(isHttpUrl('example.com'), false);
    assert.equal(isHttpUrl('ftp://example.com'), false);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl(''), false);
});

test('runReport rejects an invalid URL before launching Chrome', async () => {
    await assert.rejects(runReport('not a url'), /Not a valid http\(s\) URL/);
});
