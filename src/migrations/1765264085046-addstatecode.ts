import { MigrationInterface, QueryRunner } from "typeorm";

export class Addstatecode1765264085046 implements MigrationInterface {
    name = 'Addstatecode1765264085046'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "stateCode" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD "stateCode" character varying(10)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "stateCode"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "stateCode"`);
    }

}
