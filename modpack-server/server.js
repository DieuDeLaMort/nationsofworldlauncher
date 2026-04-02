/**
 * Nations of World - Modpack Distribution Server
 * 
 * This Node.js server serves the distribution.json and modpack files
 * for the Nations of World launcher.
 * 
 * Usage:
 *   1. Place your mods in the ./mods/ folder
 *   2. Edit distribution.json to list your mods and their download URLs
 *   3. Run: npm install && npm start
 *   4. In the launcher settings (Distribution), set the URL to:
 *      http://YOUR_SERVER_IP:3000/distribution
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,             // 60 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// Serve static mod files from the /mods directory
app.use('/mods', express.static(path.join(__dirname, 'mods')));

// Serve the distribution index
app.get('/distribution', (req, res) => {
    const distroPath = path.join(__dirname, 'distribution.json');
    
    if (!fs.existsSync(distroPath)) {
        return res.status(404).json({ error: 'distribution.json not found' });
    }

    try {
        const data = JSON.parse(fs.readFileSync(distroPath, 'utf-8'));
        res.json(data);
    } catch (err) {
        console.error('Error reading distribution.json:', err.message);
        res.status(500).json({ error: 'Failed to parse distribution.json' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', name: 'Nations of World Modpack Server' });
});

app.listen(PORT, () => {
    console.log(`Nations of World Modpack Server running on port ${PORT}`);
    console.log(`Distribution URL: http://localhost:${PORT}/distribution`);
    console.log(`Mods served from: ${path.join(__dirname, 'mods')}`);
});
