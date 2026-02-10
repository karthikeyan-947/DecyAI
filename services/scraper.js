/**
 * DECY Tool Scraper
 * Auto-discovers AI tools from the web and adds them to the database
 * 
 * Sources:
 * 1. Product Hunt AI launches
 * 2. Alternative.to AI tools
 * 3. Direct website analysis (when user asks about unknown tool)
 * 
 * Flow: Scrape → AI validates & categorizes → Add to tools.json
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');

class ToolScraper {
    constructor() {
        this.groqKey = process.env.GROQ_API_KEY;
        this.groq = this.groqKey ? new Groq({ apiKey: this.groqKey }) : null;
        this.toolsPath = path.join(__dirname, '..', 'data', 'tools.json');
        this.discoveredPath = path.join(__dirname, '..', 'data', 'discovered.json');
        
        // Initialize discovered tools file
        if (!fs.existsSync(this.discoveredPath)) {
            fs.writeFileSync(this.discoveredPath, JSON.stringify({ 
                tools: [], 
                lastScrape: null,
                totalDiscovered: 0 
            }, null, 2));
        }

        // User agent to avoid blocking
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        };

        console.log('[SCRAPER] Tool scraper initialized');
    }

    /**
     * Get all existing tool IDs to avoid duplicates
     */
    getExistingToolIds() {
        const tools = JSON.parse(fs.readFileSync(this.toolsPath, 'utf-8'));
        const ids = new Set();
        for (const category of Object.values(tools.categories)) {
            for (const tool of category.tools) {
                ids.add(tool.id);
                ids.add(tool.name.toLowerCase());
            }
        }
        return ids;
    }

    /**
     * SOURCE 1: Scrape AI tools from search results
     * Searches for new AI tools and extracts basic info
     */
    async scrapeFromSearch(query = 'new AI tools 2026') {
        console.log(`[SCRAPER] Searching: "${query}"`);
        const discovered = [];

        try {
            // Use alternative.to as a structured source
            const url = `https://alternative.to/software/chatgpt--ai-tools`;
            const response = await axios.get(url, { 
                headers: this.headers,
                timeout: 10000 
            });

            const $ = cheerio.load(response.data);
            
            // Extract tool names and descriptions
            $('.app-listing, .alternativeList__item, [data-app-slug]').each((i, el) => {
                const name = $(el).find('.name, .app-name, h2, h3').first().text().trim();
                const desc = $(el).find('.description, .app-description, p').first().text().trim();
                const link = $(el).find('a').first().attr('href');

                if (name && name.length > 1 && name.length < 50) {
                    discovered.push({ name, description: desc, source: 'alternative.to', sourceUrl: link });
                }
            });

            console.log(`[SCRAPER] Found ${discovered.length} potential tools from alternative.to`);
        } catch (error) {
            console.log(`[SCRAPER] Alternative.to scrape failed: ${error.message}`);
        }

        return discovered;
    }

    /**
     * SOURCE 2: Analyze a specific tool URL
     * When a user mentions a tool DECY doesn't know, scrape its website directly
     */
    async analyzeToolUrl(url) {
        console.log(`[SCRAPER] Analyzing tool URL: ${url}`);

        try {
            const response = await axios.get(url, { 
                headers: this.headers,
                timeout: 15000,
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);

            // Extract key information from the webpage
            const title = $('title').text().trim();
            const metaDesc = $('meta[name="description"]').attr('content') || '';
            const ogTitle = $('meta[property="og:title"]').attr('content') || '';
            const ogDesc = $('meta[property="og:description"]').attr('content') || '';
            
            // Look for pricing info
            const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 3000);
            const pricingText = this.extractPricingText($, bodyText);

            // Look for keywords that indicate it's an AI tool
            const h1 = $('h1').first().text().trim();
            const h2s = [];
            $('h2').each((i, el) => {
                if (i < 5) h2s.push($(el).text().trim());
            });

            return {
                url: url,
                title: title || ogTitle,
                description: metaDesc || ogDesc,
                headline: h1,
                subheadlines: h2s,
                pricingHints: pricingText,
                rawSnippet: bodyText.substring(0, 2000)
            };
        } catch (error) {
            console.error(`[SCRAPER] Failed to analyze ${url}: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract pricing-related text from a page
     */
    extractPricingText($, bodyText) {
        const pricingKeywords = ['pricing', 'price', 'plan', 'free', 'premium', 'pro', 'enterprise', 
                                  '$', '€', '/month', '/year', 'subscribe', 'trial'];
        const hints = [];

        // Check for pricing section
        $('*').each((i, el) => {
            const text = $(el).text().trim();
            if (text.length > 10 && text.length < 200) {
                for (const keyword of pricingKeywords) {
                    if (text.toLowerCase().includes(keyword)) {
                        hints.push(text);
                        break;
                    }
                }
            }
        });

        // Deduplicate and limit
        return [...new Set(hints)].slice(0, 5).join(' | ');
    }

    /**
     * Use AI to categorize and format a discovered tool
     * This is the "brain" - turns raw scraped data into a proper DECY tool entry
     */
    async categorizeWithAI(toolData) {
        if (!this.groq) {
            console.log('[SCRAPER] No Groq API key, using basic categorization');
            return this.basicCategorize(toolData);
        }

        const existingCategories = this.getExistingCategories();

        try {
            const completion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: `You are a tool analyst for DECY, an AI tool recommendation engine. 
Analyze the provided tool information and create a structured entry.

EXISTING CATEGORIES (use one of these):
${existingCategories.map(c => `- ${c.key}: ${c.name}`).join('\n')}

RESPOND IN THIS EXACT JSON FORMAT:
{
    "isAITool": true/false,
    "id": "lowercase_underscore_name",
    "name": "Tool Name",
    "bestFor": "One line describing what it's best for",
    "category": "category_key from the list above",
    "deploy": {
        "available": true/false,
        "type": "Free/Paid/N/A",
        "note": "Brief deploy note"
    },
    "limits": "Free tier limits",
    "pricing": {
        "free": true/false,
        "premium": "$X/month or null"
    },
    "whySuitsYou": "One sentence why a user would want this",
    "ease": 1-5,
    "url": "https://...",
    "acceptsPrompt": true/false,
    "promptHint": "What kind of prompt to write (if acceptsPrompt is true)"
}

RULES:
- Set isAITool to false if this is NOT an AI tool
- If you can't determine pricing, set free: true and premium: null
- Ease is 1-5 (5 = easiest for beginners)
- Keep descriptions concise and helpful
- Use existing category keys ONLY`
                    },
                    {
                        role: 'user',
                        content: `Analyze this tool:\n${JSON.stringify(toolData, null, 2)}`
                    }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.3,
                max_tokens: 500,
                response_format: { type: "json_object" }
            });

            const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
            
            if (!result.isAITool) {
                console.log(`[SCRAPER] "${toolData.title || toolData.name}" is not an AI tool, skipping`);
                return null;
            }

            console.log(`[SCRAPER] AI categorized: ${result.name} → ${result.category}`);
            return result;

        } catch (error) {
            console.error('[SCRAPER] AI categorization failed:', error.message);
            return this.basicCategorize(toolData);
        }
    }

    /**
     * Get existing categories from tools.json
     */
    getExistingCategories() {
        const tools = JSON.parse(fs.readFileSync(this.toolsPath, 'utf-8'));
        return Object.entries(tools.categories).map(([key, cat]) => ({
            key,
            name: cat.name
        }));
    }

    /**
     * Basic categorization fallback (no AI)
     */
    basicCategorize(toolData) {
        const text = JSON.stringify(toolData).toLowerCase();
        
        const categoryKeywords = {
            'app_building': ['app', 'website', 'build', 'deploy', 'full-stack', 'no-code'],
            'image_generation': ['image', 'picture', 'generate', 'art', 'illustration'],
            'image_editing': ['edit', 'photo', 'retouch', 'background', 'enhance'],
            'video_creation': ['video', 'animation', 'clip', 'movie', 'reel'],
            'coding_assistance': ['code', 'programming', 'developer', 'ide', 'debug'],
            'writing': ['write', 'content', 'blog', 'article', 'copy'],
            'design': ['design', 'graphic', 'logo', 'ui', 'template'],
            'presentation': ['presentation', 'slide', 'deck', 'pitch'],
            'audio': ['audio', 'music', 'voice', 'sound', 'speech']
        };

        let bestCategory = 'coding_assistance';
        let bestScore = 0;

        for (const [cat, keywords] of Object.entries(categoryKeywords)) {
            let score = 0;
            for (const keyword of keywords) {
                if (text.includes(keyword)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                bestCategory = cat;
            }
        }

        return {
            isAITool: true,
            id: (toolData.name || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'),
            name: toolData.name || toolData.title || 'Unknown Tool',
            bestFor: toolData.description || 'AI tool',
            category: bestCategory,
            deploy: { available: false, type: 'N/A', note: 'Check website' },
            limits: 'Check website for free tier details',
            pricing: { free: true, premium: null },
            whySuitsYou: toolData.description || 'An AI tool that might help with your project',
            ease: 3,
            url: toolData.url || '#',
            acceptsPrompt: false
        };
    }

    /**
     * MAIN: Discover a specific tool by URL
     * Called when DECY encounters a tool it doesn't know about
     */
    async discoverToolByUrl(url) {
        console.log(`[SCRAPER] Discovering tool from: ${url}`);
        
        // Check if already exists
        const existingIds = this.getExistingToolIds();
        
        // Scrape the website
        const rawData = await this.analyzeToolUrl(url);
        if (!rawData) {
            return { success: false, error: 'Could not access the website' };
        }

        // Check if tool name already exists
        const toolName = (rawData.title || '').toLowerCase().split(/[-–|]/)[0].trim();
        if (existingIds.has(toolName)) {
            return { success: false, error: 'Tool already exists in database', name: toolName };
        }

        // Use AI to categorize
        const categorized = await this.categorizeWithAI(rawData);
        if (!categorized) {
            return { success: false, error: 'Not identified as an AI tool' };
        }

        // Add to database
        const added = this.addToolToDatabase(categorized);
        
        if (added) {
            // Also save to discovered log
            this.logDiscovery(categorized);
            return { success: true, tool: categorized };
        }

        return { success: false, error: 'Failed to add to database' };
    }

    /**
     * MAIN: Discover a tool by name
     * Searches the web for the tool, then analyzes it
     */
    async discoverToolByName(toolName) {
        console.log(`[SCRAPER] Searching for tool: "${toolName}"`);
        
        // Check if already exists
        const existingIds = this.getExistingToolIds();
        if (existingIds.has(toolName.toLowerCase())) {
            return { success: false, error: 'Tool already exists in database', name: toolName };
        }

        // Try common AI tool URL patterns
        const possibleUrls = [
            `https://${toolName.toLowerCase().replace(/\s+/g, '')}.com`,
            `https://${toolName.toLowerCase().replace(/\s+/g, '')}.ai`,
            `https://${toolName.toLowerCase().replace(/\s+/g, '')}.io`,
            `https://www.${toolName.toLowerCase().replace(/\s+/g, '')}.com`,
        ];

        for (const url of possibleUrls) {
            try {
                const result = await this.discoverToolByUrl(url);
                if (result.success) {
                    return result;
                }
            } catch (e) {
                // Try next URL
                continue;
            }
        }

        return { success: false, error: `Could not find "${toolName}" online` };
    }

    /**
     * Run a full scrape of AI tool directories
     * Discovers multiple new tools at once
     */
    async runFullScrape() {
        console.log('[SCRAPER] Starting full directory scrape...');
        const results = { discovered: 0, added: 0, skipped: 0, errors: 0 };
        const existingIds = this.getExistingToolIds();

        // Scrape from directories
        const rawTools = await this.scrapeFromSearch();
        results.discovered = rawTools.length;

        for (const raw of rawTools) {
            try {
                // Skip if already exists
                if (existingIds.has(raw.name.toLowerCase())) {
                    results.skipped++;
                    continue;
                }

                // Try to get more info if we have a URL
                let toolData = raw;
                if (raw.sourceUrl) {
                    const detailed = await this.analyzeToolUrl(raw.sourceUrl);
                    if (detailed) {
                        toolData = { ...raw, ...detailed };
                    }
                }

                // Categorize with AI
                const categorized = await this.categorizeWithAI(toolData);
                if (categorized) {
                    const added = this.addToolToDatabase(categorized);
                    if (added) {
                        this.logDiscovery(categorized);
                        results.added++;
                        existingIds.add(categorized.id);
                        existingIds.add(categorized.name.toLowerCase());
                    }
                }

                // Rate limit - be nice to servers
                await this.sleep(2000);

            } catch (error) {
                console.error(`[SCRAPER] Error processing ${raw.name}: ${error.message}`);
                results.errors++;
            }
        }

        console.log(`[SCRAPER] Scrape complete: ${results.added} added, ${results.skipped} skipped, ${results.errors} errors`);
        return results;
    }

    /**
     * Add a validated tool to the tools.json database
     */
    addToolToDatabase(tool) {
        try {
            const data = JSON.parse(fs.readFileSync(this.toolsPath, 'utf-8'));
            
            // Find the category
            if (!data.categories[tool.category]) {
                console.log(`[SCRAPER] Category "${tool.category}" not found, skipping`);
                return false;
            }

            // Check for duplicate ID
            const existing = data.categories[tool.category].tools.find(t => t.id === tool.id);
            if (existing) {
                console.log(`[SCRAPER] Tool "${tool.id}" already exists in ${tool.category}`);
                return false;
            }

            // Clean the tool entry (remove non-database fields)
            const toolEntry = {
                id: tool.id,
                name: tool.name,
                bestFor: tool.bestFor,
                deploy: tool.deploy,
                limits: tool.limits,
                pricing: tool.pricing,
                whySuitsYou: tool.whySuitsYou,
                ease: tool.ease,
                url: tool.url
            };

            if (tool.acceptsPrompt) {
                toolEntry.acceptsPrompt = true;
                toolEntry.promptHint = tool.promptHint || 'Describe what you want to create';
            }

            // Add to category
            data.categories[tool.category].tools.push(toolEntry);
            
            // Update metadata
            data.metadata.totalTools = Object.values(data.categories)
                .reduce((sum, cat) => sum + cat.tools.length, 0);
            data.metadata.lastUpdated = new Date().toISOString().split('T')[0];

            // Save
            fs.writeFileSync(this.toolsPath, JSON.stringify(data, null, 2));
            console.log(`[SCRAPER] ✅ Added "${tool.name}" to ${tool.category} (total: ${data.metadata.totalTools})`);
            return true;

        } catch (error) {
            console.error(`[SCRAPER] Failed to add tool: ${error.message}`);
            return false;
        }
    }

    /**
     * Log a discovery for analytics
     */
    logDiscovery(tool) {
        try {
            const discovered = JSON.parse(fs.readFileSync(this.discoveredPath, 'utf-8'));
            discovered.tools.push({
                id: tool.id,
                name: tool.name,
                category: tool.category,
                discoveredAt: new Date().toISOString(),
                url: tool.url
            });
            discovered.lastScrape = new Date().toISOString();
            discovered.totalDiscovered = discovered.tools.length;
            fs.writeFileSync(this.discoveredPath, JSON.stringify(discovered, null, 2));
        } catch (error) {
            console.error('[SCRAPER] Failed to log discovery:', error.message);
        }
    }

    /**
     * Get scraper stats
     */
    getStats() {
        try {
            const tools = JSON.parse(fs.readFileSync(this.toolsPath, 'utf-8'));
            const discovered = JSON.parse(fs.readFileSync(this.discoveredPath, 'utf-8'));
            
            return {
                totalTools: tools.metadata.totalTools,
                categories: Object.keys(tools.categories).length,
                lastUpdated: tools.metadata.lastUpdated,
                totalDiscovered: discovered.totalDiscovered,
                lastScrape: discovered.lastScrape
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Utility: Sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ToolScraper;
