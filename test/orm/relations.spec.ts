import { database, records, resetFakeFirestore } from './helpers/fake-firestore';
import { Member, Team } from './helpers/relation-models';

const teamRef = (id: string) => database.collection('Teams').doc(id);

const storeTeam = (id: string, name: string): void => {
  records.set(`Teams/${id}`, { id, name });
};

const storeMember = (
  id: string,
  relations: Record<string, unknown>,
): void => {
  records.set(`Members/${id}`, { id, name: `Member ${id}`, ...relations });
};

beforeEach(resetFakeFirestore);

describe('populate()', () => {
  it('loads and caches single relations', async () => {
    storeTeam('team-1', 'Alpha');
    storeMember('member-1', { team: teamRef('team-1') });

    const member = await Member.findOrFail('member-1');
    const populated = await Member.populate([member], 'team');

    expect(populated).toEqual([member]);
    records.delete('Teams/team-1');

    const team = await member.team;
    expect(team).toBeInstanceOf(Team);
    expect(team?.name).toBe('Alpha');
  });

  it('loads relation arrays and drops missing documents', async () => {
    storeTeam('team-1', 'Alpha');
    storeTeam('team-2', 'Beta');
    storeMember('member-1', {
      teams: [teamRef('team-1'), teamRef('missing'), teamRef('team-2')],
    });

    const member = await Member.findOrFail('member-1');
    await Member.populate([member], 'teams');
    records.clear();

    const teams = await member.teams;
    expect(teams?.map((team) => team.name)).toEqual(['Alpha', 'Beta']);
  });

  it('loads every relation when no field is specified', async () => {
    storeTeam('team-1', 'Alpha');
    storeMember('member-1', {
      team: teamRef('team-1'),
      teams: [teamRef('team-1')],
    });

    const member = await Member.findOrFail('member-1');
    await Member.populate([member]);
    records.clear();

    expect((await member.team)?.name).toBe('Alpha');
    expect(await member.teams).toHaveLength(1);
  });

  it('returns null when a single relation document is missing', async () => {
    storeMember('member-1', { team: teamRef('missing') });

    const member = await Member.findOrFail('member-1');
    await Member.populate([member], 'team');

    expect(await member.team).toBeNull();
  });

  it('handles empty model collections and unknown relation names', async () => {
    await expect(Member.populate([])).resolves.toEqual([]);

    storeMember('member-1', {});
    const member = await Member.findOrFail('member-1');
    await expect(Member.populate([member], 'missing')).resolves.toEqual([
      member,
    ]);
  });
});

describe('load()', () => {
  it('loads and caches relations on a single instance', async () => {
    storeTeam('team-1', 'Alpha');
    storeMember('member-1', { team: teamRef('team-1') });

    const member = await Member.findOrFail('member-1');
    const loaded = await member.load('team');
    records.clear();

    expect(loaded).toBe(member);
    expect((await member.team)?.name).toBe('Alpha');
  });
});
