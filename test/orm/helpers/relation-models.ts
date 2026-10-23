import type { Firestore } from '@google-cloud/firestore';
import { Connector, FireObject, field, reference } from '../../../src/orm';
import { database } from './fake-firestore';

export interface TeamData {
  id: string;
  name: string;
}

export interface MemberData {
  id: string;
  name: string;
}

@Connector(database as unknown as Firestore, 'Teams')
export class Team extends FireObject<TeamData> {
  @field() declare id: string;
  @field() declare name: string;
}

@Connector(database as unknown as Firestore, 'Members')
export class Member extends FireObject<MemberData> {
  @field() declare id: string;
  @field() declare name: string;

  @reference(() => Team)
  declare team?: Promise<Team | null>;

  @reference(() => Team)
  declare teams?: Promise<Team[]>;
}
