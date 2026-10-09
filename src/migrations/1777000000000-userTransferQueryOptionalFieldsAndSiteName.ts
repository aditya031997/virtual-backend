import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserTransferQueryOptionalFieldsAndSiteName1777000000000
  implements MigrationInterface
{
  name = 'UserTransferQueryOptionalFieldsAndSiteName1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_transfer_query" ALTER COLUMN "currentCallSid" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_transfer_query" ALTER COLUMN "conversationId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_transfer_query" ALTER COLUMN "transferPhoneNumber" DROP NOT NULL`,
    );
    const table = await queryRunner.getTable('user_transfer_query');
    if (!table?.findColumnByName('siteName')) {
      await queryRunner.query(
        `ALTER TABLE "user_transfer_query" ADD "siteName" character varying(255)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('user_transfer_query');
    if (table?.findColumnByName('siteName')) {
      await queryRunner.query(
        `ALTER TABLE "user_transfer_query" DROP COLUMN "siteName"`,
      );
    }
    await queryRunner.query(
      `UPDATE "user_transfer_query" SET "currentCallSid" = '' WHERE "currentCallSid" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "user_transfer_query" SET "conversationId" = '' WHERE "conversationId" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "user_transfer_query" SET "transferPhoneNumber" = '' WHERE "transferPhoneNumber" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_transfer_query" ALTER COLUMN "currentCallSid" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_transfer_query" ALTER COLUMN "conversationId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_transfer_query" ALTER COLUMN "transferPhoneNumber" SET NOT NULL`,
    );
  }
}
