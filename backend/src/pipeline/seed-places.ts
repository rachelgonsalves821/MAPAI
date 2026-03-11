/**
 * Mapai Data Pipeline — Place Index Seeder
 * Crawls Google Places API to build the Boston place index.
 * Target: 4,000–6,000 venues across key neighborhoods.
 *
 * Usage: npx tsx src/pipeline/seed-places.ts
 */

import 'dotenv/config';

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

interface SeedResult {
    neighborhood: string;
    type: string;
    count: number;
    places: any[];
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

    const data = await response.json();
    return data.places || [];
}

async function main() {
    if (!GOOGLE_API_KEY) {
        console.error('❌ GOOGLE_PLACES_API_KEY not set in environment');
        process.exit(1);
    }

    console.log('🗺️  Mapai Place Index Seeder');
    console.log(`   ${BOSTON_NEIGHBORHOODS.length} neighborhoods × ${PLACE_TYPES.length} categories`);
    console.log('');

    const allPlaces = new Map<string, any>(); // dedupe by place ID
    const results: SeedResult[] = [];

    for (const hood of BOSTON_NEIGHBORHOODS) {
        console.log(`📍 ${hood.name}`);

        for (const type of PLACE_TYPES) {
            // Throttle to respect API rate limits
            await sleep(200);

            const places = await searchNearby(
                { lat: hood.lat, lng: hood.lng },
                type
            );

            let newCount = 0;
            for (const p of places) {
                if (!allPlaces.has(p.id)) {
                    allPlaces.set(p.id, {
                        ...mapPlace(p),
                        neighborhood: hood.name,
                        seedCategory: type,
                    });
                    newCount++;
                }
            }

            console.log(`   ${type}: ${places.length} found, ${newCount} new`);

            results.push({
                neighborhood: hood.name,
                type,
                count: newCount,
                places: places.map(mapPlace),
            });
        }
    }

    // Summary
    console.log('\n─────────────────────────────────────');
    console.log(`✅ Total unique places: ${allPlaces.size}`);
    console.log('');

    // Write index to JSON for now (Sprint 2: write to PostgreSQL)
    const indexData = Array.from(allPlaces.values());
    const outputPath = 'place-index.json';

    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(indexData, null, 2));
    console.log(`📄 Saved to ${outputPath}`);
}

function mapPlace(raw: any): any {
    const priceLevelMap: Record<string, number> = {
        PRICE_LEVEL_FREE: 0,
        PRICE_LEVEL_INEXPENSIVE: 1,
        PRICE_LEVEL_MODERATE: 2,
        PRICE_LEVEL_EXPENSIVE: 3,
        PRICE_LEVEL_VERY_EXPENSIVE: 4,
    };

    return {
        id: raw.id,
        name: raw.displayName?.text || '',
        address: raw.formattedAddress || '',
        location: raw.location || { latitude: 0, longitude: 0 },
        rating: raw.rating || 0,
        ratingCount: raw.userRatingCount || 0,
        priceLevel: priceLevelMap[raw.priceLevel] ?? 2,
        category: raw.primaryType || 'restaurant',
        photos: (raw.photos || []).slice(0, 3).map((p: any) => p.name),
        openNow: raw.regularOpeningHours?.openNow,
        website: raw.websiteUri || '',
        phoneNumber: raw.nationalPhoneNumber || '',
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
