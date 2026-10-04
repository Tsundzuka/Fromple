// ============================================================
// GET /api/health
// ============================================================
// Public ping endpoint. No auth, no database, no side effects.

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(200).json({
        status: 'ok',
        service: 'fromple',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
};
