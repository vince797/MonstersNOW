const { guardReviewPreview } = require('../lib/review-preview-api-guard');
module.exports = async function handler(request, response) {
  if (await guardReviewPreview(request, response)) return;
  response.status(404).json({ error: 'Not found.' });
};
