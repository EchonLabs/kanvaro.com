import mongoose from 'mongoose';
import { isProjectTeamMember } from '../project-team-membership';

describe('isProjectTeamMember', () => {
  const USER = new mongoose.Types.ObjectId();
  const OTHER = new mongoose.Types.ObjectId();

  it('matches the real subdocument shape', () => {
    const project = { teamMembers: [{ memberId: OTHER }, { memberId: USER, hourlyRate: 40 }] };

    expect(isProjectTeamMember(project, USER)).toBe(true);
    expect(isProjectTeamMember(project, USER.toString())).toBe(true);
  });

  it('matches a populated memberId', () => {
    const project = { teamMembers: [{ memberId: { _id: USER, firstName: 'Dev' } }] };

    expect(isProjectTeamMember(project, USER.toString())).toBe(true);
  });

  it('still matches a legacy flat id element', () => {
    expect(isProjectTeamMember({ teamMembers: [USER] }, USER.toString())).toBe(true);
    expect(isProjectTeamMember({ teamMembers: [USER.toString()] }, USER)).toBe(true);
  });

  it('still matches a legacy flat element that has been populated', () => {
    const project = { teamMembers: [{ _id: USER, firstName: 'Dev' }] };

    expect(isProjectTeamMember(project, USER.toString())).toBe(true);
  });

  it('rejects a non-member', () => {
    expect(isProjectTeamMember({ teamMembers: [{ memberId: OTHER }] }, USER)).toBe(false);
  });

  // The failure mode this helper exists to prevent: a subdocument stringifies
  // to something that must never be treated as an id match.
  it('never matches on a stringified subdocument', () => {
    const project = { teamMembers: [{ memberId: OTHER }] };

    expect(isProjectTeamMember(project, '[object Object]')).toBe(false);
    expect(isProjectTeamMember(project, String({ memberId: OTHER }))).toBe(false);
  });

  it('is false for missing, empty or malformed input', () => {
    expect(isProjectTeamMember(null, USER)).toBe(false);
    expect(isProjectTeamMember(undefined, USER)).toBe(false);
    expect(isProjectTeamMember({}, USER)).toBe(false);
    expect(isProjectTeamMember({ teamMembers: [] }, USER)).toBe(false);
    expect(isProjectTeamMember({ teamMembers: 'nope' }, USER)).toBe(false);
    expect(isProjectTeamMember({ teamMembers: [null, undefined, {}] }, USER)).toBe(false);
    expect(isProjectTeamMember({ teamMembers: [{ memberId: USER }] }, null)).toBe(false);
    expect(isProjectTeamMember({ teamMembers: [{ memberId: USER }] }, undefined)).toBe(false);
    expect(isProjectTeamMember({ teamMembers: [{ memberId: USER }] }, '')).toBe(false);
  });
});
