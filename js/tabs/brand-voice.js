// ============================================================
// tabs/brand-voice.js - Brand Voice Tab
// ============================================================
// Handles the Brand Voice tab: loading and saving tone, keywords, and samples.

let supabase = null;
let user = null;

// ============================================================
// INIT & REFRESH
// ============================================================

export async function init(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔵 Brand Voice tab initialized');

    // Attach event listeners for the UI
    attachEventListeners();

    // Load brand voice data
    await loadBrandVoice();
}

export async function refresh(supabaseClient, dashboardUser) {
    supabase = supabaseClient;
    user = dashboardUser;

    console.log('🔄 Refreshing Brand Voice tab');
    await loadBrandVoice();
}

// ============================================================
// LOAD BRAND VOICE
// ============================================================

export async function loadBrandVoice() {
    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            console.log('Not logged in, using localStorage fallback');
            loadFromLocalStorage();
            return;
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('brand_voice_tone, brand_voice_keywords, brand_voice_samples')
            .eq('user_id', session.user.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No profile found – use defaults
                console.log('No profile found, using defaults');
                loadFromLocalStorage();
            } else {
                console.error('Error loading brand voice:', error);
                loadFromLocalStorage();
            }
            return;
        }

        if (profile) {
            // Update the UI with database data
            updateToneTags(profile.brand_voice_tone || ['Professional']);
            updateKeywords(profile.brand_voice_keywords || ['Content Strategy', 'AI-Powered']);
            updateSamples(profile.brand_voice_samples || []);

            // Also save to localStorage as a cache
            saveToLocalStorage({
                tones: profile.brand_voice_tone || ['Professional'],
                keywords: profile.brand_voice_keywords || ['Content Strategy', 'AI-Powered'],
                samples: profile.brand_voice_samples || []
            });

            console.log('✅ Brand Voice loaded from database');
        } else {
            loadFromLocalStorage();
        }

    } catch (error) {
        console.error('Error loading brand voice:', error);
        loadFromLocalStorage();
    }
}

// ============================================================
// SAVE BRAND VOICE
// ============================================================

export async function saveBrandVoice() {
    try {
        // Collect current UI state
        const activeTags = document.querySelectorAll('.brand-voice-tags .platform-pill.active-tag');
        const selectedTones = Array.from(activeTags).map(tag => tag.textContent.trim());

        const keywordPills = document.querySelectorAll('.brand-voice-keywords .platform-pill:not(.add-keyword-btn)');
        const selectedKeywords = Array.from(keywordPills).map(pill => pill.textContent.trim());

        const sampleTexts = document.querySelectorAll('.brand-voice-sample-text');
        const samples = Array.from(sampleTexts).map(el => el.textContent.trim());

        // Save to database
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            // Fallback to localStorage if not logged in
            saveToLocalStorage({
                tones: selectedTones,
                keywords: selectedKeywords,
                samples: samples
            });
            showToast('Brand Voice saved to local storage (you are not logged in).', 'info');
            return;
        }

        // Check if profile exists
        const { data: existingProfile, error: checkError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

        let error;
        if (existingProfile) {
            // Update existing profile
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    brand_voice_tone: selectedTones,
                    brand_voice_keywords: selectedKeywords,
                    brand_voice_samples: samples,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', session.user.id);
            error = updateError;
        } else {
            // Insert new profile
            const { error: insertError } = await supabase
                .from('profiles')
                .insert({
                    user_id: session.user.id,
                    brand_voice_tone: selectedTones,
                    brand_voice_keywords: selectedKeywords,
                    brand_voice_samples: samples
                });
            error = insertError;
        }

        if (error) {
            console.error('Error saving brand voice:', error);
            showToast('Failed to save Brand Voice: ' + error.message, 'error');
            return;
        }

        // Also save to localStorage as cache
        saveToLocalStorage({
            tones: selectedTones,
            keywords: selectedKeywords,
            samples: samples
        });

        showToast('Brand Voice settings saved successfully! ✅', 'success');
        console.log('💾 Brand Voice saved:', { selectedTones, selectedKeywords, samples });

    } catch (error) {
        console.error('Error saving brand voice:', error);
        showToast('Error saving settings. Please try again.', 'error');
    }
}

// ============================================================
// UI UPDATE FUNCTIONS
// ============================================================

function updateToneTags(tones) {
    const tagsContainer = document.querySelector('.brand-voice-tags');
    if (!tagsContainer) return;

    const tags = tagsContainer.querySelectorAll('.platform-pill');
    tags.forEach(tag => {
        const tagText = tag.textContent.trim();
        if (tones.includes(tagText)) {
            tag.classList.add('active-tag');
        } else {
            tag.classList.remove('active-tag');
        }
    });
}

function updateKeywords(keywords) {
    const container = document.querySelector('.brand-voice-keywords');
    if (!container) return;

    // Remove existing keyword pills (keep the "Add Keyword" button)
    const existingPills = container.querySelectorAll('.platform-pill:not(.add-keyword-btn)');
    existingPills.forEach(pill => pill.remove());

    // Add keyword pills
    keywords.forEach(keyword => {
        const pill = document.createElement('span');
        pill.className = 'platform-pill active-tag';
        pill.textContent = keyword;
        pill.setAttribute('data-keyword', keyword);

        // Add remove button
        const removeBtn = document.createElement('span');
        removeBtn.className = 'keyword-remove';
        removeBtn.textContent = '×';
        removeBtn.style.cssText = `
            margin-left: 4px;
            cursor: pointer;
            font-weight: 700;
            color: var(--gray-500);
            font-size: 14px;
        `;
        removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeKeyword(keyword);
        });

        pill.appendChild(removeBtn);
        container.insertBefore(pill, container.querySelector('.add-keyword-btn'));
    });
}

