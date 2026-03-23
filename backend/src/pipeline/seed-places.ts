/**
 * Mapai Data Pipeline — Place Index Seeder
 * Crawls Google Places API to build the Boston place index.
 * Target: 4,000–6,000 venues across key neighborhoods.
 *
 * Writes to Supabase when configured, falls back to place-index.json.
 * Usage: npx tsx src/pipeline/seed-places.ts
 */

import 'dotenv/config';
import { getSupabase } from '../db/supabase-client.js';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const PLACES_BASE = 'https://places.googleapis.com/v1/places';

// Boston neighborhoods to crawl (PRD §4.1)
const BOSTON_NEIGHBORHOODS = [
    { name: 'Back Bay', lat: 42.3503, lng: -71.0810 },
    { name: 'South End', lat: 42.3420, lng: -71.0713 },
    { name: 'North End', lat: 42.3647, lng: -71.0542 },
    { name: 'Beacon Hill', lat: 42.3588, lng: -71.0707 },
    { name: 'Downtown/Financial', lat: 42.3555, lng: -71.0565 },
    { name: 'Seaport', lat: 42.3479, lng: -71.0387 },
    { name: 'Fenway/Kenmore', lat: 42.3467, lng: -71.0972 },
    { name: 'Allston/Brighton', lat: 42.3539, lng: -71.1337 },
    { name: 'Jamaica Plain', lat: 42.3097, lng: -71.1151 },
    { name: 'Somerville', lat: 42.3876, lng: -71.0995 },
    { name: 'Cambridge/Harvard', lat: 42.3736, lng: -71.1097 },
    { name: 'Cambridge/Kendall', lat: 42.3629, lng: -71.0862 },
    { name: 'Brookline', lat: 42.3318, lng: -71.1212 },
    { name: 'Charlestown', lat: 42.3782, lng: -71.0602 },
];

const PLACE_TYPES = [
    'restaurant',
    'cafe',
    'bar',
    'coffee_shop',
    'bakery',
    'meal_delivery',
    'meal_takeaway',
];

interface MappedPlace {
    google_place_id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    neighborhood: string;
    category: string;
    rating: number;
    rating_count: number;
    price_level: number;
    photos: string[];
    website: string;
    phone_number: string;
    open_now: boolean | null;
    seed_category: string;
}

async function searchNearby(
    location: { lat: number; lng: number },
    type: string,
    radius: number = 1500
): Promise<any[]> {
    const response = await fetch(`${PLACES_BASE}:searchNearby`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.location,' +
                'places.rating,places.priceLevel,places.primaryType,places.photos,' +
                'places.regularOpeningHours,places.websiteUri,places.nationalPhoneNumber,' +
                'places.userRatingCount',
        },
        body: JSON.stringify({
            locationRestriction: {
                circle: {
                    center: { latitude: location.lat, longitude: location.lng },
                    radius,
                },
            },
            includedTypes: [type],
            maxResultCount: 20,
        }),
    });

    if (!response.ok) {
        console.error(`  ✗ API error for ${type}: ${response.status}`);
        return [];
    }

    const data = (await response.json()) as any;
    return data.places || [];
}

function mapPlace(raw: any, neighborhood: string, seedCategory: string): MappedPlace {
    const priceLevelMap: Record<string, number> = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };

    return {
        google_place_id: raw.id,
        name: raw.displayName?.text || '',
        address: raw.formattedAddress || '',
        latitude: raw.location?.latitude || 0,
        longitude: raw.location?.longitude || 0,
        neighborhood,
        category: raw.primaryType || 'restaurant',
        rating: raw.rating || 0,
        rating_count: raw.userRatingCount || 0,
        price_level: priceLevelMap[raw.priceLevel] ?? 2,
        photos: (raw.photos || []).slice(0, 3).map((p: any) => p.name),
        website: raw.websiteUri || '',
        phone_number: raw.nationalPhoneNumber || '',
        open_now: raw.regularOpeningHours?.openNow ?? null,
        seed_category: seedCategory,
    };
}

async function writeToSupabase(places: MappedPlace[]): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) return false;

    console.log(`\n📤 Writing ${places.length} places to Supabase...`);

    // Batch upsert in chunks of 100
    const BATCH_SIZE = 100;
    let written = 0;

    for (let i = 0; i < places.length; i += BATCH_SIZE) {
        const batch = places.slice(i, i + BATCH_SIZE);
        const { error } = await (supabase.from('places') as any)
            .upsert(batch as any[], { onConflict: 'google_place_id' });

        if (error) {
            console.error(`  ✗ Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
        } else {
            written += batch.length;
        }
    }

    console.log(`✅ Wrote ${written}/${places.length} places to Supabase`);
    return true;
}

async function writeToJson(places: MappedPlace[]): Promise<void> {
    const fs = await import('fs');
    const outputPath = 'place-index.json';
    fs.writeFileSync(outputPath, JSON.stringify(places, null, 2));
    console.log(`📄 Saved ${places.length} places to ${outputPath}`);
}

async function main() {
    if (!GOOGLE_API_KEY) {
        console.error('❌ GOOGLE_PLACES_API_KEY not set in environment');
        process.exit(1);
    }

    console.log('🗺️  Mapai Place Index Seeder');
    console.log(`   ${BOSTON_NEIGHBORHOODS.length} neighborhoods × ${PLACE_TYPES.length} categories`);
    console.log('');

    const allPlaces = new Map<string, MappedPlace>();

    for (const hood of BOSTON_NEIGHBORHOODS) {
        console.log(`📍 ${hood.name}`);

        for (const type of PLACE_TYPES) {
            await sleep(200);

            const rawPlaces = await searchNearby(
                { lat: hood.lat, lng: hood.lng },
                type
            );

            let newCount = 0;
            for (const p of rawPlaces) {
                if (!allPlaces.has(p.id)) {
                    allPlaces.set(p.id, mapPlace(p, hood.name, type));
                    newCount++;
                }
            }

            console.log(`   ${type}: ${rawPlaces.length} found, ${newCount} new`);
        }
    }

    console.log('\n─────────────────────────────────────');
    console.log(`✅ Total unique places: ${allPlaces.size}`);

    const places = Array.from(allPlaces.values());

    // Try Supabase first, fallback to JSON
    const wroteToDb = await writeToSupabase(places);
    if (!wroteToDb) {
        console.log('⚠️  No Supabase credentials — falling back to JSON file');
        await writeToJson(places);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
