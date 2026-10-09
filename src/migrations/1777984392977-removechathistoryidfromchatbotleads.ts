import { MigrationInterface, QueryRunner } from "typeorm";

export class Removechathistoryidfromchatbotleads1777984392977 implements MigrationInterface {
    name = 'Removechathistoryidfromchatbotleads1777984392977'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chatbot_leads" DROP COLUMN "chatHistoryId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chatbot_leads" ADD "chatHistoryId" character varying(255)`);
    }

}
