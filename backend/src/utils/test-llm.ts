/**
 * TEST SCRIPT: Mapai AI + Places Integration
 * Verifies that Claude correctly detects intent and Google Places returns results.
 * Usage: npx tsx src/utils/test-llm.ts
 */

import 'dotenv/config';
import { AiOrchestrator } from '../services/ai-orchestrator.js';
import { PlacesService } from '../services/places-service.js';

async function testIntegration() {
    console.log('🧪 Starting Mapai AI + Places Integration Test...');
    
    const ai = new AiOrchestrator();
    const places = new PlacesService();
    
    const testQueries = [
        "Find some cool espresso bars in Back Bay where I can work.",
        "I'm looking for a date night spot in the South End, something cozy and Italian.",
    ];
    
    const mockMemory = {
        cuisineLikes: ['Italian', 'Japanese'],
        cuisineDislikes: ['Fast food'],
        priceRange: { min: 2, max: 4 },
        speedSensitivity: 'moderate',
        ambiancePreferences: ['cozy', 'quiet'],
        dietaryRestrictions: [],
    };
    
    for (const query of testQueries) {
        console.log(`\n--- User: "${query}" ---`);
        
        try {
            console.log('🤖 Sending to Claude...');
            const aiResponse = await ai.chat({
                message: query,
                userId: 'test-user',
                userMemory: mockMemory,
                location: { latitude: 42.3601, longitude: -71.0589 }
            });
            
            console.log(`💬 AI: ${aiResponse.text.slice(0, 100)}...`);
            
            if (aiResponse.searchQuery) {
                console.log(`🔍 Detected Search Query: "${aiResponse.searchQuery}"`);
                
                console.log('🗺️  Fetching from Google Places...');
                const results = await places.search({
                    query: aiResponse.searchQuery,
                    location: { latitude: 42.3601, longitude: -71.0589 },
                    userId: 'test-user',
                    userMemory: mockMemory
                });
                
                console.log(`✅ Success! Found ${results.length} places.`);
                results.slice(0, 2).forEach(p => {
                    console.log(`   - ${p.name} (${p.matchScore}% Match)`);
                });
            } else {
                console.warn('⚠️ No search query detected by AI.');
            }
            
        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    }
}

testIntegration().catch(console.error);
