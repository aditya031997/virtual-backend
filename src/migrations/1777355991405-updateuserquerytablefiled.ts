import { MigrationInterface, QueryRunner } from "typeorm";

export class Updateuserquerytablefiled1777355991405 implements MigrationInterface {
    name = 'Updateuserquerytablefiled1777355991405'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_transfer_query" ADD "callerQuery" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_transfer_query" DROP COLUMN "callerQuery"`);
    }

}
