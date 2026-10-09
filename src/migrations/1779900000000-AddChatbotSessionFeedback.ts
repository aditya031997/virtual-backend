import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatbotSessionFeedback1779900000000
  implements MigrationInterface
{
  name = 'AddChatbotSessionFeedback1779900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "feedbackRating" smallint`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD "sentiment" character varying(10)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "sentiment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP COLUMN "feedbackRating"`,
    );
  }
}
