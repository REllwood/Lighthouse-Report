const { BigQuery } = require('@google-cloud/bigquery');

/**
 * Turns a result into a BigQuery row. Column names match bigquery-schema.json
 * @param result - One result from analyseUrls
 * @returns {object}
 */
function toRow(result) {
    return {
        url: result.url,
        final_url: result.finalUrl,
        strategy: result.strategy,
        fetched_at: result.fetchedAt,
        lighthouse_version: result.lighthouseVersion,
        performance_score: result.performanceScore,
        first_contentful_paint_ms: result.firstContentfulPaintMs,
        largest_contentful_paint_ms: result.largestContentfulPaintMs,
        total_blocking_time_ms: result.totalBlockingTimeMs,
        speed_index_ms: result.speedIndexMs,
        cumulative_layout_shift: result.cumulativeLayoutShift,
    };
}

/**
 * Loads the results into the BigQuery table, one row per URL
 * @param results - Results from analyseUrls
 * @param table.datasetId - BigQuery dataset ID
 * @param table.tableId - BigQuery table ID
 * @param bigquery - BigQuery client, only replaced in tests
 * @returns {Promise<void>}
 */
async function saveResults(results, { datasetId, tableId }, bigquery = new BigQuery()) {
    try {
        await bigquery.dataset(datasetId).table(tableId).insert(results.map(toRow));
    } catch (err) {
        // A PartialFailureError lists each rejected row with its reasons
        const reasons = (err.errors || [])
            .flatMap(rowError => (rowError.errors || []).map(e => e.message))
            .filter(Boolean);
        const detail = reasons.length > 0 ? reasons.join('; ') : err.message;
        throw new Error(`BigQuery insert into ${datasetId}.${tableId} failed: ${detail}`);
    }
}

module.exports = { saveResults, toRow };
