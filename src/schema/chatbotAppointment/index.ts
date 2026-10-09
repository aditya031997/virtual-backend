import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * An appointment request submitted from the chatbot widget after the lead
 * form. Persisted for the admin dashboard and used to build the notification
 * email sent to the support inbox (SES_SUPPORT_EMAIL).
 */
@Entity('chatbot_appointments')
export class ChatbotAppointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  leadId!: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;

  // Snapshot of who booked (lead details may change over time)
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  contact!: string | null;

  // Nullable since conversational booking may omit it — the form always sent
  // a value, so existing rows are unaffected.
  @Column({ type: 'varchar', length: 255, nullable: true })
  careFacilityLocation!: string | null;

  // Preferred time in 24h "HH:MM" form. Nullable: a user may give a date
  // ("next week") without naming a time.
  @Column({ type: 'varchar', length: 5, nullable: true })
  preferredTime!: string | null;

  // Preferred calendar date, resolved from phrases such as "next Tuesday".
  // Absent on rows created by the old form, which collected time only.
  @Column({ type: 'date', nullable: true })
  preferredDate!: string | null;

  // Team the user asked for (e.g. "sales"), when they named one.
  @Column({ type: 'varchar', length: 50, nullable: true })
  department!: string | null;

  @Column({ type: 'text' })
  natureOfRequest!: string;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status!: string;

  @Column({ type: 'boolean', default: false })
  emailSent!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
