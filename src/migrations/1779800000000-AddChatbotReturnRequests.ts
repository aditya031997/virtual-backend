import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatbotReturnRequests1779800000000
  implements MigrationInterface
{
  name = 'AddChatbotReturnRequests1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "chatbot_return_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "leadId" uuid NOT NULL, "sessionId" uuid, "name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "contact" character varying(30), "productName" character varying(255) NOT NULL, "orderId" character varying(100) NOT NULL, "reasonForReturn" text NOT NULL, "returnAddress" text NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'requested', "emailSent" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_chatbot_return_requests_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_return_requests_leadId" ON "chatbot_return_requests" ("leadId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_return_requests" ADD CONSTRAINT "FK_chatbot_return_requests_lead" FOREIGN KEY ("leadId") REFERENCES "chatbot_leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_return_requests" ADD CONSTRAINT "FK_chatbot_return_requests_session" FOREIGN KEY ("sessionId") REFERENCES "chatbot_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_return_requests" DROP CONSTRAINT "FK_chatbot_return_requests_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_return_requests" DROP CONSTRAINT "FK_chatbot_return_requests_lead"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_return_requests_leadId"`,
    );
    await queryRunner.query(`DROP TABLE "chatbot_return_requests"`);
  }
}
