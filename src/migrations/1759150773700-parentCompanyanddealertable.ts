import { MigrationInterface, QueryRunner } from "typeorm";

export class ParentCompanyanddealertable1759150773700 implements MigrationInterface {
    name = 'ParentCompanyanddealertable1759150773700'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "parent_companies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "companyName" character varying(100) NOT NULL, "email" character varying(255) NOT NULL, "contactNumber" character varying(20) NOT NULL, "businessAddress" character varying(100) NOT NULL, "description" text, "userId" uuid NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_0d8c1b2f30db459c60fce597a5a" UNIQUE ("email"), CONSTRAINT "PK_749e875b2f782afaec5d7c15682" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "sites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "siteName" character varying(100) NOT NULL, "parentCompanyId" uuid, "assignedDealerId" uuid, "email" character varying(255) NOT NULL, "contactNumber" character varying(20) NOT NULL, "businessAddress" character varying(100) NOT NULL, "description" text, "userId" uuid NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_5bfb186ab4994f7db835bca5fdb" UNIQUE ("email"), CONSTRAINT "PK_4f5eccb1dfde10c9170502595a7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "parent_companies" ADD CONSTRAINT "FK_5c147d97baca57d5e14ffae3a5f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_40b488a4b8629cc8bcccb5a28ec" FOREIGN KEY ("parentCompanyId") REFERENCES "parent_companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_f6ede09c5a3e1529c82afec9ed1" FOREIGN KEY ("assignedDealerId") REFERENCES "dealer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_8bc6823c23faf9c75bbace6053a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_8bc6823c23faf9c75bbace6053a"`);
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_f6ede09c5a3e1529c82afec9ed1"`);
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_40b488a4b8629cc8bcccb5a28ec"`);
        await queryRunner.query(`ALTER TABLE "parent_companies" DROP CONSTRAINT "FK_5c147d97baca57d5e14ffae3a5f"`);
        await queryRunner.query(`DROP TABLE "sites"`);
        await queryRunner.query(`DROP TABLE "parent_companies"`);
    }

}
