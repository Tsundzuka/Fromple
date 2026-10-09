/* ============================================================
   TOKENS
   ============================================================ */
:root {
  --primary: #14B8A6;
  --primary-dark: #0D9488;
  --primary-light: #CCFBF1;
  --primary-lightest: #F0FDFA;
  --gray-50: #F9FAFB;
  --gray-100: #F3F4F6;
  --gray-200: #E5E7EB;
  --gray-300: #D1D5DB;
  --gray-400: #9CA3AF;
  --gray-500: #6B7280;
  --gray-600: #4B5563;
  --gray-700: #374151;
  --gray-800: #1F2937;
  --gray-900: #111827;
  --sidebar-width: 220px;
  --radius: 8px;
  --radius-lg: 12px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(20, 184, 166, 0.12);
  --transition: all 0.2s ease;
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;
  --info: #3B82F6;
  --gradient-primary: linear-gradient(135deg, #14B8A6, #0D9488);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  color: var(--gray-800);
  background: var(--gray-50);
}

/* ============================================================
   DASHBOARD LAYOUT
   ============================================================ */
.dashboard-wrapper {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  background: #fff;
  border-right: 1px solid var(--gray-200);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 18px 20px;
  border-bottom: 1px solid var(--gray-100);
}

.brand-logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
  flex-shrink: 0;
}

.brand-text {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--gray-800);
}

.sidebar-nav {
  flex: 1;
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.sidebar-nav a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius);
  color: var(--gray-600);
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  transition: var(--transition);
}

.sidebar-nav a:hover { background: var(--gray-100); color: var(--gray-800); }
.sidebar-nav a.active { background: var(--primary-light); color: var(--primary-dark); }

.nav-icon { width: 17px; height: 17px; flex-shrink: 0; }

.sidebar-footer {
  padding: 14px 16px 16px 16px;
  border-top: 1px solid var(--gray-100);
  flex-shrink: 0;
}

.sidebar-usage-summary {
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--gray-50);
  border-radius: var(--radius);
  border: 1px solid var(--gray-200);
}

.sidebar-usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.sidebar-usage-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--gray-600);
}

.sidebar-usage-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--gray-800);
  font-family: 'JetBrains Mono', monospace;
}

.sidebar-usage-bar {
  width: 100%;
  height: 4px;
  background: var(--gray-200);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 5px;
}

.sidebar-usage-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-dark));
  border-radius: 4px;
  transition: width 0.6s ease;
}

.sidebar-usage-details {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--gray-400);
  font-family: 'JetBrains Mono', monospace;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.user-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gray-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-plan {
  font-size: 10.5px;
  color: var(--gray-500);
}

.logout-btn {
  background: transparent;
  border: 1px solid var(--gray-200);
  color: var(--gray-500);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: var(--transition);
}
.logout-btn:hover {
  color: var(--danger);
  border-color: var(--danger);
}

/* ============================================================
   MAIN CONTENT
   ============================================================ */
.main-content {
  padding: 20px 24px 40px;
  min-width: 0;
  background: var(--gray-50);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--gray-900);
  letter-spacing: -0.01em;
  margin: 0;
}

.page-subtitle {
  color: var(--gray-500);
  font-size: 13px;
  margin-top: 3px;
}

.dashboard-header-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* ============================================================
   CARDS
   ============================================================ */
.card {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  box-shadow: var(--shadow);
  margin-bottom: 16px;
  min-width: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 10px;
  flex-wrap: wrap;
}

.card-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-800);
  margin: 0;
  display: flex;
  align-items: center;
}

.card-meta {
  font-size: 11.5px;
  color: var(--gray-400);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 500;
}

.card-link {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--primary);
  text-decoration: none;
  transition: var(--transition);
}
.card-link:hover {
  color: var(--primary-dark);
  text-decoration: underline;
}

/* ============================================================
   STATS GRID
   ============================================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: #fff;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-lg);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--shadow);
  transition: var(--transition);
  min-width: 0;
}
.stat-card:hover { border-color: var(--primary); box-shadow: var(--shadow-md); }

.stat-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-icon.blue   { background: #F0FDFA; }
.stat-icon.green  { background: #D1FAE5; }
.stat-icon.orange { background: #FEF3C7; }
.stat-icon.purple { background: #EDE9FE; }

.stat-content { display: flex; flex-direction: column; min-width: 0; }

.stat-value {
  font-size: 19px;
  font-weight: 700;
  color: var(--gray-900);
  line-height: 1.15;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 11.5px;
  color: var(--gray-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ============================================================
   TWO-COLUMN GRID
   ============================================================ */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

/* ============================================================
   FORMS
   ============================================================ */
.form-row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 1.4fr;
  gap: 12px;
  margin-bottom: 14px;
}

.form-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.form-field-sm { max-width: 110px; }

.form-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--gray-600);
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.form-input {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--gray-300);
  border-radius: var(--radius);
  font-size: 13px;
  font-family: inherit;
  color: var(--gray-800);
  background: #fff;
  transition: var(--transition);
  min-width: 0;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.1);
}

.form-input.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.form-status {
  font-size: 12.5px;
  color: var(--gray-500);
  flex: 1;
  text-align: right;
}
.form-status.ok  { color: var(--success); }
.form-status.err { color: var(--danger); }

