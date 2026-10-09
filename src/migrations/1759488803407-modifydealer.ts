import { MigrationInterface, QueryRunner } from "typeorm";

export class Modifydealer1759488803407 implements MigrationInterface {
    name = 'Modifydealer1759488803407'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD "description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD "description" character varying NOT NULL`);
    }

}
