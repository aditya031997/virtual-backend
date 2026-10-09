import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { HumanAgent, Site } from '@/schema';

@Entity('dealer')
export class Dealer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  dealerName: string;

  @Column({ type: 'varchar', length: 4, unique: true })
  dealerCode: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar' })
  businessAddress: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  stateCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  // Cascade delete for human agents
  @OneToMany(() => HumanAgent, (agent) => agent.dealer, { cascade: true })
  humanAgents: HumanAgent[];

  // Add relationship with sites and cascade delete
  @OneToMany(() => Site, (site) => site.assignedDealer, { cascade: true })
  sites: Site[];

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}