import { MigrationInterface, QueryRunner } from "typeorm";

export class Addemailtable1764916673948 implements MigrationInterface {
    name = 'Addemailtable1764916673948'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "support_emails" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "uid" integer NOT NULL, "messageId" character varying(255), "fromEmail" character varying(255) NOT NULL, "fromName" character varying(255), "toEmails" text, "subject" character varying(500), "emailDate" TIMESTAMP NOT NULL, "bodyText" text, "bodyHtml" text, "isRead" boolean NOT NULL DEFAULT false, "isProcessed" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_20e41ccfbdb00e896b6207eec5b" UNIQUE ("uid"), CONSTRAINT "PK_20ddaf38afe913bafeaf8c8e538" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_20e41ccfbdb00e896b6207eec5" ON "support_emails" ("uid") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_20e41ccfbdb00e896b6207eec5"`);
        await queryRunner.query(`DROP TABLE "support_emails"`);
    }

}
