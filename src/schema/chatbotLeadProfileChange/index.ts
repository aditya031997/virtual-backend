import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ChatbotLeadProfileField = 'name' | 'email' | 'contact';

/** 'initial' = the creation baseline snapshot; 'update' = a later change. */
export type ChatbotLeadProfileChangeType = 'initial' | 'update';

/**
 * Audit trail of profile changes on a {@link ChatbotLead}. One row per
 * changed field per update (e.g. name "Aditya" -> "Adi"). The lead id never
 * changes, so chat history/sessions stay linked regardless of profile edits.
 */
@Entity('chatbot_lead_profile_changes')
export class ChatbotLeadProfileChange {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  leadId!: string;

  // The session in which this change happened (the session active when the
  // user submitted these details). Null for admin edits / historical rows.
  @Index()
  @Column({ type: 'uuid', nullable: true })
  sessionId!: string | null;

  // 'initial' for the first-session baseline snapshot, 'update' afterwards.
  @Column({ type: 'varchar', length: 10, default: 'update' })
  changeType!: ChatbotLeadProfileChangeType;

  @Column({ type: 'varchar', length: 20 })
  field!: ChatbotLeadProfileField;

  @Column({ type: 'varchar', length: 255, nullable: true })
  oldValue!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  newValue!: string | null;

  @CreateDateColumn()
  changedAt!: Date;
}
