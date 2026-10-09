import { Injectable } from '@nestjs/common';

/**
 * Simple service to track active uploads and abort flags
 * Uses userId as the key (one upload per user at a time)
 */
@Injectable()
export class UploadAbortService {
    // Map of userId -> shouldAbort flag
    private abortFlags: Map<string, boolean> = new Map();

    /**
     * Mark user's upload for abortion
     */
    setAbort(userId: string): void {
        this.abortFlags.set(userId, true);
        console.log(`🛑 Abort requested for user: ${userId}`);
    }

    /**
     * Check if user's upload should be aborted
     */
    shouldAbort(userId: string): boolean {
        return this.abortFlags.get(userId) === true;
    }

    /**
     * Clear abort flag (called when upload completes or is cancelled)
     */
    clearAbort(userId: string): void {
        this.abortFlags.delete(userId);
        console.log(`✅ Abort flag cleared for user: ${userId}`);
    }
}
