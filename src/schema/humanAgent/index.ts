import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { Dealer, SupportType } from '@/schema';

@Entity('human_agents')
export class HumanAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  agentName: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 100 })
  email: string;

  @Column({ type: 'enum', enum: ['P1', 'P2', 'P3'], default: 'P1' })
  priority: 'P1' | 'P2' | 'P3';

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  stateCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'uuid' })
  dealerId: string;

  @ManyToOne(() => Dealer, (dealer) => dealer.humanAgents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dealerId' })
  dealer: Dealer;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  supportTypeId: string;

  @ManyToOne(() => SupportType, (supportType) => supportType.humanAgents, { nullable: false })
  @JoinColumn({ name: 'supportTypeId' })
  supportType: SupportType;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: true })
  isAvailable: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}