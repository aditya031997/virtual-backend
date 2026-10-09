import { MigrationInterface, QueryRunner } from "typeorm";

export class Changecallhistoryfield1763024975938 implements MigrationInterface {
    name = 'Changecallhistoryfield1763024975938'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "conversationId" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "conversationId"`);
    }

}
