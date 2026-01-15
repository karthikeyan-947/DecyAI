/**
 * DECY Recommendation Engine
 * Smart AI tool matching with Groq (Llama 3) + Gemini fallback
 */

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const tools = require('../data/tools.json');

class RecommendationEngine {
    constructor(geminiKey) {
        // Primary: Groq (fast & reliable)
        this.groqKey = process.env.GROQ_API_KEY;
        this.groq = this.groqKey ? new Groq({ apiKey: this.groqKey }) : null;

        // Backup: Gemini
        this.geminiKey = geminiKey;
        this.genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;

        this.tools = tools;

        if (this.groq) {
            console.log('[DECY] ⚡ Using Groq (Llama 3) - Fast & Reliable');
        } else if (this.genAI) {
            console.log('[DECY] Using Gemini (backup mode)');
        }
    }


    /**
     * Main recommendation function - tries Gemini first, falls back to keyword matching
     */
    async getRecommendations(userQuery, budgetType = 'free') {
        console.log(`[DECY] Processing: "${userQuery}" | Budget: ${budgetType}`);

        try {
            // Try Gemini first
            if (this.genAI && this.apiKey !== 'your_gemini_api_key_here') {
                const result = await this.getGeminiRecommendation(userQuery, budgetType);
                if (result && result.tools && result.tools.length > 0) {
                    console.log('[DECY] Gemini response successful');
                    return result;
                }
            }
        } catch (error) {
            console.log('[DECY] Gemini failed, using fallback:', error.message);
        }

        // Fallback to smart keyword matching
        console.log('[DECY] Using fallback recommendation engine');
        return this.getFallbackRecommendation(userQuery, budgetType);
    }

    /**
     * Handle chat messages - use AI to respond naturally to ANY input
     */
    async handleChat(message, history = []) {
        console.log(`[DECY] Chat: "${message}" (history: ${history.length} messages)`);

        // Try Groq first (fast & reliable)
        if (this.groq) {
            try {
                const response = await this.getGroqResponse(message, history);
                return response;
            } catch (error) {
                console.log('[DECY] Groq failed:', error.message);
            }
        }

        // Try Gemini as backup
        if (this.genAI && this.geminiKey !== 'your_gemini_api_key_here') {
            try {
                const response = await this.getSmartResponse(message, history);
                return response;
            } catch (error) {
                console.log('[DECY] Gemini failed:', error.message);
            }
        }

        // Fallback to keyword matching
        return this.getSmartFallback(message, history);
    }

