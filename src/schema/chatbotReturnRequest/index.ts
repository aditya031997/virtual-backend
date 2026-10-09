import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A return / RMA request submitted from the chatbot widget. Persisted for the
 * admin dashboard and used to build the notification email sent to the support
 * inbox (SES_SUPPORT_EMAIL).
 */
@Entity('chatbot_return_requests')
export class ChatbotReturnRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  leadId!: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;

  // Snapshot of who submitted (lead details may change over time)
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  contact!: string | null;

  @Column({ type: 'varchar', length: 255 })
  productName!: string;

  @Column({ type: 'varchar', length: 100 })
  orderId!: string;

  @Column({ type: 'text' })
  reasonForReturn!: string;

  @Column({ type: 'text' })
  returnAddress!: string;

  @Column({ type: 'varchar', length: 20, default: 'requested' })
  status!: string;

  @Column({ type: 'boolean', default: false })
  emailSent!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
