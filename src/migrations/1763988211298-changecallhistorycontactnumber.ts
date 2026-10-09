import { MigrationInterface, QueryRunner } from "typeorm";

export class Changecallhistorycontactnumber1763988211298 implements MigrationInterface {
    name = 'Changecallhistorycontactnumber1763988211298'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "humanAgentContact" character varying(20)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "humanAgentContact"`);
    }

}
