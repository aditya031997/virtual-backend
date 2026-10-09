import { MigrationInterface, QueryRunner } from "typeorm";

export class Addstatusinlinktable1770723126676 implements MigrationInterface {
    name = 'Addstatusinlinktable1770723126676'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link" ADD "status" character varying NOT NULL DEFAULT 'success'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link" DROP COLUMN "status"`);
    }

}
