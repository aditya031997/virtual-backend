import { MigrationInterface, QueryRunner } from "typeorm";

export class Addstatecoeforhumanagent1765274887097 implements MigrationInterface {
    name = 'Addstatecoeforhumanagent1765274887097'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "parent_companies" ADD "stateCode" character varying(10)`);
        await queryRunner.query(`ALTER TABLE "sites" ADD "stateCode" character varying(10)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP COLUMN "stateCode"`);
        await queryRunner.query(`ALTER TABLE "parent_companies" DROP COLUMN "stateCode"`);
    }

}
