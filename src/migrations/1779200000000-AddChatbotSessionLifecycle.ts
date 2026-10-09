import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatbotSessionLifecycle1779200000000
  implements MigrationInterface
{
  name = 'AddChatbotSessionLifecycle1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "endReason" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "lastActivityAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    // Backfill existing rows so TTL logic has a sane baseline.
    await queryRunner.query(
      `UPDATE "chatbot_sessions" SET "lastActivityAt" = COALESCE("updatedAt", "createdAt", now())`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_sessions_status" ON "chatbot_sessions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_sessions_lastActivityAt" ON "chatbot_sessions" ("lastActivityAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_sessions_lastActivityAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_sessions_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "lastActivityAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "endReason"`,
    );
  }
}
