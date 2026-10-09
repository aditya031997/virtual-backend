import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { ParentCompany, Dealer } from '@/schema';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  siteName: string;

  @Column({ type: 'uuid', nullable: true })
  parentCompanyId: string;

  @ManyToOne(() => ParentCompany, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentCompanyId' })
  parentCompany: ParentCompany;

  @Column({ type: 'uuid', nullable: true })
  assignedDealerId: string;

  // Add onDelete: 'CASCADE' to the dealer relationship
  @ManyToOne(() => Dealer, (dealer) => dealer.sites, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignedDealerId' })
  assignedDealer: Dealer;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  contactNumber: string | null;

  @Column({ type: 'varchar', length: 100 })
  businessAddress: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  stateCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}