// ============================================================
// /api/admin/administrator — single admin endpoint
// ============================================================
// One Vercel function for every admin resource. Frontend calls:
//   GET    /api/admin/administrator?resource=dashboard
//   GET    /api/admin/administrator?resource=users
//   GET    /api/admin/administrator?resource=scans
//   GET    /api/admin/administrator?resource=subscriptions
//   POST   /api/admin/administrator?resource=subscriptions
//   GET    /api/admin/administrator?resource=ai-usage
//   GET    /api/admin/administrator?resource=analytics
//   GET    /api/admin/administrator?resource=billing
//   GET    /api/admin/administrator?resource=logs
//   GET    /api/admin/administrator?resource=prompts
//   GET    /api/admin/administrator?resource=prompts&id=X
//   POST   /api/admin/administrator?resource=prompts
//   PUT    /api/admin/administrator?resource=prompts&id=X
//   DELETE /api/admin/administrator?resource=prompts&id=X
//   GET    /api/admin/administrator?resource=settings
//   PUT    /api/admin/administrator?resource=settings
//
// Auth: every request verifies the Bearer token and an active
// admin_users row before dispatching.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // ── Auth: verify Bearer token ───────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // ── Auth: verify admin_users row ────────────────────────
    const { data: adminRow } = await supabase
        .from('admin_users')
        .select('role, is_active')
        .eq('id', user.id)
        .eq('is_active', true)
        .maybeSingle();

    if (!adminRow) return res.status(403).json({ error: 'Forbidden' });

    // ── Dispatch ────────────────────────────────────────────
    const resource = req.query.resource;

    try {
        switch (resource) {
            case 'dashboard':      return await handleDashboard(req, res);
            case 'users':          return await handleUsers(req, res);
            case 'scans':          return await handleScans(req, res);
            case 'subscriptions':  return await handleSubscriptions(req, res);
            case 'ai-usage':       return await handleAiUsage(req, res);
            case 'analytics':      return await handleAnalytics(req, res);
            case 'billing':        return await handleBilling(req, res);
            case 'logs':           return await handleLogs(req, res);
            case 'prompts':        return await handlePrompts(req, res);
            case 'settings':       return await handleSettings(req, res);
            default:
                return res.status(404).json({ error: `Unknown admin resource: ${resource}` });
        }
    } catch (err) {
        console.error(`admin/${resource} error:`, err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// ============================================================
// DASHBOARD
// ============================================================
async function handleDashboard(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const topUsersRange = Math.max(1, Math.min(365, parseInt(req.query.topUsersRange || '30', 10)));
    const userGrowthRange = Math.max(1, Math.min(365, parseInt(req.query.userGrowthRange || '90', 10)));
    const scanVolumeRange = Math.max(1, Math.min(365, parseInt(req.query.scanVolumeRange || '90', 10)));

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [
        { count: totalUsers },
        { count: usersBeforeMonth },
        { count: totalOrgs },
        { count: orgsBeforeMonth },
        { count: totalScans },
        { count: scansThisMonth },
        { count: activeSchedules },
        { count: unreadAlerts },
        { count: failedDiagnoses },
    ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).lt('created_at', startOfMonth),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('organizations').select('*', { count: 'exact', head: true }).is('deleted_at', null).lt('created_at', startOfMonth),
        supabase.from('audit_jobs').select('*', { count: 'exact', head: true }),
        supabase.from('audit_jobs').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
        supabase.from('monitor_schedules').select('*', { count: 'exact', head: true }).eq('is_active', true).is('deleted_at', null),
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('is_read', false),
        supabase.from('audit_jobs').select('*', { count: 'exact', head: true }).eq('diagnosis_status', 'failed'),
    ]);

    const { data: subs } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('status', 'active')
        .is('deleted_at', null);

    const { data: plans } = await supabase
        .from('pricing_plans')
        .select('plan_key, price_monthly_usd');

    const priceMap = new Map((plans || []).map(p => [p.plan_key, p.price_monthly_usd || 0]));
    const activeSubs = (subs || []).length;
    const paidSubs = (subs || []).filter(s => (priceMap.get(s.plan) || 0) > 0).length;
    const freeSubs = activeSubs - paidSubs;
    const mrr = (subs || []).reduce((sum, s) => sum + (priceMap.get(s.plan) || 0), 0) / 100;

    const [recentSignups, recentScans, recentSubs, recentAlerts] = await Promise.all([
        supabase.from('users').select('id, email, full_name, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('audit_jobs').select('id, business_name, status, score, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('subscriptions').select('id, plan, status, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('alerts').select('id, title, severity, created_at').order('created_at', { ascending: false }).limit(10),
    ]);

    const activity = [
        ...(recentSignups.data || []).map(r => ({ type: 'signup', icon: '👤', title: `${r.full_name || r.email} signed up`, created_at: r.created_at })),
        ...(recentScans.data || []).map(r => ({ type: 'scan', icon: '🔍', title: `Scan: ${r.business_name} — ${r.status}${r.score != null ? ` (${r.score}%)` : ''}`, created_at: r.created_at })),
        ...(recentSubs.data || []).map(r => ({ type: 'subscription', icon: '💳', title: `Subscription ${r.status}: ${r.plan}`, created_at: r.created_at })),
        ...(recentAlerts.data || []).map(r => ({ type: 'alert', icon: '🔔', title: `${r.severity}: ${r.title}`, created_at: r.created_at })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

    const topUsersSince = new Date(now.getTime() - topUsersRange * 86400000).toISOString();
    const { data: topScans } = await supabase
        .from('audit_jobs')
        .select('user_id, queries, created_at')
        .gte('created_at', topUsersSince);

    const userAgg = new Map();
    for (const s of topScans || []) {
        if (!s.user_id) continue;
        const cur = userAgg.get(s.user_id) || { scans: 0, queries: 0, last_active: null };
        cur.scans += 1;
        cur.queries += Array.isArray(s.queries) ? s.queries.length : 0;
        if (!cur.last_active || s.created_at > cur.last_active) cur.last_active = s.created_at;
        userAgg.set(s.user_id, cur);
    }

    const topUserIds = [...userAgg.entries()].sort((a, b) => b[1].scans - a[1].scans).slice(0, 5).map(([id]) => id);

    let topUsers = [];
    if (topUserIds.length > 0) {
        const { data: userRows } = await supabase.from('users').select('id, email, full_name').in('id', topUserIds);
        const uMap = new Map((userRows || []).map(u => [u.id, u]));
        topUsers = topUserIds.map(id => {
            const u = uMap.get(id) || {};
            const agg = userAgg.get(id);
            return {
                id,
                email: u.email || '',
                full_name: u.full_name || u.email || 'Unknown',
                scans: agg.scans,
                queries: agg.queries,
                last_active: agg.last_active,
            };
        });
    }

    const userGrowthSince = new Date(now.getTime() - userGrowthRange * 86400000).toISOString();
    const { data: newUsers } = await supabase.from('users').select('created_at').gte('created_at', userGrowthSince);
    const userGrowth = bucketByDay(newUsers || [], 'created_at', userGrowthRange);

    const scanSince = new Date(now.getTime() - scanVolumeRange * 86400000).toISOString();
    const { data: scansInRange } = await supabase.from('audit_jobs').select('created_at').gte('created_at', scanSince);
    const scanVolume = bucketByDay(scansInRange || [], 'created_at', scanVolumeRange);

    const { data: recentScansList } = await supabase
        .from('audit_jobs')
        .select('id, business_name, user_id, queries, score, diagnosis_status, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    const scanUserIds = [...new Set((recentScansList || []).map(s => s.user_id).filter(Boolean))];
    let scanUserMap = new Map();
    if (scanUserIds.length > 0) {
        const { data: uRows } = await supabase.from('users').select('id, email, full_name').in('id', scanUserIds);
        scanUserMap = new Map((uRows || []).map(u => [u.id, u]));
    }

    const formattedScans = (recentScansList || []).map(s => {
        const u = scanUserMap.get(s.user_id) || {};
        return {
            id: s.id,
            business_name: s.business_name,
            user_email: u.email || '—',
            user_name: u.full_name || u.email || '—',
            queries: Array.isArray(s.queries) ? s.queries.length : 0,
            score: s.score,
            diagnosis_status: s.diagnosis_status,
            status: s.status,
            created_at: s.created_at,
        };
    });

    const userGrowthPct = usersBeforeMonth > 0
        ? Math.round(((totalUsers - usersBeforeMonth) / usersBeforeMonth) * 100)
        : (totalUsers > 0 ? 100 : 0);
    const orgGrowthPct = orgsBeforeMonth > 0
        ? Math.round(((totalOrgs - orgsBeforeMonth) / orgsBeforeMonth) * 100)
        : (totalOrgs > 0 ? 100 : 0);

    return res.status(200).json({
        stats: {
            totalUsers: totalUsers || 0,
            totalOrgs: totalOrgs || 0,
            activeSubs, paidSubs, freeSubs,
            mrr: Math.round(mrr * 100) / 100,
            userGrowthPct, orgGrowthPct,
        },
        usage: {
            totalScans: totalScans || 0,
            scansThisMonth: scansThisMonth || 0,
            activeSchedules: activeSchedules || 0,
            unreadAlerts: unreadAlerts || 0,
            failedDiagnoses: failedDiagnoses || 0,
        },
        activity,
        topUsers,
        userGrowth,
        scanVolume,
        recentScans: formattedScans,
    });
}

// ============================================================
// USERS
// ============================================================
async function handleUsers(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '20', 10)));
    const search = (req.query.search || '').trim();
    const planFilter = req.query.plan && req.query.plan !== 'all' ? req.query.plan : null;
    const roleFilter = req.query.role && req.query.role !== 'all' ? req.query.role : null;

    let adminQuery = supabase
        .from('admin_users')
        .select('id, email, full_name, role, is_active, created_at')
        .order('created_at', { ascending: false });

    if (search) adminQuery = adminQuery.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);

    const { data: admins, error: adminErr } = await adminQuery;
    if (adminErr) throw adminErr;

    let userQuery = supabase
        .from('users')
        .select('id, email, full_name, plan_type, created_at')
        .order('created_at', { ascending: false });

    if (search) userQuery = userQuery.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    if (planFilter) userQuery = userQuery.eq('plan_type', planFilter);

    const { data: userRows, error: userErr } = await userQuery;
    if (userErr) throw userErr;

    const userIds = (userRows || []).map(u => u.id);

    const [memberships, subs, scans] = await Promise.all([
        userIds.length
            ? supabase.from('organization_members').select('user_id, role, organization_id').in('user_id', userIds).eq('is_active', true).is('deleted_at', null)
            : { data: [] },
        supabase.from('subscriptions').select('organization_id, plan').in('status', ['active', 'trialing']).is('deleted_at', null),
        userIds.length ? supabase.from('audit_jobs').select('user_id').in('user_id', userIds) : { data: [] },
    ]);

    const roleByUser = new Map();
    const orgsByUser = new Map();
    for (const m of memberships.data || []) {
        if (!roleByUser.has(m.user_id) || m.role === 'owner') roleByUser.set(m.user_id, m.role);
        if (!orgsByUser.has(m.user_id)) orgsByUser.set(m.user_id, []);
        orgsByUser.get(m.user_id).push(m.organization_id);
    }

    const planByOrg = new Map();
    for (const s of subs.data || []) planByOrg.set(s.organization_id, s.plan);

    const scanCountByUser = new Map();
    for (const s of scans.data || []) scanCountByUser.set(s.user_id, (scanCountByUser.get(s.user_id) || 0) + 1);

    const adminList = (admins || []).map(a => ({
        id: a.id, email: a.email, full_name: a.full_name,
        plan: 'platform_admin', role: a.role,
        status: a.is_active ? 'active' : 'inactive',
        scan_count: 0, source: 'admin', created_at: a.created_at,
    }));

    const customerList = (userRows || []).map(u => {
        const orgIds = orgsByUser.get(u.id) || [];
        const plan = orgIds.map(id => planByOrg.get(id)).find(Boolean) || u.plan_type || 'starter';
        const role = roleByUser.get(u.id) || 'member';
        return {
            id: u.id, email: u.email, full_name: u.full_name,
            plan, role, status: 'active',
            scan_count: scanCountByUser.get(u.id) || 0,
            source: 'customer', created_at: u.created_at,
        };
    });

    let merged = [...adminList, ...customerList].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (roleFilter) merged = merged.filter(u => u.role === roleFilter);

    const total = merged.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;

    return res.status(200).json({
        users: merged.slice(start, start + limit),
        total, page, totalPages,
    });
}

// ============================================================
// SCANS
// ============================================================
async function handleScans(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
    const search = (req.query.search || '').trim();
    const statusFilter = req.query.status && req.query.status !== 'all' ? req.query.status : null;
    const diagnosisFilter = req.query.diagnosis && req.query.diagnosis !== 'all' ? req.query.diagnosis : null;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
        .from('audit_jobs')
        .select('id, business_name, website, user_id, queries, competitors, platforms, score, status, diagnosis_status, created_at, completed_at', { count: 'exact' });

    if (search) query = query.or(`business_name.ilike.%${search}%,website.ilike.%${search}%`);
    if (statusFilter) query = query.eq('status', statusFilter);
    if (diagnosisFilter) query = query.eq('diagnosis_status', diagnosisFilter);

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data: scans, error: scanErr, count } = await query;
    if (scanErr) throw scanErr;

    const userIds = [...new Set((scans || []).map(s => s.user_id).filter(Boolean))];
    let userMap = new Map();
    if (userIds.length) {
        const { data: userRows } = await supabase.from('users').select('id, email, full_name').in('id', userIds);
        userMap = new Map((userRows || []).map(u => [u.id, u]));
    }

    const formatted = (scans || []).map(s => {
        const u = userMap.get(s.user_id) || {};
        return {
            id: s.id,
            business_name: s.business_name,
            website: s.website,
            user_id: s.user_id,
            user_email: u.email || '—',
            user_name: u.full_name || u.email || '—',
            queries: Array.isArray(s.queries) ? s.queries.length : 0,
            competitors: Array.isArray(s.competitors) ? s.competitors.length : 0,
            platforms: Array.isArray(s.platforms) ? s.platforms : [],
            score: s.score,
            status: s.status,
            diagnosis_status: s.diagnosis_status,
            created_at: s.created_at,
            completed_at: s.completed_at,
        };
    });

    return res.status(200).json({
        scans: formatted,
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit) || 1,
    });
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================
async function handleSubscriptions(req, res) {
    if (req.method === 'GET') return getSubscriptions(req, res);
    if (req.method === 'POST') return postSubscriptions(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function getSubscriptions(req, res) {
    const search = (req.query.search || '').trim();
    const planFilter = req.query.plan && req.query.plan !== 'all' ? req.query.plan : null;
    const statusFilter = req.query.status && req.query.status !== 'all' ? req.query.status : null;

    let query = supabase
        .from('subscriptions')
        .select('id, organization_id, plan, status, current_period_start, current_period_end, canceled_at, ended_at, cancel_at_period_end, billing_email, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (planFilter) query = query.eq('plan', planFilter);
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data: subs, error: subsErr } = await query;
    if (subsErr) throw subsErr;

    const orgIds = [...new Set((subs || []).map(s => s.organization_id).filter(Boolean))];

    const [orgsRes, plansRes, membersRes] = await Promise.all([
        orgIds.length ? supabase.from('organizations').select('id, name, slug, website').in('id', orgIds) : { data: [] },
        supabase.from('pricing_plans').select('plan_key, name, price_monthly_usd'),
        orgIds.length ? supabase.from('organization_members').select('organization_id, user_id, role').in('organization_id', orgIds).eq('is_active', true).is('deleted_at', null) : { data: [] },
    ]);

    const orgMap = new Map((orgsRes.data || []).map(o => [o.id, o]));
    const planMap = new Map((plansRes.data || []).map(p => [p.plan_key, p]));

    const userPerOrg = new Map();
    for (const m of membersRes.data || []) {
        const existing = userPerOrg.get(m.organization_id);
        const rank = { owner: 0, admin: 1, member: 2, viewer: 3 };
        if (!existing || rank[m.role] < rank[existing.role]) userPerOrg.set(m.organization_id, { user_id: m.user_id, role: m.role });
    }

    const ownerIds = [...new Set([...userPerOrg.values()].map(v => v.user_id))];
    let userMap = new Map();
    if (ownerIds.length) {
        const { data: userRows } = await supabase.from('users').select('id, email, full_name').in('id', ownerIds);
        userMap = new Map((userRows || []).map(u => [u.id, u]));
    }

    let subscriptions = (subs || []).map(s => {
        const org = orgMap.get(s.organization_id) || {};
        const plan = planMap.get(s.plan) || {};
        const ownerEntry = userPerOrg.get(s.organization_id);
        const owner = ownerEntry ? userMap.get(ownerEntry.user_id) : null;
        return {
            id: s.id,
            organization_id: s.organization_id,
            org_name: org.name || '—',
            org_slug: org.slug || '',
            org_website: org.website || '',
            user_email: owner?.email || s.billing_email || '—',
            user_name: owner?.full_name || owner?.email || s.billing_email || '—',
            plan: s.plan,
            plan_name: plan.name || s.plan,
            price_monthly_usd: plan.price_monthly_usd || 0,
            status: s.status,
            current_period_start: s.current_period_start,
            current_period_end: s.current_period_end,
            cancel_at_period_end: s.cancel_at_period_end,
            canceled_at: s.canceled_at,
            ended_at: s.ended_at,
            created_at: s.created_at,
        };
    });

    if (search) {
        const s = search.toLowerCase();
        subscriptions = subscriptions.filter(sub =>
            sub.org_name.toLowerCase().includes(s) ||
            sub.user_email.toLowerCase().includes(s) ||
            sub.user_name.toLowerCase().includes(s)
        );
    }

    const stats = {
        active: subscriptions.filter(s => s.status === 'active').length,
        trial: subscriptions.filter(s => s.status === 'trialing').length,
        cancelled: subscriptions.filter(s => s.status === 'canceled').length,
        expired: subscriptions.filter(s => s.ended_at || (s.status !== 'active' && s.current_period_end && new Date(s.current_period_end) < new Date())).length,
    };

    const mrr = subscriptions
        .filter(s => s.status === 'active')
        .reduce((sum, s) => sum + (s.price_monthly_usd || 0), 0) / 100;

    return res.status(200).json({
        subscriptions,
        total: subscriptions.length,
        stats,
        mrr: Math.round(mrr * 100) / 100,
    });
}

async function postSubscriptions(req, res) {
    const { action, id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });

    if (action === 'cancel') {
        const { data, error } = await supabase
            .from('subscriptions')
            .update({
                status: 'canceled',
                canceled_at: new Date().toISOString(),
                cancel_at_period_end: true,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return res.status(200).json({ success: true, subscription: data });
    }

    return res.status(400).json({ error: 'Unknown action' });
}

// ============================================================
// AI USAGE
// ============================================================
async function handleAiUsage(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const TAVILY_COST = 0.008;
    const YOU_COST = 0.005;
    const GROQ_COST = 0.001;

    const { data: allScans } = await supabase
        .from('audit_jobs')
        .select('id, organization_id, queries, diagnosis_status, status, created_at, completed_at');

    const totalScans = (allScans || []).length;
    const totalQueries = (allScans || []).reduce((sum, s) =>
        sum + (Array.isArray(s.queries) ? s.queries.length : 0), 0);

    const tavilyCalls = totalQueries;
    const youCalls = totalQueries;
    const groqRuns = (allScans || []).filter(s => s.diagnosis_status === 'complete').length;
    const groqTokens = groqRuns * 5000;

    const monthScans = (allScans || []).filter(s => s.created_at >= startOfMonth);
    const monthQueries = monthScans.reduce((sum, s) =>
        sum + (Array.isArray(s.queries) ? s.queries.length : 0), 0);
    const monthGroqRuns = monthScans.filter(s => s.diagnosis_status === 'complete').length;

    const costThisMonth =
        monthQueries * TAVILY_COST +
        monthQueries * YOU_COST +
        monthGroqRuns * GROQ_COST;

    const totalCalls = tavilyCalls + youCalls + groqRuns || 1;
    const providerUsage = {
        tavily: Math.round((tavilyCalls / totalCalls) * 100),
        you: Math.round((youCalls / totalCalls) * 100),
        groq: Math.round((groqRuns / totalCalls) * 100),
    };

    const queueWaiting = (allScans || []).filter(s => s.status === 'pending').length;
    const queueProcessing = (allScans || []).filter(s =>
        s.status === 'scanning' || s.diagnosis_status === 'running').length;
    const queueCompletedToday = (allScans || []).filter(s =>
        s.status === 'complete' && s.completed_at && s.completed_at >= startOfDay).length;

    const orgAgg = new Map();
    for (const s of allScans || []) {
        if (!s.organization_id) continue;
        const cur = orgAgg.get(s.organization_id) || { scans: 0, queries: 0, groqRuns: 0 };
        cur.scans += 1;
        cur.queries += Array.isArray(s.queries) ? s.queries.length : 0;
        if (s.diagnosis_status === 'complete') cur.groqRuns += 1;
        orgAgg.set(s.organization_id, cur);
    }

    const orgIds = [...orgAgg.keys()];
    let orgMap = new Map();
    if (orgIds.length > 0) {
        const { data: orgs } = await supabase
            .from('organizations')
            .select('id, name, slug')
            .in('id', orgIds);
        orgMap = new Map((orgs || []).map(o => [o.id, o]));
    }

    const usageByOrg = [...orgAgg.entries()].map(([orgId, agg]) => {
        const org = orgMap.get(orgId) || {};
        const cost =
            agg.queries * TAVILY_COST +
            agg.queries * YOU_COST +
            agg.groqRuns * GROQ_COST;
        return {
            organization_id: orgId,
            org_name: org.name || '—',
            org_slug: org.slug || '',
            scans: agg.scans,
            queries: agg.queries,
            tavily_calls: agg.queries,
            you_calls: agg.queries,
            groq_runs: agg.groqRuns,
            estimated_cost: Math.round(cost * 10000) / 10000,
        };
    }).sort((a, b) => b.scans - a.scans);

    return res.status(200).json({
        totals: {
            totalTokens: groqTokens,
            groqTokens,
            tavilyCalls,
            youCalls,
            groqRuns,
            costThisMonth: Math.round(costThisMonth * 100) / 100,
        },
        providerUsage,
        queue: {
            waiting: queueWaiting,
            processing: queueProcessing,
            completedToday: queueCompletedToday,
            avgWait: 0,
        },
        usageByOrg,
    });
}

// ============================================================
// ANALYTICS
// ============================================================
async function handleAnalytics(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const period = req.query.period || '30d';
    const periodDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 }[period] || 30;

    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 86400000).toISOString();
    const prevPeriodStart = new Date(now.getTime() - periodDays * 2 * 86400000).toISOString();

    const [
        { count: usersThisPeriod },
        { count: usersPrevPeriod },
        { count: totalUsers },
    ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', periodStart),
        supabase.from('users').select('*', { count: 'exact', head: true })
            .gte('created_at', prevPeriodStart).lt('created_at', periodStart),
        supabase.from('users').select('*', { count: 'exact', head: true }),
    ]);

    const userGrowthRate = usersPrevPeriod > 0
        ? Math.round(((usersThisPeriod - usersPrevPeriod) / usersPrevPeriod) * 100)
        : (usersThisPeriod > 0 ? 100 : 0);

    const { data: plans } = await supabase
        .from('pricing_plans')
        .select('plan_key, price_monthly_usd');

    const priceMap = new Map((plans || []).map(p => [p.plan_key, p.price_monthly_usd || 0]));

    const { data: subsThisPeriod } = await supabase
        .from('subscriptions')
        .select('plan, status, created_at, canceled_at')
        .gte('created_at', periodStart)
        .is('deleted_at', null);

    const { data: subsPrevPeriod } = await supabase
        .from('subscriptions')
        .select('plan, status, created_at, canceled_at')
        .gte('created_at', prevPeriodStart)
        .lt('created_at', periodStart)
        .is('deleted_at', null);

    const revenueThis = (subsThisPeriod || [])
        .filter(s => s.status === 'active')
        .reduce((sum, s) => sum + (priceMap.get(s.plan) || 0), 0);
    const revenuePrev = (subsPrevPeriod || [])
        .filter(s => s.status === 'active')
        .reduce((sum, s) => sum + (priceMap.get(s.plan) || 0), 0);

    const revenueGrowthRate = revenuePrev > 0
        ? Math.round(((revenueThis - revenuePrev) / revenuePrev) * 100)
        : (revenueThis > 0 ? 100 : 0);

    const { data: allSubs } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .is('deleted_at', null);

    const activeSubs = (allSubs || []).filter(s => s.status === 'active');
    const paidSubs = activeSubs.filter(s => (priceMap.get(s.plan) || 0) > 0);
    const conversionRate = totalUsers > 0
        ? Math.round((paidSubs.length / totalUsers) * 1000) / 10
        : 0;

    const { data: canceledInPeriod } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('status', 'canceled')
        .gte('canceled_at', periodStart)
        .is('deleted_at', null);

    const activeAtPeriodStart = activeSubs.length + (canceledInPeriod || []).length;
    const churnRate = activeAtPeriodStart > 0
        ? Math.round(((canceledInPeriod || []).length / activeAtPeriodStart) * 1000) / 10
        : 0;

    const breakdown = {
        starter: 0,
        pro_agency: 0,
        growth: 0,
        enterprise: 0,
    };
    for (const s of activeSubs) {
        if (breakdown[s.plan] !== undefined) breakdown[s.plan] += 1;
    }

    const maxBreakdown = Math.max(...Object.values(breakdown), 1);

    return res.status(200).json({
        period,
        userGrowthRate,
        revenueGrowthRate,
        conversionRate,
        churnRate,
        breakdown,
        breakdownMax: maxBreakdown,
        totals: {
            usersThisPeriod,
            usersPrevPeriod,
            totalUsers,
            revenueThis: Math.round(revenueThis) / 100,
            revenuePrev: Math.round(revenuePrev) / 100,
            activeSubs: activeSubs.length,
            paidSubs: paidSubs.length,
            canceledInPeriod: (canceledInPeriod || []).length,
        },
    });
}

