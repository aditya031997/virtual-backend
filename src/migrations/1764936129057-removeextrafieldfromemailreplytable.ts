import { MigrationInterface, QueryRunner } from "typeorm";

export class Removeextrafieldfromemailreplytable1764936129057 implements MigrationInterface {
    name = 'Removeextrafieldfromemailreplytable1764936129057'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_replies" DROP COLUMN "sentAt"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_replies" ADD "sentAt" TIMESTAMP`);
    }

}
