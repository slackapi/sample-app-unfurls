require('dotenv').config();

const slackEventsAPI = require('@slack/events-api');
const { WebClient } = require('@slack/client');
const { getFlickrUrlData } = require('./lib/flickr');
const keyBy = require('lodash.keyby');
const omit = require('lodash.omit');
const mapValues = require('lodash.mapvalues');
const normalizePort = require('normalize-port');

/**
 * Transform a Slack link into a Slack message attachment.
 *
 * @param {Object} link - Slack link
 * @param {string} link.url - The URL of the link
 *
 * @returns {Promise.<Object>} An object described by the Slack message attachment structure. In
 * addition to the properties described in the API documentation, an additional `url` property is
 * defined so the source of the attachment is captured.
 * See: https://api.slack.com/docs/message-attachments
 */
function messageAttachmentFromLink(link) {
  return getFlickrUrlData(link.url)
    .then((photo) => {
      // The basic attachment
      const attachment = {
        fallback: photo.title + (photo.description ? `: ${photo.description}` : ''),
        color: '#ff0084', // Flickr logo pink
        title: photo.title,
        title_link: photo.url,
        image_url: photo.imageUrl,
        url: link.url,
      };

      // Slack only renders the author information if the `author_name` property is defined
      // Doesn't always have a value. see: https://github.com/npm-flickr/flickr-photo-info/pull/3
      const authorName = photo.owner.name || photo.owner.username;
      if (authorName) {
        attachment.author_name = authorName;
        attachment.author_icon = photo.owner.icons.small;
        attachment.author_link = photo.owner.url;
      }

      // Conditionally add fields as long as the data is available
      const fields = [];

      if (photo.description) {
        fields.push({
          title: 'Description',
          value: photo.description,
        });
      }

      if (photo.tags.length > 0) {
        fields.push({
          title: 'Tags',
          value: photo.tags.map(t => t.raw).join(', '),
        });
      }

      if (photo.takenTS) {
        fields.push({
          title: 'Taken',
          value: (new Date(photo.takenTS)).toUTCString(),
        });
      }

      if (photo.postTS) {
        fields.push({
          title: 'Posted',
          value: (new Date(photo.postTS)).toUTCString(),
        });
      }

      if (fields.length > 0) {
        attachment.fields = fields;
      }

      return attachment;
    });
}

// Initialize a Slack Event Adapter for easy use of the Events API
// See: https://github.com/slackapi/node-slack-events-api
const slackEvents = slackEventsAPI.createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN);

// Initialize a Web Client
const slack = new WebClient(process.env.SLACK_CLIENT_TOKEN);

// Handle the event from the Slack Events API
slackEvents.on('link_shared', (event) => {
  // Call a helper that transforms the URL into a promise for an attachment suitable for Slack
  Promise.all(event.links.map(messageAttachmentFromLink))
    // Transform the array of attachments to an unfurls object keyed by URL
    .then(attachments => keyBy(attachments, 'url'))
    .then(unfurls => mapValues(unfurls, attachment => omit(attachment, 'url')))
    // Invoke the Slack Web API to append the attachment
    .then(unfurls => slack.chat.unfurl(event.message_ts, event.channel, unfurls))
    .catch(console.error);
});

// Handle errors
const slackEventsErrorCodes = slackEventsAPI.errorCodes;
slackEvents.on('error', (error) => {
  if (error.code === slackEventsErrorCodes.TOKEN_VERIFICATION_FAILURE) {
    console.warn(`An unverified request was sent to the Slack events request URL: ${error.body}`);
  } else {
    console.error(error);
  }
});

// Start the server
const port = normalizePort(process.env.PORT || '3000');
slackEvents.start(port).then(() => {
  console.log(`server listening on port ${port}`);
});
