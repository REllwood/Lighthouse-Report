const nodemailer = require('nodemailer');

const PDF_NAME = 'lighthouse-report.pdf';

/**
 * Creates the SMTP connection. For Gmail use smtp.gmail.com with an App Password, a normal Gmail password will be rejected
 * @param smtp - host, port, user and pass from loadConfig
 * @returns {import('nodemailer').Transporter}
 */
function createTransport({ host, port, user, pass }) {
    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    });
}

/**
 * Emails the PDF report with a short summary of the scores in the body
 * @param transporter - From createTransport
 * @param message.from - Sender address
 * @param message.to - Recipient address
 * @param message.pdf - The PDF report
 * @param message.results - Results from analyseUrls
 * @param message.failures - URLs that could not be analysed
 * @returns {Promise<void>}
 */
async function sendReport(transporter, { from, to, pdf, results, failures = [] }) {
    const lines = [
        'Please find attached the Lighthouse report for the URLs you provided.',
        '',
        ...results.map(result => `${result.url}: performance ${result.performanceScore ?? 'n/a'} / 100`),
    ];
    if (failures.length > 0) {
        lines.push('', 'Could not be analysed:', ...failures.map(failure => `${failure.url}: ${failure.error}`));
    }

    await transporter.sendMail({
        from,
        to,
        subject: 'Lighthouse Report',
        text: lines.join('\n'),
        attachments: [{ filename: PDF_NAME, content: pdf, contentType: 'application/pdf' }],
    });
}

module.exports = { createTransport, sendReport, PDF_NAME };
