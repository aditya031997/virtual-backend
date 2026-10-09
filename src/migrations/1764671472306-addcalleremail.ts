import { MigrationInterface, QueryRunner } from "typeorm";

export class Addcalleremail1764671472306 implements MigrationInterface {
    name = 'Addcalleremail1764671472306'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "callerEmail" character varying(255)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "callerEmail"`);
    }

}