    /**
     * Get response using Groq (Llama 3) - FAST & RELIABLE
     */
    async getGroqResponse(message, history = []) {
        const lowerMessage = message.toLowerCase().trim();

        // STANDALONE BUDGET ANSWER: User typed just "free" or "premium" as a response
        const isStandaloneBudgetAnswer = /^(free|free tools?|premium|paid|pro)$/i.test(lowerMessage) ||
            /^(i want|i prefer|i'll go with|go with|show me|give me)?\s*(free|premium|paid)(\s+tools?)?$/i.test(lowerMessage);

        if (isStandaloneBudgetAnswer && history.length > 0) {
            // Check if the last assistant message was asking about budget
            const lastAssistant = history.filter(m => m.role === 'assistant').slice(-1)[0];
            const askedBudget = lastAssistant?.content?.toLowerCase().includes('free') &&
                lastAssistant?.content?.toLowerCase().includes('premium');

            if (askedBudget) {
                const budget = lowerMessage.includes('free') ? 'free' : 'premium';
                console.log(`[DECY] User typed budget answer: ${budget}`);
                // Get the original query from history (the message before the budget question)
                const userMessages = history.filter(m => m.role === 'user');
                const originalQuery = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : message;
                return {
                    success: true,
                    type: 'direct_recommendation',
                    budget: budget,
                    originalQuery: originalQuery
                };
            }
        }

        // DIRECT BUDGET DETECTION: If user explicitly says "free" or "premium", skip chat and get tools
        const wantsFree = /\b(free|no cost|without paying|don't want to pay|i need free|want free)\b/i.test(message);
        const wantsPremium = /\b(premium|paid|pro|professional|best quality|money|budget|willing to pay)\b/i.test(message);
        const isToolRequest = /\b(tool|app|software|recommend|suggest|find|need|want to|help me|looking for|create|build|make|design|edit|generate)\b/i.test(message);

        // If user explicitly states budget AND wants a tool -> directly get recommendations
        if ((wantsFree || wantsPremium) && isToolRequest) {
            const budget = wantsFree ? 'free' : 'premium';
            console.log(`[DECY] Direct tool request detected with budget: ${budget}`);
            return {
                success: true,
                type: 'direct_recommendation',
                budget: budget,
                originalQuery: message
            };
        }

        // Build conversation messages
        const messages = [
            {
                role: 'system',
                content: `You are DECY - an AI assistant specialized in recommending AI tools. Your PRIMARY MISSION is to help users find the perfect AI tool for their needs.

PERSONALITY:
- Warm, witty, and genuinely helpful
- Chat naturally like a knowledgeable friend 
- Use emoji occasionally when appropriate

EXPERTISE (50+ AI Tools):
- App builders: Bolt, Lovable, Bubble, Glide, Replit
- Image AI: Midjourney ($10/mo), DALL-E, Canva (free!), Leonardo AI, Ideogram
- Video AI: Runway, Pika Labs, CapCut, InVideo
- Coding: Cursor, GitHub Copilot, ChatGPT, Claude
- Writing: Jasper, Copy.ai, Notion AI, Grammarly
- Design: Canva, Figma, Kittl, Looka
- Audio: ElevenLabs, Suno AI, Murf

CRITICAL RULE - NEVER BREAK THIS:
When a user wants to create, build, make, design, edit, or do ANYTHING that requires a tool:
-> You MUST ask EXACTLY: "Would you prefer free tools or are you open to premium options?"
-> Do NOT list tool names or make recommendations in your text response
-> The tool cards will be shown AFTER they answer the budget question

For casual chat and questions about what tools do, answer naturally. But the moment they want to USE a tool for a task -> ASK THE BUDGET QUESTION.

Keep responses concise (2-3 sentences). Stay focused on your mission!`
            }
        ];

        // Add conversation history
        for (const msg of history.slice(-8)) {
            messages.push({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            });
        }

        // Add current message
        messages.push({ role: 'user', content: message });

        const completion = await this.groq.chat.completions.create({
            messages: messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 400,
        });

        const text = completion.choices[0]?.message?.content || '';
        console.log('[DECY] Groq response:', text.substring(0, 80) + '...');

        // Detect if this is a tool request (AI asked the budget question)
        const askedBudgetQuestion = text.toLowerCase().includes('free') &&
            text.toLowerCase().includes('premium') &&
            (text.toLowerCase().includes('prefer') || text.toLowerCase().includes('would you'));

        return {
            success: true,
            type: askedBudgetQuestion ? 'tool_request' : 'question',
            response: text
        };
    }



    /**
     * Get intelligent response using Gemini - TRUE conversational AI like ChatGPT
     */
    async getSmartResponse(message, history = []) {
        // Use stable model with good parameters
        const model = this.genAI.getGenerativeModel({
            model: 'gemini-1.5-pro',
            generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                maxOutputTokens: 1024,
            }
        });

        // Build conversation history for context
        let conversationHistory = '';
        if (history.length > 0) {
            conversationHistory = '\n\n[Previous conversation]\n' +
                history.slice(-8).map(msg =>
                    `${msg.role === 'user' ? 'Human' : 'DECY'}: ${msg.content}`
                ).join('\n') + '\n[End of previous conversation]\n';
        }

        // Natural conversational AI prompt - FOCUSED on tool recommendations
        const systemPrompt = `You are DECY - an AI assistant specialized in recommending AI tools. Your PRIMARY MISSION is to help users find the perfect AI tool for their needs.

PERSONALITY:
- Warm, witty, and genuinely helpful
- Chat naturally like a knowledgeable friend
- Use emoji occasionally when appropriate

EXPERTISE (50+ AI Tools):
- App builders: Bolt, Lovable, Replit, v0 by Vercel
- Image AI: Midjourney ($10/mo), DALL-E, Canva (free!), Leonardo AI, Ideogram
- Video AI: Runway, Pika Labs, CapCut, InVideo, Descript
- Coding: Cursor, GitHub Copilot, ChatGPT, Claude
- Writing: Jasper, Copy.ai, Notion AI, Grammarly
- Design: Canva, Figma, Kittl, Looka
- Audio: ElevenLabs, Suno AI, Murf
- Presentations: Gamma, Tome, Beautiful.ai

CORE BEHAVIOR - ALWAYS FOLLOW:
1. ANSWER questions naturally, but ALWAYS connect back to AI tools
2. When users describe a problem, project, or goal -> PROACTIVELY offer: "I can recommend some great tools for that! Would you prefer free tools or are you open to premium options?"
3. After answering any question, ADD a helpful nudge like: "By the way, if you're working on [related topic], I know some AI tools that could help!"
4. NEVER let conversations drift without mentioning tools
5. If conversation goes off-topic for 2+ messages, gently steer back: "That's cool! Is there any project or task I can help you find the right AI tool for?"

TOOL RECOMMENDATION TRIGGER:
Keywords: build, create, make, design, edit, generate, write, code, develop, produce, automate
-> Ask: "Would you prefer free tools or are you open to premium options?"

Keep responses concise (2-3 sentences + tool mention). Stay laser-focused on your mission - helping users discover the right AI tools!`;

        const prompt = `${systemPrompt}${conversationHistory}
Human: ${message}
DECY:`;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();

            console.log('[DECY] Gemini response:', text.substring(0, 100) + '...');

            // Detect if this is a tool request by checking for budget question
            const isToolRequest = text.toLowerCase().includes('free') &&
                text.toLowerCase().includes('premium') &&
                text.toLowerCase().includes('prefer');

            return {
                success: true,
                type: isToolRequest ? 'tool_request' : 'question',
                response: text
            };
        } catch (error) {
            console.log('[DECY] Gemini error:', error.message);
            // Return fallback with history
            return this.getSmartFallback(message, history);
        }
    }



