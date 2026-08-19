/**
 * Multi-guild configuration isolation test (no Discord network).
 */
const { applyPatch, getGuildSettings } = require('../services/settingsBridge');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  applyPatch(GUILD_A, { 'deadchat.enabled': true, 'deadchat.minutes': 15 }, { id: 'test', username: 'tester' });
  applyPatch(GUILD_B, { 'deadchat.enabled': false, 'deadchat.minutes': 60 }, { id: 'test', username: 'tester' });

  const a = getGuildSettings(GUILD_A);
  const b = getGuildSettings(GUILD_B);

  assert(a['deadchat.enabled'] === true, 'A deadchat should be true');
  assert(b['deadchat.enabled'] === false, 'B deadchat should be false');
  assert(a['deadchat.minutes'] === 15, 'A minutes 15');
  assert(b['deadchat.minutes'] === 60, 'B minutes 60');

  applyPatch(GUILD_A, { 'deadchat.minutes': 20 }, { id: 'test', username: 'tester' });
  const a2 = getGuildSettings(GUILD_A);
  const b2 = getGuildSettings(GUILD_B);
  assert(a2['deadchat.minutes'] === 20, 'A updated');
  assert(b2['deadchat.minutes'] === 60, 'B unchanged');

  console.log('OK guild isolation test passed');
}

main().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
