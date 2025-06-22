const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});

// --- Credit System with Persistence ---
const CREDITS_FILE = path.join(__dirname, 'user_credits.json');
const FREE_CREDITS = 100;
const GENERATION_COST = 25;

// Credit pricing tiers
const CREDIT_PACKAGES = {
    starter: { credits: 50, price: 299, name: "Starter Pack" },
    explorer: { credits: 150, price: 799, name: "Explorer Pack" },
    colonist: { credits: 500, price: 1999, name: "Colonist Pack" },
    pioneer: { credits: 1200, price: 3999, name: "Pioneer Pack" }
};

// Load existing credits from file
function loadCredits() {
    try {
        if (fs.existsSync(CREDITS_FILE)) {
            const data = fs.readFileSync(CREDITS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading credits:', error);
    }
    return {};
}

// Save credits to file
function saveCredits(credits) {
    try {
        fs.writeFileSync(CREDITS_FILE, JSON.stringify(credits, null, 2));
    } catch (error) {
        console.error('Error saving credits:', error);
    }
}

// Initialize credits storage
let userCredits = loadCredits();

// --- Static File Serving & Middleware ---
app.use(cors());
app.use(express.json());
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- Data ---
const habitatTemplates = [
    { name: "The Martian Dome", description: "Classic geodesic dome with panoramic views", style: "Futuristic", capacity: "4-6 people" },
    { name: "Underground Bunker", description: "Radiation-shielded subterranean habitat", style: "Survival", capacity: "8-12 people" },
    { name: "Modular Station", description: "Expandable modular design for growing colonies", style: "Modular", capacity: "10-20 people" },
    { name: "Lava Tube Home", description: "Natural cave system converted to living space", style: "Natural", capacity: "6-10 people" }
];
const marsEnvironment = {
    temperature: { average: -63 },
    gravity: "38% Earth",
    radiation: "High"
};

// --- Wild Prompt Twists for Image Diversity ---
const PROMPT_TWISTS = [
  "at sunset with dramatic shadows",
  "during a Martian dust storm, swirling red clouds",
  "with a glowing blue aurora in the sky",
  "with a futuristic Mars rover parked outside",
  "with a group of astronauts in colorful suits",
  "in a cyberpunk art style, neon accents",
  "with bioluminescent plants around the habitat",
  "with a transparent dome showing lush green gardens inside",
  "with a rocket launching in the background",
  "with a giant Mars mountain in the distance",
  "with a surreal, dreamlike atmosphere",
  "with dramatic cinematic lighting, lens flare",
  "in the style of a 1980s sci-fi movie poster",
  "with a massive solar farm nearby",
  "with a Martian pet (alien creature) outside",
  "with a holographic sign above the entrance",
  "with a meteor shower in the sky",
  "with a red-blue color palette, high contrast",
  "with a whimsical, cartoonish look",
  "with a panoramic view of Valles Marineris canyon"
];

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
  console.log('A Mars colonist has connected.');
  
  // Store user ID mapping
  let currentUserId = null;

  socket.on('user_connect', (data) => {
    currentUserId = data.userId;
    console.log(`User connected with ID: ${currentUserId}`);
    console.log(`Current credits for user: ${userCredits[currentUserId] || 'not found'}`);
    
    // Initialize credits for new user or get existing credits
    if (!userCredits[currentUserId]) {
        console.log(`New user, setting credits to ${FREE_CREDITS}`);
        userCredits[currentUserId] = FREE_CREDITS;
        saveCredits(userCredits);
    } else {
        console.log(`Existing user, credits: ${userCredits[currentUserId]}`);
    }
    socket.emit('credit_update', { credits: userCredits[currentUserId] });
  });

  socket.on('get_templates', () => {
    console.log('Templates requested, sending:', habitatTemplates);
    socket.emit('templates_data', habitatTemplates);
  });

  socket.on('get_mars_weather', async () => {
    const weather = await getMarsWeather();
    socket.emit('mars_weather', weather);
  });

  socket.on('purchase_credits', async (data) => {
    if (!currentUserId) {
        return socket.emit('error', { message: "User not identified." });
    }
    
    try {
        const { paymentIntentId } = data;
        const response = await fetch(`${req.protocol}://${req.get('host')}/api/confirm-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId, userId: currentUserId })
        });
        
        const result = await response.json();
        
        if (result.success) {
            socket.emit('credit_update', { credits: result.newBalance });
            socket.emit('purchase_success', { 
                creditsAdded: result.creditsAdded,
                newBalance: result.newBalance 
            });
        } else {
            socket.emit('error', { message: 'Payment confirmation failed' });
        }
    } catch (error) {
        console.error('Purchase error:', error);
        socket.emit('error', { message: 'Purchase failed' });
    }
  });

  socket.on('design_habitat', async (data) => {
    if (!currentUserId) {
        return socket.emit('error', { message: "User not identified." });
    }
    
    const currentCredits = userCredits[currentUserId] || 0;
    console.log(`Design request - User: ${currentUserId}, Current credits: ${currentCredits}`);
    
    if (currentCredits < GENERATION_COST) {
        return socket.emit('error', { message: "Insufficient credits." });
    }

    try {
      const imageUrl = await generateHabitatVisual(data.preferences);
      if (!imageUrl) throw new Error("Image generation failed.");
      
      const habitatDesign = generateHabitatDesign(data.preferences);
      habitatDesign.imageUrl = imageUrl;

      const newCredits = currentCredits - GENERATION_COST;
      console.log(`Deducting ${GENERATION_COST} credits. New balance: ${newCredits}`);
      userCredits[currentUserId] = newCredits;
      saveCredits(userCredits);
      socket.emit('credit_update', { credits: newCredits });

      socket.emit('habitat_design', {
        design: habitatDesign,
        environment: marsEnvironment,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in design_habitat:', error);
      socket.emit('error', { message: 'Design generation failed.' });
    }
  });

  socket.on('disconnect', () => {
    // Don't delete credits on disconnect - keep them persistent
    console.log('A colonist has disconnected.');
  });
});

function generateHabitatDesign(preferences) {
    const { style, capacity, budget } = preferences;
    const template = habitatTemplates.find(t => t.name === style) || habitatTemplates[0];

    const specifications = {
        totalArea: (parseInt(capacity) || 4) * 28,
        powerConsumption: (parseInt(capacity) || 4) * 2.2,
        oxygenProduction: `${((parseInt(capacity) || 4) * 0.83).toFixed(2)}`,
        waterRecycling: `${((parseInt(capacity) || 4) * 3.8).toFixed(2)}`,
        radiationShielding: '98.5% effective'
    };

    return {
        template: template,
        specifications: specifications,
        estimatedCost: (parseInt(capacity) || 4) * 1.2 * (budget === 'High' ? 2 : 1),
        buildTime: Math.ceil((parseInt(capacity) || 4) * 1.5),
        safetyRating: Math.floor(Math.random() * (98 - 85 + 1) + 85)
    };
}

// --- AI Image Generation ---
async function generateHabitatVisual(preferences) {
  const { style, capacity, budget } = preferences;
  const template = habitatTemplates.find(t => t.name === style) || {};
  // Pick a random twist for this generation
  const twist = PROMPT_TWISTS[Math.floor(Math.random() * PROMPT_TWISTS.length)];
  // Optionally, add a random number for even more uniqueness
  const uniqueTag = `UniqueID:${Math.floor(Math.random() * 1000000)}`;
  const prompt = `\n    Create a photorealistic, cinematic concept art of a Mars habitat.\n    Style: ${style}, matching the concept of \"${template.description}\".\n    It is designed for a capacity of ${capacity} and a ${budget}.\n    The scene must be set on the Martian landscape: a rocky, desolate, red-orange desert under a thin, dusty pink sky.\n    The visual should be awe-inspiring, rugged, and futuristic.\n    If the style is \"Underground Bunker\" or \"Lava Tube Home\", show a cutaway view revealing the subterranean living quarters, with only an entrance visible on the surface.\n    Add this twist: ${twist}.\n    ${uniqueTag}\n  `;
  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
    });
    return response.data[0].url;
  } catch (error) {
    console.error('Error generating image with DALL-E:', error);
    return null;
  }
}

// --- Credit Purchase API Endpoints ---
app.get('/api/credit-packages', (req, res) => {
    res.json(CREDIT_PACKAGES);
});

app.get('/api/templates', (req, res) => {
    console.log('REST API: Templates requested');
    res.json(habitatTemplates);
});

app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { packageId, userId } = req.body;
        const package = CREDIT_PACKAGES[packageId];
        
        if (!package) {
            return res.status(400).json({ error: 'Invalid package' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: package.price, // Amount in cents
            currency: 'usd',
            metadata: {
                userId: userId,
                packageId: packageId,
                credits: package.credits
            }
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            package: package
        });
    } catch (error) {
        console.error('Payment intent error:', error);
        res.status(500).json({ error: 'Payment failed' });
    }
});

