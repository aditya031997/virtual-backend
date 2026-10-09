import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagecallhistoryfieldcallernumber1764054025542 implements MigrationInterface {
    name = 'Chnagecallhistoryfieldcallernumber1764054025542'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" RENAME COLUMN "callerNumber" TO "humanAgentContact"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" RENAME COLUMN "humanAgentContact" TO "callerNumber"`);
    }

}