    /**
     * Build context about available tools for the AI
     */
    buildToolsContext() {
        const categories = Object.entries(this.tools.categories).map(([key, cat]) => {
            const topTools = cat.tools.slice(0, 3).map(t => t.name).join(', ');
            return `- ${cat.name}: ${topTools}`;
        }).join('\n');

        return `Available categories (50+ tools total):
${categories}`;
    }

    /**
     * Smart fallback when Gemini is unavailable - uses history for context
     */
    getSmartFallback(message, history = []) {
        const msg = message.toLowerCase().trim();

        // Check last message in history for context
        const lastAssistantMsg = history.filter(m => m.role === 'assistant').slice(-1)[0];
        const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0];

        // Handle follow-up questions like "is it free?" by checking context
        if (/^is it|^is that|^does it|^can it/i.test(msg)) {
            const context = lastAssistantMsg?.content?.toLowerCase() || lastUserMsg?.content?.toLowerCase() || '';

            // Check what tool was mentioned
            const toolInfo = {
                'canva': { name: 'Canva', free: true, info: 'Yes! Canva has a generous free tier with tons of features. The Pro version adds more templates and features for $12.99/month.' },
                'midjourney': { name: 'Midjourney', free: false, info: "No, Midjourney is paid only. Plans start at $10/month for the Basic tier." },
                'chatgpt': { name: 'ChatGPT', free: true, info: 'Yes! ChatGPT has a free tier. GPT-4 access requires ChatGPT Plus at $20/month.' },
                'figma': { name: 'Figma', free: true, info: 'Yes! Figma has a free tier for up to 3 projects. Professional plans start at $12/month.' },
                'bolt': { name: 'Bolt', free: true, info: 'Bolt has a free tier for basic usage. Premium features require a subscription.' },
                'lovable': { name: 'Lovable', free: true, info: 'Lovable offers some free features. Full access requires a subscription.' },
                'runway': { name: 'Runway', free: true, info: 'Runway has a limited free tier. Pro features need a subscription starting at $15/month.' },
            };

            for (const [key, tool] of Object.entries(toolInfo)) {
                if (context.includes(key)) {
                    return {
                        success: true,
                        type: 'question',
                        response: tool.info
                    };
                }
            }
        }