app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId, userId } = req.body;
        
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status === 'succeeded') {
            const credits = paymentIntent.metadata.credits;
            const currentCredits = userCredits[userId] || 0;
            userCredits[userId] = currentCredits + parseInt(credits);
            saveCredits(userCredits);
            
            res.json({ 
                success: true, 
                newBalance: userCredits[userId],
                creditsAdded: credits 
            });
        } else {
            res.status(400).json({ error: 'Payment not completed' });
        }
    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ error: 'Payment confirmation failed' });
    }
});

// --- Catch-all route to serve index.html ---
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- Server Startup ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Mars Habitat Designer is running on http://localhost:${PORT}`);
});

// --- Mars Weather API ---
async function getMarsWeather() {
    try {
        // NASA's InSight Mars Weather API
        const response = await axios.get('https://api.nasa.gov/insight_weather/', {
            params: {
                api_key: process.env.NASA_API_KEY || 'DEMO_KEY',
                feedtype: 'json',
                ver: '1.0'
            },
            timeout: 10000
        });
        
        if (response.data && response.data.sol_keys && response.data.sol_keys.length > 0) {
            const latestSol = response.data.sol_keys[response.data.sol_keys.length - 1];
            const latestData = response.data[latestSol];
            
            if (latestData && latestData.AT) {
                const temp = latestData.AT.av || latestData.AT.mn || -63;
                return {
                    temperature: Math.round(temp),
                    sol: latestSol,
                    timestamp: new Date().toISOString(),
                    source: 'NASA InSight'
                };
            }
        }
        
        // Fallback to average Mars temperature if API fails
        return {
            temperature: -63,
            sol: 'Unknown',
            timestamp: new Date().toISOString(),
            source: 'Average (API unavailable)'
        };
    } catch (error) {
        console.error('Error fetching Mars weather:', error.message);
        return {
            temperature: -63,
            sol: 'Unknown',
            timestamp: new Date().toISOString(),
            source: 'Average (API error)'
        };
    }
}