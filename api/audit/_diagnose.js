// ============================================================
// /api/audit/_diagnose.js
// Analyzes raw AI search results to explain why competitors
// are winning and where your brand is losing visibility.
// ============================================================

export function runDiagnosis(rawResults, competitors, businessName) {

    // ---------- Input Validation ----------
    if (!rawResults || typeof rawResults !== 'object') {
        console.warn('_diagnose: rawResults is missing or invalid');
        return [];
    }

    if (!rawResults.queries || !Array.isArray(rawResults.queries) || rawResults.queries.length === 0) {
        console.warn('_diagnose: No queries in rawResults');
        return [];
    }

    if (!businessName) {
        console.warn('_diagnose: businessName is missing');
        return [];
    }

    const competitorNames = competitors.map(c => c.name.toLowerCase());
    const diagnosis = [];

    // ---------- Analyze Each Query ----------
    for (const queryObj of rawResults.queries) {
        const query = queryObj.query || 'unknown';
        const results = queryObj.results || {};

        // Count mentions across all AI platforms
        const mentionCount = {};

        // Initialize with your business and competitors
        mentionCount[businessName.toLowerCase()] = 0;
        for (const comp of competitorNames) {
            mentionCount[comp] = 0;
        }

        // Process each platform's results
        const platformKeys = Object.keys(results);
        for (const platform of platformKeys) {
            const platformData = results[platform] || {};
            const mentions = platformData.mentions || [];

            for (const mention of mentions) {
                const mentionKey = mention.toLowerCase();
                if (mentionCount.hasOwnProperty(mentionKey)) {
                    mentionCount[mentionKey] += 1;
                } else {
                    // Unknown entity – could be a new competitor
                    mentionCount[mentionKey] = 1;
                }
            }
        }

        // Extract your mentions vs competitor mentions
        const yourMentions = mentionCount[businessName.toLowerCase()] || 0;
        const competitorMentions = {};
        let totalCompetitorMentions = 0;
        const topCompetitors = [];

        for (const [name, count] of Object.entries(mentionCount)) {
            if (name !== businessName.toLowerCase()) {
                competitorMentions[name] = count;
                totalCompetitorMentions += count;
                if (count > 0) {
                    topCompetitors.push({ name, count });
                }
            }
        }

        // Sort competitors by mention count (descending)
        topCompetitors.sort((a, b) => b.count - a.count);

        // ---------- Determine if there is a gap ----------
        // If you have 0 mentions and competitors appear
        if (yourMentions === 0 && totalCompetitorMentions > 0) {
            diagnosis.push({
                category: 'content_gap',
                severity: 'high',
                title: `Your brand is NOT mentioned for "${query}"`,
                description: `AI systems consistently recommend your competitors for this query, but your brand does not appear in any results. This suggests you lack relevant content, citations, or authority for this topic.`,
                query: query,
                competitors: topCompetitors.map(c => c.name),
                your_mentions: yourMentions,
                competitor_mentions: competitorMentions,
                evidence: [`Your brand has 0 mentions across ${platformKeys.length} AI platforms`, `Competitors appear ${totalCompetitorMentions} times collectively`]
            });
        } else if (yourMentions > 0 && totalCompetitorMentions > yourMentions * 2) {
            // You appear, but competitors dominate (2x+)
            const ratio = (totalCompetitorMentions / yourMentions).toFixed(1);
            diagnosis.push({
                category: 'authority_gap',
                severity: 'high',
                title: `Competitors dominate "${query}" (${ratio}x more mentions)`,
                description: `Your brand appears ${yourMentions} times, but competitors appear ${totalCompetitorMentions} times. This suggests competitors have stronger authority signals, more citations, or better-optimized content for this topic.`,
                query: query,
                competitors: topCompetitors.map(c => c.name),
                your_mentions: yourMentions,
                competitor_mentions: competitorMentions,
                evidence: [`Your mentions: ${yourMentions}`, `Top competitor: ${topCompetitors[0]?.name} with ${topCompetitors[0]?.count} mentions`]
            });
        }
        // If you are winning or tied, no diagnosis for this query

        // ---------- Additional signal: Citation/Source analysis ----------
        if (rawResults.sources) {
            const sourceCounts = {};
            for (const [name, urls] of Object.entries(rawResults.sources)) {
                sourceCounts[name.toLowerCase()] = urls ? urls.length : 0;
            }

            const yourSources = sourceCounts[businessName.toLowerCase()] || 0;
            let totalCompetitorSources = 0;
            for (const comp of competitorNames) {
                totalCompetitorSources += sourceCounts[comp] || 0;
            }

            if (yourSources === 0 && totalCompetitorSources > 0) {
                // Avoid duplicate if already added for this query
                const existingCitationGap = diagnosis.find(d => d.category === 'citation_gap');
                if (!existingCitationGap) {
                    diagnosis.push({
                        category: 'citation_gap',
                        severity: 'medium',
                        title: 'You have no citations in AI search results',
                        description: `AI systems are not citing any of your content as a source. Competitors have ${totalCompetitorSources} total cited sources. This indicates your content is not being discovered or referenced by AI.`,
                        query: 'global',
                        competitors: competitorNames.filter(c => sourceCounts[c] > 0),
                        your_mentions: yourSources,
                        competitor_mentions: sourceCounts,
                        evidence: [`Your sources: 0`, `Top competitor sources: ${Math.max(...Object.values(sourceCounts))}`]
                    });
                }
            }
        }
    }

    // Sort by severity (high first)
    diagnosis.sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return diagnosis;
}