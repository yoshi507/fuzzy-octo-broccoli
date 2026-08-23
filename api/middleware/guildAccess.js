/**
 * Guild authorization helpers.
 * Implementation lives on the guilds router to avoid duplication.
 */
const { assertCanManage } = require('../routes/guilds');

module.exports = { assertCanManage };
