import { MigrationInterface, QueryRunner } from "typeorm";

export class Changecallhistorytable1763017416511 implements MigrationInterface {
    name = 'Changecallhistorytable1763017416511'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "rationale" text`);
        await queryRunner.query(`ALTER TABLE "call_transcript" ADD "timeInCallSecs" character varying(20)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_transcript" DROP COLUMN "timeInCallSecs"`);
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "rationale"`);
    }

}
