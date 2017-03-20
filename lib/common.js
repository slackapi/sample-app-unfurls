const pick = require('lodash.pick');

/**
 * Common helpers
 * @module lib/common
 */

// These dimensions are dictated by message attachment specifications from Slack
// see: https://api.slack.com/docs/message-attachments

/**
 * @constant {number}
 * @alias module:lib/common.maxWidth
 * @default
 */
const maxWidth = 400;

/**
 * @constant {number}
 * @alias module:lib/common.maxHeight
 * @default
 */
const maxHeight = 500;

/**
 * @constant {number}
 * @alias module:lib/common.idealAspectRatio
 * @default
 */
const idealAspectRatio = maxWidth / maxHeight;

/**
 * Clone an attachment object while ensuring it doesn't have any server-assigned properties present
 * @param {Object} attachment - the attachment to be cloned and cleaned
 *
 * @returns {Object} The clean clone
 */
function cloneAndCleanAttachment(attachment) {
  const clone = pick(attachment, [
    'fallback',
    'color',
    'title',
    'title_link',
    'image_url',
    'url',
    'author_name',
    'author_icon',
    'author_link',
    'url',
    'fields',
    'actions',
    'callback_id',
  ]);
  if (clone.actions) {
    clone.actions = clone.actions.map(c => pick(c, ['text', 'name', 'type', 'value']));
  }
  return clone;
}

exports.maxWidth = maxWidth;
exports.maxHeight = maxHeight;
exports.idealAspectRatio = idealAspectRatio;
exports.cloneAndCleanAttachment = cloneAndCleanAttachment;
