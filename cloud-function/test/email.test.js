const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { createTransport, sendReport, PDF_NAME } = require('../lib/email');

const results = [
    { url: 'https://example.com/', performanceScore: 87 },
    { url: 'https://example2.com/', performanceScore: null },
];
const failures = [{ url: 'https://broken.example/', error: 'PageSpeed Insights returned 500: boom' }];
const pdf = Buffer.from('%PDF-1.3 fake');

test('sendReport attaches the PDF and summarises the scores', async () => {
    const sent = [];
    await sendReport({ sendMail: async options => sent.push(options) }, {
        from: 'reports@example.com', to: 'someone@example.com', pdf, results, failures,
    });

    assert.equal(sent.length, 1);
    const [mail] = sent;
    assert.equal(mail.from, 'reports@example.com');
    assert.equal(mail.to, 'someone@example.com');
    assert.equal(mail.subject, 'Lighthouse Report');
    assert.deepEqual(mail.attachments, [{ filename: PDF_NAME, content: pdf, contentType: 'application/pdf' }]);
    assert.match(mail.text, /https:\/\/example\.com\/: performance 87 \/ 100/);
    assert.match(mail.text, /https:\/\/example2\.com\/: performance n\/a \/ 100/);
    assert.match(mail.text, /Could not be analysed:\nhttps:\/\/broken\.example\/: PageSpeed Insights returned 500: boom/);
});

test('sendReport builds a valid email with nodemailer', async () => {
    const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    let info;
    await sendReport({ sendMail: async options => { info = await transporter.sendMail(options); } }, {
        from: 'reports@example.com', to: 'someone@example.com', pdf, results,
    });

    const message = info.message.toString();
    assert.match(message, /^To: someone@example\.com$/m);
    assert.match(message, /^Subject: Lighthouse Report$/m);
    assert.match(message, /Content-Type: application\/pdf; name=lighthouse-report\.pdf/);
    assert.match(message, new RegExp(pdf.toString('base64')));
});

test('createTransport uses SSL on port 465 and STARTTLS on other ports', () => {
    const ssl = createTransport({ host: 'smtp.gmail.com', port: 465, user: 'a@example.com', pass: 'secret' });
    assert.equal(ssl.options.host, 'smtp.gmail.com');
    assert.equal(ssl.options.secure, true);

    const starttls = createTransport({ host: 'smtp.example.com', port: 587, user: 'a@example.com', pass: 'secret' });
    assert.equal(starttls.options.secure, false);
});
