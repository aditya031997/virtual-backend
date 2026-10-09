import { MigrationInterface, QueryRunner } from "typeorm";

export class Addstateandcity1764652931839 implements MigrationInterface {
    name = 'Addstateandcity1764652931839'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "state" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "city" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD "state" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD "city" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "parent_companies" ADD "state" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "parent_companies" ADD "city" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "sites" ADD "state" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "sites" ADD "city" character varying(100)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "sites" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "parent_companies" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "parent_companies" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "state"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "city"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "state"`);
    }

}
