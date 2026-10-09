import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCallBackNumberToUserTransferQuery1778100000000 implements MigrationInterface {
    name = 'AddCallBackNumberToUserTransferQuery1778100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_transfer_query" ADD "callBackNumber" character varying(40)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_transfer_query" DROP COLUMN "callBackNumber"`);
    }

}
