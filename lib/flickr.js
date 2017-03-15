/**
 * Flickr Helper module
 * @module lib/flickr
 */
const promisify = require('es6-promisify');
const sample = require('lodash.sample');
const sortBy = require('lodash.sortby');
const find = require('lodash.find');
const fc = require('flickr-client');
const fpi = require('flickr-photo-info');
const fpu = require('flickr-photo-urls');
const { parseURL } = require('whatwg-url');
const { maxWidth, maxHeight, idealAspectRatio } = require('./common');

const flickrClient = fc({ key: process.env.FLICKR_API_KEY });
const fetchPhotoInfo = promisify(fpi(flickrClient));
const fetchPhotoUrls = promisify(fpu(flickrClient));
const flickr = promisify(flickrClient);

/**
 * Find the photo URL oject that best suits the dimensions of a Slack message attachment.
 *
 * @param {Object} photoUrls - A collection of objects which describe a photoUrl that has specific
 * dimensions
 * @returns {Object} The chosen object from the collection
 */
function findBestImage(photoUrls) {
  const anyPhoto = sample(photoUrls);
  const aspectRatio = anyPhoto.width / anyPhoto.height;
  const prioritizedDimension = (idealAspectRatio > aspectRatio) ? 'width' : 'height';
  const comparedDimensionValue = (prioritizedDimension === 'height') ? maxHeight : maxWidth;
  const sortedPhotos = sortBy(photoUrls, prioritizedDimension);
  return find(sortedPhotos, photo => photo[prioritizedDimension] > comparedDimensionValue);
}

/**
 * Retreive structured data about a Flickr image from its URL. This method encapsulates getting
 * any information about the URL. The goal is to aggregate all possibly required data.
 *
 * @alias module:lib/flickr.getFlickrUrlData
 * @param {string} inputUrl - An image URL
 * @returns {Promise.<Object>} An object which contains data about the photo at the URL
 */
function getFlickrUrlData(inputUrl) {
  const url = parseURL(inputUrl);
  const photoId = url.path[2];
  return Promise.all([
    fetchPhotoInfo(photoId),
    fetchPhotoUrls(photoId),
    flickr('photos.getAllContexts', { photo_id: photoId }),
  ])
    .then((results) => {
      const photoInfo = results[0];
      const photoUrls = results[1];
      const photoContexts = results[2];
      const image = findBestImage(photoUrls);
      return Object.assign(photoInfo, {
        imageUrl: image.source,
        sets: photoContexts.set,
        pools: photoContexts.pool,
      });
    });
}

exports.getFlickrUrlData = getFlickrUrlData;
