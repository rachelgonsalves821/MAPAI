/**
 * Quick test: verify Supabase connection works.
 * Run: npx tsx src/db/test-connection.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

console.log('🔗 Testing Supabase connection...');
console.log(`   URL: ${url}`);

const supabase = createClient(url, key, {
    auth: { persistSession: false },
});

async function test() {
    // Try a simple query to see if the connection works
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
        // If table doesn't exist yet, that's expected — connection still works
        if (error.message.includes('does not exist') || error.code === '42P01') {
            console.log('✅ Connection works! (tables not yet created — migration needed)');
            return true;
        }
        // Permission/auth errors mean credentials might be wrong
        console.log(`⚠️  Error: ${error.message} (code: ${error.code})`);
        return false;
    }
    
    console.log('✅ Connection works! Tables already exist.');
    console.log('   Data:', data);
    return true;
}

test().then((ok) => {
    if (!ok) process.exit(1);
}).catch((err) => {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
});
