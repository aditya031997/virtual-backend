import { Logger } from '@nestjs/common';
import { Transcript } from '@/types/callTranscript';

/**
 * Utility class for formatting call-related data
 */
export class CallDataFormatter {
  private static readonly logger = new Logger(CallDataFormatter.name);

  /**
   * Map numeric feedback value to feedback category
   * @param feedbackValue - Feedback value as string or number (e.g., "7" or 7)
   * @returns Feedback category: 'Positive' (>7), 'Neutral' (5-7), 'Negative' (<5), or undefined if invalid
   */
  static mapFeedbackValue(feedbackValue: string | number | undefined): 'Positive' | 'Neutral' | 'Negative' | undefined {
    if (feedbackValue === undefined || feedbackValue === null) {
      return undefined;
    }

    // Convert to number
    const numericValue = typeof feedbackValue === 'string' ? parseFloat(feedbackValue) : feedbackValue;

    // Check if it's a valid number
    if (isNaN(numericValue)) {
      this.logger.warn(`Invalid feedback value: ${feedbackValue}`);
      return undefined;
    }

    // Map according to rules:
    // > 7: Positive
    // 5, 6, or 7: Neutral
    // < 5: Negative
    if (numericValue > 7) {
      return 'Positive';
    } else if (numericValue >= 5 && numericValue <= 7) {
      return 'Neutral';
    } else {
      return 'Negative';
    }
  }

  /**
   * Format time in seconds to MM:SS format
   * @param seconds - Time in seconds
   * @returns Formatted time string (MM:SS)
   */
  static formatTimeInCallSecs(seconds: number): string {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      return '0:00';
    }

    const totalSeconds = Math.floor(seconds);

    if (totalSeconds < 60) {
      // Less than 60 seconds: format as 0:SS
      return `0:${totalSeconds.toString().padStart(2, '0')}`;
    } else {
      // 60 or more seconds: format as MM:SS
      const minutes = Math.floor(totalSeconds / 60);
      const remainingSeconds = totalSeconds % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Format transcript to extract role, message, and time_in_call_secs
   * @param rawTranscript - Raw transcript array from conversation
   * @returns Formatted transcript with role, message, and formatted timeInCallSecs
   */
  static formatTranscript(rawTranscript: any[]): Transcript {
    return rawTranscript
      .filter((item: any) => item.role && item.message)
      .map((item: any) => ({
        role: item.role as 'agent' | 'user',
        message: String(item.message || ''),
        // FIXED: Using snake_case field name from ElevenLabs
        timeInCallSecs: this.formatTimeInCallSecs(
          typeof item.time_in_call_secs === 'number' ? item.time_in_call_secs : 0
        ),
      }));
  }

  /**
   * Format duration in seconds to "Xm Ys" format
   * @param seconds - Duration in seconds
   * @returns Formatted duration string or null if invalid
   */
  static formatDuration(seconds: number): string | null {
    if (!seconds || seconds <= 0) {
      return null;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes === 0) {
      return `${remainingSeconds}s`;
    }

    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  }
}

