import { MigrationInterface, QueryRunner } from "typeorm";

export class Modifyelaertable1759488469108 implements MigrationInterface {
    name = 'Modifyelaertable1759488469108'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" ADD "description" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "description"`);
    }

}
