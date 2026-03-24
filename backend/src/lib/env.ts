/**
 * Mapai Backend — Environment Variable Utilities
 * Enforces required env vars are present at startup.
 */

/**
 * Returns the value of an environment variable, or throws if it is missing or empty.
 */
export function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

/**
 * Returns the value of an environment variable, or a fallback default.
 */
export function optionalEnv(name: string, fallback: string): string {
    return process.env[name] || fallback;
}
