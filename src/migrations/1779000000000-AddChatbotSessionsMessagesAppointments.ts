import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChatbotSessionsMessagesAppointments1779000000000
  implements MigrationInterface
{
  name = 'AddChatbotSessionsMessagesAppointments1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // chatbot_sessions
    await queryRunner.query(
      `CREATE TABLE "chatbot_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "leadId" uuid NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "startedAt" TIMESTAMP NOT NULL DEFAULT now(), "endedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_chatbot_sessions_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_sessions_leadId" ON "chatbot_sessions" ("leadId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" ADD CONSTRAINT "FK_chatbot_sessions_lead" FOREIGN KEY ("leadId") REFERENCES "chatbot_leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // chatbot_messages
    await queryRunner.query(
      `CREATE TABLE "chatbot_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sessionId" uuid NOT NULL, "role" character varying(20) NOT NULL, "content" text NOT NULL, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_chatbot_messages_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_messages_sessionId" ON "chatbot_messages" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_messages_createdAt" ON "chatbot_messages" ("createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_messages" ADD CONSTRAINT "FK_chatbot_messages_session" FOREIGN KEY ("sessionId") REFERENCES "chatbot_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // chatbot_appointments
    await queryRunner.query(
      `CREATE TABLE "chatbot_appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "leadId" uuid NOT NULL, "sessionId" uuid, "name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "contact" character varying(30), "careFacilityLocation" character varying(255) NOT NULL, "preferredTime" character varying(5) NOT NULL, "natureOfRequest" text NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'requested', "emailSent" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_chatbot_appointments_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_appointments_leadId" ON "chatbot_appointments" ("leadId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ADD CONSTRAINT "FK_chatbot_appointments_lead" FOREIGN KEY ("leadId") REFERENCES "chatbot_leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ADD CONSTRAINT "FK_chatbot_appointments_session" FOREIGN KEY ("sessionId") REFERENCES "chatbot_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" DROP CONSTRAINT "FK_chatbot_appointments_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" DROP CONSTRAINT "FK_chatbot_appointments_lead"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_appointments_leadId"`,
    );
    await queryRunner.query(`DROP TABLE "chatbot_appointments"`);

    await queryRunner.query(
      `ALTER TABLE "chatbot_messages" DROP CONSTRAINT "FK_chatbot_messages_session"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_messages_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_messages_sessionId"`,
    );
    await queryRunner.query(`DROP TABLE "chatbot_messages"`);

    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions" DROP CONSTRAINT "FK_chatbot_sessions_lead"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_sessions_leadId"`,
    );
    await queryRunner.query(`DROP TABLE "chatbot_sessions"`);
  }
}
