import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email becomes the sole unique identifier (resume key). Phone is now a
 * freely-updatable, audited attribute, so its UNIQUE constraint is dropped
 * (the contactNormalized column is kept — still used to detect phone changes
 * robustly across formats). Adds chatbot_lead_profile_changes for audit
 * tracking of name/email/phone updates.
 */
export class EmailPrimaryAndProfileChangeAudit1779500000000
  implements MigrationInterface
{
  name = 'EmailPrimaryAndProfileChangeAudit1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_chatbot_leads_contactNormalized"`,
    );

    await queryRunner.query(
      `CREATE TABLE "chatbot_lead_profile_changes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "leadId" uuid NOT NULL,
        "field" character varying(20) NOT NULL,
        "oldValue" character varying(255),
        "newValue" character varying(255),
        "changedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chatbot_lead_profile_changes_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chatbot_lead_profile_changes_leadId" ON "chatbot_lead_profile_changes" ("leadId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" ADD CONSTRAINT "FK_chatbot_lead_profile_changes_lead" FOREIGN KEY ("leadId") REFERENCES "chatbot_leads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_lead_profile_changes" DROP CONSTRAINT "FK_chatbot_lead_profile_changes_lead"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_chatbot_lead_profile_changes_leadId"`,
    );
    await queryRunner.query(`DROP TABLE "chatbot_lead_profile_changes"`);

    // Restore the phone UNIQUE constraint (best-effort; assumes no collisions).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_chatbot_leads_contactNormalized" ON "chatbot_leads" ("contactNormalized") WHERE "contactNormalized" IS NOT NULL`,
    );
  }
}
