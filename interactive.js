require('dotenv').config();

const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const slackEventsAPI = require('@slack/events-api');
const { WebClient } = require('@slack/client');
const { getFlickrUrlData, getFlickrPhotoSets, getFlickrPhotoPools } = require('./lib/flickr');
const { cloneAndCleanAttachment } = require('./lib/common');
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

      // Add buttons for interactivity
      attachment.callback_id = 'photo_details';
      attachment.actions = [
        {
          text: 'Albums',
          name: 'list_photosets',
          type: 'button',
          value: photo.id,
        },
        {
          text: 'Groups',
          name: 'list_pools',
          type: 'button',
          value: photo.id,
        },
      ];

      return attachment;
    });
}

/**
 * Handle Slack interactive messages from `photo_details` interaction types
 */
function handlePhotoDetailsInteraction(payload, done) {
  // Clone the originalAttachment so that we can send back a replacement with our own modifications
  const originalAttachment = payload.original_message.attachments[0];
  const attachment = cloneAndCleanAttachment(originalAttachment);

  // Find the relevant action
  const action = payload.actions[0];

  // Since many buttons could have triggered a `photo_details` interaction, we choose to use another
  // switch statement to deal with each kind of button separately.
  let attachmentPromise;
  switch (action.name) {
    case 'list_photosets':
      // Make modifications to the attachment to include the photo set details
      // In general, this is an opportunity to fetch more data, perform updates, or communicate
      // with other systems to build a new attachment.
      attachmentPromise = getFlickrPhotoSets(action.value)
        .then((photoSets) => {
          // If this isn't the first time the button was pressed, the field might already exist,
          // so here we remove it so the content is essentially refreshed.
          attachment.fields = attachment.fields ? attachment.fields.filter(f => f.title !== 'Albums') : [];
          const field = {
            title: 'Albums',
          };
          if (photoSets.length > 0) {
            field.value = photoSets.map(set => `:small_blue_diamond: <${set.url}|${set.title}>`).join('\n');
          } else {
            field.value = 'This photo is not in any albums';
          }
          attachment.fields.push(field);
          return attachment;
        });
      break;
    case 'list_pools':
      // As described above, the attachment is augmented to Group data
      attachmentPromise = getFlickrPhotoPools(action.value)
        .then((photoPools) => {
          attachment.fields = attachment.fields ? attachment.fields.filter(f => f.title !== 'Groups') : [];
          const field = {
            title: 'Groups',
          };
          if (photoPools.length > 0) {
            field.value = photoPools.map(pool => `:small_blue_diamond: <${pool.url}|${pool.title}>`).join('\n');
          } else {
            field.value = 'This photo is not in any groups';
          }
          attachment.fields.push(field);
          return attachment;
        });
      break;
    default:
      // As long as the above list of cases is exhaustive, there shouldn't be anything here
      attachmentPromise = Promise.reject(new Error('Unhandled action'));
      break;
  }
  attachmentPromise.then(a => done(null, a)).catch(done);
}

/**
 * Handle requests from Slack interactive messages
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function handleInteractiveMessages(req, res) {
  // Parse the `payload` body parameter as JSON, otherwise abort and respond with client erorr
  let payload;
  try {
    payload = JSON.parse(req.body.payload);
  } catch (parseError) {
    res.sendStatus(400);
    return;
  }

  // Verify token to prove that the request originates from Slack
  if (!payload.token || payload.token !== process.env.SLACK_VERIFICATION_TOKEN) {
    res.sendStatus(404);
    return;
  }

  // Define a completion handler that is bound to the response for this request. Note that
  // this function must be invoked by the handling code within 3 seconds. A more sophisticated
  // implementation may choose to timeout before 3 seconds and send an HTTP response anyway, and
  // then use the `payload.response_url` to send a request once the completion handler is invoked.
  function callback(error, body) {
    if (error) {
      res.sendStatus(500);
    } else {
      res.send(body);
    }
  }

  // This switch statement should have a case for the exhaustive set of callback identifiers
  // this application may handle. In this sample, we only have one: `photo_details`.
  switch (payload.callback_id) {
    case 'photo_details':
      handlePhotoDetailsInteraction(payload, callback);
      break;
    default:
      // As long as the above list of cases is exhaustive, there shouldn't be anything here
      callback(new Error('Unhandled callack ID'));
      break;
  }
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

// Handle Events API errors
const slackEventsErrorCodes = slackEventsAPI.errorCodes;
slackEvents.on('error', (error) => {
  if (error.code === slackEventsErrorCodes.TOKEN_VERIFICATION_FAILURE) {
    console.warn(`An unverified request was sent to the Slack events request URL: ${error.body}`);
  } else {
    console.error(error);
  }
});

// Create the server
const port = normalizePort(process.env.PORT || '3000');
const app = express();
// Mount JSON body parser before the Events API middleware
app.use(bodyParser.json());
app.use('/slack/events', slackEvents.expressMiddleware());
// Mount the `application/x-www-form-urlencoded` body parser before handling Slack interactive
// messages
app.use(bodyParser.urlencoded({ extended: false }));
app.use('/slack/messages', handleInteractiveMessages);
// Start the server
http.createServer(app).listen(port, () => {
  console.log(`server listening on port ${port}`);
});
