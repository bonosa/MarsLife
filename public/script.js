// Mars Habitat Designer JavaScript
class MarsHabitatDesigner {
    constructor() {
        this.socket = io();
        this.selectedTemplate = "The Martian Dome";
        this.currentDesign = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
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
        };
        // Start with music off and the correct icon
        this.elements.musicToggleBtn.textContent = '🔇';
    }

    setupEventListeners() {
        this.elements.generateButton.addEventListener('click', () => this.generateHabitat());
        this.elements.musicToggleBtn.addEventListener('click', () => this.toggleMusic());
        
        document.querySelector('.share-buttons').addEventListener('click', (e) => {
            if (e.target.classList.contains('share-btn')) {
                this.shareHabitat(e.target.classList[1]);
            }
        });

        // Handle browser autoplay policies
        document.body.addEventListener('click', () => this.handleFirstInteraction(), { once: true });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log("Socket connected! Requesting initial data.");
            this.loadTemplates();
        });

        this.socket.on('habitat_design', (data) => this.displayHabitat(data));
        this.socket.on('templates_data', (data) => this.renderTemplates(data));
        this.socket.on('error', (data) => this.showError(data.message));
        this.socket.on('credit_update', (data) => this.updateCredits(data.credits));
    }

    loadTemplates() {
        console.log("Requesting templates...");
        this.socket.emit('get_templates');
    }

    renderTemplates(templates) {
        console.log("Rendering templates...");
        if (!templates || templates.length === 0) {
            console.error("No templates to render.");
            this.elements.templateGrid.innerHTML = '<p>Error loading habitat styles.</p>';
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
                <div class="spec-item"><span>Est. Cost:</span> <span>$${(estimatedCost / 1000000).toFixed(1)}M</span></div>
                <div class="spec-item"><span>Safety Rating:</span> <span>${safetyRating}%</span></div>
                <div class="spec-item"><span>Radiation Shield:</span> <span>${specifications.radiationShielding}</span></div>
            </div>
        `;
    }

    showError(message) {
        this.elements.imageContainer.classList.remove('is-loading');
        this.elements.loadingMessage.textContent = 'Welcome to Mars Life';
        alert(`Error: ${message}`);
    }

    shareHabitat(platform) {
        if (!this.currentDesign) {
            alert('Design a habitat first!');
            return;
        }
        
        const text = `🚀 I just designed my Mars habitat with AI! It's a "${this.currentDesign.template.name}" concept. Safety: ${this.currentDesign.safetyRating}%. Design yours! #MarsHabitat #AI`;
        const url = encodeURIComponent(window.location.href);
        let shareUrl = '';
        
        if (platform === 'twitter') {
            shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`;
        } else if (platform === 'reddit') {
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
            this.elements.ambientMusic.play().catch(e => console.warn("Music autoplay was blocked by the browser."));
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
}

document.addEventListener('DOMContentLoaded', () => {
    new MarsHabitatDesigner();
}); 