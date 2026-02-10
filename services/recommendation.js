/**
 * DECY Recommendation Engine
 * Smart AI tool matching with Groq (Llama 3) + Gemini fallback
 */

const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

class RecommendationEngine {
    constructor(geminiKey) {
        // Primary: Groq (fast & reliable)
        this.groqKey = process.env.GROQ_API_KEY;
        this.groq = this.groqKey ? new Groq({ apiKey: this.groqKey }) : null;

        // Backup: Gemini
        this.geminiKey = geminiKey;
        this.genAI = geminiKey ? new GoogleGenerativeAI(geminiKey) : null;

        // Load tools (dynamic - reloads when new tools are added by scraper)
        this.toolsPath = path.join(__dirname, '..', 'data', 'tools.json');
        this.tools = this.loadTools();

        // Scraper for auto-discovery
        this.scraper = null; // lazy-loaded to avoid circular dependency

        if (this.groq) {
            console.log('[DECY] ⚡ Using Groq (Llama 3) - Fast & Reliable');
        } else if (this.genAI) {
            console.log('[DECY] Using Gemini (backup mode)');
        }
    }

    /**
     * Load tools from disk (called after scraper adds new tools)
     */
    loadTools() {
        try {
            // Clear require cache to get fresh data
            delete require.cache[require.resolve('../data/tools.json')];
            return require('../data/tools.json');
        } catch (e) {
            console.error('[DECY] Failed to load tools:', e.message);
            return { categories: {} };
        }
    }

    /**
     * Refresh tools data (call after scraper adds new tools)
     */
    refreshTools() {
        this.tools = this.loadTools();
        console.log(`[DECY] Tools refreshed: ${this.tools.metadata?.totalTools || 0} tools`);
    }

    /**
     * Set the scraper instance (called from server.js to avoid circular deps)
     */
    setScraper(scraperInstance) {
        this.scraper = scraperInstance;
    }


