import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ChatbotMessageRole = 'user' | 'bot' | 'system';

/**
 * A single message within a {@link ChatbotSession}. The frontend posts each
 * message (user and bot) so the complete conversation can be replayed later.
 */
@Entity('chatbot_messages')
export class ChatbotMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: ChatbotMessageRole;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
