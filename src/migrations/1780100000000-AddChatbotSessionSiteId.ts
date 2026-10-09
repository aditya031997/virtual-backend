import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records which site a chatbot session belongs to, so Chat History can show a
 * "Site Name" column alongside the one Call History already has.
 *
 * Nullable with no backfill: sessions that predate this column genuinely have
 * no site recorded, and inventing one would be worse than showing "---".
 */
export class AddChatbotSessionSiteId1780100000000 implements MigrationInterface {
  name = 'AddChatbotSessionSiteId1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "siteId" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_sessions_siteId" ON "chatbot_sessions" ("siteId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_chatbot_sessions_siteId"`);
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "siteId"`,
    );
  }
}
