// ============================================================
// /api/audit/index.js
// Main route handler for audit jobs
// POST  /api/audit  – Create a new audit job OR trigger existing one
// GET   /api/audit?id=123 – Fetch audit results + diagnosis + optimization
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { runDiagnosis } from './_diagnose.js';
import { runOptimization } from './_optimize.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ------------------------------------------------------------
// verifyUser
// Directly hits Supabase's auth endpoint instead of using
// supabase.auth.getUser(). This works with ES256 tokens, HS256
// tokens, and any future signing algorithm Supabase adopts.
// Returns { user } on success, or { error } on failure.
// ------------------------------------------------------------
async function verifyUser(token) {
    if (!token) return { error: 'missing token' };

    const url = `${process.env.SUPABASE_URL}/auth/v1/user`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            },
        });

        if (!response.ok) {
            const body = await response.text();
            return {
                error: `auth endpoint returned ${response.status}`,
                detail: body.slice(0, 300),
            };
        }

        const user = await response.json();
        if (!user || !user.id) {
            return { error: 'auth endpoint returned no user' };
        }

        return { user };
    } catch (err) {
        return { error: 'auth fetch failed', detail: err.message };
    }
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ---------- Authenticate user ----------
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.warn('auth: missing Authorization header');
        return res.status(401).json({ error: 'Unauthorized', reason: 'missing header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { user, error: authError, detail } = await verifyUser(token);

    if (!user) {
        console.error('auth failed:', { error: authError, detail });
        return res.status(401).json({
            error: 'Unauthorized',
            reason: authError,
            detail: detail || null,
        });
    }

    // ============================================================
    // GET  /api/audit?id=123
    // ============================================================
    if (req.method === 'GET') {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'id is required' });
        }

        try {
            const { data: audit, error } = await supabase
                .from('audit_jobs')
                .select('*')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (error || !audit) {
                return res.status(404).json({ error: 'Audit not found' });
            }

            if (audit.status !== 'complete') {
                return res.status(200).json({
                    id: audit.id,
                    status: audit.status,
                    business_name: audit.business_name,
                    message: 'Audit is still in progress. Check back later.',
                });
            }

            const competitorObjects = (audit.competitors || []).map(c =>
                typeof c === 'string' ? { name: c } : c
            );

            const diagnosis = runDiagnosis(
                audit.raw_results,
                competitorObjects,
                audit.business_name
            );
            const optimizations = runOptimization(
                diagnosis,
                audit.business_name,
                null
            );

            return res.status(200).json({
                id: audit.id,
                business_name: audit.business_name,
                brand_aliases: audit.brand_aliases,
                competitors: audit.competitors,
                queries: audit.queries,
                platforms: audit.platforms,
                plan: audit.plan,
                score: audit.score,
                status: audit.status,
                results: audit.raw_results,
                diagnosis: diagnosis,
                optimizations: optimizations,
                created_at: audit.created_at,
                completed_at: audit.completed_at,
            });

        } catch (error) {
            console.error('GET /api/audit error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // ============================================================
    // POST  /api/audit
    // ============================================================
    if (req.method === 'POST') {
        const {
            audit_id,
            brand,
            brand_aliases,
            competitors,
            queries,
            platforms,
            plan,
            report_email,
        } = req.body;

        // ---------- CASE 1: Trigger an existing audit ----------
        if (audit_id) {
            try {
                const { data: audit, error: fetchError } = await supabase
                    .from('audit_jobs')
                    .select('*')
                    .eq('id', audit_id)
                    .eq('user_id', user.id)
                    .single();

                if (fetchError || !audit) {
                    return res.status(404).json({ error: 'Audit not found' });
                }

                const edgeUrl = `${process.env.SUPABASE_URL}/functions/v1/process-audit`;
                const edgeResponse = await fetch(edgeUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                    },
                    body: JSON.stringify({ audit_id: audit.id }),
                });

                if (!edgeResponse.ok) {
                    const errorText = await edgeResponse.text();
                    console.error(`❌ Edge Function returned ${edgeResponse.status}: ${errorText}`);
                } else {
                    console.log(`✅ Edge Function triggered successfully for audit ${audit.id}`);
                }

                return res.status(200).json({
                    id: audit.id,
                    status: audit.status || 'pending',
                    business_name: audit.business_name,
                    message: 'Processing triggered for existing audit.',
                });

            } catch (error) {
                console.error('Error triggering existing audit:', error);
                return res.status(500).json({ error: 'Failed to trigger processing' });
            }
        }

        // ---------- CASE 2: Create a new audit ----------
        if (!brand) {
            return res.status(400).json({ error: 'brand is required' });
        }
        if (!queries || !Array.isArray(queries) || queries.length === 0) {
            return res.status(400).json({ error: 'queries must be a non-empty array' });
        }

        try {
            const { data: orgMember, error: orgError } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', user.id)
                .limit(1)
                .single();

            if (orgError || !orgMember) {
                return res.status(404).json({ error: 'Organization not found' });
            }

            const organizationId = orgMember.organization_id;

            const { data: audit, error: insertError } = await supabase
                .from('audit_jobs')
                .insert({
                    user_id: user.id,
                    organization_id: organizationId,
                    business_name: brand,
                    brand_aliases: brand_aliases || null,
                    competitors: competitors || [],
                    queries: queries,
                    platforms: platforms || ['tavily', 'you'],
                    plan: plan || 'starter',
                    report_email: report_email || null,
                    status: 'pending',
                    score: null,
                    raw_results: null,
                    started_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (insertError) {
                console.error('Insert error:', insertError);
                return res.status(500).json({ error: insertError.message });
            }

            const edgeUrl = `${process.env.SUPABASE_URL}/functions/v1/process-audit`;
            console.log(`📤 Calling Edge Function for audit ${audit.id}...`);

            const edgeResponse = await fetch(edgeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ audit_id: audit.id }),
            });

            if (!edgeResponse.ok) {
                const errorText = await edgeResponse.text();
                console.error(`❌ Edge Function returned ${edgeResponse.status}: ${errorText}`);
            } else {
                console.log(`✅ Edge Function triggered successfully for audit ${audit.id}`);
            }

            return res.status(200).json({
                id: audit.id,
                status: 'pending',
                business_name: audit.business_name,
                message: 'Scan started – check back later for results.',
            });

        } catch (error) {
            console.error('POST /api/audit error:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
