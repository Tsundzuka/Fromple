// ============================================================
// /api/audit/_optimize.js
// Converts diagnosis gaps into prioritized actionable recommendations
// ============================================================

export function runOptimization(diagnosis, businessName, website = '') {

    if (!diagnosis || !Array.isArray(diagnosis) || diagnosis.length === 0) {
        return [];
    }

    const optimizations = [];

    for (const item of diagnosis) {
        const basePriority = item.severity === 'high' ? 'high' : (item.severity === 'medium' ? 'medium' : 'low');

        switch (item.category) {
            case 'content_gap':
                optimizations.push({
                    priority: basePriority,
                    category: 'content',
                    title: `Create content for "${item.query}"`,
                    description: `Your brand has no mentions for "${item.query}". Create a dedicated page or article targeting this topic to improve visibility. Include relevant keywords, answer common questions, and address user intent.`,
                    action_type: 'create_page',
                    source_gap: item.evidence.join('; '),
                    expected_impact: item.severity === 'high' ? '70%' : '50%',
                    content_draft: null
                });
                break;

            case 'authority_gap':
                optimizations.push({
                    priority: basePriority,
                    category: 'authority',
                    title: `Build authority for "${item.query}"`,
                    description: `Your brand has fewer mentions (${item.your_mentions}) than competitors (${Object.values(item.competitor_mentions).reduce((a,b) => a+b, 0)}). Improve authority by earning backlinks, creating high-quality content, and ensuring your site is cited in relevant industry sources.`,
                    action_type: 'improve_authority',
                    source_gap: `Competitors: ${item.competitors.join(', ')}`,
                    expected_impact: basePriority === 'high' ? '60%' : '40%',
                    content_draft: null
                });
                break;

            case 'citation_gap':
                optimizations.push({
                    priority: basePriority,
                    category: 'citations',
                    title: 'Build citations in AI search results',
                    description: `Your content is not cited by any AI system. Increase citations by publishing unique, authoritative content on your website, getting featured in industry publications, and ensuring your business information is consistent across directories.`,
                    action_type: 'build_citations',
                    source_gap: 'No cited sources found',
                    expected_impact: '55%',
                    content_draft: null
                });
                break;

            case 'structured_data_gap':
                optimizations.push({
                    priority: basePriority,
                    category: 'structured_data',
                    title: 'Add structured data (Schema.org)',
                    description: `AI systems often rely on structured data to understand your content. Add relevant Schema.org markup to your pages (e.g., Product, Service, FAQ, LocalBusiness) to improve visibility in AI search results.`,
                    action_type: 'add_schema',
                    source_gap: 'No structured data detected',
                    expected_impact: '40%',
                    content_draft: null
                });
                break;

            case 'location_gap':
                optimizations.push({
                    priority: basePriority,
                    category: 'local_seo',
                    title: 'Optimize local presence',
                    description: `Your location is not well represented. Ensure your Google Business Profile is complete, add location-specific content, and get listed in local directories.`,
                    action_type: 'improve_local_seo',
                    source_gap: 'Missing local signals',
                    expected_impact: '45%',
                    content_draft: null
                });
                break;

            default:
                optimizations.push({
                    priority: 'medium',
                    category: 'general',
                    title: `Address gap: ${item.title}`,
                    description: item.description,
                    action_type: 'general_improvement',
                    source_gap: 'Diagnosis provided but no specific mapping',
                    expected_impact: '30%',
                    content_draft: null
                });
        }
    }

    // Sort by priority: high → medium → low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    optimizations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return optimizations;
}