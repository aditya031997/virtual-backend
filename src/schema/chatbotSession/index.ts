import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A single chatbot conversation. A new session is created per visit and is
 * linked to a {@link ChatbotLead} so a returning user's full history can be
 * reconstructed across all of their sessions.
 */
@Entity('chatbot_sessions')
export class ChatbotSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  leadId!: string;

  // The site the widget was embedded on, as sent by the client. Nullable
  // because sessions created before this column existed have no value, and a
  // widget on a page that does not supply one still has to work.
  //
  // varchar, NOT uuid. It looks like it should match `sites.id` here, but the
  // widget's siteId comes from the smartcaller service, whose ids are cuids
  // ("cmspz5rxy0007vdkkl3c4tboz"). A uuid column rejected every one of them and
  // took the whole lead-creation transaction down with it.
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  siteId!: string | null;

  // Lifecycle: 'active' | 'ended' | 'expired'. Backend is the source of truth.
  @Index()
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: string;

  // Why the session ended: 'manual' | 'inactivity' | 'tab_close' |
  // 'superseded' | 'expired'. Null while still active.
  @Column({ type: 'varchar', length: 20, nullable: true })
  endReason!: string | null;

  // Bumped on every message / activity ping. Drives server-side TTL expiry.
  // Must be a plain @Column: @CreateDateColumn is insert-only, so TypeORM
  // silently dropped every heartbeat written via .save(), leaving this frozen
  // at startedAt and inflating the durations shown in Chat History.
  @Index()
  @Column({ type: 'timestamp', default: () => 'now()' })
  lastActivityAt!: Date;

  // ElevenLabs `conv_...` id, set once the client SDK conversation starts.
  // Used to correlate the ElevenLabs post-call webhook transcript with this
  // session/lead. NOT our session id and NOT the lead id.
  @Index()
  @Column({ type: 'varchar', length: 255, nullable: true })
  conversationId!: string | null;

  @CreateDateColumn()
  startedAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt!: Date | null;

  // The chatbot_messages.id this session ended *after* — i.e. the last
  // message before termination. Null if the session had no messages or is
  // still active. FK is ON DELETE SET NULL.
  @Column({ type: 'uuid', nullable: true })
  endedAfterMessageId!: string | null;

  // End-of-session feedback collected by the frontend (1-10 picker). Null
  // until the user submits a rating. 'neutral_timeout' auto-ends write 6.
  @Column({ type: 'smallint', nullable: true })
  feedbackRating!: number | null;

  // Derived from feedbackRating: 1-4 = 'Negative', 5-7 = 'Neutral',
  // 8-10 = 'Positive'. Stored explicitly so admin queries can filter
  // without needing the derivation function.
  @Column({ type: 'varchar', length: 10, nullable: true })
  sentiment!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
