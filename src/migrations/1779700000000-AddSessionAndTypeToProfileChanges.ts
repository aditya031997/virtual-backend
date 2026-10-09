import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make profile-change history session-aware and self-describing:
 *  - sessionId: which chatbot session the change happened in (FK, SET NULL).
 *  - changeType: 'initial' (creation baseline) vs 'update' (later edit).
 *
 * Backfill: rows with oldValue IS NULL are the creation baseline -> 'initial';
 * everything else is 'update'. sessionId stays NULL for historical rows
 * (the original session is unknown).
 */
export class AddSessionAndTypeToProfileChanges1779700000000
  implements MigrationInterface
{
  name = 'AddSessionAndTypeToProfileChanges1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" ADD "sessionId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" ADD "changeType" character varying(10) NOT NULL DEFAULT 'update'`,
    );
    await queryRunner.query(
      `UPDATE "chatbot_lead_profile_changes" SET "changeType" = 'initial' WHERE "oldValue" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_lead_profile_changes_sessionId" ON "chatbot_lead_profile_changes" ("sessionId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" ADD CONSTRAINT "FK_chatbot_lead_profile_changes_session" FOREIGN KEY ("sessionId") REFERENCES "chatbot_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" DROP CONSTRAINT "FK_chatbot_lead_profile_changes_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_lead_profile_changes_sessionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" DROP COLUMN "changeType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" DROP COLUMN "sessionId"`,
    );
  }
}