        // Greetings
        if (/^(hi|hello|hey|hii+|hola|yo|greetings|sup|what's up)/i.test(msg)) {
            return {
                success: true,
                type: 'question',
                response: "Hey there! 👋 I'm DECY, an AI assistant that knows 50+ AI tools inside-out. What are you working on today?"
            };
        }

        // How are you / casual chat
        if (/how are you|how's it going|what's new|how do you do/i.test(msg)) {
            return {
                success: true,
                type: 'question',
                response: "I'm doing great, thanks for asking! 😊 Ready to help you find the perfect AI tools. What's on your mind?"
            };
        }

        // Thanks
        if (/thank|thanks|thx|appreciate/i.test(msg)) {
            return {
                success: true,
                type: 'question',
                response: "You're welcome! 😊 Anything else you'd like to know about AI tools?"
            };
        }

        // Questions about DECY
        if (/who are you|what are you|what can you do|how do you work|what is decy/i.test(msg)) {
            return {
                success: true,
                type: 'question',
                response: "I'm DECY! 🤖 Think of me as your AI-savvy friend who knows 50+ tools like Canva, Midjourney, Bolt, Runway, and more. I can help you find the right tool for any project - just tell me what you're building!"
            };
        }

        // Questions about specific tools - give real answers
        const toolAnswers = {
            'canva': "Canva is an awesome design platform! 🎨 You can create graphics, presentations, social media posts, and more. It has a generous free tier, and Pro is $12.99/month. Would you like me to recommend similar tools?",
            'midjourney': "Midjourney is one of the best AI image generators! 🖼️ It creates stunning, artistic images from text prompts. It's paid-only, starting at $10/month. Want me to suggest free alternatives?",
            'chatgpt': "ChatGPT is OpenAI's conversational AI (like me but different 😄). The free version uses GPT-3.5, while Plus ($20/month) gets you GPT-4. What do you want to use it for?",
            'figma': "Figma is a powerful design and prototyping tool! 🎯 Great for UI/UX design, wireframes, and collaboration. Has a free tier for up to 3 projects. Are you into design?",
            'bolt': "Bolt is an AI app builder that helps you create apps quickly! ⚡ It writes code for you based on your descriptions. Has some free features. Want to build an app?",
            'runway': "Runway is amazing for AI video editing and generation! 🎬 It can remove backgrounds, generate videos from text, and more. Limited free tier available. Interested in video creation?"
        };

        for (const [tool, answer] of Object.entries(toolAnswers)) {
            if (msg.includes(tool)) {
                return {
                    success: true,
                    type: 'question',
                    response: answer
                };
            }
        }

        // Clear tool request patterns
        if (/i want to|i need to|help me|looking for|recommend/i.test(msg)) {
            if (/app|website|code|program|software|video|image|photo|design|logo|presentation|slide|music|audio|voice|write|blog|article/i.test(msg)) {
                return {
                    success: true,
                    type: 'tool_request',
                    response: "Nice! I can help with that 🚀 Would you prefer free tools or are you open to premium options?"
                };
            }
        }

        // Default - friendly and curious
        return {
            success: true,
            type: 'question',
            response: "I'm here to chat and help! 😊 I know a ton about AI tools - from image generators to app builders. What's on your mind?"
        };
    }


