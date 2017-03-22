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
  ])
    .then((results) => {
      const photoInfo = results[0];
      const photoUrls = results[1];
      const image = findBestImage(photoUrls);
      return Object.assign(photoInfo, {
        imageUrl: image.source,
      });
    });
}

/**
 * Retreive structured data about the Flickr photo sets (also known as an Album) that a certain
 * photo appears in.
 *
 * @alias module:lib/flickr.getFlickrPhotoSets
 * @param {string} photoId - The photo whose albums are to be found
 * @returns {Promise.<Array>} An array of objects containing data about the photo sets
 */
function getFlickrPhotoSets(photoId) {
  return flickr('photos.getAllContexts', { photo_id: photoId })
    .then((photoContexts) => {
      if (photoContexts.set) {
        return Promise.all(photoContexts.set.map(set => flickr('photosets.getInfo', {
          photoset_id: set.id,
        })
        .then((setInfo) => {
          const setData = Object.assign({}, setInfo.photoset);
          /* eslint-disable no-underscore-dangle */
          setData.title = setData.title._content || '';
          setData.description = setData.description._content || '';
          /* eslint-enable no-underscore-dangle */
          setData.url = `https://www.flickr.com/photos/${setData.owner}/sets/${setData.id}/`;
          return setData;
        })));
      }
      return [];
    });
}

function getFlickrPhotoPools(photoId) {
  return flickr('photos.getAllContexts', { photo_id: photoId })
    .then((photoContexts) => {
      if (photoContexts.pool) {
        return photoContexts.pool.map((pool) => {
          const poolData = Object.assign({}, pool);
          poolData.url = `https://www.flickr.com${pool.url}`;
          return poolData;
        });
      }
      return [];
    });
}

exports.getFlickrUrlData = getFlickrUrlData;
exports.getFlickrPhotoSets = getFlickrPhotoSets;
exports.getFlickrPhotoPools = getFlickrPhotoPools;
