# App Unfurls API Sample for Node

[App Unfurls](https://api.slack.com/docs/message-link-unfurling) are a feature of the Slack Platform
that allow your Slack app customize the presentation of links that belong to a certain domain or
set of domains.

This sample demonstrates building an app that can unfurl links from the popular photo sharing site
[Flickr](https://www.flickr.com/). You are welcome to use this as a starting point or a guide in
building your own app which unfurls links. This sample uses Slack's own SDKs and tools. Even if you
choose to use another programming language or another set of tools, reading through the code will
help you gain an understanding of how to make use of unfurls.

![Demo](support/demo.gif "Demo")

## Set Up

You should start by [creating a Slack app](https://api.slack.com/slack-apps) and configuring it
to use the Events API. This sample app uses the
[Slack Event Adapter](https://github.com/slackapi/node-slack-events-api), where you can find some
configuration steps to get the Events API ready to use in your app.


### Event Subscription

Turn on Event Subscriptions for the Slack app. You must input and verify a Request URL, and the
easiest way to do this is to
[use a development proxy as described in the Events API module](https://github.com/slackapi/node-slack-events-api#configuration).
The application listens for events at the path `/slack/events`. For example, the Request URL may
look like `https://myappunfurlsample.ngrok.io/slack/events`.
Create a subscription to the team event `link_shared`. Add an app unfurl domain for "flickr.com".
Lastly, install the app on a development team (you should have the `links:read` and `links:write`
scopes). Once the installation is complete, note the OAuth Access Token.

### Flickr

Create a Flickr app at the [Flickr developer site](https://www.flickr.com/services/apps/create/).
Once you create an app, note the API Key.

### Environment

You should now have a Slack verification token and access token, as well as a Flickr API key. Clone
this application locally. Create a new file named `.env` within the directory and place these values
as shown:

```
SLACK_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxx
SLACK_CLIENT_TOKEN=xoxp-0000000000-0000000000-0000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

FLICKR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Lastly, download the dependencies for the application by running `npm install`. Note that this
example assumes you are using a currently supported LTS version of Node (at this time, v6 or above).

## Part 1: The basic unfurl

The example of a basic unfurl is contained in `basic.js`.

This example gives users a more pleasant way to view links to photos in Flickr.

### Understanding the code

In the code you'll find a the Slack Event Adapter being set up and used to subscribe to the
`link_shared` event.

```javascript
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
```

The event contains an array of links, which are each run through the function
`messageAttachmentFromLink()` to fetch data about the link from Flickr, and transform the link into
a message attachment. Message attachments have
[rich formatting capabilities](https://api.slack.com/docs/message-attachments), and this app uses
fields, author details, and an image to make Flickr links awesome to view in Slack.

Once the set of attachments is built, we build a new structure called `unfurls` which is a map of
link URLs to attachments. That unfurls structure is passed to the Web API method `chat.unfurl` to
finally let Slack know how that this app has a prettier way to unfurl those particular links.

## Part 2: Interactivity with unfurls

The example of adding interactivity to unfurls is in `interactive.js`.

This example builds off of `basic.js` but adds interactive message buttons to each of the unfurls.
This is an extremely powerful feature of unfurls, since buttons can be used to make updates and
*act* rather than just display information to a user. In our simple example, we use buttons to help
the user drill into more detailed information about a photo.

### Additional set up

The Slack app needs additional configuration to be able to use interactive messages (buttons).
Return to the app's configuration page from [your list of apps](https://api.slack.com/apps).
Navigate to the interactive messages section using the menu. Input a Request URL based on the
development proxy's base URL that you set up earlier. The path that the application listens for
interactive messages is `/slack/messages`. For example, the Request URL may look like
`https://myappunfurlsample.ngrok.io/slack/messages`.

### Understanding the code

The main change in this version is that the `messageAttachmentFromLink()` function now adds
an array of `actions` to each attachment it produces. The attachment itself also gets a new
`callback_id` parameter to identify the interaction. In this case we call the interaction
`"photo_details"`.

Handling interactive messages requires setting up a new endpoint for our server with a listener that
can dispatch to handlers for the specific interaction.

```javascript
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
```

Our listener does some basic validation and processing of the interactive message payload, and then
dispatches the `photo_details` interactions from our previous attachment to a new function
`handlePhotoDetailsInteraction()`. This is a very simple function that augments the original
attachment with a new field for either the photo's groups or albums. Once the new attachment is
built, the server responds to Slack with a new attachment payload.

Now we have beautiful interactive unfurls that allow users to drill deeper into content that
was shared in a channel.
