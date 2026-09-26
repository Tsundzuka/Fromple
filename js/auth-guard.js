// ============================================================
// AUTH GUARD - Protect Pages with Loading Overlay
// ============================================================

import { supabase } from './supabase-client.js';

/**
 * Show the loading overlay
 */
function showLoading() {
    const overlay = document.getElementById('authLoadingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

/**
 * Hide the loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('authLoadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

/**
 * Require user to be logged in
 * Redirects to user login page if not authenticated
 * @param {string} redirectTo - Where to redirect if not logged in
 * @returns {Promise<object|null>} - Session object or null
 */
export async function requireAuth(redirectTo = '/login.html') {
    showLoading();
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        const currentPath = window.location.pathname;
        window.location.href = redirectTo + '?redirect=' + encodeURIComponent(currentPath);
        return null;
    }
    
    hideLoading();
    return session;
}

/**
 * Require user to be an admin
 * Redirects to admin login if not logged in, or dashboard if not admin
 * @param {string} loginRedirect - Where to redirect if not logged in
 * @param {string} nonAdminRedirect - Where to redirect if not admin
 * @returns {Promise<object|null>} - Session object or null
 */
export async function requireAdmin(
    loginRedirect = '/admin/login.html',
    nonAdminRedirect = '/dashboard.html'
) {
    showLoading();
    
    // First check if logged in
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        const currentPath = window.location.pathname;
        window.location.href = loginRedirect + '?redirect=' + encodeURIComponent(currentPath);
        return null;
    }
    
    // Check if user is an admin
    const { data, error: adminError } = await supabase
        .from('admin_users')
        .select('role')
        .eq('id', session.user.id)
        .single();
    
    if (adminError || !data) {
        // Not an admin - redirect to dashboard
        window.location.href = nonAdminRedirect;
        return null;
    }
    
    hideLoading();
    return session;
}

/**
 * Check auth status without redirecting
 * @returns {Promise<{session: object|null, isAdmin: boolean}>}
 */
export async function checkAuthStatus() {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
        return { session: null, isAdmin: false };
    }
    
    const { data, error: adminError } = await supabase
        .from('admin_users')
        .select('role')
        .eq('id', session.user.id)
        .single();
    
    return {
        session: session,
        isAdmin: !adminError && !!data
    };
}

/**
 * Force hide loading overlay (for error recovery)
 */
export function hideLoadingOverlay() {
    hideLoading();
}
