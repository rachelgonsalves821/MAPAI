/**
 * Mapai Backend — QR Service
 * Generates and verifies cryptographically signed QR codes for venue check-ins.
 *
 * Each QR code encodes a URL of the form:
 *   https://mapai.app/checkin/{placeId}?sig={hmac-sha256-hex}
 *
 * The signature is HMAC-SHA256(placeId, QR_SIGNING_SECRET).  Because the
 * signature is deterministic per placeId, QR codes are permanent — they do
 * not change per-scan or per-day.  Duplicate-check-in protection is enforced
 * at the database level (one check-in per user per venue per calendar day).
 *
 * A legacy "mapai:checkin:{placeId}:{sig}" deep-link format is also recognised
 * so that any QR codes printed before the URL scheme was adopted still work.
 */

import crypto from 'node:crypto';

const DEV_FALLBACK_SECRET = 'mapai-dev-qr-secret-do-not-use-in-production';

export class QRService {
    private secret: string;

    constructor(secret?: string) {
        this.secret = secret || process.env.QR_SIGNING_SECRET || DEV_FALLBACK_SECRET;
    }

    /**
     * Produce the HMAC-SHA256 signature for a given placeId.
     */
    sign(placeId: string): string {
        return crypto.createHmac('sha256', this.secret).update(placeId).digest('hex');
    }

    /**
     * Constant-time verification of a placeId + signature pair.
     * Returns false on any mismatch or malformed input rather than throwing.
     */
    verify(placeId: string, signature: string): boolean {
        const expected = this.sign(placeId);
        // Length must match before calling timingSafeEqual (both are hex → same
        // length as long as the digest algorithm hasn't changed).
        if (expected.length !== signature.length) return false;
        try {
            return crypto.timingSafeEqual(
                Buffer.from(expected, 'hex'),
                Buffer.from(signature, 'hex')
            );
        } catch {
            return false;
        }
    }

    /**
     * Build the canonical check-in URL that will be encoded into the QR image.
     */
    buildURL(placeId: string): string {
        const sig = this.sign(placeId);
        return `https://mapai.app/checkin/${placeId}?sig=${sig}`;
    }

    /**
     * Parse QR code data into its component parts.
     *
     * Accepts two formats:
     *  1. URL  — https://mapai.app/checkin/{placeId}?sig={hex}
     *  2. Legacy deep-link — mapai:checkin:{placeId}:{hex}
     *
     * Returns null when the data doesn't match either format.
     */
    parse(data: string): { placeId: string; signature: string } | null {
        // Format 1: canonical HTTPS URL
        const urlMatch = data.match(
            /^https?:\/\/mapai\.app\/checkin\/([a-zA-Z0-9_-]+)\?sig=([a-f0-9]+)$/i
        );
        if (urlMatch) return { placeId: urlMatch[1], signature: urlMatch[2] };

        // Format 2: legacy deep-link scheme
        const legacyMatch = data.match(
            /^mapai:checkin:([a-zA-Z0-9_-]+):([a-f0-9]+)$/i
        );
        if (legacyMatch) return { placeId: legacyMatch[1], signature: legacyMatch[2] };

        return null;
    }
}
