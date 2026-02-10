/**
 * DECY Bulk Tool Importer
 * Discovers and adds popular AI tools to the database automatically
 * Run: node scripts/bulk-import.js
 */

require('dotenv').config();
const ToolScraper = require('../services/scraper');

const scraper = new ToolScraper();

// Curated list of popular AI tools DECY should know about
// These are real, popular tools that users actually search for
const TOOLS_TO_DISCOVER = [
    // --- Image Generation ---
    { url: 'https://www.midjourney.com', name: 'Midjourney' },
    { url: 'https://ideogram.ai', name: 'Ideogram' },
    { url: 'https://flux.ai', name: 'Flux AI' },
    { url: 'https://playground.com', name: 'Playground AI' },
    { url: 'https://stablediffusionweb.com', name: 'Stable Diffusion' },
    { url: 'https://nightcafe.studio', name: 'NightCafe' },
    { url: 'https://creator.nightcafe.studio', name: 'NightCafe Creator' },
    { url: 'https://deepai.org', name: 'DeepAI' },

    // --- Video Creation ---
    { url: 'https://pika.art', name: 'Pika' },
    { url: 'https://lumalabs.ai', name: 'Luma Dream Machine' },
    { url: 'https://www.synthesia.io', name: 'Synthesia' },
    { url: 'https://heygen.com', name: 'HeyGen' },
    { url: 'https://www.veed.io', name: 'VEED' },
    { url: 'https://fliki.ai', name: 'Fliki' },
    { url: 'https://www.d-id.com', name: 'D-ID' },
    { url: 'https://pictory.ai', name: 'Pictory' },

    // --- Writing / Content ---
    { url: 'https://writesonic.com', name: 'Writesonic' },
    { url: 'https://rytr.me', name: 'Rytr' },
    { url: 'https://www.wordtune.com', name: 'Wordtune' },
    { url: 'https://quillbot.com', name: 'QuillBot' },
    { url: 'https://www.hyperwriteai.com', name: 'HyperWrite' },
    { url: 'https://www.sudowrite.com', name: 'Sudowrite' },

    // --- Coding ---
    { url: 'https://www.tabnine.com', name: 'Tabnine' },
    { url: 'https://codeium.com', name: 'Codeium' },
    { url: 'https://www.windsurf.com', name: 'Windsurf' },
    { url: 'https://aider.chat', name: 'Aider' },
    { url: 'https://www.codium.ai', name: 'CodiumAI' },

    // --- Design ---
    { url: 'https://www.framer.com', name: 'Framer' },
    { url: 'https://www.canva.com', name: 'Canva' },
    { url: 'https://www.kittl.com', name: 'Kittl' },
    { url: 'https://www.autodraw.com', name: 'AutoDraw' },
    { url: 'https://uizard.io', name: 'Uizard' },
    { url: 'https://magician.design', name: 'Magician' },

    // --- Presentations ---
    { url: 'https://www.slidesai.io', name: 'SlidesAI' },
    { url: 'https://www.decktopus.com', name: 'Decktopus' },
    { url: 'https://pitch.com', name: 'Pitch' },

    // --- Audio / Voice ---
    { url: 'https://www.descript.com', name: 'Descript' },
    { url: 'https://murf.ai', name: 'Murf AI' },
    { url: 'https://play.ht', name: 'Play.ht' },
    { url: 'https://www.resemble.ai', name: 'Resemble AI' },
    { url: 'https://speechify.com', name: 'Speechify' },
    { url: 'https://www.naturalreaders.com', name: 'NaturalReader' },

    // --- Music ---
    { url: 'https://suno.com', name: 'Suno' },
    { url: 'https://udio.com', name: 'Udio' },
    { url: 'https://www.aiva.ai', name: 'AIVA' },
    { url: 'https://boomy.com', name: 'Boomy' },

    // --- AI Assistants / Chatbots ---
    { url: 'https://poe.com', name: 'Poe' },
    { url: 'https://www.perplexity.ai', name: 'Perplexity' },
    { url: 'https://you.com', name: 'You.com' },
    { url: 'https://www.phind.com', name: 'Phind' },

    // --- Productivity ---
    { url: 'https://otter.ai', name: 'Otter AI' },
    { url: 'https://fireflies.ai', name: 'Fireflies' },
    { url: 'https://www.taskade.com', name: 'Taskade' },
    { url: 'https://www.mem.ai', name: 'Mem AI' },
    { url: 'https://reclaim.ai', name: 'Reclaim AI' },

    // --- App Building ---
    { url: 'https://www.framer.com', name: 'Framer' },
    { url: 'https://bubble.io', name: 'Bubble' },
    { url: 'https://glideapps.com', name: 'Glide' },
    { url: 'https://www.softr.io', name: 'Softr' },
    { url: 'https://www.builder.ai', name: 'Builder.ai' },

    // --- Marketing ---
    { url: 'https://www.adcreative.ai', name: 'AdCreative' },
    { url: 'https://www.predis.ai', name: 'Predis AI' },
    { url: 'https://www.pencil.li', name: 'Pencil' },

    // --- Research ---
    { url: 'https://elicit.com', name: 'Elicit' },
    { url: 'https://consensus.app', name: 'Consensus' },
    { url: 'https://www.semanticscholar.org', name: 'Semantic Scholar' },

    // --- 3D / Game ---
    { url: 'https://meshy.ai', name: 'Meshy' },
    { url: 'https://spline.design', name: 'Spline' },
    { url: 'https://www.blockadelabs.com', name: 'Blockade Labs' },
];

