import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { HumanAgent } from '@/schema';

@Entity('support_types')
export class SupportType {
  @PrimaryGeneratedColumn('uuid')
  id: string; 

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => HumanAgent, (humanAgent) => humanAgent)
  humanAgents: HumanAgent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}