// ============================================================
// BILLING
// ============================================================
async function handleBilling(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const search = (req.query.search || '').trim();
    const statusFilter = req.query.status && req.query.status !== 'all' ? req.query.status : null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    let query = supabase
        .from('invoices')
        .select('id, organization_id, subscription_id, invoice_number, amount_due, amount_paid, amount_remaining, currency, status, invoice_url, pdf_url, due_date, paid_at, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

    if (statusFilter) query = query.eq('status', statusFilter);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59Z');

    const { data: invoices, error: invErr } = await query;
    if (invErr) throw invErr;

    const orgIds = [...new Set((invoices || []).map(i => i.organization_id).filter(Boolean))];

    const [orgsRes, membersRes] = await Promise.all([
        orgIds.length ? supabase.from('organizations').select('id, name, slug').in('id', orgIds) : { data: [] },
        orgIds.length
            ? supabase.from('organization_members')
                .select('organization_id, user_id, role')
                .in('organization_id', orgIds)
                .eq('is_active', true)
                .is('deleted_at', null)
            : { data: [] },
    ]);

    const orgMap = new Map((orgsRes.data || []).map(o => [o.id, o]));

    const userPerOrg = new Map();
    for (const m of membersRes.data || []) {
        const existing = userPerOrg.get(m.organization_id);
        const rank = { owner: 0, admin: 1, member: 2, viewer: 3 };
        if (!existing || rank[m.role] < rank[existing.role]) {
            userPerOrg.set(m.organization_id, { user_id: m.user_id, role: m.role });
        }
    }

    const ownerIds = [...new Set([...userPerOrg.values()].map(v => v.user_id))];
    let userMap = new Map();
    if (ownerIds.length) {
        const { data: userRows } = await supabase
            .from('users')
            .select('id, email, full_name')
            .in('id', ownerIds);
        userMap = new Map((userRows || []).map(u => [u.id, u]));
    }

    let formatted = (invoices || []).map(i => {
        const org = orgMap.get(i.organization_id) || {};
        const ownerEntry = userPerOrg.get(i.organization_id);
        const owner = ownerEntry ? userMap.get(ownerEntry.user_id) : null;
        return {
            id: i.id,
            invoice_number: i.invoice_number || i.id.slice(0, 8),
            org_name: org.name || '—',
            user_email: owner?.email || '—',
            user_name: owner?.full_name || owner?.email || '—',
            amount_due: i.amount_due || 0,
            amount_paid: i.amount_paid || 0,
            amount_remaining: i.amount_remaining || 0,
            currency: (i.currency || 'usd').toUpperCase(),
            status: i.status,
            invoice_url: i.invoice_url,
            pdf_url: i.pdf_url,
            due_date: i.due_date,
            paid_at: i.paid_at,
            created_at: i.created_at,
        };
    });

    if (search) {
        const s = search.toLowerCase();
        formatted = formatted.filter(inv =>
            String(inv.invoice_number).toLowerCase().includes(s) ||
            inv.org_name.toLowerCase().includes(s) ||
            inv.user_email.toLowerCase().includes(s) ||
            inv.user_name.toLowerCase().includes(s)
        );
    }

    const totalRevenueCents = formatted.reduce((sum, i) => sum + (i.amount_paid || 0), 0);
    const monthRevenueCents = formatted
        .filter(i => i.paid_at && i.paid_at >= startOfMonth)
        .reduce((sum, i) => sum + (i.amount_paid || 0), 0);

    const { data: refundTx } = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('transaction_type', 'refund')
        .eq('status', 'completed');

    const totalRefundsCents = (refundTx || []).reduce((sum, t) => sum + (t.total_amount || 0), 0);

    return res.status(200).json({
        invoices: formatted,
        total: formatted.length,
        stats: {
            totalRevenue: Math.round(totalRevenueCents) / 100,
            monthlyRevenue: Math.round(monthRevenueCents) / 100,
            totalInvoices: formatted.length,
            totalRefunds: Math.round(totalRefundsCents) / 100,
        },
    });
}

// ============================================================
// LOGS — unified event timeline
// ============================================================
async function handleLogs(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
    const search = (req.query.search || '').trim().toLowerCase();
    const typeFilter = req.query.type && req.query.type !== 'all' ? req.query.type : null;
    const severityFilter = req.query.severity && req.query.severity !== 'all' ? req.query.severity : null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;

    const SOURCE_LIMIT = 200;

    const [
        { data: auditRows },
        { data: userRows },
        { data: scanRows },
        { data: subRows },
        { data: alertRows },
        { data: txRows },
    ] = await Promise.all([
        supabase.from('audit_logs')
            .select('id, user_id, admin_id, organization_id, action, entity_type, severity, ip_address, created_at')
            .order('created_at', { ascending: false })
            .limit(SOURCE_LIMIT),
        supabase.from('users')
            .select('id, email, full_name, created_at')
            .order('created_at', { ascending: false })
            .limit(SOURCE_LIMIT),
        supabase.from('audit_jobs')
            .select('id, user_id, business_name, status, score, diagnosis_status, created_at, completed_at, diagnosis_completed_at')
            .order('created_at', { ascending: false })
            .limit(SOURCE_LIMIT),
        supabase.from('subscriptions')
            .select('id, organization_id, plan, status, created_at, canceled_at')
            .order('created_at', { ascending: false })
            .limit(SOURCE_LIMIT),
        supabase.from('alerts')
            .select('id, organization_id, title, message, severity, created_at')
            .order('created_at', { ascending: false })
            .limit(SOURCE_LIMIT),
        supabase.from('transactions')
            .select('id, user_id, organization_id, transaction_type, total_amount, currency, status, created_at')
            .order('created_at', { ascending: false })
            .limit(SOURCE_LIMIT),
    ]);

    const userIds = new Set();
    for (const u of userRows || []) userIds.add(u.id);
    for (const s of scanRows || []) if (s.user_id) userIds.add(s.user_id);
    for (const t of txRows || []) if (t.user_id) userIds.add(t.user_id);
    for (const a of auditRows || []) if (a.user_id) userIds.add(a.user_id);

    const { data: userLookup } = userIds.size > 0
        ? await supabase.from('users').select('id, email, full_name').in('id', [...userIds])
        : { data: [] };

    const userMap = new Map((userLookup || []).map(u => [u.id, u]));

    const events = [];

    for (const a of auditRows || []) {
        const u = userMap.get(a.user_id) || {};
        events.push({
            timestamp: a.created_at,
            type: a.entity_type || 'system',
            severity: a.severity || 'info',
            user_email: u.email || '—',
            message: a.action,
            ip_address: a.ip_address || '—',
        });
    }

    for (const u of userRows || []) {
        events.push({
            timestamp: u.created_at,
            type: 'user',
            severity: 'info',
            user_email: u.email || '—',
            message: `${u.full_name || u.email} signed up`,
            ip_address: '—',
        });
    }

    for (const s of scanRows || []) {
        const u = userMap.get(s.user_id) || {};
        events.push({
            timestamp: s.created_at,
            type: 'scan',
            severity: 'info',
            user_email: u.email || '—',
            message: `Scan created: ${s.business_name}`,
            ip_address: '—',
        });

        if (s.completed_at) {
            events.push({
                timestamp: s.completed_at,
                type: 'scan',
                severity: s.status === 'failed' ? 'error' : 'info',
                user_email: u.email || '—',
                message: `Scan ${s.status}: ${s.business_name}${s.score != null ? ` (score ${s.score}%)` : ''}`,
                ip_address: '—',
            });
        }

        if (s.diagnosis_status === 'failed') {
            events.push({
                timestamp: s.diagnosis_completed_at || s.completed_at || s.created_at,
                type: 'error',
                severity: 'error',
                user_email: u.email || '—',
                message: `DIAGNOSE failed for ${s.business_name}`,
                ip_address: '—',
            });
        }
    }

    for (const s of subRows || []) {
        events.push({
            timestamp: s.created_at,
            type: 'system',
            severity: 'info',
            user_email: '—',
            message: `Subscription created: ${s.plan} (${s.status})`,
            ip_address: '—',
        });

        if (s.canceled_at) {
            events.push({
                timestamp: s.canceled_at,
                type: 'system',
                severity: 'warning',
                user_email: '—',
                message: `Subscription canceled: ${s.plan}`,
                ip_address: '—',
            });
        }
    }

    for (const a of alertRows || []) {
        events.push({
            timestamp: a.created_at,
            type: 'system',
            severity: a.severity === 'critical' ? 'error' : a.severity === 'warning' ? 'warning' : 'info',
            user_email: '—',
            message: `Alert: ${a.title}`,
            ip_address: '—',
        });
    }

    for (const t of txRows || []) {
        const u = userMap.get(t.user_id) || {};
        events.push({
            timestamp: t.created_at,
            type: 'payment',
            severity: t.status === 'failed' ? 'error' : 'info',
            user_email: u.email || '—',
            message: `${t.transaction_type}: ${(t.total_amount || 0) / 100} ${t.currency || 'USD'}`,
            ip_address: '—',
        });
    }

    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let filtered = events;

    if (typeFilter) filtered = filtered.filter(e => e.type === typeFilter);
    if (severityFilter) filtered = filtered.filter(e => e.severity === severityFilter);
    if (dateFrom) {
        const from = new Date(dateFrom).getTime();
        filtered = filtered.filter(e => new Date(e.timestamp).getTime() >= from);
    }
    if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59Z').getTime();
        filtered = filtered.filter(e => new Date(e.timestamp).getTime() <= to);
    }
    if (search) {
        filtered = filtered.filter(e =>
            (e.message || '').toLowerCase().includes(search) ||
            (e.user_email || '').toLowerCase().includes(search)
        );
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return res.status(200).json({
        logs: paginated,
        total,
        page,
        totalPages,
    });
}

// ============================================================
// PROMPTS — CRUD for prompt_templates
// ============================================================
async function handlePrompts(req, res) {
    if (req.method === 'GET') return getPrompts(req, res);
    if (req.method === 'POST') return createPrompt(req, res);
    if (req.method === 'PUT') return updatePrompt(req, res);
    if (req.method === 'DELETE') return deletePrompt(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function getPrompts(req, res) {
    const id = req.query.id;
    const categoryFilter = req.query.category && req.query.category !== 'all' ? req.query.category : null;
    const search = (req.query.search || '').trim();

    if (id) {
        const { data: prompt, error } = await supabase
            .from('prompt_templates')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw error;
        if (!prompt) return res.status(404).json({ error: 'Prompt not found' });
        return res.status(200).json({ prompt });
    }

    let query = supabase
        .from('prompt_templates')
        .select('id, name, category, module, version, status, created_at, updated_at')
        .order('name', { ascending: true });

    if (categoryFilter) {
        query = query.or(`category.eq.${categoryFilter},module.eq.${categoryFilter}`);
    }
    if (search) {
        query = query.or(`name.ilike.%${search}%,module.ilike.%${search}%`);
    }

    const { data: prompts, error } = await query;
    if (error) throw error;

    return res.status(200).json({
        prompts: prompts || [],
        total: (prompts || []).length,
    });
}

async function createPrompt(req, res) {
    const { name, category, module, template, status } = req.body || {};

    if (!name || !template) {
        return res.status(400).json({ error: 'name and template are required' });
    }

    const validCategories = ['social', 'authority', 'business'];
    const cat = validCategories.includes(category) ? category : 'authority';

    const validStatuses = ['active', 'draft', 'disabled'];
    const st = validStatuses.includes(status) ? status : 'active';

    const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
            name,
            category: cat,
            module: module || 'diagnose',
            template,
            version: 1,
            status: st,
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'A prompt with this name already exists' });
        }
        throw error;
    }

    return res.status(200).json({ success: true, prompt: data });
}

