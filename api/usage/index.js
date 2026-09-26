// ============================================================
// GET /api/usage - Get feature usage stats
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get user from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    try {
        // Verify token with Supabase
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError || !user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Total generations
        const { count: totalGenerations, error: genError } = await supabase
            .from('content_history')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (genError) {
            console.error('Error counting generations:', genError);
        }

        // Get all feature types used by this user
        const { data: featureData, error: featureError } = await supabase
            .from('content_history')
            .select('feature_type')
            .eq('user_id', user.id);

        if (featureError) {
            console.error('Error fetching features:', featureError);
        }

        // Count unique features
        const uniqueFeatures = [...new Set(featureData?.map(f => f.feature_type) || [])];

        // Count usage per feature
        const featureUsageMap = {};
        (featureData || []).forEach(item => {
            featureUsageMap[item.feature_type] = (featureUsageMap[item.feature_type] || 0) + 1;
        });

        // Sort by most used
        const sortedFeatures = Object.entries(featureUsageMap)
            .sort((a, b) => b[1] - a[1])
            .map(([feature, count]) => ({ feature, count }));

        // Total uploads
        const { count: totalUploads, error: uploadError } = await supabase
            .from('uploads')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (uploadError) {
            console.error('Error counting uploads:', uploadError);
        }

        return res.status(200).json({
            total_generations: totalGenerations || 0,
            features_used_count: uniqueFeatures.length,
            most_used_features: sortedFeatures.slice(0, 5),
            total_uploads: totalUploads || 0
        });

    } catch (error) {
        console.error('GET /api/usage error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};