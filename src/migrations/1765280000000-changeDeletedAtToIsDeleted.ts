import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeDeletedAtToIsDeleted1765280000000 implements MigrationInterface {
    name = 'ChangeDeletedAtToIsDeleted1765280000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop deletedAt column if it exists
        await queryRunner.query(`ALTER TABLE "support_emails" DROP COLUMN IF EXISTS "deletedAt"`);
        // Add isDeleted column
        await queryRunner.query(`ALTER TABLE "support_emails" ADD "isDeleted" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop isDeleted column
        await queryRunner.query(`ALTER TABLE "support_emails" DROP COLUMN "isDeleted"`);
        // Add deletedAt column back
        await queryRunner.query(`ALTER TABLE "support_emails" ADD "deletedAt" TIMESTAMP`);
    }
}


