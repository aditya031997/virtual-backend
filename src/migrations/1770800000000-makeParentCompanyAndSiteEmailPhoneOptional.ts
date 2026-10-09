import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeParentCompanyAndSiteEmailPhoneOptional1770800000000 implements MigrationInterface {
    name = 'MakeParentCompanyAndSiteEmailPhoneOptional1770800000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "parent_companies" ALTER COLUMN "email" DROP NOT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "parent_companies" ALTER COLUMN "contactNumber" DROP NOT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "sites" ALTER COLUMN "email" DROP NOT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "sites" ALTER COLUMN "contactNumber" DROP NOT NULL`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "parent_companies" SET "email" = '' WHERE "email" IS NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "parent_companies" ALTER COLUMN "email" SET NOT NULL`
        );
        await queryRunner.query(
            `UPDATE "parent_companies" SET "contactNumber" = '' WHERE "contactNumber" IS NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "parent_companies" ALTER COLUMN "contactNumber" SET NOT NULL`
        );
        await queryRunner.query(
            `UPDATE "sites" SET "email" = '' WHERE "email" IS NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "sites" ALTER COLUMN "email" SET NOT NULL`
        );
        await queryRunner.query(
            `UPDATE "sites" SET "contactNumber" = '' WHERE "contactNumber" IS NULL`
        );
        await queryRunner.query(
            `ALTER TABLE "sites" ALTER COLUMN "contactNumber" SET NOT NULL`
        );
    }
}
