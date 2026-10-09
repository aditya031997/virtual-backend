import { MigrationInterface, QueryRunner } from "typeorm";

export class AddealerCode1759908209583 implements MigrationInterface {
    name = 'AddealerCode1759908209583'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" ADD "dealerCode" character varying(4) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD CONSTRAINT "UQ_ef4a9d55d06c344f82606b014da" UNIQUE ("dealerCode")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" DROP CONSTRAINT "UQ_ef4a9d55d06c344f82606b014da"`);
        await queryRunner.query(`ALTER TABLE "dealer" DROP COLUMN "dealerCode"`);
    }

}
