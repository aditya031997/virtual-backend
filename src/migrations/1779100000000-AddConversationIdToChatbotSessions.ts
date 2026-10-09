import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationIdToChatbotSessions1779100000000
  implements MigrationInterface
{
  name = 'AddConversationIdToChatbotSessions1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "conversationId" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_sessions_conversationId" ON "chatbot_sessions" ("conversationId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_sessions_conversationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "conversationId"`,
    );
  }
}
