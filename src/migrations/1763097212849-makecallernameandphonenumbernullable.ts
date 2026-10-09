import { MigrationInterface, QueryRunner } from "typeorm";

export class Makecallernameandphonenumbernullable1763097212849 implements MigrationInterface {
    name = 'Makecallernameandphonenumbernullable1763097212849'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Alter callerName column to be nullable
        await queryRunner.query(`ALTER TABLE "call_history" ALTER COLUMN "callerName" DROP NOT NULL`);
        
        // Alter phoneNumber column to be nullable
        await queryRunner.query(`ALTER TABLE "call_history" ALTER COLUMN "phoneNumber" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert callerName column to NOT NULL (set existing NULL values to empty string first)
        await queryRunner.query(`UPDATE "call_history" SET "callerName" = '' WHERE "callerName" IS NULL`);
        await queryRunner.query(`ALTER TABLE "call_history" ALTER COLUMN "callerName" SET NOT NULL`);
        
        // Revert phoneNumber column to NOT NULL (set existing NULL values to empty string first)
        await queryRunner.query(`UPDATE "call_history" SET "phoneNumber" = '' WHERE "phoneNumber" IS NULL`);
        await queryRunner.query(`ALTER TABLE "call_history" ALTER COLUMN "phoneNumber" SET NOT NULL`);
    }
}

