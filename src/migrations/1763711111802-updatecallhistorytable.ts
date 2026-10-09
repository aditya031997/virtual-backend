import { MigrationInterface, QueryRunner } from "typeorm";

export class Updatecallhistorytable1763711111802 implements MigrationInterface {
    name = 'Updatecallhistorytable1763711111802'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "humanAgentName" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "isEscalation" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "isEscalation"`);
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "humanAgentName"`);
    }

}
