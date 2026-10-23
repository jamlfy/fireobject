import type { Firestore } from '@google-cloud/firestore';
import { Connector, FireObject, field } from '../../../src/orm';
import { database, resetFakeFirestore } from './fake-firestore';

export interface UserData {
  id: string;
  name: string;
  email?: string;
  role?: string;
  secret?: string;
  active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export const hooks: string[] = [];

@Connector(database as unknown as Firestore, 'Users')
export class User extends FireObject<UserData> {
  static timestamps = true;
  static softDelete = true;

  @field({
    validators: [(value: unknown) => Boolean(value) || 'required'],
    nullable: false,
  })
  declare id: string;

  @field({
    validators: [(value: unknown) => Boolean(value) || 'required'],
    nullable: false,
  })
  declare name: string;

  @field({ immutable: true })
  declare email?: string;

  @field({ default: 'member' })
  declare role?: string;

  @field({
    serialize: (value) => `serialized:${String(value)}`,
    deserialize: (value) => String(value).replace(/^serialized:/, ''),
  })
  declare secret?: string;

  @field()
  declare active?: boolean;

  @field() declare createdAt?: Date;
  @field() declare updatedAt?: Date;
  @field() declare deletedAt?: Date;

  beforeSave() {
    hooks.push('beforeSave');
  }
  beforeCreate() {
    hooks.push('beforeCreate');
  }
  afterCreate() {
    hooks.push('afterCreate');
  }
  beforeUpdate() {
    hooks.push('beforeUpdate');
  }
  afterUpdate() {
    hooks.push('afterUpdate');
  }
  beforeDelete() {
    hooks.push('beforeDelete');
  }
  afterDelete() {
    hooks.push('afterDelete');
  }
  afterSave() {
    hooks.push('afterSave');
  }
}

export const resetUserState = (): void => {
  resetFakeFirestore();
  hooks.length = 0;
};
