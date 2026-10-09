import { MigrationInterface, QueryRunner } from "typeorm";

export class Knowledgebasetable1759316632400 implements MigrationInterface {
    name = 'Knowledgebasetable1759316632400'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "folder" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "folderName" character varying(100) NOT NULL, "section" character varying(100) NOT NULL, "userId" uuid NOT NULL, "parentId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6278a41a706740c94c02e288df8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "document" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fileName" character varying NOT NULL, "fileUrl" character varying NOT NULL, "fileType" character varying NOT NULL, "folderId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e57d3357f83f3cdc0acffc3d777" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "link" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "url" character varying NOT NULL, "description" text, "folderId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_26206fb7186da72fbb9eaa3fac9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "text" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "content" text NOT NULL, "folderId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ef734161ea7c326fedf699309f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "faq" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "question" text NOT NULL, "answer" text NOT NULL, "folderId" uuid NOT NULL, "userId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d6f5a52b1a96dd8d0591f9fbc47" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "folder" ADD CONSTRAINT "FK_a0ef64d088bc677d66b9231e90b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "folder" ADD CONSTRAINT "FK_9ee3bd0f189fb242d488c0dfa39" FOREIGN KEY ("parentId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "document" ADD CONSTRAINT "FK_76b187510eda9c862f9944808a8" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "document" ADD CONSTRAINT "FK_7424ddcbdf1e9b067669eb0d3fd" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "link" ADD CONSTRAINT "FK_1f8538f1595d7007b8a92c460ca" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "link" ADD CONSTRAINT "FK_14a562b14bb83fc8ba73d30d3e0" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "text" ADD CONSTRAINT "FK_6953cd28d551af06f91fb531adf" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "text" ADD CONSTRAINT "FK_04677d4ae91c83da4dae0211151" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "faq" ADD CONSTRAINT "FK_2743041614bcc45fba51b5ebb79" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "faq" ADD CONSTRAINT "FK_2b6dcfbef5586e37112cd3b6ee8" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "faq" DROP CONSTRAINT "FK_2b6dcfbef5586e37112cd3b6ee8"`);
        await queryRunner.query(`ALTER TABLE "faq" DROP CONSTRAINT "FK_2743041614bcc45fba51b5ebb79"`);
        await queryRunner.query(`ALTER TABLE "text" DROP CONSTRAINT "FK_04677d4ae91c83da4dae0211151"`);
        await queryRunner.query(`ALTER TABLE "text" DROP CONSTRAINT "FK_6953cd28d551af06f91fb531adf"`);
        await queryRunner.query(`ALTER TABLE "link" DROP CONSTRAINT "FK_14a562b14bb83fc8ba73d30d3e0"`);
        await queryRunner.query(`ALTER TABLE "link" DROP CONSTRAINT "FK_1f8538f1595d7007b8a92c460ca"`);
        await queryRunner.query(`ALTER TABLE "document" DROP CONSTRAINT "FK_7424ddcbdf1e9b067669eb0d3fd"`);
        await queryRunner.query(`ALTER TABLE "document" DROP CONSTRAINT "FK_76b187510eda9c862f9944808a8"`);
        await queryRunner.query(`ALTER TABLE "folder" DROP CONSTRAINT "FK_9ee3bd0f189fb242d488c0dfa39"`);
        await queryRunner.query(`ALTER TABLE "folder" DROP CONSTRAINT "FK_a0ef64d088bc677d66b9231e90b"`);
        await queryRunner.query(`DROP TABLE "faq"`);
        await queryRunner.query(`DROP TABLE "text"`);
        await queryRunner.query(`DROP TABLE "link"`);
        await queryRunner.query(`DROP TABLE "document"`);
        await queryRunner.query(`DROP TABLE "folder"`);
    }

}
