// ========================================
// FAQ Page Functionality
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // FAQ Toggle Function
    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(function(question) {
        question.addEventListener('click', function() {
            const item = this.closest('.faq-item');
            const isOpen = item.classList.contains('open');

            // Close all other items in the same category
            const category = item.closest('.faq-category');
            if (category) {
                category.querySelectorAll('.faq-item').forEach(function(otherItem) {
                    if (otherItem !== item && otherItem.classList.contains('open')) {
                        otherItem.classList.remove('open');
                        const btn = otherItem.querySelector('.faq-question');
                        if (btn) btn.setAttribute('aria-expanded', 'false');
                    }
                });
            }

            // Toggle this item
            if (isOpen) {
                item.classList.remove('open');
                this.setAttribute('aria-expanded', 'false');
            } else {
                item.classList.add('open');
                this.setAttribute('aria-expanded', 'true');
            }
        });

        // Keyboard support for Enter/Space
        question.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
    });

    // Search Functionality
    const searchInput = document.getElementById('faqSearch');
    const faqItems = document.querySelectorAll('.faq-item');
    const faqCategories = document.querySelectorAll('.faq-category');
    const noResults = document.getElementById('faqNoResults');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            let hasResults = false;

            faqCategories.forEach(function(category) {
                let categoryHasResults = false;
                const items = category.querySelectorAll('.faq-item');

                items.forEach(function(item) {
                    const question = item.querySelector('.faq-question')?.textContent?.toLowerCase() || '';
                    const answer = item.querySelector('.faq-answer')?.textContent?.toLowerCase() || '';

                    const matches = query === '' || question.includes(query) || answer.includes(query);

                    if (matches) {
                        item.style.display = '';
                        categoryHasResults = true;
                        hasResults = true;
                    } else {
                        item.style.display = 'none';
                    }
                });

                if (query !== '') {
                    category.style.display = categoryHasResults ? '' : 'none';
                } else {
                    category.style.display = '';
                }
            });

            if (noResults) {
                noResults.classList.toggle('show', query !== '' && !hasResults);
            }

            if (query === '') {
                faqItems.forEach(function(item) {
                    item.style.display = '';
                    item.classList.remove('open');
                    const btn = item.querySelector('.faq-question');
                    if (btn) btn.setAttribute('aria-expanded', 'false');
                });
                faqCategories.forEach(function(category) {
                    category.style.display = '';
                });
            }
        });
    }
});