import { Injectable } from '@nestjs/common';
import type { IEntityMatch, IReportLookupOption } from '@/types/chatbotReport';

/**
 * Matches the user's words against real entities on a site.
 *
 * This is the guard that stops a hallucinated entity reaching the report API.
 * The classifier may happily report `locationText: "Wing A"` for a site that
 * has no Wing A; this service is what turns that into "I couldn't find Wing A —
 * did you mean one of these?" rather than a report over the wrong data or an
 * opaque 400.
 *
 * Matching is deliberately conservative and deterministic:
 *  - exact match wins outright
 *  - otherwise a scored fuzzy pass must clear a confidence floor AND beat the
 *    runner-up by a clear margin
 *  - anything else returns no match plus candidates, so the chatbot asks
 *
 * No LLM involvement: entity resolution is a lookup problem, and a model that
 * invents a plausible id here would be actively dangerous.
 */
@Injectable()
export class ReportEntityMatcherService {
  /** Minimum score for a fuzzy match to be accepted at all. */
  private static readonly MIN_SCORE = 0.6;

  /**
   * How far ahead the best match must be before it is taken automatically.
   * Prevents silently picking "Room 5" when "Room 50" scores nearly the same.
   */
  private static readonly AMBIGUITY_MARGIN = 0.15;

  /** Cap on options offered back to the user in one question. */
  private static readonly MAX_CANDIDATES = 5;

  /**
   * Resolve one piece of user text against a lookup list.
   *
   * @returns A match with `matched` set when confident, otherwise `matched`
   *          null and `candidates` populated for a follow-up question.
   */
  match(text: string, options: IReportLookupOption[]): IEntityMatch {
    const trimmed = text.trim();

    if (!trimmed || options.length === 0) {
      return { text: trimmed, matched: null, candidates: [] };
    }

    const normalisedQuery = this.normalise(trimmed);

    const exact = options.find(
      (option): boolean => this.normalise(option.label) === normalisedQuery,
    );
    if (exact) {
      return { text: trimmed, matched: exact, candidates: [] };
    }

    const scored = options
      .map((option): { option: IReportLookupOption; score: number } => ({
        option,
        score: this.score(normalisedQuery, this.normalise(option.label)),
      }))
      .filter((entry): boolean => entry.score > 0)
      .sort((a, b): number => b.score - a.score);

    if (scored.length === 0) {
      return {
        text: trimmed,
        matched: null,
        candidates: options.slice(0, ReportEntityMatcherService.MAX_CANDIDATES),
      };
    }

    const best = scored[0];
    const runnerUp = scored[1];

    const clearsFloor = best.score >= ReportEntityMatcherService.MIN_SCORE;
    const beatsRunnerUp =
      !runnerUp ||
      best.score - runnerUp.score >=
        ReportEntityMatcherService.AMBIGUITY_MARGIN;

    if (clearsFloor && beatsRunnerUp) {
      return { text: trimmed, matched: best.option, candidates: [] };
    }

    return {
      text: trimmed,
      matched: null,
      candidates: scored
        .slice(0, ReportEntityMatcherService.MAX_CANDIDATES)
        .map((entry): IReportLookupOption => entry.option),
    };
  }

  /**
   * Resolve several pieces of text against the same list.
   * Used when the user names more than one location or alarm type.
   */
  matchAll(texts: string[], options: IReportLookupOption[]): IEntityMatch[] {
    return texts.map((text): IEntityMatch => this.match(text, options));
  }

  /**
   * Lowercase, collapse whitespace, drop punctuation.
   *
   * Keeps digits and letters only, so "Room #5" and "room 5" converge without
   * "Room 5" and "Room 50" collapsing into each other.
   */
  private normalise(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Score similarity between query and candidate, 0..1.
   *
   * Combines three signals, strongest first:
   *  - whole-string containment (query is a prefix/substring of the label)
   *  - token overlap (every query word appears in the label)
   *  - character-level edit distance, as a last resort for typos
   */
  private score(query: string, candidate: string): number {
    if (!query || !candidate) return 0;

    if (candidate === query) return 1;

    // Containment: "wing a" inside "wing a - ground floor".
    if (candidate.startsWith(`${query} `) || candidate.endsWith(` ${query}`)) {
      return 0.95;
    }
    if (candidate.includes(query)) {
      return 0.85;
    }

    const queryTokens = query.split(' ').filter(Boolean);
    const candidateTokens = candidate.split(' ').filter(Boolean);

    if (queryTokens.length > 0 && candidateTokens.length > 0) {
      // Score each query token against its best counterpart, allowing a near
      // miss to still count. Without this, one typo in a multi-word name
      // ("Groud Floor Reception") drags an otherwise clear match below the
      // floor and forces a needless clarifying question.
      const tokenScores = queryTokens.map((token): number =>
        Math.max(
          ...candidateTokens.map((candidateToken): number =>
            this.tokenSimilarity(token, candidateToken),
          ),
        ),
      );

      const matchedTokens = tokenScores.filter(
        (score): boolean => score > 0,
      ).length;

      if (matchedTokens === queryTokens.length) {
        const meanScore =
          tokenScores.reduce((sum, score): number => sum + score, 0) /
          tokenScores.length;

        // Scale by coverage of the label so a tight match outranks a sprawling
        // one, but keep near-complete matches comfortably above the floor.
        const coverage = queryTokens.length / candidateTokens.length;
        return 0.6 * meanScore + 0.35 * coverage * meanScore;
      }

      if (matchedTokens > 0) {
        return 0.5 * (matchedTokens / queryTokens.length);
      }
    }

    // Typo tolerance, e.g. "wing b" vs "wing a" should NOT match, but
    // "romo 5" vs "room 5" should.
    const distance = this.levenshtein(query, candidate);
    const longest = Math.max(query.length, candidate.length);
    const similarity = 1 - distance / longest;

    // Only surface genuinely close strings; below this it is noise.
    return similarity >= 0.75 ? similarity * 0.7 : 0;
  }

  /**
   * Similarity between two single words, 0..1.
   *
   * Returns 1 for an exact hit and a scaled score for a near miss, but 0 once
   * the words are far enough apart to be genuinely different — this is what
   * keeps "wing a" from scoring against "wing b" while still forgiving a typo
   * like "romo" for "room".
   */
  private tokenSimilarity(query: string, candidate: string): number {
    if (query === candidate) return 1;

    // Very short tokens carry the distinguishing information in these labels
    // ("a" vs "b", "5" vs "50"), so they must match exactly.
    if (query.length <= 2 || candidate.length <= 2) return 0;

    const distance = this.levenshtein(query, candidate);
    const longest = Math.max(query.length, candidate.length);
    const similarity = 1 - distance / longest;

    return similarity >= 0.75 ? similarity : 0;
  }

  /** Standard iterative Levenshtein distance with a single-row buffer. */
  private levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let previousRow = Array.from(
      { length: b.length + 1 },
      (_unused, index): number => index,
    );

    for (let i = 1; i <= a.length; i += 1) {
      const currentRow = [i];

      for (let j = 1; j <= b.length; j += 1) {
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;

        currentRow[j] = Math.min(
          currentRow[j - 1] + 1,
          previousRow[j] + 1,
          previousRow[j - 1] + substitutionCost,
        );
      }

      previousRow = currentRow;
    }

    return previousRow[b.length];
  }
}
