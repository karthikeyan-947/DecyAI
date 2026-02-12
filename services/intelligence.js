/**
 * DECY Intelligence Layer
 * Smart pre-filtering and context building for AI recommendations
 * This is what makes DECY actually understand user needs
 */

class DecyIntelligence {
    constructor(tools) {
        this.tools = tools;
        this.intentMap = this.buildIntentMap();
        this.allToolsFlat = this.flattenTools();
    }

    /**
     * Flatten all tools into a single searchable array with category info
     */
    flattenTools() {
        const flat = [];
        for (const [catKey, cat] of Object.entries(this.tools.categories)) {
            for (const tool of cat.tools) {
                flat.push({
                    ...tool,
                    categoryKey: catKey,
                    categoryName: cat.name,
                    categoryKeywords: cat.keywords || [],
                    // Build searchable text for matching
                    searchText: [
                        tool.name,
                        tool.bestFor,
                        tool.whySuitsYou || '',
                        tool.limits || '',
                        ...(cat.keywords || [])
                    ].join(' ').toLowerCase()
                });
            }
        }
        return flat;
    }

    /**
     * Intent mapping — maps real user language to tool categories and use cases
     * This is the "brain" that understands what users actually mean
     */
    buildIntentMap() {
        return [
            // === BUILDING / CREATING ===
            {
                intents: ['portfolio', 'personal website', 'personal site', 'showcase my work', 'online presence'],
                category: 'app_building',
                context: 'The user wants to build a personal portfolio website to showcase their work. Recommend app/website builders that are easy to use and produce professional-looking sites.',
                priority: ['lovable', 'bolt', 'v0']
            },
            {
                intents: ['landing page', 'saas', 'startup website', 'product page', 'business website'],
                category: 'app_building',
                context: 'The user wants to build a professional landing page or business website. Recommend tools that can create polished, conversion-optimized pages.',
                priority: ['lovable', 'bolt', 'v0']
            },
            {
                intents: ['app', 'mobile app', 'web app', 'build app', 'create app', 'develop app', 'mvp', 'prototype'],
                category: 'app_building',
                context: 'The user wants to build a functional application. Recommend no-code/low-code builders that can create real, deployable apps.',
                priority: ['lovable', 'bolt', 'replit']
            },

            // === VISUAL CONTENT ===
            {
                intents: ['logo', 'brand identity', 'branding', 'brand kit', 'company logo'],
                category: 'design',
                context: 'The user needs logo/branding design. Recommend AI tools specifically built for logo creation.',
                priority: ['looka', 'canva_design', 'kittl']
            },
            {
                intents: ['poster', 'flyer', 'banner', 'social media post', 'instagram post', 'thumbnail', 'cover image', 'marketing material'],
                category: 'design',
                context: 'The user wants to create visual marketing content. Recommend design tools with templates for social media and marketing.',
                priority: ['canva_design', 'kittl', 'figma']
            },
            {
                intents: ['ui design', 'wireframe', 'mockup', 'prototype design', 'user interface', 'figma'],
                category: 'design',
                context: 'The user needs to design user interfaces or wireframes. Recommend professional UI/UX design tools.',
                priority: ['figma', 'uizard', 'canva_design']
            },

            // === IMAGE GENERATION ===
            {
                intents: ['generate image', 'create image', 'ai art', 'artwork', 'illustration', 'picture', 'image generation', 'ai image', 'draw'],
                category: 'image_generation',
                context: 'The user wants to generate images from text descriptions. Recommend AI image generators.',
                priority: ['ideogram', 'leonardo', 'midjourney']
            },
            {
                intents: ['edit photo', 'remove background', 'enhance photo', 'photo editing', 'retouch', 'upscale image'],
                category: 'image_editing',
                context: 'The user wants to edit or enhance existing photos. Recommend photo editing AI tools.',
                priority: ['canva', 'remove_bg', 'clipdrop']
            },

            // === VIDEO ===
            {
                intents: ['video', 'edit video', 'reel', 'short', 'youtube', 'tiktok', 'clip', 'montage'],
                category: 'video_creation',
                context: 'The user wants to create or edit video content. Recommend video editing tools.',
                priority: ['capcut', 'descript', 'invideo']
            },
            {
                intents: ['generate video', 'text to video', 'ai video', 'animate', 'motion', 'video from text'],
                category: 'video_creation',
                context: 'The user wants to generate video from text or images using AI. Recommend AI video generators.',
                priority: ['runway', 'pika', 'invideo']
            },
            {
                intents: ['talking head', 'avatar video', 'spokesperson', 'virtual presenter'],
                category: 'video_creation',
                context: 'The user wants AI-generated talking head or avatar videos. Recommend avatar video tools.',
                priority: ['heygen', 'synthesia', 'd-id']
            },

            // === WRITING ===
            {
                intents: ['write', 'blog', 'article', 'essay', 'content', 'copywriting', 'email', 'marketing copy'],
                category: 'writing',
                context: 'The user wants to write or generate text content. Recommend AI writing tools.',
                priority: ['notion_ai', 'copy_ai', 'jasper']
            },
            {
                intents: ['grammar', 'proofread', 'spelling', 'editing text', 'paraphrase', 'rewrite'],
                category: 'writing',
                context: 'The user wants to check grammar, paraphrase, or improve existing text. Recommend editing/grammar tools.',
                priority: ['grammarly', 'quillbot', 'wordtune']
            },

            // === CODING ===
            {
                intents: ['code', 'programming', 'debug', 'developer', 'coding assistant', 'autocomplete', 'copilot'],
                category: 'coding_assistance',
                context: 'The user needs help with coding or programming. Recommend AI coding assistants.',
                priority: ['cursor', 'github_copilot', 'chatgpt']
            },

            // === PRESENTATIONS ===
            {
                intents: ['presentation', 'slides', 'pitch deck', 'ppt', 'powerpoint', 'keynote', 'slide deck'],
                category: 'presentation',
                context: 'The user wants to create a presentation or slide deck. Recommend AI presentation tools.',
                priority: ['gamma', 'tome', 'beautiful_ai']
            },

            // === AUDIO ===
            {
                intents: ['voice', 'voiceover', 'text to speech', 'narration', 'dubbing', 'voice clone'],
                category: 'audio',
                context: 'The user needs text-to-speech, voiceovers, or voice generation. Recommend voice AI tools.',
                priority: ['elevenlabs', 'murf', 'play_ht']
            },
            {
                intents: ['music', 'song', 'beat', 'soundtrack', 'jingle', 'compose'],
                category: 'music_generation',
                context: 'The user wants to create music or audio content. Recommend AI music tools.',
                priority: ['suno', 'udio', 'aiva']
            },

            // === PRODUCTIVITY ===
            {
                intents: ['meeting notes', 'transcribe', 'summarize meeting', 'meeting summary'],
                category: 'productivity',
                context: 'The user wants to transcribe or summarize meetings. Recommend meeting AI tools.',
                priority: ['otter', 'fireflies', 'granola']
            },
            {
                intents: ['research', 'find information', 'academic', 'papers', 'study'],
                category: 'research',
                context: 'The user needs help with research or finding information. Recommend AI research tools.',
                priority: ['perplexity', 'elicit', 'consensus']
            },

            // === RESUME (special - crosses categories) ===
            {
                intents: ['resume', 'cv', 'cover letter', 'job application'],
                category: 'design',
                context: 'The user wants to create a resume or CV. Recommend design tools with resume templates, AND website builders for online portfolios.',
                priority: ['canva_design', 'lovable', 'notion_ai']
            }
        ];
    }