    /**
     * Main recommendation function - uses AI-detected category when available
     */
    async getRecommendations(userQuery, budgetType = 'free', category = null) {
        console.log(`[DECY] Processing: "${userQuery}" | Budget: ${budgetType} | Category: ${category || 'auto-detect'}`);

        // If AI provided a specific category, use it directly
        if (category && this.tools.categories[category]) {
            console.log(`[DECY] Using AI-detected category: ${category}`);
            return this.getToolsFromCategory(category, budgetType, userQuery);
        }

        try {
            // Try Gemini first for smart matching
            if (this.genAI && this.geminiKey !== 'your_gemini_api_key_here') {
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
     * Get tools directly from a specific category (when AI already detected it)
     */
    getToolsFromCategory(categoryKey, budgetType, userQuery) {
        const category = this.tools.categories[categoryKey];
        if (!category) {
            return this.getFallbackRecommendation(userQuery, budgetType);
        }

        let matchedTools = category.tools.filter(tool => {
            if (budgetType === 'free') {
                return tool.pricing.free === true;
            }
            return true;
        });

        // Sort by ease of use
        matchedTools.sort((a, b) => (b.ease || 3) - (a.ease || 3));

        const recommendations = matchedTools.slice(0, 3).map(tool => ({
            ...tool,
            category: category.name,
            categoryIcon: category.icon
        }));

        return {
            success: true,
            source: 'ai_category',
            category: category.name,
            reasoning: `Here are the best ${budgetType} tools for ${this.extractKeyIntent(userQuery.toLowerCase())}:`,
            tools: recommendations
        };
    }

    /**
     * Get specific tools by their IDs (when AI recommends specific tools)
     * This is the TRUE ChatGPT-like approach - AI picks the tools, we just look them up
     */
    getToolsByIds(toolIds, budgetType = 'free') {
        const tools = [];

        for (const toolId of toolIds) {
            const tool = this.findToolById(toolId);
            if (tool) {
                // Filter by budget if needed
                if (budgetType === 'free' && !tool.pricing.free) {
                    continue; // Skip non-free tools if user wants free
                }
                tools.push(tool);
            }
        }

        console.log(`[DECY] Found ${tools.length} tools from AI's recommendations`);
        return tools;
    }

    /**
     * Generate an optimized prompt for a specific AI tool
     * This is DECY's unique feature - we don't just recommend tools, we help you USE them!
     */
    async generatePromptForTool(toolId, toolName, userDescription) {
        console.log(`[DECY] Generating prompt for ${toolName}: "${userDescription}"`);

        if (!this.groq) {
            // Fallback if Groq is not available
            return this.generateBasicPrompt(toolName, userDescription);
        }

        // Tool-specific prompt templates
        const toolContexts = {
            // App Builders
            'lovable': 'Lovable builds full-stack web apps. Include: tech stack preferences, UI components, features, pages, and functionality.',
            'bolt': 'Bolt.new creates web apps in browser. Specify: framework (React/Vue/etc), components, styling, and features.',
            'v0': 'v0 generates React/Next.js UI components. Describe: component type, styling, interactivity, and variants.',
            'replit': 'Replit is a coding environment. Specify: programming language, project type, and what it should do.',

            // Image Generators
            'ideogram': 'Ideogram excels at text in images. Include: image style, subjects, colors, mood, and any text to include.',
            'leonardo': 'Leonardo.ai creates detailed images. Specify: art style, subject, lighting, composition, and quality settings.',
            'midjourney': 'Midjourney creates artistic images. Include: artistic style, subject, mood, lighting, and aspect ratio.',
            'bing_image_creator': 'Bing uses DALL-E 3. Describe: subject, style, setting, mood, and composition.',

            // Video
            'runway': 'Runway generates AI videos. Describe: scene, motion, style, duration, and visual effects.',
            'invideo': 'InVideo creates videos from descriptions. Include: topic, style, length, tone, and call-to-action.',

            // Presentations
            'gamma': 'Gamma creates presentations. Specify: topic, audience, key points, style, and number of slides.',
            'tome': 'Tome makes storytelling presentations. Include: narrative arc, key messages, visual style.',

            // Audio
            'suno': 'Suno creates songs. Include: genre, mood, tempo, lyric theme, and musical style.',
            'elevenlabs': 'ElevenLabs converts text to speech. Include: the exact script and voice characteristics.',
            'murf': 'Murf creates professional voiceovers. Include: script, tone, pacing, and audience.'
        };

        const toolContext = toolContexts[toolId] || `${toolName} is an AI tool. Be specific about what you want to create.`;

        const messages = [
            {
                role: 'system',
                content: `You are an expert prompt engineer. Generate the PERFECT prompt for ${toolName}.

TOOL CONTEXT: ${toolContext}

YOUR TASK:
1. Take the user's brief description
2. Expand it into a detailed, optimized prompt that will get the BEST results from ${toolName}
3. Include specific details, settings, and parameters that work well with this tool
4. Format it cleanly so the user can copy-paste it directly

OUTPUT RULES:
- Output ONLY the prompt text, nothing else
- No explanations, no "Here is your prompt:", just the prompt itself
- Make it detailed but focused (150-300 words ideal)
- Use the formatting style that works best for ${toolName}`
            },
            {
                role: 'user',
                content: `Generate an optimized ${toolName} prompt for: "${userDescription}"`
            }
        ];

        try {
            const completion = await this.groq.chat.completions.create({
                messages: messages,
                model: 'llama-3.3-70b-versatile',
                temperature: 0.7,
                max_tokens: 600
            });

            const prompt = completion.choices[0]?.message?.content?.trim() || '';
            console.log(`[DECY] Generated prompt (${prompt.length} chars)`);
            return prompt;
        } catch (error) {
            console.error('[DECY] Prompt generation failed:', error.message);
            return this.generateBasicPrompt(toolName, userDescription);
        }
    }

    /**
     * Basic prompt generation fallback (when Groq is unavailable)
     */
    generateBasicPrompt(toolName, userDescription) {
        return `Create ${userDescription}

Requirements:
- Modern, clean design
- Professional quality
- User-friendly and intuitive
- Responsive and well-organized

Please make it polished and ready to use.`;
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
     * Get response using Groq (Llama 3) - AI-FIRST APPROACH
     * The AI understands the conversation and returns structured JSON
     */
    async getGroqResponse(message, history = []) {
        // Build the tools context for the AI
        const toolsContext = this.buildToolsContext();

        // Build conversation messages with a smart system prompt
        const messages = [
            {
                role: 'system',
                content: `You are DECY - an AI assistant that helps users find the perfect AI tools. You TRULY UNDERSTAND what users need.

YOUR TOOL KNOWLEDGE (use these exact IDs when recommending):
- Website/App Building: lovable, bolt, replit, v0
- Image Generation: ideogram, leonardo, bing_image_creator, midjourney
- Image Editing: canva, remove_bg, photoroom, clipdrop
- Video Creation: capcut, runway, invideo, descript, opusclip
- Coding: cursor, github_copilot, chatgpt, claude
- Writing: notion_ai, grammarly, copy_ai, jasper
- Design/Graphics: canva_design, figma, looka, kittl
- Presentations: gamma, tome, beautiful_ai
- Audio/Music: elevenlabs, suno, murf

INTENT MAPPING - FOLLOW STRICTLY:
When user says...                          → Category to pick from
"portfolio", "personal website", "landing page", "website", "web app" → Website/App Building (lovable, bolt, v0)
"app", "mobile app", "build app", "startup idea" → Website/App Building (lovable, bolt, replit)
"logo", "brand", "branding" → Design/Graphics (looka, canva_design, kittl)
"poster", "flyer", "social media post", "instagram post", "thumbnail" → Design/Graphics (canva_design, kittl, figma)
"UI design", "wireframe", "mockup", "prototype" → Design/Graphics (figma, canva_design)
"image", "picture", "illustration", "artwork", "AI art" → Image Generation (ideogram, leonardo, midjourney)
"edit photo", "remove background", "enhance photo" → Image Editing (canva, remove_bg, clipdrop)
"video", "reel", "short", "youtube", "edit video" → Video Creation (capcut, descript, invideo)
"generate video", "text to video", "AI video" → Video Creation (runway, invideo, pika)
"presentation", "slides", "pitch deck", "ppt" → Presentations (gamma, tome, beautiful_ai)
"write", "blog", "article", "essay", "content" → Writing (notion_ai, copy_ai, grammarly)
"code", "programming", "debug", "developer" → Coding (cursor, github_copilot, chatgpt)
"voice", "voiceover", "text to speech", "narration" → Audio/Music (elevenlabs, murf)
"music", "song", "beat" → Audio/Music (suno, elevenlabs)
"resume" → BOTH Design (canva_design) AND App Building (lovable)

CRITICAL RULES:
1. NEVER mix categories randomly. A "portfolio" request = Website/App Building tools ONLY (lovable, bolt, v0)
2. Recommend ALL 3 tools from the SAME primary category
3. Only mix categories if the request EXPLICITLY mentions two different tasks

YOUR RESPONSE FORMAT (JSON only):
{
  "action": "chat" | "show_tools",
  "message": "Your friendly response",
  "budget": "free" | "premium" | null,
  "tools": ["tool_id_1", "tool_id_2", "tool_id_3"] | null
}

DECISION RULES:
- Just chatting → action: "chat", tools: null
- Wants something, no budget mentioned → action: "chat", ask "Would you prefer free tools or premium options?"
- Wants something + budget mentioned → action: "show_tools", return best 3 tool IDs
- Says "free"/"premium" after you asked → action: "show_tools", pick best tools for that budget

PERSONALITY: Warm, friendly, concise (2-3 sentences), use emojis occasionally.

CRITICAL: Return ONLY valid JSON. Put tool IDs in the "tools" array.`
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
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        console.log('[DECY] Groq raw response:', responseText.substring(0, 150) + '...');

        try {
            const aiResponse = JSON.parse(responseText);

            if (aiResponse.action === 'show_tools' && aiResponse.budget && aiResponse.tools) {
                console.log(`[DECY] AI recommended tools: ${aiResponse.tools.join(', ')} | Budget: ${aiResponse.budget}`);
                return {
                    success: true,
                    type: 'show_tools',
                    budget: aiResponse.budget,
                    toolIds: aiResponse.tools,  // AI-selected tool IDs
                    response: aiResponse.message || '🔍 Here are the best tools for you!'
                };
            } else {
                console.log('[DECY] AI decided to chat');
                return {
                    success: true,
                    type: 'chat',
                    response: aiResponse.message || "I'm here to help you find the perfect AI tool! What would you like to create or build?"
                };
            }
        } catch (parseError) {
            console.log('[DECY] Failed to parse AI response, treating as chat:', parseError.message);
            // If JSON parsing fails, treat the response as a regular chat message
            return {
                success: true,
                type: 'chat',
                response: responseText
            };
        }
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
