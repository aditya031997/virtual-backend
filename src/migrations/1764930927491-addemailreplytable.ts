import { MigrationInterface, QueryRunner } from "typeorm";

export class Addemailreplytable1764930927491 implements MigrationInterface {
    name = 'Addemailreplytable1764930927491'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."email_replies_status_enum" AS ENUM('draft', 'sent')`);
        await queryRunner.query(`CREATE TABLE "email_replies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "supportEmailId" uuid NOT NULL, "fromEmail" character varying(255) NOT NULL, "toEmail" character varying(255) NOT NULL, "subject" character varying(500), "replyContent" text NOT NULL, "status" "public"."email_replies_status_enum" NOT NULL DEFAULT 'draft', "sentAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_590de6bfd459b0436b049eafcb9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7294e22b7f158a892bdf5e07a5" ON "email_replies" ("supportEmailId") `);
        await queryRunner.query(`ALTER TABLE "email_replies" ADD CONSTRAINT "FK_7294e22b7f158a892bdf5e07a54" FOREIGN KEY ("supportEmailId") REFERENCES "support_emails"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_replies" DROP CONSTRAINT "FK_7294e22b7f158a892bdf5e07a54"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7294e22b7f158a892bdf5e07a5"`);
        await queryRunner.query(`DROP TABLE "email_replies"`);
        await queryRunner.query(`DROP TYPE "public"."email_replies_status_enum"`);
    }

}
