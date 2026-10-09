import { MigrationInterface, QueryRunner } from "typeorm";

export class Updateusertransferquerytable1777353329790 implements MigrationInterface {
    name = 'Updateusertransferquerytable1777353329790'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_transfer_query" DROP COLUMN "agentQueue"`);
        await queryRunner.query(`ALTER TABLE "user_transfer_query" DROP COLUMN "dealerCode"`);
        await queryRunner.query(`ALTER TABLE "user_transfer_query" DROP COLUMN "transferPhoneNumber"`);
        await queryRunner.query(`ALTER TABLE "user_transfer_query" ADD "agentQuery" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_transfer_query" DROP COLUMN "agentQuery"`);
        await queryRunner.query(`ALTER TABLE "user_transfer_query" ADD "transferPhoneNumber" character varying(40)`);
        await queryRunner.query(`ALTER TABLE "user_transfer_query" ADD "dealerCode" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "user_transfer_query" ADD "agentQueue" jsonb`);
    }

}
