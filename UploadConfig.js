const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config(); // Pastikan ini ada agar env terbaca

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // 1. Ambil ekstensi file dan ubah ke huruf kecil
    const fileExt = file.originalname.split('.').pop().toLowerCase();
    
    // Default setting (untuk gambar)
    let resource_type = 'image';
    let folder = 'kritik_saran_desa';
    // Format gambar yang diizinkan
    let allowed_formats = ['jpg', 'png', 'jpeg', 'webp'];

    // 2. Cek apakah VIDEO
    if (['mp4', 'mov', 'mkv', 'avi'].includes(fileExt)) {
      resource_type = 'video';
      allowed_formats = ['mp4', 'mov', 'mkv', 'avi'];
    } 
    // 3. Cek apakah DOKUMEN (Word, Excel, PDF)
    // PENTING: Gunakan .includes() agar logika benar!
    else if (['pdf', 'docx', 'xlsx', 'doc', 'ppt', 'pptx', 'xls'].includes(fileExt)) {
      resource_type = 'raw'; // 'raw' adalah tipe untuk file non-media di Cloudinary
      // Untuk tipe 'raw', biasanya kita tidak perlu set allowed_formats secara ketat
      // atau kita set sesuai ekstensinya agar Cloudinary tidak bingung
      allowed_formats = [fileExt]; 
    }

    return {
      folder: folder,
      resource_type: resource_type,
      // public_id: file.originalname.split('.')[0], // Opsional: Pakai nama asli file
      // format: fileExt, // Paksa format sesuai ekstensi asli
    };
  },
});

const upload = multer({ storage: storage });

module.exports = upload;