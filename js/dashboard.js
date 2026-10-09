// ============================================================
// TAB SWITCHING
// ============================================================
function activateTab(name) {
  document.querySelectorAll(".sidebar-nav a[data-tab]").forEach((a) =>
    a.classList.toggle("active", a.dataset.tab === name)
  );
  document.querySelectorAll(".tab-content").forEach((s) =>
    s.classList.toggle("active", s.dataset.tab === name)
  );
  history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll(".sidebar-nav a[data-tab]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    activateTab(link.dataset.tab);
  });
});

// Buttons that jump between tabs (e.g. "Upload document" on Overview)
document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    activateTab(el.dataset.goto);
  });
});

// Restore tab from URL hash on load
const initialTab = (location.hash || "#overview").slice(1);
if (document.querySelector(`.tab-content[data-tab="${initialTab}"]`)) {
  activateTab(initialTab);
}

// ============================================================
// UPLOAD ZONE (stub — wire to Supabase Storage later)
// ============================================================
const uploadZone  = document.getElementById("uploadZone");
const uploadInput = document.getElementById("uploadInput");
const uploadPick  = document.getElementById("uploadPick");
const uploadBtn   = document.getElementById("uploadBtn");

if (uploadPick) uploadPick.addEventListener("click", () => uploadInput.click());
if (uploadBtn)  uploadBtn.addEventListener("click",  () => uploadInput.click());

if (uploadInput) {
  uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file);
  });
}

if (uploadZone) {
  ["dragenter", "dragover"].forEach((ev) =>
    uploadZone.addEventListener(ev, (e) => {
      e.preventDefault();
      uploadZone.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    uploadZone.addEventListener(ev, (e) => {
      e.preventDefault();
      uploadZone.classList.remove("dragging");
    })
  );
  uploadZone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  });
}

function handleUpload(file) {
  if (file.type !== "application/pdf") {
    alert("Only PDF files are supported for now.");
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    alert("File too large — max 50 MB.");
    return;
  }
  // TODO: upload to Supabase Storage, then insert into documents table
  console.log("Ready to upload:", file.name, file.size);
  alert(`Selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)\n\nUpload wiring comes once Supabase is connected.`);
}

// ============================================================
// LINK CREATE PANEL — toggle open/closed
// ============================================================
const toggleCreateLink = document.getElementById("toggleCreateLink");
const createLinkBody   = document.getElementById("createLinkBody");
if (toggleCreateLink && createLinkBody) {
  toggleCreateLink.addEventListener("click", () => {
    const isHidden = createLinkBody.style.display === "none";
    createLinkBody.style.display = isHidden ? "" : "none";
    toggleCreateLink.textContent = isHidden ? "Hide" : "Show";
  });
}

// ============================================================
// LINK TABLE FILTER
// ============================================================
document.querySelectorAll(".filter-tabs").forEach((group) => {
  group.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".filter-btn").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      // TODO: refilter rows in the matching table once data is live
    });
  });
});

// ============================================================
// LOGOUT
// ============================================================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    // TODO: await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

// ============================================================
// SETTINGS — password change stub
// ============================================================
const saveProfile = document.getElementById("saveProfile");
if (saveProfile) {
  saveProfile.addEventListener("click", () => {
    const status = document.getElementById("profileStatus");
    status.textContent = "Saved (not yet persisted — Supabase pending).";
    status.className = "form-status ok";
  });
}

const savePassword = document.getElementById("savePassword");
if (savePassword) {
  savePassword.addEventListener("click", () => {
    const status = document.getElementById("passwordStatus");
    const p1 = document.getElementById("setNewPassword").value;
    const p2 = document.getElementById("setConfirmPassword").value;
    if (p1 !== p2) {
      status.textContent = "Passwords do not match.";
      status.className = "form-status err";
      return;
    }
    status.textContent = "Password change not yet wired.";
    status.className = "form-status";
  });
}

const deleteAccount = document.getElementById("deleteAccount");
if (deleteAccount) {
  deleteAccount.addEventListener("click", () => {
    if (confirm("Delete your account and all data? This cannot be undone.")) {
      alert("Account deletion is not yet wired.");
    }
  });
}

// ============================================================
// ANALYTICS — CSV export stub
// ============================================================
const exportAnalytics = document.getElementById("exportAnalytics");
if (exportAnalytics) {
  exportAnalytics.addEventListener("click", () => {
    alert("CSV export will work once analytics are live.");
  });
}

// ============================================================
// DATA LOADING (stub — replaces with Supabase queries later)
// ============================================================
async function loadDashboard() {
  // TODO (once Supabase schema is live):
  //
  // const { data: docs }      = await supabase.from("documents").select("*");
  // const { data: links }     = await supabase.from("links").select("*");
  // const { data: views }     = await supabase.from("views").select("*");
  //
  // document.getElementById("kpiDocuments").textContent = docs.length;
  // document.getElementById("kpiLinks").textContent     = links.filter(l => !l.is_revoked).length;
  // document.getElementById("kpiViews").textContent     = views.length;
  // document.getElementById("kpiViewers").textContent   =
  //   new Set(views.map(v => v.viewer_email)).size;
  //
  console.log("Dashboard ready — awaiting Supabase wiring.");
}

loadDashboard();
