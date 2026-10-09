import { MigrationInterface, QueryRunner } from "typeorm";

export class Removeuserfield1777983820407 implements MigrationInterface {
    name = 'Removeuserfield1777983820407'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chatbot_leads" DROP CONSTRAINT "FK_471d9214c587fda609a4e750b6e"`);
        await queryRunner.query(`ALTER TABLE "chatbot_leads" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "chatbot_leads" ALTER COLUMN "chatStatus" SET DEFAULT 'Active'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chatbot_leads" ALTER COLUMN "chatStatus" SET DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE "chatbot_leads" ADD "userId" uuid`);
        await queryRunner.query(`ALTER TABLE "chatbot_leads" ADD CONSTRAINT "FK_471d9214c587fda609a4e750b6e" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
