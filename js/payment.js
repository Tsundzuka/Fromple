// js/payment.js
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const plan = urlParams.get('plan') || 'professional';

  const plans = {
    'free': { name: 'Free Trial', price: '$0', priceId: null },
    'professional': { name: 'Professional Plan', price: 'R299.00', priceId: 'price_professional_monthly' },
    'growth': { name: 'Growth Plan', price: 'R599.00', priceId: 'price_growth_monthly' }
  };

  const selectedPlan = plans[plan] || plans['professional'];
  
  document.getElementById('paymentPlan').textContent = selectedPlan.name;
  document.getElementById('planName').textContent = selectedPlan.name;
  document.getElementById('planPrice').textContent = selectedPlan.price;
  document.getElementById('totalPrice').textContent = selectedPlan.price;

  createCheckoutSession(plan);

  async function createCheckoutSession(plan) {
    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('authToken');
      
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ plan: plan })
      });

      const data = await response.json();

      if (data.error) {
        showError(data.error);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        showError('Unable to create checkout session. Please try again.');
      }

    } catch (error) {
      console.error('Checkout error:', error);
      showError('Network error. Please check your connection and try again.');
    }
  }

  function showError(message) {
    const errorEl = document.getElementById('paymentError');
    const messageEl = document.getElementById('errorMessage');
    messageEl.textContent = message;
    errorEl.classList.add('show');
    document.querySelector('.payment-spinner').style.display = 'none';
  }
});