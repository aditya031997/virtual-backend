import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn
} from 'typeorm';
@Entity('call_history')
export class CallHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  callerName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'timestamp' })
  callDateTime: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  duration: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  afterHours: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  callStatus: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  facility: string | null;

  // The site the caller identified, as verified by the agent's get_site_info
  // tool. Distinct from `facility`, which holds a dealer code — one dealer
  // covers many sites, so the code cannot be resolved back to a site name.
  // Null when the agent never established a site (most business-hours calls).
  @Column({ type: 'varchar', length: 255, nullable: true })
  siteName: string | null;

  @Column({ 
    type: 'enum', 
    enum: ['Positive', 'Neutral', 'Negative'],
    default: 'Neutral'
  })
  feedback: 'Positive' | 'Neutral' | 'Negative';

  @Column({ type: 'varchar', length: 100, nullable: true })
  handledBy: string | null;

  @Column({ type: 'boolean', default: false })
  isTransferred: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  humanAgentName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  callerNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  callerEmail: string | null;

  @Column({ 
    type: 'enum', 
    enum: ['not-requested', 'successful', 'unsuccessful'],
    default: 'not-requested'
  })
  isEscalation: 'not-requested' | 'successful' | 'unsuccessful';

  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @Column({ type: 'text', nullable: true })
  callSummary: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