async function bulkImport() {
    console.log('🚀 DECY Bulk Import Starting...');
    console.log(`📋 ${TOOLS_TO_DISCOVER.length} tools to check\n`);

    const results = { added: 0, skipped: 0, failed: 0 };
    const existingIds = scraper.getExistingToolIds();

    for (let i = 0; i < TOOLS_TO_DISCOVER.length; i++) {
        const tool = TOOLS_TO_DISCOVER[i];
        const progress = `[${i + 1}/${TOOLS_TO_DISCOVER.length}]`;

        // Skip if already exists
        if (existingIds.has(tool.name.toLowerCase())) {
            console.log(`${progress} ⏭️  ${tool.name} - already exists`);
            results.skipped++;
            continue;
        }

        try {
            console.log(`${progress} 🔍 Discovering ${tool.name}...`);
            const result = await scraper.discoverToolByUrl(tool.url);

            if (result.success) {
                console.log(`${progress} ✅ ${tool.name} → ${result.tool.category}`);
                results.added++;
                existingIds.add(tool.name.toLowerCase());
                existingIds.add(result.tool.id);
            } else {
                console.log(`${progress} ❌ ${tool.name} - ${result.error}`);
                results.failed++;
            }
        } catch (error) {
            console.log(`${progress} ❌ ${tool.name} - ${error.message}`);
            results.failed++;
        }

        // Rate limit - 1.5 seconds between requests
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log('\n════════════════════════════════════');
    console.log('📊 BULK IMPORT RESULTS');
    console.log('════════════════════════════════════');
    console.log(`✅ Added:   ${results.added}`);
    console.log(`⏭️  Skipped: ${results.skipped} (already existed)`);
    console.log(`❌ Failed:  ${results.failed}`);
    console.log('════════════════════════════════════');

    // Show final stats
    const stats = scraper.getStats();
    console.log(`\n📦 Total tools in database: ${stats.totalTools}`);
    console.log(`📂 Total categories: ${stats.categories}`);
}

bulkImport().then(() => {
    console.log('\n✨ Done! DECY now knows way more tools.');
    process.exit(0);
}).catch(error => {
    console.error('Import failed:', error);
    process.exit(1);
});
