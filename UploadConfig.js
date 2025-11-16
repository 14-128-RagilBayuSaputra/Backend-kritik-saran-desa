const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage} = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config ({
    cloud_name: process.env.CLOUDINRY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage ({
    cloudinary: cloudinary,
    params: {
        folder: 'kritik_saran_desa',
        allowed_formats: ['jpg', 'png', 'pdf', 'jpeg']
    }
});

const upload = multer ({ storage: storage});
module.exports = upload;