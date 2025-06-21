const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
  console.log('A Mars colonist has connected.');
  
  // Store user ID mapping
  let currentUserId = null;

  socket.on('user_connect', (data) => {
    currentUserId = data.userId;
    console.log(`User connected with ID: ${currentUserId}`);
    
    // Initialize credits for new user or get existing credits
    if (!userCredits[currentUserId]) {
        userCredits[currentUserId] = FREE_CREDITS;
        saveCredits(userCredits);
    }
    socket.emit('credit_update', { credits: userCredits[currentUserId] });
  });

  socket.on('get_templates', () => {
    socket.emit('templates_data', habitatTemplates);
  });

  socket.on('design_habitat', async (data) => {
    if (!currentUserId) {
        return socket.emit('error', { message: "User not identified." });
    }
    
    const currentCredits = userCredits[currentUserId] || 0;
    if (currentCredits < GENERATION_COST) {
        return socket.emit('error', { message: "Insufficient credits." });
    }

    try {
      const imageUrl = await generateHabitatVisual(data.preferences);
      if (!imageUrl) throw new Error("Image generation failed.");
      
      const habitatDesign = generateHabitatDesign(data.preferences);
      habitatDesign.imageUrl = imageUrl;

      const newCredits = currentCredits - GENERATION_COST;
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
  const prompt = `
    Create a photorealistic, cinematic concept art of a Mars habitat.
    Style: ${style}, matching the concept of "${template.description}".
    It is designed for a capacity of ${capacity} and a ${budget}.
    The scene must be set on the Martian landscape: a rocky, desolate, red-orange desert under a thin, dusty pink sky.
    The visual should be awe-inspiring, rugged, and futuristic.
    If the style is "Underground Bunker" or "Lava Tube Home", show a cutaway view revealing the subterranean living quarters, with only an entrance visible on the surface.
  `;
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

// --- Catch-all route to serve index.html ---
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// --- Server Startup ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Mars Habitat Designer is running on http://localhost:${PORT}`);
});