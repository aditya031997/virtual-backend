import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChatbotLeads1777982280560 implements MigrationInterface {
    name = 'AddChatbotLeads1777982280560'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "chatbot_leads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid, "name" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "contact" character varying(30), "chatHistoryId" character varying(255), "chatStatus" character varying(50) NOT NULL DEFAULT 'pending', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_65483032b122651f14ab5b5d158" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b18c4c68104a371f357924cbf7" ON "chatbot_leads" ("email") `);
        await queryRunner.query(`ALTER TABLE "chatbot_leads" ADD CONSTRAINT "FK_471d9214c587fda609a4e750b6e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chatbot_leads" DROP CONSTRAINT "FK_471d9214c587fda609a4e750b6e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b18c4c68104a371f357924cbf7"`);
        await queryRunner.query(`DROP TABLE "chatbot_leads"`);
    }

}
