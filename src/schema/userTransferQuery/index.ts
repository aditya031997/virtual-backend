import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserTransferQueryStatus = 'pending' | 'resolved' | 'escalated';

@Entity('user_transfer_query')
export class UserTransferQuery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'resolved', 'escalated'],
    default: 'pending',
  })
  queryStatus: UserTransferQueryStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  currentCallSid: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  conversationId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  siteName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  callerName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  callerEmail: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  callerPhone: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  callBackNumber: string | null;

  @Column({ type: 'text', nullable: true })
  callerQuery: string | null;

  @Column({ type: 'jsonb', nullable: true })
  agentQuery: unknown | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
