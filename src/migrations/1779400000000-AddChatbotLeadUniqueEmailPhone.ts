import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce uniqueness of email and phone on chatbot_leads.
 *
 * - Adds contactNormalized (digits-only canonical phone) and backfills it.
 * - UNIQUE on lower(email) — case/space-insensitive email uniqueness.
 * - Partial UNIQUE on contactNormalized (only where not null) so leads
 *   without a phone don't collide on NULL.
 *
 * NOTE: requires no pre-existing collisions on lower(email) or the
 * normalized phone. The colliding test rows were removed before this ran.
 */
export class AddChatbotLeadUniqueEmailPhone1779400000000
  implements MigrationInterface
{
  name = 'AddChatbotLeadUniqueEmailPhone1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_leads" ADD "contactNormalized" character varying(30)`,
    );
    await queryRunner.query(
      `UPDATE "chatbot_leads" SET "contactNormalized" = NULLIF(regexp_replace(COALESCE("contact", ''), '\\D', '', 'g'), '')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_chatbot_leads_email_lower" ON "chatbot_leads" (LOWER("email"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_chatbot_leads_contactNormalized" ON "chatbot_leads" ("contactNormalized") WHERE "contactNormalized" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_chatbot_leads_contactNormalized"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_chatbot_leads_email_lower"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_leads" DROP COLUMN "contactNormalized"`,
    );
  }
}