/* ============================================================
   BUTTONS
   ============================================================ */
.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: var(--transition);
  border: none;
  white-space: nowrap;
  text-decoration: none;
}

.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.55; cursor: wait; }

.btn-secondary { background: var(--gray-100); color: var(--gray-700); }
.btn-secondary:hover { background: var(--gray-200); }

/* ============================================================
   FILTER TABS
   ============================================================ */
.filter-tabs {
  display: inline-flex;
  gap: 5px;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 4px 11px;
  border: 1px solid var(--gray-200);
  border-radius: 20px;
  background: transparent;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--gray-600);
  cursor: pointer;
  transition: var(--transition);
  font-family: inherit;
}

.filter-btn:hover { border-color: var(--primary); color: var(--primary); }
.filter-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }

/* ============================================================
   TABLES
   ============================================================ */
.table-wrap {
  overflow-y: auto;
  overflow-x: auto;
  margin: 0 -18px;
  padding: 0 18px;
  min-width: 0;
  --table-row-h: 46px;
  --table-head-h: 34px;
  max-height: calc(var(--table-head-h) + 8 * var(--table-row-h));
}

.table-wrap::-webkit-scrollbar { width: 8px; height: 8px; }
.table-wrap::-webkit-scrollbar-track { background: transparent; }
.table-wrap::-webkit-scrollbar-thumb { background: var(--gray-300); border-radius: 4px; }
.table-wrap::-webkit-scrollbar-thumb:hover { background: var(--gray-400); }

.table-wrap thead th {
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 2;
  box-shadow: inset 0 -1px 0 var(--gray-200);
}

.activity-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.activity-table thead th {
  text-align: left;
  padding: 9px 10px;
  font-weight: 600;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gray-500);
  white-space: nowrap;
}

.activity-table tbody tr {
  border-bottom: 1px solid var(--gray-100);
  transition: var(--transition);
}
.activity-table tbody tr:hover { background: var(--gray-50); }
.activity-table tbody tr:last-child { border-bottom: none; }

.activity-table td {
  padding: 10px 10px;
  vertical-align: middle;
  color: var(--gray-700);
}

.empty-row {
  text-align: center;
  color: var(--gray-400);
  font-size: 12.5px;
  padding: 18px 0;
}

.activity-table tbody tr.clickable { cursor: pointer; }

/* ============================================================
   BADGES
   ============================================================ */
.badge {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 12px;
  white-space: nowrap;
}
.badge.success { background: #D1FAE5; color: #065F46; }
.badge.warning { background: #FEF3C7; color: #92400E; }
.badge.info    { background: #DBEAFE; color: #1E40AF; }
.badge.muted   { background: var(--gray-100); color: var(--gray-500); }

/* ============================================================
   STATUS PILLS (links table)
   ============================================================ */
.pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.pill-active    { background: #D1FAE5; color: #065F46; }
.pill-revoked   { background: #FEE2E2; color: #991B1B; }
.pill-expired   { background: var(--gray-100); color: var(--gray-500); }
.pill-scheduled { background: #DBEAFE; color: #1E40AF; }

/* ============================================================
   LIVE DOT
   ============================================================ */
.live-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
  animation: pulse-dot 2s ease-in-out infinite;
  vertical-align: middle;
  margin-left: 6px;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.35; }
}

/* ============================================================
   ACTIVITY FEED (live viewer events)
   ============================================================ */
.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 360px;
  overflow-y: auto;
  margin: 0 -18px;
  padding: 0 18px;
}

.activity-feed::-webkit-scrollbar { width: 6px; }
.activity-feed::-webkit-scrollbar-track { background: transparent; }
.activity-feed::-webkit-scrollbar-thumb {
  background: var(--gray-300);
  border-radius: 3px;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--gray-100);
}

.activity-item:last-child { border-bottom: none; }

.activity-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
  margin-top: 6px;
}

.activity-body {
  flex: 1;
  min-width: 0;
}

.activity-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--gray-800);
  margin: 0 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-title strong {
  font-weight: 700;
  color: var(--gray-900);
}

.activity-sub {
  font-size: 11.5px;
  color: var(--gray-500);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--gray-400);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  padding-top: 3px;
}

/* ============================================================
   SETTINGS PAGE
   ============================================================ */
.settings-container {
  max-width: 780px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card { padding: 22px; }

.settings-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--gray-800);
}

.settings-hint {
  font-size: 12.5px;
  color: var(--gray-500);
  margin: 0 0 16px;
}

.settings-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.settings-field { display: flex; flex-direction: column; gap: 4px; }

.settings-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--gray-600);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .dashboard-grid { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 768px) {
  .dashboard-wrapper { grid-template-columns: 1fr; }

  .sidebar {
    position: fixed;
    width: 240px;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
  }
  .sidebar.open { transform: translateX(0); }

  .main-content { padding: 16px; }
  .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .dashboard-grid { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr; }
  .settings-form { grid-template-columns: 1fr; }
  .dashboard-header { flex-direction: column; align-items: flex-start; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
  .stat-card { padding: 10px 12px; gap: 9px; }
  .stat-value { font-size: 16px; }
  .card { padding: 12px 14px; }
  .table-wrap { margin: 0 -14px; padding: 0 14px; }
}
