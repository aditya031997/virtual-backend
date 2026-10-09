import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagedocumentschema1761362744082 implements MigrationInterface {
    name = 'Chnagedocumentschema1761362744082'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document" ADD "fileSize" bigint NOT NULL`);
        await queryRunner.query(`ALTER TABLE "document" ADD "mimeType" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "document" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "mimeType"`);
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "fileSize"`);
    }

}
