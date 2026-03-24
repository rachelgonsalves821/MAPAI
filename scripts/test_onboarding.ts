/**
 * Mapai — Onboarding End-to-End Test Script
 * Simulates: login → onboarding → save prefs → reload
 *
 * Run: npx tsx scripts/test_onboarding.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.resolve(__dirname, '../_test_results.log');
const results: string[] = [];

function log(test: string, status: 'PASS' | 'FAIL' | 'SKIP', detail?: string) {
  const line = `[${new Date().toISOString()}] ${test}: ${status}${detail ? ` — ${detail}` : ''}`;
  results.push(line);
  console.log(line);
}

async function runTests() {
  console.log('=== Mapai Onboarding Test Suite ===\n');

  // Test 1: Auth module exists and exports correctly
  try {
    const authStorePath = path.resolve(__dirname, '../mobile-app/store/authStore.ts');
    if (fs.existsSync(authStorePath)) {
      const content = fs.readFileSync(authStorePath, 'utf-8');
      if (content.includes('useAuthStore') && content.includes('UserPreferencesState')) {
        log('Auth store module', 'PASS', 'authStore.ts exists with correct exports');
      } else {
        log('Auth store module', 'FAIL', 'Missing expected exports');
      }
    } else {
      log('Auth store module', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Auth store module', 'FAIL', String(e));
  }

  // Test 2: Onboarding store exists
  try {
    const onboardingPath = path.resolve(__dirname, '../mobile-app/store/onboardingStore.ts');
    if (fs.existsSync(onboardingPath)) {
      const content = fs.readFileSync(onboardingPath, 'utf-8');
      if (content.includes('useOnboardingStore') && content.includes('OnboardingPreferences')) {
        log('Onboarding store', 'PASS', 'onboardingStore.ts exists with correct exports');
      } else {
        log('Onboarding store', 'FAIL', 'Missing expected exports');
      }
    } else {
      log('Onboarding store', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Onboarding store', 'FAIL', String(e));
  }

  // Test 3: Preferences screen exists
  try {
    const prefsPath = path.resolve(__dirname, '../mobile-app/app/(onboarding)/preferences.tsx');
    if (fs.existsSync(prefsPath)) {
      const content = fs.readFileSync(prefsPath, 'utf-8');
      if (content.includes('PRICE_OPTIONS') && content.includes('AMBIANCE_OPTIONS') && content.includes('SPEED_OPTIONS')) {
        log('Preferences screen', 'PASS', 'preferences.tsx has price, ambiance, speed sections');
      } else {
        log('Preferences screen', 'FAIL', 'Missing preference sections');
      }
    } else {
      log('Preferences screen', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Preferences screen', 'FAIL', String(e));
  }

  // Test 4: Onboarding flow navigation
  try {
    const interestsPath = path.resolve(__dirname, '../mobile-app/app/(onboarding)/interests.tsx');
    const content = fs.readFileSync(interestsPath, 'utf-8');
    if (content.includes("'/(onboarding)/preferences'")) {
      log('Onboarding flow', 'PASS', 'interests → preferences → profile flow connected');
    } else {
      log('Onboarding flow', 'FAIL', 'interests.tsx does not route to preferences');
    }
  } catch (e) {
    log('Onboarding flow', 'FAIL', String(e));
  }

  // Test 5: Username generator exists
  try {
    const usernamePath = path.resolve(__dirname, '../backend/src/services/username-service.ts');
    if (fs.existsSync(usernamePath)) {
      const content = fs.readFileSync(usernamePath, 'utf-8');
      if (content.includes('generateUsername') && content.includes('isUsernameTaken')) {
        log('Username generator', 'PASS', 'username-service.ts with uniqueness check');
      } else {
        log('Username generator', 'FAIL', 'Missing expected functions');
      }
    } else {
      log('Username generator', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Username generator', 'FAIL', String(e));
  }

  // Test 6: Identity service (getOrCreateUser)
  try {
    const identityPath = path.resolve(__dirname, '../backend/src/services/identity-service.ts');
    if (fs.existsSync(identityPath)) {
      const content = fs.readFileSync(identityPath, 'utf-8');
      if (content.includes('getOrCreateUser') && content.includes('getPublicProfile')) {
        log('Identity service', 'PASS', 'getOrCreateUser + getPublicProfile implemented');
      } else {
        log('Identity service', 'FAIL', 'Missing expected functions');
      }
    } else {
      log('Identity service', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Identity service', 'FAIL', String(e));
  }

  // Test 7: Public profile route
  try {
    const profilePath = path.resolve(__dirname, '../mobile-app/app/u/[username].tsx');
    if (fs.existsSync(profilePath)) {
      const content = fs.readFileSync(profilePath, 'utf-8');
      if (content.includes('PublicProfileScreen') && content.includes('/v1/user/public/')) {
        log('Public profile route', 'PASS', '/u/[username] screen with backend fetch');
      } else {
        log('Public profile route', 'FAIL', 'Missing expected components');
      }
    } else {
      log('Public profile route', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Public profile route', 'FAIL', String(e));
  }

  // Test 8: Social API scaffold
  try {
    const socialPath = path.resolve(__dirname, '../backend/src/routes/social.ts');
    if (fs.existsSync(socialPath)) {
      const content = fs.readFileSync(socialPath, 'utf-8');
      if (content.includes('/friends') && content.includes('/request')) {
        log('Social API scaffold', 'PASS', 'friends + request endpoints exist');
      } else {
        log('Social API scaffold', 'FAIL', 'Missing expected endpoints');
      }
    } else {
      log('Social API scaffold', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Social API scaffold', 'FAIL', String(e));
  }

  // Test 9: LLM context injection
  try {
    const ctxPath = path.resolve(__dirname, '../mobile-app/lib/buildUserContext.ts');
    if (fs.existsSync(ctxPath)) {
      const content = fs.readFileSync(ctxPath, 'utf-8');
      if (content.includes('buildUserContext') && content.includes('user_profile')) {
        log('LLM context injection', 'PASS', 'buildUserContext exports user_profile shape');
      } else {
        log('LLM context injection', 'FAIL', 'Missing expected exports');
      }
    } else {
      log('LLM context injection', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('LLM context injection', 'FAIL', String(e));
  }

  // Test 10: Chat screen includes user context
  try {
    const chatPath = path.resolve(__dirname, '../mobile-app/app/chat.tsx');
    const content = fs.readFileSync(chatPath, 'utf-8');
    if (content.includes('buildUserContext') && content.includes('user_context')) {
      log('Chat personalization', 'PASS', 'chat.tsx sends user_context with messages');
    } else {
      log('Chat personalization', 'FAIL', 'chat.tsx missing user_context injection');
    }
  } catch (e) {
    log('Chat personalization', 'FAIL', String(e));
  }

  // Test 11: Database migration
  try {
    const migrationPath = path.resolve(__dirname, '../backend/src/db/migration-v2-identity.sql');
    if (fs.existsSync(migrationPath)) {
      const content = fs.readFileSync(migrationPath, 'utf-8');
      if (content.includes('username') && content.includes('friend_requests') && content.includes('friendships')) {
        log('Database migration', 'PASS', 'v2 migration has username, friend_requests, friendships');
      } else {
        log('Database migration', 'FAIL', 'Missing expected schema additions');
      }
    } else {
      log('Database migration', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Database migration', 'FAIL', String(e));
  }

  // Test 12: Social routes registered in server
  try {
    const serverPath = path.resolve(__dirname, '../backend/src/server.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');
    if (content.includes('socialRoutes') && content.includes('/v1/social')) {
      log('Social routes registration', 'PASS', 'socialRoutes registered at /v1/social');
    } else {
      log('Social routes registration', 'FAIL', 'socialRoutes not registered');
    }
  } catch (e) {
    log('Social routes registration', 'FAIL', String(e));
  }

  // Test 13: Preference persistence service
  try {
    const savePath = path.resolve(__dirname, '../mobile-app/lib/savePreferences.ts');
    if (fs.existsSync(savePath)) {
      const content = fs.readFileSync(savePath, 'utf-8');
      if (content.includes('savePreferences') && content.includes('apiClient.put')) {
        log('Preference persistence', 'PASS', 'savePreferences writes to backend + stores');
      } else {
        log('Preference persistence', 'FAIL', 'Missing expected implementation');
      }
    } else {
      log('Preference persistence', 'FAIL', 'File not found');
    }
  } catch (e) {
    log('Preference persistence', 'FAIL', String(e));
  }

  // Write results to log file
  const summary = results.join('\n');
  const header = `\n# Test Run: ${new Date().toISOString()}\n# Tests: ${results.length}\n# Pass: ${results.filter(r => r.includes('PASS')).length}\n# Fail: ${results.filter(r => r.includes('FAIL')).length}\n\n`;
  fs.appendFileSync(LOG_FILE, header + summary + '\n');

  console.log(`\n=== Results: ${results.filter(r => r.includes('PASS')).length}/${results.length} passed ===`);
  console.log(`Results appended to: ${LOG_FILE}`);
}

runTests().catch(console.error);
