import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagetext1761492238207 implements MigrationInterface {
    name = 'Chnagetext1761492238207'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link" ADD "documentId" character varying`);
        await queryRunner.query(`ALTER TABLE "text" ADD "documentId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "text" DROP COLUMN "documentId"`);
        await queryRunner.query(`ALTER TABLE "link" DROP COLUMN "documentId"`);
    }

}