function updateSamples(samples) {
    const container = document.querySelector('.brand-voice-sample');
    if (!container) return;

    // If there are samples, show the first one in the text area
    const sampleTextEl = container.querySelector('.brand-voice-sample-text');
    if (sampleTextEl) {
        if (samples && samples.length > 0) {
            sampleTextEl.textContent = samples[0];
        } else {
            sampleTextEl.textContent = 'Add a sample of your brand\'s writing style.';
        }
    }

    // Update the "Add Sample" button to show count
    const addBtn = container.querySelector('.btn-secondary');
    if (addBtn) {
        const count = samples ? samples.length : 0;
        addBtn.textContent = count > 0 ? `Edit Sample (${count})` : 'Add Sample';
    }
}

// ============================================================
// KEYWORD MANAGEMENT
// ============================================================

function addKeyword(keyword) {
    if (!keyword || keyword.trim() === '') return;

    const container = document.querySelector('.brand-voice-keywords');
    if (!container) return;

    // Check if keyword already exists
    const existing = container.querySelectorAll('.platform-pill');
    for (const pill of existing) {
        if (pill.textContent.trim() === keyword.trim()) {
            showToast('Keyword already exists.', 'warning');
            return;
        }
    }

    const pill = document.createElement('span');
    pill.className = 'platform-pill active-tag';
    pill.textContent = keyword.trim();
    pill.setAttribute('data-keyword', keyword.trim());

    const removeBtn = document.createElement('span');
    removeBtn.className = 'keyword-remove';
    removeBtn.textContent = '×';
    removeBtn.style.cssText = `
        margin-left: 4px;
        cursor: pointer;
        font-weight: 700;
        color: var(--gray-500);
        font-size: 14px;
    `;
    removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeKeyword(keyword.trim());
    });

    pill.appendChild(removeBtn);
    container.insertBefore(pill, container.querySelector('.add-keyword-btn'));

    showToast('Keyword added: ' + keyword.trim(), 'success');
}

function removeKeyword(keyword) {
    const container = document.querySelector('.brand-voice-keywords');
    if (!container) return;

    const pills = container.querySelectorAll('.platform-pill');
    for (const pill of pills) {
        if (pill.textContent.trim() === keyword.trim()) {
            pill.remove();
            showToast('Keyword removed: ' + keyword.trim(), 'info');
            // Auto-save after removal
            saveBrandVoice();
            return;
        }
    }
}

// ============================================================
// SAMPLE MANAGEMENT
// ============================================================

function addSample() {
    const container = document.querySelector('.brand-voice-sample');
    if (!container) return;

    const sampleTextEl = container.querySelector('.brand-voice-sample-text');
    if (!sampleTextEl) return;

    // Open a prompt to enter sample text
    const currentText = sampleTextEl.textContent;
    const newText = prompt('Enter your brand voice sample text:', currentText !== 'Add a sample of your brand\'s writing style.' ? currentText : '');

    if (newText !== null && newText.trim() !== '') {
        sampleTextEl.textContent = newText.trim();
        // Auto-save after adding sample
        saveBrandVoice();
        showToast('Sample updated! ✅', 'success');
    }
}

// ============================================================
// LOCAL STORAGE HELPERS (fallback)
// ============================================================

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('brandVoiceSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            updateToneTags(settings.tones || ['Professional']);
            updateKeywords(settings.keywords || ['Content Strategy', 'AI-Powered']);
            updateSamples(settings.samples || []);
            console.log('📂 Brand Voice loaded from localStorage');
            return;
        }
    } catch (e) {
        console.log('No saved brand voice settings found.');
    }

    // Default values if nothing is saved
    updateToneTags(['Professional']);
    updateKeywords(['Content Strategy', 'AI-Powered']);
    updateSamples([]);
}

function saveToLocalStorage(settings) {
    try {
        localStorage.setItem('brandVoiceSettings', JSON.stringify({
            tones: settings.tones || [],
            keywords: settings.keywords || [],
            samples: settings.samples || [],
            savedAt: new Date().toISOString()
        }));
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
    }
}

// ============================================================
// ATTACH EVENT LISTENERS
// ============================================================

function attachEventListeners() {
    // --- Tone tags ---
    const tagsContainer = document.querySelector('.brand-voice-tags');
    if (tagsContainer) {
        tagsContainer.querySelectorAll('.platform-pill').forEach(tag => {
            tag.addEventListener('click', function() {
                this.classList.toggle('active-tag');
                // Auto-save after toggling
                saveBrandVoice();
            });
        });
    }

    // --- Add Keyword button ---
    const addKeywordBtn = document.querySelector('.brand-voice-keywords .add-keyword-btn');
    if (addKeywordBtn) {
        addKeywordBtn.addEventListener('click', function() {
            const keyword = prompt('Enter a new keyword or phrase:');
            if (keyword && keyword.trim() !== '') {
                addKeyword(keyword.trim());
            }
        });
    }

    // --- Add Sample button ---
    const addSampleBtn = document.querySelector('.brand-voice-sample .btn-secondary');
    if (addSampleBtn) {
        addSampleBtn.addEventListener('click', addSample);
    }

    // --- Save Changes button (top of the page) ---
    const saveBtn = document.querySelector('#tab-brand-voice .dashboard-header .btn-primary');
    if (saveBtn) {
        saveBtn.addEventListener('click', function(e) {
            e.preventDefault();
            saveBrandVoice();
        });
    }

    console.log('✅ Brand Voice event listeners attached');
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW (for legacy onclick handlers)
// ============================================================

window.saveBrandVoice = saveBrandVoice;
window.loadBrandVoice = loadBrandVoice;
window.addKeyword = addKeyword;
window.removeKeyword = removeKeyword;
window.addSample = addSample;