async function updatePrompt(req, res) {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { name, category, module, template, status } = req.body || {};

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (category !== undefined) {
        const validCategories = ['social', 'authority', 'business'];
        updates.category = validCategories.includes(category) ? category : 'authority';
    }
    if (module !== undefined) updates.module = module;
    if (template !== undefined) updates.template = template;
    if (status !== undefined) {
        const validStatuses = ['active', 'draft', 'disabled'];
        updates.status = validStatuses.includes(status) ? status : 'active';
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('prompt_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Prompt not found' });

    return res.status(200).json({ success: true, prompt: data });
}

async function deletePrompt(req, res) {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await supabase
        .from('prompt_templates')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return res.status(200).json({ success: true });
}

// ============================================================
// SETTINGS — read + write system_settings
// ============================================================
async function handleSettings(req, res) {
    if (req.method === 'GET') return getSettings(req, res);
    if (req.method === 'PUT' || req.method === 'POST') return updateSettings(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
}

async function getSettings(req, res) {
    const { data: rows, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value, category, description, updated_at');

    if (error) throw error;

    const settings = {};
    for (const r of rows || []) {
        settings[r.setting_key] = r.setting_value;
    }

    return res.status(200).json({ settings, total: (rows || []).length });
}

async function updateSettings(req, res) {
    const body = req.body || {};
    const updates = body.settings || body;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
        return res.status(400).json({ error: 'settings object required' });
    }

    const ALLOWED_KEYS = new Set([
        'site_name',
        'contact_email',
        'support_email',
        'ai_default_provider',
        'ai_max_tokens',
        'ai_temperature',
        'ai_parallel_versions',
        'rate_limit_free',
        'rate_limit_professional',
        'rate_limit_growth',
        'rate_limit_enterprise',
        'feature_find',
        'feature_diagnose',
        'feature_optimize',
        'feature_monitor',
        'maintenance_mode',
        'maintenance_message',
        'max_upload_size',
    ]);

    const now = new Date().toISOString();
    const written = [];
    const skipped = [];

    for (const [key, value] of Object.entries(updates)) {
        if (!ALLOWED_KEYS.has(key)) {
            skipped.push(key);
            continue;
        }

        const { error } = await supabase
            .from('system_settings')
            .upsert(
                {
                    setting_key: key,
                    setting_value: value,
                    category: categorizeSetting(key),
                    updated_at: now,
                },
                { onConflict: 'setting_key' }
            );

        if (error) {
            console.error(`Failed to update ${key}:`, error);
        } else {
            written.push(key);
        }
    }

    return res.status(200).json({
        success: true,
        written,
        skipped,
    });
}

function categorizeSetting(key) {
    if (key.startsWith('feature_')) return 'features';
    if (key.startsWith('rate_limit_')) return 'rate_limits';
    if (key.startsWith('ai_')) return 'ai';
    if (key.startsWith('maintenance_')) return 'maintenance';
    return 'general';
}

// ============================================================
// SHARED HELPERS
// ============================================================
function bucketByDay(rows, field, days) {
    const buckets = new Map();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
    }

    for (const row of rows) {
        if (!row[field]) continue;
        const key = new Date(row[field]).toISOString().slice(0, 10);
        if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    }

    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}
