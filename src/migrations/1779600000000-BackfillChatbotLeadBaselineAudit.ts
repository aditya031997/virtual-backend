import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill a baseline profile snapshot for existing leads that have NO audit
 * rows yet (created before baseline-on-create and never changed — so their
 * current values ARE the originals). Records name + email always, and phone
 * when present, with oldValue = NULL. Leads that already have any audit row
 * are left untouched (their earliest row already carries the prior value).
 *
 * Single atomic statement: the NOT EXISTS check is evaluated against the
 * pre-statement state, so all up-to-3 rows for a qualifying lead are inserted
 * consistently.
 */
export class BackfillChatbotLeadBaselineAudit1779600000000
  implements MigrationInterface
{
  name = 'BackfillChatbotLeadBaselineAudit1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "chatbot_lead_profile_changes"
        ("leadId", "field", "oldValue", "newValue", "changedAt")
      SELECT l."id", v.field, NULL, v.val, l."createdAt"
      FROM "chatbot_leads" l
      CROSS JOIN LATERAL (VALUES
        ('name',    l."name"),
        ('email',   l."email"),
        ('contact', l."contact")
      ) AS v(field, val)
      WHERE NOT EXISTS (
        SELECT 1 FROM "chatbot_lead_profile_changes" p
        WHERE p."leadId" = l."id"
      )
      AND (
        v.field <> 'contact'
        OR (l."contact" IS NOT NULL AND l."contact" <> '')
      )
    `);
  }

  public async down(): Promise<void> {
    // Irreversible data backfill: there is no safe way to distinguish these
    // baseline rows from legitimate "value first set later" change rows
    // (both have oldValue = NULL), so reverting is intentionally a no-op.
  }
}