    /**
     * Gemini-powered recommendation
     */
    async getGeminiRecommendation(userQuery, budgetType) {
        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        const prompt = this.buildPrompt(userQuery, budgetType);

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response from Gemini
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return this.enrichRecommendations(parsed, budgetType);
            }
        } catch (e) {
            console.log('[DECY] Failed to parse Gemini response');
        }

        return null;
    }

    /**
     * Build the prompt for Gemini
     */
    buildPrompt(userQuery, budgetType) {
        const categoriesInfo = Object.entries(this.tools.categories).map(([key, cat]) => {
            const toolsList = cat.tools.map(t => `${t.name}: ${t.bestFor}`).join('\n    ');
            return `${cat.name}:\n    ${toolsList}`;
        }).join('\n\n');

        return `You are DECY, an AI assistant that helps users find the right AI tool for their needs.

USER QUERY: "${userQuery}"
BUDGET: ${budgetType === 'free' ? 'Free tools only' : 'Can include premium tools'}

AVAILABLE TOOLS BY CATEGORY:
${categoriesInfo}

YOUR TASK:
1. Understand what the user wants to accomplish
2. Select 1-3 BEST tools that match their needs
3. For ${budgetType === 'free' ? 'FREE budget: only recommend tools with free tier' : 'PREMIUM budget: recommend the best tools regardless of price'}

RESPOND IN THIS EXACT JSON FORMAT:
{
    "category": "detected category name",
    "tools": ["tool_id_1", "tool_id_2"],
    "reasoning": "brief explanation of why these tools match"
}

IMPORTANT: Only use tool IDs from the database. Be concise. Maximum 3 tools.`;
    }

    /**
     * Enrich the Gemini recommendations with full tool data
     */
    enrichRecommendations(geminiResponse, budgetType) {
        const recommendations = [];
        const toolIds = geminiResponse.tools || [];

        for (const categoryKey in this.tools.categories) {
            const category = this.tools.categories[categoryKey];
            for (const tool of category.tools) {
                if (toolIds.includes(tool.id)) {
                    // Filter based on budget
                    if (budgetType === 'free' && !tool.pricing.free) continue;

                    recommendations.push({
                        ...tool,
                        category: category.name,
                        categoryIcon: category.icon
                    });
                }
            }
        }

        return {
            success: true,
            source: 'gemini',
            category: geminiResponse.category,
            reasoning: geminiResponse.reasoning,
            tools: recommendations.slice(0, 3)
        };
    }

    /**
     * Smart fallback recommendation using keyword matching
     */
    getFallbackRecommendation(userQuery, budgetType) {
        const query = userQuery.toLowerCase();
        const words = query.split(/\s+/);

        // Score each category
        const categoryScores = {};

        for (const [categoryKey, category] of Object.entries(this.tools.categories)) {
            let score = 0;

            // Check keywords
            for (const keyword of category.keywords) {
                if (query.includes(keyword.toLowerCase())) {
                    score += 10;
                }
                // Partial match
                for (const word of words) {
                    if (keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase())) {
                        score += 3;
                    }
                }
            }

            // Check tool names and descriptions
            for (const tool of category.tools) {
                if (query.includes(tool.name.toLowerCase())) {
                    score += 15;
                }
                if (query.includes(tool.bestFor.toLowerCase())) {
                    score += 5;
                }
            }

            if (score > 0) {
                categoryScores[categoryKey] = { score, category };
            }
        }

        // Get best matching category
        const sortedCategories = Object.entries(categoryScores)
            .sort((a, b) => b[1].score - a[1].score);

        if (sortedCategories.length === 0) {
            // Default to general AI assistants
            return this.getDefaultRecommendation(budgetType);
        }

        const [bestCategoryKey, bestMatch] = sortedCategories[0];
        const category = bestMatch.category;

        // Get tools from the best category
        let matchedTools = category.tools.filter(tool => {
            if (budgetType === 'free') {
                return tool.pricing.free === true;
            }
            return true;
        });

        // Sort by ease of use for beginners
        matchedTools.sort((a, b) => (b.ease || 3) - (a.ease || 3));

        // Take top 3
        const recommendations = matchedTools.slice(0, 3).map(tool => ({
            ...tool,
            category: category.name,
            categoryIcon: category.icon
        }));

        return {
            success: true,
            source: 'fallback',
            category: category.name,
            reasoning: `Based on your query about "${this.extractKeyIntent(query)}", these tools are best suited for your needs.`,
            tools: recommendations
        };
    }

    /**
     * Default recommendation when no match found
     */
    getDefaultRecommendation(budgetType) {
        const generalTools = [
            this.findToolById('chatgpt'),
            this.findToolById('perplexity'),
            this.findToolById('canva')
        ].filter(t => t && (budgetType !== 'free' || t.pricing.free));

        return {
            success: true,
            source: 'default',
            category: 'General AI',
            reasoning: 'Here are versatile AI tools that can help with many tasks.',
            tools: generalTools.slice(0, 3)
        };
    }

    /**
     * Find a tool by ID
     */
    findToolById(toolId) {
        for (const category of Object.values(this.tools.categories)) {
            const tool = category.tools.find(t => t.id === toolId);
            if (tool) {
                return {
                    ...tool,
                    category: category.name,
                    categoryIcon: category.icon
                };
            }
        }
        return null;
    }

    /**
     * Extract key intent from query
     */
    extractKeyIntent(query) {
        const intents = {
            'website': 'building a website',
            'web': 'building a website',
            'app': 'building applications',
            'image': 'working with images',
            'video': 'video creation',
            'code': 'coding and development',
            'write': 'writing and content',
            'design': 'design and graphics',
            'graphic': 'design and graphics',
            'logo': 'logo and branding',
            'present': 'creating presentations',
            'music': 'audio and music',
            'voice': 'voice and audio',
            'research': 'research and learning',
            'automate': 'automation',
            'build': 'building your project',
            'create': 'creating your project',
            'edit': 'editing content',
            'startup': 'your startup project'
        };

        for (const [keyword, intent] of Object.entries(intents)) {
            if (query.includes(keyword)) {
                return intent;
            }
        }
        return 'your project';
    }
}

module.exports = RecommendationEngine;
