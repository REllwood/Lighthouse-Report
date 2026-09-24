const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRequest } = require('../lib/validate');

const limits = { maxUrls: 3 };

test('parseRequest accepts a valid body and normalises the URLs', () => {
    assert.deepEqual(
        parseRequest({ urls: ['https://example.com', ' https://Example2.com/path '], email: 'someone@example.com' }, limits),
        { urls: ['https://example.com/', 'https://example2.com/path'], email: 'someone@example.com', strategy: 'mobile' }
    );
});

test('parseRequest removes duplicate URLs and accepts desktop', () => {
    const request = parseRequest({ urls: ['https://example.com', 'https://example.com/'], email: 'a@b.co', strategy: 'desktop' }, limits);
    assert.deepEqual(request.urls, ['https://example.com/']);
    assert.equal(request.strategy, 'desktop');
});

test('parseRequest rejects a missing or non-object body', () => {
    for (const body of [undefined, null, 'urls=https://example.com', ['https://example.com']]) {
        assert.equal(parseRequest(body, limits).errors.length, 1);
    }
});

test('parseRequest rejects missing, empty or too many URLs', () => {
    assert.deepEqual(parseRequest({ email: 'a@b.co' }, limits).errors, ['"urls" must be a non-empty array of URLs']);
    assert.deepEqual(parseRequest({ urls: [], email: 'a@b.co' }, limits).errors, ['"urls" must be a non-empty array of URLs']);
    assert.deepEqual(parseRequest({ urls: 'https://example.com', email: 'a@b.co' }, limits).errors, ['"urls" must be a non-empty array of URLs']);
    assert.deepEqual(
        parseRequest({ urls: ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'], email: 'a@b.co' }, limits).errors,
        ['"urls" can contain at most 3 URLs']
    );
});

test('parseRequest rejects anything that is not an http(s) URL', () => {
    const { errors } = parseRequest({ urls: ['example.com', 'ftp://example.com', 'javascript:alert(1)', 42], email: 'a@b.co' }, { maxUrls: 10 });
    assert.deepEqual(errors, [
        'Not a valid http(s) URL: example.com',
        'Not a valid http(s) URL: ftp://example.com',
        'Not a valid http(s) URL: javascript:alert(1)',
        'Not a valid http(s) URL: 42',
    ]);
});

test('parseRequest only accepts a single plain email address', () => {
    for (const email of [undefined, '', 'not-an-email', 'a@b', 'a@b.co, victim@example.com', 'a@b.co;c@d.co', 'Name <a@b.co>', 'a @b.co', `${'a'.repeat(250)}@b.co`]) {
        assert.deepEqual(parseRequest({ urls: ['https://example.com'], email }, limits).errors, ['"email" must be a single valid email address'], `accepted ${email}`);
    }
});

test('parseRequest rejects an unknown strategy', () => {
    assert.deepEqual(
        parseRequest({ urls: ['https://example.com'], email: 'a@b.co', strategy: 'tablet' }, limits).errors,
        ['"strategy" must be "mobile" or "desktop"']
    );
});
