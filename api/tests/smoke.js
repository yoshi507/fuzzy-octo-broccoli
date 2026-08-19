const assert = require('assert');
const { getDefaults, getSettingById, validateSetting } = require('../config/settingsRegistry');
const { getGuildSettings, applyPatch, getHistory } = require('../services/settingsBridge');

const GUILD = '999000111222333444';

function testRegistry() {
  const defaults = getDefaults();
  assert.ok(defaults['ai.dailyLimit'] === 20);
  assert.ok(getSettingById('leveling.enabled'));
  assert.strictEqual(validateSetting(getSettingById('ai.dailyLimit'), 9999).ok, false);
  assert.strictEqual(validateSetting(getSettingById('ai.dailyLimit'), 15).ok, true);
  console.log('OK registry/validation');
}

function testSettingsBridge() {
  assert.ok(typeof getGuildSettings(GUILD)['leveling.enabled'] === 'boolean');
  let failed = false;
  try { applyPatch(GUILD, { 'ai.dailyLimit': 9999 }, { username: 'test' }); } catch (e) { failed = e.code === 'VALIDATION'; }
  assert.ok(failed);
  const next = applyPatch(GUILD, { 'leveling.enabled': false, 'welcome.message': 'Hello {user}', 'ai.dailyLimit': 12 }, { username: 'tester' });
  assert.strictEqual(next['leveling.enabled'], false);
  assert.strictEqual(next['welcome.message'], 'Hello {user}');
  assert.strictEqual(next['ai.dailyLimit'], 12);
  assert.ok(getHistory(GUILD).length >= 1);
  console.log('OK settings bridge + history');
}

testRegistry();
testSettingsBridge();
console.log('All API smoke tests passed');
