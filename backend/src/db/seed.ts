/**
 * Mapai Backend — Database Seed
 * Inserts test data for local development.
 * Run: npx tsx src/db/seed.ts
 */

import 'dotenv/config';
import { getSupabase } from './supabase-client.js';

async function main() {
    console.log('🌱 Mapai Database Seeder');

    const supabase = getSupabase();
    if (!supabase) {
        console.log('⚠️  No Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
        return;
    }

    // 1. Create a dev user
    const { data: user, error: userErr } = await (supabase as any)
        .from('users')
        .upsert({
            id: 'dev-user-001',
            email: 'dev@mapai.app',
            display_name: 'Dev User',
            onboarding_complete: true,
        }, { onConflict: 'id' })
        .select()
        .single();

    if (userErr) {
        console.error('Error creating dev user:', userErr.message);
    } else {
        console.log('✅ Dev user created:', user?.email);
    }

    // 2. Seed some preferences
    const preferences = [
        { user_id: 'dev-user-001', dimension: 'cuisine_like', value: 'Italian', confidence: 0.85, source: 'explicit' },
        { user_id: 'dev-user-001', dimension: 'cuisine_like', value: 'Japanese', confidence: 0.75, source: 'inferred' },
        { user_id: 'dev-user-001', dimension: 'cuisine_dislike', value: 'Fast food', confidence: 0.60, source: 'inferred' },
        { user_id: 'dev-user-001', dimension: 'ambiance_preference', value: 'cozy', confidence: 0.70, source: 'inferred' },
        { user_id: 'dev-user-001', dimension: 'price_preference', value: 'moderate', confidence: 0.80, source: 'explicit' },
        { user_id: 'dev-user-001', dimension: 'dietary_restriction', value: 'vegetarian-friendly', confidence: 0.65, source: 'inferred' },
    ];

    const { error: prefErr } = await (supabase as any)
        .from('user_preferences')
        .upsert(preferences);

    if (prefErr) {
        console.error('Error seeding preferences:', prefErr.message);
    } else {
        console.log(`✅ Seeded ${preferences.length} preferences`);
    }

    // 3. Seed a couple of test places
    const places = [
        {
            google_place_id: 'ChIJYTN9T-14j4ARe3GfygqMnbk_test1',
            name: 'Neptune Oyster',
            address: '63 Salem St, Boston, MA 02113',
            latitude: 42.3637,
            longitude: -71.0546,
            neighborhood: 'North End',
            category: 'restaurant',
            rating: 4.6,
            rating_count: 3200,
            price_level: 3,
            photos: [],
            website: 'https://www.neptuneoyster.com',
        },
        {
            google_place_id: 'ChIJYTN9T-14j4ARe3GfygqMnbk_test2',
            name: 'Tatte Bakery',
            address: '70 Charles St, Boston, MA 02114',
            latitude: 42.3571,
            longitude: -71.0701,
            neighborhood: 'Beacon Hill',
            category: 'cafe',
            rating: 4.5,
            rating_count: 1800,
            price_level: 2,
            photos: [],
            website: 'https://tattebakery.com',
        },
    ];

    const { error: placeErr } = await (supabase as any)
        .from('places')
        .upsert(places, { onConflict: 'google_place_id' });

    if (placeErr) {
        console.error('Error seeding places:', placeErr.message);
    } else {
        console.log(`✅ Seeded ${places.length} test places`);
    }

    console.log('\n🎉 Seed complete!');
}

main().catch(console.error);