    /**
     * THE CORE: Understand what the user wants and find the best tools
     * Returns: { matchedTools: [], context: string, confidence: number }
     */
    analyzeIntent(userMessage) {
        const query = userMessage.toLowerCase().trim();

        // FIRST: Check if user is asking for guidance on a SPECIFIC tool
        const guidance = this.detectToolGuidance(query);
        if (guidance) {
            return guidance;
        }

        const words = query.split(/\s+/);

        let bestMatch = null;
        let bestScore = 0;

        // Score each intent pattern
        for (const pattern of this.intentMap) {
            let score = 0;

            for (const intent of pattern.intents) {
                // Exact phrase match (strongest signal)
                if (query.includes(intent)) {
                    score += 20;
                }
                // Individual word matches
                const intentWords = intent.split(' ');
                for (const iw of intentWords) {
                    if (words.includes(iw)) {
                        score += 5;
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = pattern;
            }
        }

        // If we found a strong match, get the tools
        if (bestMatch && bestScore >= 5) {
            // Get priority tools first, then fill with category tools
            const relevantTools = this.getRelevantTools(bestMatch, query);

            return {
                matched: true,
                category: bestMatch.category,
                context: bestMatch.context,
                confidence: Math.min(bestScore / 20, 1),
                tools: relevantTools
            };
        }

        // Fallback: search all tools by keywords
        const fallbackTools = this.searchAllTools(query);
        if (fallbackTools.length > 0) {
            return {
                matched: true,
                category: 'mixed',
                context: `The user is looking for: "${query}". Found tools by keyword match.`,
                confidence: 0.3,
                tools: fallbackTools.slice(0, 6)
            };
        }

        return {
            matched: false,
            category: null,
            context: 'Could not determine specific tool needs from the message.',
            confidence: 0,
            tools: []
        };
    }

    /**
     * Detect when user is asking HOW TO USE a specific tool
     * e.g., "how to create an app using lovable", "how to use bolt", "guide me on figma"
     */
    detectToolGuidance(query) {
        // Guidance signal words
        const guidanceSignals = [
            'how to use', 'how to create', 'how to build', 'how to make',
            'how do i use', 'how does', 'guide me', 'teach me', 'help me use',
            'steps to use', 'tutorial', 'how to start with', 'getting started',
            'using the', 'using it', 'how can i use', 'what can i do with',
            'tips for', 'how to get started'
        ];

        const hasGuidanceSignal = guidanceSignals.some(signal => query.includes(signal));
        if (!hasGuidanceSignal) return null;

        // Look for a specific tool name in the query
        for (const tool of this.allToolsFlat) {
            const toolName = tool.name.toLowerCase();
            const toolId = tool.id.toLowerCase();

            if (query.includes(toolName) || query.includes(toolId)) {
                return {
                    matched: true,
                    isGuidance: true,
                    category: tool.categoryKey,
                    tool: tool,
                    context: `The user is asking for guidance on HOW TO USE ${tool.name}. DO NOT recommend other tools. Instead, give a clear step-by-step guide on how to use ${tool.name} effectively. Include: 1) How to get started 2) Key features to use 3) Tips for best results. Tool details: ${tool.bestFor}. URL: ${tool.url}`,
                    confidence: 1.0,
                    tools: [tool]
                };
            }
        }

        return null;
    }

    /**
     * Get relevant tools for a matched intent pattern
     */
    getRelevantTools(pattern, query) {
        const tools = [];
        const addedIds = new Set();

        // 1. Add priority tools first (the best picks)
        for (const priorityId of pattern.priority) {
            const tool = this.allToolsFlat.find(t => t.id === priorityId);
            if (tool && !addedIds.has(tool.id)) {
                tools.push(tool);
                addedIds.add(tool.id);
            }
        }

        // 2. Add more tools from the same category
        const categoryTools = this.allToolsFlat
            .filter(t => t.categoryKey === pattern.category && !addedIds.has(t.id))
            .sort((a, b) => (b.ease || 3) - (a.ease || 3));

        for (const tool of categoryTools) {
            if (tools.length >= 6) break;
            tools.push(tool);
            addedIds.add(tool.id);
        }

        return tools;
    }

    /**
     * Search all tools by keyword matching (fallback)
     */
    searchAllTools(query) {
        const queryWords = query.toLowerCase().split(/\s+/);
        const scored = [];

        for (const tool of this.allToolsFlat) {
            let score = 0;
            for (const word of queryWords) {
                if (word.length < 3) continue; // Skip tiny words
                if (tool.searchText.includes(word)) {
                    score += 5;
                }
                if (tool.name.toLowerCase().includes(word)) {
                    score += 15;
                }
            }
            if (score > 0) {
                scored.push({ ...tool, matchScore: score });
            }
        }

        return scored
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 6);
    }

    /**
     * Build rich context for the AI about matched tools
     * This is what makes the AI actually KNOW the tools
     */
    buildToolContext(matchedTools) {
        if (matchedTools.length === 0) return 'No specific tools matched.';

        return matchedTools.map((tool, i) => {
            const pricing = tool.pricing?.free ? 'Free tier available' : (tool.pricing?.premium || 'Paid');
            const premium = tool.pricing?.premium ? ` | Premium: ${tool.pricing.premium}` : '';
            return `${i + 1}. **${tool.name}** (ID: ${tool.id})
   - Best for: ${tool.bestFor}
   - Why it suits: ${tool.whySuitsYou || 'Great option'}
   - Pricing: ${pricing}${premium}
   - Ease of use: ${tool.ease || 3}/5
   - Limits: ${tool.limits || 'Check website'}`;
        }).join('\n\n');
    }

    /**
     * Get follow-up suggestions based on what the user just did
     * Like ChatGPT — always suggest what to do next
     */
    getFollowUpSuggestions(category) {
        const followUps = {
            'app_building': [
                { text: '🎨 Design a logo for it', message: 'I need a logo for my project' },
                { text: '📊 Create a pitch deck', message: 'I want to create a pitch deck' },
                { text: '🎬 Make a launch video', message: 'I need to create a promotional video' },
                { text: '📝 Write marketing copy', message: 'Help me write marketing content for my app' }
            ],
            'design': [
                { text: '🌐 Build a website', message: 'I want to build a website' },
                { text: '🎬 Create a promo video', message: 'I need to create a promotional video' },
                { text: '📝 Write brand content', message: 'I need help writing content for my brand' },
                { text: '📊 Make a presentation', message: 'I want to create a presentation' }
            ],
            'image_generation': [
                { text: '✂️ Edit the image', message: 'I need to edit a photo' },
                { text: '🎨 Design social posts', message: 'I want to create social media posts' },
                { text: '🌐 Build a portfolio', message: 'I want to build a portfolio website' },
                { text: '🎬 Turn it into a video', message: 'I want to create a video from images' }
            ],
            'image_editing': [
                { text: '🖼️ Generate new images', message: 'I want to generate AI images' },
                { text: '🎨 Design with them', message: 'I want to create designs with my images' },
                { text: '🌐 Build a gallery site', message: 'I need to build a gallery website' }
            ],
            'video_creation': [
                { text: '🎵 Add music/voiceover', message: 'I need music or voiceover for my video' },
                { text: '📝 Write a script', message: 'I need help writing a video script' },
                { text: '🎨 Design a thumbnail', message: 'I need a YouTube thumbnail' },
                { text: '🌐 Build a channel site', message: 'I want to build a content creator website' }
            ],
            'writing': [
                { text: '🎨 Design graphics for it', message: 'I need graphics for my content' },
                { text: '📊 Turn it into slides', message: 'I want to turn my content into a presentation' },
                { text: '🎬 Make a video version', message: 'I want to turn my content into a video' },
                { text: '🌐 Publish it online', message: 'I want to build a blog website' }
            ],
            'coding_assistance': [
                { text: '🌐 Deploy my project', message: 'I want to deploy my app online' },
                { text: '🎨 Design the UI', message: 'I need to design a user interface' },
                { text: '📊 Create docs/slides', message: 'I want to create project documentation' }
            ],
            'presentation': [
                { text: '🎬 Record a video pitch', message: 'I want to record a video pitch' },
                { text: '🎨 Design a logo', message: 'I need a professional logo' },
                { text: '🌐 Build a landing page', message: 'I want to create a landing page' }
            ],
            'audio': [
                { text: '🎬 Add to a video', message: 'I want to create a video with voiceover' },
                { text: '📝 Write a script first', message: 'I need help writing a script' },
                { text: '🎵 Generate background music', message: 'I need to create background music' }
            ],
            'music_generation': [
                { text: '🎬 Create a music video', message: 'I want to create a music video' },
                { text: '🎙️ Add vocals/voiceover', message: 'I need voiceover or vocals' },
                { text: '🌐 Build an artist site', message: 'I want to build a music artist website' }
            ],
            'productivity': [
                { text: '📊 Create a presentation', message: 'I want to create a presentation from my notes' },
                { text: '📝 Write a summary', message: 'I need help writing a document' },
                { text: '🌐 Build a project page', message: 'I want to build a project website' }
            ],
            'research': [
                { text: '📝 Write the paper', message: 'I need help writing a research paper' },
                { text: '📊 Create slides', message: 'I want to create a research presentation' },
                { text: '🎬 Make an explainer video', message: 'I want to create an explainer video' }
            ]
        };

        // Get suggestions for the matched category, or return generic ones
        const suggestions = followUps[category] || [
            { text: '🌐 Build a website', message: 'I want to build a website' },
            { text: '🎨 Create a design', message: 'I need help with design' },
            { text: '🎬 Make a video', message: 'I want to create a video' },
            { text: '📝 Write content', message: 'I need help with writing' }
        ];

        // Return 3 random suggestions to keep it fresh
        return this.shuffle(suggestions).slice(0, 3);
    }

    /**
     * Shuffle array (Fisher-Yates)
     */
    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
}

module.exports = DecyIntelligence;

