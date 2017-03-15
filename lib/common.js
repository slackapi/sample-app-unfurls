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

exports.maxWidth = maxWidth;
exports.maxHeight = maxHeight;
exports.idealAspectRatio = idealAspectRatio;
