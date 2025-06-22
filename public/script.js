// Mars Habitat Designer JavaScript
class MarsHabitatDesigner {
    constructor() {
        this.socket = io();
        this.selectedTemplate = "The Martian Dome";
        this.currentDesign = null;
        
        // Generate or retrieve persistent user ID
        this.userId = this.getOrCreateUserId();
        
        // Initialize Stripe - THIS IS THE FIX
        // NOTE: Replace this with your actual Stripe Publishable Key
        this.stripe = Stripe('pk_test_your_stripe_publishable_key_here'); 
        this.elements = null;
        this.cardElement = null;
        this.selectedPackage = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    getOrCreateUserId() {
        let userId = localStorage.getItem('marslifeUserId');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('marslifeUserId', userId);
        }
        return userId;
    }

    initializeElements() {
        this.elements = {
            templateGrid: document.getElementById('templateGrid'),
            capacitySelect: document.getElementById('capacitySelect'),
            budgetSelect: document.getElementById('budgetSelect'),
            generateButton: document.getElementById('generateButton'),
            imageContainer: document.getElementById('imageContainer'),
            habitatImage: document.getElementById('habitatImage'),
            loadingMessage: document.getElementById('loadingMessage'),
            resultsPanel: document.getElementById('resultsPanel'),
            specsGrid: document.querySelector('.specs-grid'),
            creditCount: document.getElementById('creditCount'),
            musicToggleBtn: document.getElementById('musicToggleBtn'),
            ambientMusic: document.getElementById('ambientMusic'),
            marsTemp: document.getElementById('marsTemp'),
            refreshWeather: document.getElementById('refreshWeather'),
            buyCreditsBtn: document.getElementById('buyCreditsBtn'),
            creditModal: document.getElementById('creditModal'),
            creditPackages: document.getElementById('creditPackages'),
            paymentSection: document.getElementById('paymentSection'),
            payButton: document.getElementById('payButton'),
            closeModal: document.querySelector('.close'),
            refreshTemplatesBtn: document.getElementById('refreshTemplatesBtn'),
        };
        // Start with music off and the correct icon
        this.elements.musicToggleBtn.textContent = '🔇';
    }

