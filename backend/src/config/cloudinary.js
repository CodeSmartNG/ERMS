const cloudinary = require('cloudinary').v2;
const env = require('./env');

for (const [k, v] of [
  ['CLOUDINARY_CLOUD_NAME', process.env.CLOUDINARY_CLOUD_NAME],
  ['CLOUDINARY_API_KEY', process.env.CLOUDINARY_API_KEY],
  ['CLOUDINARY_API_SECRET', process.env.CLOUDINARY_API_SECRET],
]) {
  if (!v) throw new Error(`Missing required env: ${k}`);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

module.exports = {
  cloudinary,
  folder: process.env.CLOUDINARY_FOLDER || 'codesmartng-erms/evidence',
};
