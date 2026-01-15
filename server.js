/**
 * DECY Backend Server
 * AI Tool Recommendation API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const RecommendationEngine = require('./services/recommendation');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize recommendation engine
const engine = new RecommendationEngine(process.env.GEMINI_API_KEY);

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
║   🤖 DECY - AI Decision Assistant                         ║
║   ─────────────────────────────────────                   ║
║                                                           ║
║   Server running at: http://localhost:${PORT}               ║
║   API endpoint:      http://localhost:${PORT}/api/recommend ║
║                                                           ║
║   Gemini API: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' ? '✅ Enabled' : '⚠️  Using fallback mode'}                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});
