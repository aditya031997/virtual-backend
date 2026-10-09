import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEndedAfterMessageIdToChatbotSessions1779300000000
  implements MigrationInterface
{
  name = 'AddEndedAfterMessageIdToChatbotSessions1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "endedAfterMessageId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD CONSTRAINT "FK_chatbot_sessions_endedAfterMessage" FOREIGN KEY ("endedAfterMessageId") REFERENCES "chatbot_messages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP CONSTRAINT "FK_chatbot_sessions_endedAfterMessage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "endedAfterMessageId"`,
    );
  }
}
