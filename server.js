/**
 * DECY Backend Server
 * AI Tool Recommendation API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const RecommendationEngine = require('./services/recommendation');
const ToolScraper = require('./services/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize engines
const engine = new RecommendationEngine(process.env.GEMINI_API_KEY);
const scraper = new ToolScraper();
engine.setScraper(scraper);  // Connect scraper for auto-discovery

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'DECY API',
        version: '1.0.0',
        geminiEnabled: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
    });
});

/**
 * POST /api/chat
 * Conversational endpoint - handles questions and detects intent
 * Body: { message: string, history?: Array<{role: 'user'|'assistant', content: string}> }
 * Returns: { type: 'question' | 'tool_request', response?: string }
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please enter a message'
            });
        }

        const result = await engine.handleChat(message.trim(), history);
        res.json(result);
    } catch (error) {
        console.error('[DECY] Chat error:', error);
        res.status(500).json({
            success: false,
            type: 'error',
            response: 'Something went wrong. Please try again.'
        });
    }
});


/**
 * POST /api/recommend
 * Get AI tool recommendations
 * Body: { query: string, budget: 'free' | 'premium', category?: string }
 */
app.post('/api/recommend', async (req, res) => {
    try {
        const { query, budget = 'free', category = null } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Please tell me what you want to do'
            });
        }

        const recommendations = await engine.getRecommendations(query.trim(), budget, category);

        res.json(recommendations);
    } catch (error) {
        console.error('[DECY] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Something went wrong. Please try again.'
        });
    }
});

/**
 * POST /api/tools-by-ids
 * Get specific tools by their IDs (used when AI recommends specific tools)
 * Body: { toolIds: string[], budget: 'free' | 'premium' }
 */
app.post('/api/tools-by-ids', async (req, res) => {
    try {
        const { toolIds, budget = 'free' } = req.body;

        if (!toolIds || !Array.isArray(toolIds) || toolIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No tool IDs provided'
            });
        }

        const tools = engine.getToolsByIds(toolIds, budget);

        res.json({
            success: true,
            tools: tools
        });
    } catch (error) {
        console.error('[DECY] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Something went wrong. Please try again.'
        });
    }
});

/**
 * POST /api/generate-prompt
 * Generate an optimized prompt for a specific AI tool
 * Body: { toolId: string, toolName: string, description: string }
 */
app.post('/api/generate-prompt', async (req, res) => {
    try {
        const { toolId, toolName, description } = req.body;

        if (!toolName || !description) {
            return res.status(400).json({
                success: false,
                error: 'Tool name and description are required'
            });
        }

        const prompt = await engine.generatePromptForTool(toolId, toolName, description);

        res.json({
            success: true,
            prompt: prompt
        });
    } catch (error) {
        console.error('[DECY] Prompt generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate prompt. Please try again.'
        });
    }
});

/**
 * GET /api/categories
 * Get all available categories
 */
app.get('/api/categories', (req, res) => {
    const tools = require('./data/tools.json');
    const categories = Object.entries(tools.categories).map(([key, cat]) => ({
        id: key,
        name: cat.name,
        icon: cat.icon,
        toolCount: cat.tools.length
    }));

    res.json({ categories });
});

/**
 * GET /api/tools/:category
 * Get tools by category
 */
app.get('/api/tools/:category', (req, res) => {
    const { category } = req.params;
    const { budget } = req.query;
    const tools = require('./data/tools.json');

    const categoryData = tools.categories[category];

    if (!categoryData) {
        return res.status(404).json({
            success: false,
            error: 'Category not found'
        });
    }

    let filteredTools = categoryData.tools;

    if (budget === 'free') {
        filteredTools = filteredTools.filter(t => t.pricing.free);
    }

    res.json({
        success: true,
        category: categoryData.name,
        tools: filteredTools
    });
});

// ============================================
//  SCRAPER API ROUTES - Auto Tool Discovery
// ============================================

/**
 * POST /api/discover/url
 * Discover a new AI tool by its website URL
 * Body: { url: string }
 */
app.post('/api/discover/url', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }
        const result = await scraper.discoverToolByUrl(url);
        res.json(result);
    } catch (error) {
        console.error('[DECY] Discover error:', error);
        res.status(500).json({ success: false, error: 'Discovery failed' });
    }
});

/**
 * POST /api/discover/name
 * Discover a new AI tool by searching for its name
 * Body: { name: string }
 */
app.post('/api/discover/name', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Tool name is required' });
        }
        const result = await scraper.discoverToolByName(name);
        res.json(result);
    } catch (error) {
        console.error('[DECY] Discover error:', error);
        res.status(500).json({ success: false, error: 'Discovery failed' });
    }
});

/**
 * POST /api/discover/scrape
 * Run a full scrape of AI tool directories
 * Returns: { discovered, added, skipped, errors }
 */
app.post('/api/discover/scrape', async (req, res) => {
    try {
        const results = await scraper.runFullScrape();
        res.json({ success: true, ...results });
    } catch (error) {
        console.error('[DECY] Scrape error:', error);
        res.status(500).json({ success: false, error: 'Scrape failed' });
    }
});

/**
 * GET /api/discover/stats
 * Get scraper stats
 */
app.get('/api/discover/stats', (req, res) => {
    const stats = scraper.getStats();
    res.json(stats);
});

/**
 * Serve frontend
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/select', (req, res) => {
    res.sendFile(path.join(__dirname, 'select.html'));
});

app.get('/response', (req, res) => {
    res.sendFile(path.join(__dirname, 'rsponse.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🤖 DECY - AI Decision Assistant v2.0                    ║
║   ─────────────────────────────────────                   ║
║                                                           ║
║   Server:    http://localhost:${PORT}                       ║
║   API:       http://localhost:${PORT}/api/recommend         ║
║   Scraper:   http://localhost:${PORT}/api/discover/stats    ║
║                                                           ║
║   Groq:   ${process.env.GROQ_API_KEY ? '✅ Enabled' : '⚠️  Not configured'}                                  ║
║   Gemini: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' ? '✅ Enabled' : '⚠️  Not configured'}                                  ║
║   Scraper: ✅ Ready                                       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
