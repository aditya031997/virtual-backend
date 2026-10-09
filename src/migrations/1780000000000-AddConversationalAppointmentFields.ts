import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `chatbot_appointments` for conversational booking.
 *
 * The table was shaped by the old widget form, which always collected a
 * facility and a time before submitting. Natural-language booking ("can I
 * schedule a meeting with the sales team next week?") supplies a DATE and a
 * DEPARTMENT instead, and often no facility at all — so:
 *
 *  - `preferredDate` is added; the table previously stored only a time, which
 *    made "next week" impossible to represent.
 *  - `department` is added to capture the team the user asked for.
 *  - `careFacilityLocation` and `preferredTime` become nullable, since a
 *    conversational request may legitimately omit them.
 *
 * Existing rows are untouched and remain valid: every column added is
 * nullable, and the two relaxed columns only widen what is accepted. The down
 * migration restores NOT NULL by backfilling the placeholder the form used for
 * blanks, so it is safe to run provided no conversational row has since stored
 * a genuine NULL.
 */
export class AddConversationalAppointmentFields1780000000000
  implements MigrationInterface
{
  name = 'AddConversationalAppointmentFields1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ADD "preferredDate" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ADD "department" character varying(50)`,
    );

    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ALTER COLUMN "careFacilityLocation" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ALTER COLUMN "preferredTime" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore NOT NULL. Any row created by conversational booking without these
    // values gets the same 'Not provided' placeholder the form used, so the
    // constraint can be re-applied without dropping data.
    await queryRunner.query(
      `UPDATE "chatbot_appointments" SET "careFacilityLocation" = 'Not provided' WHERE "careFacilityLocation" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "chatbot_appointments" SET "preferredTime" = '00:00' WHERE "preferredTime" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ALTER COLUMN "preferredTime" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" ALTER COLUMN "careFacilityLocation" SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" DROP COLUMN "department"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chatbot_appointments" DROP COLUMN "preferredDate"`,
    );
  }
}
