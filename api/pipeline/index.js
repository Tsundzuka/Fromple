// ============================================================
// GET  /api/pipeline   → current system state
// POST /api/pipeline   → { action: 'start' | 'stop' }
// ============================================================
// Thin server-side wrapper over the system_state table.
// Uses the service role key so RLS cannot block pipeline
// control even if the browser policy is tightened later.
//
// Required env vars (Vercel → Settings → Environment Variables):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
function client() {
    if (!supabase) {
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Supabase env vars missing');
        }
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
    }
    return supabase;
}

// ------------------------------------------------------------
// Auth: require a valid Supabase access token in Authorization
// ------------------------------------------------------------
async function requireUser(req, res) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

    if (!token) {
        res.status(401).json({ error: 'Missing bearer token' });
        return null;
    }

    const { data, error } = await client().auth.getUser(token);
    if (error || !data?.user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return null;
    }

    return data.user;
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------
module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    // --- GET: read current state -----------------------------
    if (req.method === 'GET') {
        const user = await requireUser(req, res);
        if (!user) return;

        const { data, error } = await client()
            .from('system_state')
            .select('is_running, last_successful_run, updated_at')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('pipeline GET error:', error);
            return res.status(500).json({ error: 'Could not read system state' });
        }

        return res.status(200).json({
            is_running: !!data?.is_running,
            last_successful_run: data?.last_successful_run || null,
            updated_at: data?.updated_at || null,
        });
    }

    // --- POST: start / stop ----------------------------------
    if (req.method === 'POST') {
        const user = await requireUser(req, res);
        if (!user) return;

        const action = (req.body && req.body.action) || '';
        if (action !== 'start' && action !== 'stop') {
            return res.status(400).json({ error: 'action must be "start" or "stop"' });
        }

        const is_running = action === 'start';

        const { data, error } = await client()
            .from('system_state')
            .update({ is_running, updated_at: new Date().toISOString() })
            .eq('id', 1)
            .select('is_running, updated_at')
            .single();

        if (error) {
            console.error('pipeline POST error:', error);
            return res.status(500).json({ error: 'Could not update system state' });
        }

        return res.status(200).json({
            ok: true,
            is_running: data.is_running,
            updated_at: data.updated_at,
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
};