    setupEventListeners() {
        this.elements.generateButton.addEventListener('click', () => this.generateHabitat());
        this.elements.musicToggleBtn.addEventListener('click', () => this.toggleMusic());
        this.elements.refreshWeather.addEventListener('click', () => this.refreshMarsWeather());
        this.elements.buyCreditsBtn.addEventListener('click', () => this.openCreditModal());
        this.elements.closeModal.addEventListener('click', () => this.closeCreditModal());
        this.elements.payButton.addEventListener('click', () => this.processPayment());
        this.elements.refreshTemplatesBtn.addEventListener('click', () => this.loadTemplates());
        
        // Use event delegation for dynamic buttons
        this.elements.resultsPanel.addEventListener('click', (e) => {
            if (e.target.classList.contains('share-btn')) {
                this.handleAction(e.target.classList[1]);
            }
        });

        // Handle music autoplay on first interaction
        document.body.addEventListener('click', () => this.handleFirstInteraction(), { once: true });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.elements.creditModal) {
                this.closeCreditModal();
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log("Socket connected! Requesting initial data.");
            // Send user ID to server for credit tracking
            this.socket.emit('user_connect', { userId: this.userId });
            this.loadTemplates();
            // Request initial Mars weather data
            this.refreshMarsWeather();
        });

        this.socket.on('habitat_design', (data) => this.displayHabitat(data));
        this.socket.on('templates_data', (data) => this.renderTemplates(data));
        this.socket.on('error', (data) => this.showError(data.message));
        this.socket.on('credit_update', (data) => {
            console.log("Received credit update:", data);
            this.updateCredits(data.credits);
        });
        
        this.socket.on('mars_weather', (data) => {
            console.log("Received Mars weather:", data);
            this.updateMarsWeather(data);
        });
        
        this.socket.on('purchase_success', (data) => {
            console.log("Purchase successful:", data);
            this.showPurchaseSuccess(data);
        });
        
        // Additional fallback: if templates don't load after 3 seconds, try again
        setTimeout(() => {
            if (this.elements.templateGrid.children.length === 0) {
                console.log("Fallback: Templates not loaded, trying again...");
                this.loadTemplates();
            }
        }, 3000);
    }

    loadTemplates() {
        console.log("Requesting templates...");
        if (this.socket.connected) {
            this.socket.emit('get_templates');
        } else {
            console.log("Socket not connected, waiting...");
            setTimeout(() => this.loadTemplates(), 1000);
        }
    }

    renderTemplates(templates) {
        console.log("Rendering templates...");
        if (!templates || templates.length === 0) {
            console.error("No templates to render.");
            this.elements.templateGrid.innerHTML = `
                <div class="template-loading">
                    <p>Error loading habitat styles.</p>
                    <button id="refreshTemplatesBtn" class="refresh-templates-btn">🔄 Refresh Styles</button>
                </div>
            `;
            // Re-attach event listener for the new button
            document.getElementById('refreshTemplatesBtn').addEventListener('click', () => this.loadTemplates());
            return;
        }
        
        this.elements.templateGrid.innerHTML = '';
        templates.forEach((template, index) => {
            const card = document.createElement('div');
            card.className = 'template-card';
            card.dataset.name = template.name;
            card.innerHTML = `
                <h4>${template.name}</h4>
                <p>${template.description}</p>
            `;
            card.addEventListener('click', () => this.selectTemplate(template.name));
            this.elements.templateGrid.appendChild(card);
        });
        this.selectTemplate(this.selectedTemplate);
    }

    selectTemplate(templateName) {
        this.selectedTemplate = templateName;
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.toggle('active', card.dataset.name === templateName);
        });
    }

    generateHabitat() {
        this.elements.generateButton.disabled = true; // Prevent repeat clicks
        
        const preferences = {
            style: this.selectedTemplate,
            capacity: this.elements.capacitySelect.value,
            budget: this.elements.budgetSelect.value,
        };
        
        this.elements.imageContainer.classList.remove('has-image');
        this.elements.imageContainer.classList.add('is-loading');
        this.elements.loadingMessage.textContent = 'Generating your Mars habitat visual...';
        this.socket.emit('design_habitat', { preferences });
    }

    displayHabitat(data) {
        this.elements.imageContainer.classList.remove('is-loading');
        this.elements.imageContainer.classList.add('has-image');
        this.currentDesign = data.design;
        this.updateVisualization(data.design.imageUrl);
        this.updateSpecifications(data.design);
        this.elements.resultsPanel.classList.add('show');
    }

    updateVisualization(imageUrl) {
        this.elements.habitatImage.src = imageUrl;
        this.elements.imageContainer.classList.remove('is-loading');
        this.elements.loadingMessage.textContent = 'Welcome to Mars Life';
        // The button state will be updated by the 'credit_update' event from the server
    }

    updateSpecifications(design) {
        const { template, specifications, estimatedCost, buildTime, safetyRating } = design;
        this.elements.specsGrid.innerHTML = `
            <div class="spec-card">
                <h3>🏗️ Structure</h3>
                <div class="spec-item"><span>Style:</span> <span>${template.name}</span></div>
                <div class="spec-item"><span>Total Area:</span> <span>${specifications.totalArea} m²</span></div>
                <div class="spec-item"><span>Build Time:</span> <span>${buildTime} months</span></div>
            </div>
            <div class="spec-card">
                <h3>⚡ Life Support</h3>
                <div class="spec-item"><span>Power Usage:</span> <span>${specifications.powerConsumption} kW</span></div>
                <div class="spec-item"><span>O₂ Production:</span> <span>${specifications.oxygenProduction} kg/day</span></div>
                <div class="spec-item"><span>Water Recycling:</span> <span>${specifications.waterRecycling} L/day</span></div>
            </div>
            <div class="spec-card">
                <h3>💰 Vitals</h3>
                <div class="spec-item"><span>Est. Cost:</span> <span>$${(estimatedCost).toFixed(1)}M</span></div>
                <div class="spec-item"><span>Safety Rating:</span> <span>${safetyRating}%</span></div>
                <div class="spec-item"><span>Radiation Shield:</span> <span>${specifications.radiationShielding}</span></div>
            </div>
        `;
    }

    showError(message) {
        this.elements.imageContainer.classList.remove('is-loading');
        this.elements.loadingMessage.textContent = 'Welcome to Mars Life';
        // Re-enable button on error, as credits were not deducted.
        this.elements.generateButton.disabled = false;
        this.elements.generateButton.textContent = '🚀 Generate Mars Habitat';
        alert(`Error: ${message}`);
    }

    handleAction(action) {
        if (!this.currentDesign) {
            alert('Design a habitat first!');
            return;
        }

        const text = `🚀 I just designed my Mars habitat with AI! It's a "${this.currentDesign.template.name}" concept. Safety: ${this.currentDesign.safetyRating}%. Design yours! #MarsHabitat #AI`;
        const url = encodeURIComponent(window.location.href);
        let shareUrl = '';
        
        if (action === 'x') {
            shareUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`;
        } else if (action === 'tiktok') {
            // TikTok web share
            shareUrl = `https://www.tiktok.com/share?url=${url}&title=${encodeURIComponent(text)}`;
        } else if (action === 'reddit') {
            shareUrl = `https://reddit.com/submit?url=${url}&title=${encodeURIComponent("I designed my Mars Habitat with AI!")}`;
        }
        
        if (shareUrl) {
            window.open(shareUrl, '_blank');
        }
    }
    
    updateCredits(credits) {
        console.log(`Updating credits: ${credits}`);
        this.elements.creditCount.textContent = credits;
        const hasEnoughCredits = credits >= 25; // GENERATION_COST
        this.elements.generateButton.disabled = !hasEnoughCredits;
        this.elements.generateButton.textContent = hasEnoughCredits ? '🚀 Generate Mars Habitat' : 'Insufficient Credits';
    }

    handleFirstInteraction() {
        if (this.elements.ambientMusic.paused) {
            this.elements.ambientMusic.play().catch(e => console.warn("Music autoplay was blocked. Click the music icon."));
            this.elements.musicToggleBtn.textContent = '🔊';
        }
    }

    toggleMusic() {
        if (this.elements.ambientMusic.paused) {
            this.elements.ambientMusic.play();
            this.elements.musicToggleBtn.textContent = '🔊';
        } else {
            this.elements.ambientMusic.pause();
            this.elements.musicToggleBtn.textContent = '🔇';
        }
    }

    refreshMarsWeather() {
        console.log("Requesting Mars weather data...");
        this.elements.refreshWeather.style.transform = 'rotate(360deg)';
        this.socket.emit('get_mars_weather');
        
        // Reset rotation after animation
        setTimeout(() => {
            this.elements.refreshWeather.style.transform = 'rotate(0deg)';
        }, 500);
    }

    updateMarsWeather(data) {
        if (data && data.temperature !== undefined) {
            const temp = data.temperature;
            const sol = data.sol || 'Unknown';
            const source = data.source || 'NASA';
            
            this.elements.marsTemp.textContent = `${temp}°C`;
            this.elements.marsTemp.title = `Sol ${sol} | Source: ${source}`;
            
            // Add visual feedback for temperature
            if (temp > -20) {
                this.elements.marsTemp.style.color = '#F59E0B'; // Warmer - orange
            } else if (temp < -80) {
                this.elements.marsTemp.style.color = '#3B82F6'; // Colder - blue
            } else {
                this.elements.marsTemp.style.color = '#38BDF8'; // Normal - light blue
            }
            
            console.log(`Updated Mars temperature: ${temp}°C (Sol ${sol})`);
        }
    }

    openCreditModal() {
        this.elements.creditModal.style.display = 'block';
        this.loadCreditPackages();
    }

    closeCreditModal() {
        this.elements.creditModal.style.display = 'none';
        this.elements.paymentSection.style.display = 'none';
        this.selectedPackage = null;
    }

    async loadCreditPackages() {
        try {
            const response = await fetch('/api/credit-packages');
            const packages = await response.json();
            
            this.elements.creditPackages.innerHTML = '';
            Object.entries(packages).forEach(([id, pkg]) => {
                const packageDiv = document.createElement('div');
                packageDiv.className = 'credit-package';
                packageDiv.dataset.packageId = id;
                packageDiv.innerHTML = `
                    <h3>${pkg.name}</h3>
                    <div class="credits">${pkg.credits} Credits</div>
                    <div class="price">$${(pkg.price / 100).toFixed(2)}</div>
                    <div class="price-per-credit">$${(pkg.price / pkg.credits / 100).toFixed(2)} per credit</div>
                `;
                packageDiv.addEventListener('click', () => this.selectPackage(id, pkg));
                this.elements.creditPackages.appendChild(packageDiv);
            });
        } catch (error) {
            console.error('Error loading credit packages:', error);
        }
    }

    selectPackage(packageId, pkg) {
        // Remove previous selection
        document.querySelectorAll('.credit-package').forEach(p => {
            p.classList.remove('selected');
        });
        
        // Select new package
        document.querySelector(`[data-package-id="${packageId}"]`).classList.add('selected');
        this.selectedPackage = { id: packageId, ...pkg };
        
        // Show payment section
        this.elements.paymentSection.style.display = 'block';
        this.setupStripeElements();
    }

    setupStripeElements() {
        if (!this.elements) {
            this.elements = this.stripe.elements();
        }
        
        if (this.cardElement) {
            this.cardElement.destroy();
        }
        
        this.cardElement = this.elements.create('card', {
            style: {
                base: {
                    color: '#E5E7EB',
                    fontFamily: 'Rajdhani, sans-serif',
                    fontSize: '16px',
                    '::placeholder': {
                        color: '#9CA3AF'
                    }
                }
            }
        });
        
        this.cardElement.mount('#card-element');
    }

    async processPayment() {
        if (!this.selectedPackage) {
            alert('Please select a credit package first.');
            return;
        }

        this.elements.payButton.disabled = true;
        this.elements.payButton.textContent = 'Processing...';

        try {
            // Create payment intent
            const response = await fetch('/api/create-payment-intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    packageId: this.selectedPackage.id,
                    userId: this.userId
                })
            });

            const { clientSecret } = await response.json();

            // Confirm payment
            const { error, paymentIntent } = await this.stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: this.cardElement,
                }
            });

            if (error) {
                throw new Error(error.message);
            }

            // Confirm payment with server
            this.socket.emit('purchase_credits', { paymentIntentId: paymentIntent.id });

        } catch (error) {
            console.error('Payment error:', error);
            alert(`Payment failed: ${error.message}`);
        } finally {
            this.elements.payButton.disabled = false;
            this.elements.payButton.textContent = 'Pay Now';
        }
    }

    showPurchaseSuccess(data) {
        this.closeCreditModal();
        alert(`🎉 Purchase successful! Added ${data.creditsAdded} credits to your account. New balance: ${data.newBalance} credits.`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MarsHabitatDesigner();
}); 