const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { v2: cloudinary } = require('cloudinary');
const authMiddleware = require('./authMiddleware');
const upload = require('./UploadConfig');

const app = express();

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI,)
    .then(() => console.log('Berhasil Terhubung ke MongoDB'))
    .catch(err => console.log('Gagal Terhubung ke MongoDB'));

const LaporanSchema = new mongoose.Schema({
    nama: { type: String, required: true},
    telepon: { type: String},
    kategori: { type: String, required:true},
    judul: { type: String, required:true},
    deskripsi: { type: String, required:true},
    status: { type: String, default: 'pending' },
    files: {type:Array, default: []},
    priority: { type: String, default: 'rendah' },
}, {timestamps: true  
});

const pengumumanSchema = new mongoose.Schema ({
    judul: {type:String, required:true},
    isi: {type:String, required:true},
    imageFiles: [{
    url: String,
    filename: String // Ini adalah public_id di Cloudinary
    }],
}, {timestamps: true
});

const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const Laporan = mongoose.model('Laporan', LaporanSchema);
const Pengumuman = mongoose.model('Pengumuman', pengumumanSchema);
const  Admin = mongoose.model('Admin', AdminSchema);

/**
 * @route   POST /api/admin/register
 * @desc    Mendaftarkan admin baru (hanya untuk setup awal)
 * @access  Public (Nantinya harus diamankan)
 */
app.post('/api/admin/register', async (req, res) => {
    
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password tidak boleh kosong' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Buat data admin baru menggunakan Model 'Admin'
        const newAdmin = new Admin({
            username: username,
            password: hashedPassword 
        });

        // 5. Simpan admin baru ke database MongoDB
        await newAdmin.save();

        // 6. Kirim jawaban sukses (status 201 artinya "Created")
        res.status(201).json({ message: 'Admin berhasil didaftarkan' });

    } catch (err) {
        // 7. Tangani error
        // Jika error-nya punya kode 11000, itu artinya "duplicate key"
        // (username sudah ada di database).
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Username sudah digunakan' });
        }
        
        res.status(500).json({ error: 'Gagal mendaftarkan admin: ' + err.message });
    }
});

/**
 * @route   POST /api/admin/login
 * @desc    Login admin dan dapatkan token
 * @access  Public
 */
app.post('/api/admin/login', async (req, res) => {
    try {
        // 1. Ambil username dan password dari request body
        const { username, password } = req.body;

        // 2. Cari di database apakah ada admin dengan username ini
        // 'Admin.findOne' adalah perintah Mongoose untuk mencari satu data
        const admin = await Admin.findOne({ username });

        // 3. Jika admin tidak ditemukan, kirim error.
        // PENTING: Jangan bilang "Username tidak ditemukan",
        // ini untuk keamanan. Selalu gunakan pesan yang sama.
        if (!admin) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        // 4. CEK PASSWORD
        // 'bcrypt.compare' akan membandingkan:
        //    - 'password' (yang dikirim user, misal: 'admin123')
        //    - 'admin.password' (hash yang ada di database, misal: '$2b$10$fA...')
        // Fungsi ini akan mengembalikan true jika cocok, dan false jika tidak.
        const isMatch = await bcrypt.compare(password, admin.password);

        // 5. Jika password tidak cocok (isMatch == false), kirim error
        if (!isMatch) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        // 6. BUAT TOKEN (Tiket Masuk)
        // Jika username DITEMUKAN dan password COCOK, kita buatkan "tiket"
        // Ini adalah JSON Web Token (JWT)
        const token = jwt.sign(
            { adminId: admin._id, username: admin.username }, 
            process.env.JWT_SECRET,   
            { expiresIn: '1h' }     
        );

        // 7. Kirim jawaban sukses beserta token-nya
        // Frontend React akan menerima token ini dan menyimpannya.
        res.json({ 
            message: 'Login berhasil',
            token: token 
        });

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

/**
 * @route   POST /api/laporan
 * @desc    Membuat laporan baru (oleh user) DENGAN FILE
 * @access  Public
 */
app.post('/api/laporan', upload.array('files', 5), async (req, res) => {
    try {
        const { nama, telepon, kategori, judul, deskripsi } = req.body;
        const files = req.files.map(file => ({
            url: file.path,
            filename: file.filename,
            originalname: file.originalname
        }));

        const laporanBaru = new Laporan ({
            nama,
            telepon,
            kategori,
            judul,
            deskripsi,
            files: files
        });
        
        await laporanBaru.save();
        res.status(201).json({ message:'Laporan berhasil dikirim', data: laporanBaru });
    }catch (err) {
        res.status(400).json({ error: 'Gagal mengirim laporan: ' + err.message });
    }
});

/**
 * @route   GET /api/laporan
 * @desc    Mendapatkan semua laporan (untuk admin & user)
 * @access  Public (Nanti bisa kita ubah jika admin butuh data lebih)
 */
app.get('/api/laporan', async (req, res) => {
    try {
        // 1. Ambil semua data dari koleksi 'Laporan'
        // .sort({ createdAt: -1 }) artinya urutkan dari yang paling baru
        const semuaLaporan = await Laporan.find().sort({ createdAt: -1 });

        // 2. Kirim data sebagai JSON
        res.json(semuaLaporan);

    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data laporan: ' + err.message });
    }
});

/**
 * @route   PUT /api/laporan/:id
 * @desc    Update status atau prioritas laporan (oleh admin)
 * @access  Private (Admin Only)
 */
// Perhatikan penggunaan 'authMiddleware' di tengah!
app.put('/api/laporan/:id', authMiddleware, async (req, res) => {
    try {
        const { status, priority } = req.body;
        const laporanId = req.params.id;

        const dataUpdate = {};
        if (status) dataUpdate.status = status;
        if (priority) dataUpdate.priority = priority;

        const laporanTerupdate = await Laporan.findByIdAndUpdate(
            laporanId,
            dataUpdate,
            { new: true }
        );

        if (!laporanTerupdate) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan' });
        }

        res.json({ message: 'Laporan berhasil diupdate', data: laporanTerupdate });

    } catch (err) {
        res.status(500).json({ error: 'Gagal update laporan: ' + err.message });
    }
});


/**
 * @route   DELETE /api/laporan/:id
 * @desc    Menghapus laporan (oleh admin)
 * @access  Private (Admin Only)
 */
app.delete('/api/laporan/:id', authMiddleware, async (req, res) => {
    try {
        const laporanId = req.params.id;

        const laporanDihapus = await Laporan.findByIdAndDelete(laporanId);

        if (!laporanDihapus) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan' });
        }

        // --- AWAL KODE TAMBAHAN UNTUK LAPORAN ---
    try {
    // Kita gunakan 'files' sesuai nama di LaporanSchema
        if (laporanDihapus.files && laporanDihapus.files.length > 0) {

        // Dapatkan semua 'filename' (public_id)
        const publicIds = laporanDihapus.files.map(file => file.filename);

        // Perintahkan Cloudinary untuk menghapus file-file ini
        await cloudinary.api.delete_resources(publicIds);
    }
    } catch (err) {
        console.error('Gagal menghapus file laporan dari Cloudinary:', err);
    // Jika gagal, jangan batalkan respons sukses, cukup catat errornya
}
// --- AKHIR KODE TAMBAHAN UNTUK LAPORAN ---

        res.json({ message: 'Laporan berhasil dihapus', data: laporanDihapus });

    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus laporan: ' + err.message });
    }
});

// ==========================================================
// API UNTUK PENGUMUMAN (CRUD)
// ==========================================================

/**
 * @route   GET /api/pengumuman
 * @desc    Mendapatkan semua pengumuman
 * @access  Public
 */
app.get('/api/pengumuman', async (req, res) => {
    try {
        // Ambil semua pengumuman, urutkan dari yang paling baru
        const semuaPengumuman = await Pengumuman.find().sort({ createdAt: -1 });
        res.json(semuaPengumuman);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data pengumuman: ' + err.message });
    }
});

/**
 * @route   POST /api/pengumuman
 * @desc    Membuat pengumuman baru (Admin Only) DENGAN FILE
 * @access  Private
 */
app.post('/api/pengumuman', authMiddleware, upload.array('imageUrls', 3), async (req, res) => {
    // 'authMiddleware' -> Cek token admin
    // 'upload.array('imageUrls', 3)' -> Terima maks 3 file dari field 'imageUrls'
    try {
        const { judul, isi } = req.body;

        // Ambil URL file dari Cloudinary (jika ada)
        const imageFiles = req.files ? req.files.map(file => ({
            url: file.path,
            filename: file.filename // <-- INI YANG PENTING
        })) : [];

        // Validasi dasar
        if (!judul || !isi) {
            return res.status(400).json({ error: 'Judul dan Isi tidak boleh kosong' });
        }

        const pengumumanBaru = new Pengumuman({
            judul,
            isi,
            imageFiles: imageFiles // Simpan array URL ke database
        });

        await pengumumanBaru.save();
        res.status(201).json({ message: 'Pengumuman berhasil dibuat', data: pengumumanBaru });

    } catch (err) {
        res.status(400).json({ error: 'Gagal membuat pengumuman: ' + err.message });
    }
});

// server.js

// ... (semua kode lain di atas biarkan saja) ...

/**
 * @route   PUT /api/pengumuman/:id
 * @desc    Mengupdate pengumuman (Admin Only) DENGAN FILE
 * @access  Private
 */
// --- PERBAIKAN: Ganti upload.array() menjadi upload.any() ---
app.put('/api/pengumuman/:id', authMiddleware, upload.any(), async (req, res) => {
    try {
        // upload.any() menaruh field teks di req.body
        const { judul, isi, existingFiles } = req.body; 
        // upload.any() menaruh field file di req.files
        const newUploadedFiles = req.files || [];
        const pengumumanId = req.params.id;

        // 1. Cari data pengumuman lama
        const pengumumanLama = await Pengumuman.findById(pengumumanId);
        if (!pengumumanLama) {
            return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
        }

        // 2. Parse file lama yang dikirim dari frontend untuk disimpan
        let filesToKeep = [];
        if (existingFiles) {
            try {
                filesToKeep = JSON.parse(existingFiles); 
            } catch (e) {
                return res.status(400).json({ error: 'Format existingFiles salah' });
            }
        }
        
        // 3. Tentukan file mana yang harus dihapus dari Cloudinary
        const oldFilenames = pengumumanLama.imageFiles ? pengumumanLama.imageFiles.map(f => f.filename) : [];
        const keptFilenames = filesToKeep.map(f => f.filename);
        const filesToDelete = oldFilenames.filter(filename => !keptFilenames.includes(filename));

        if (filesToDelete.length > 0) {
            await cloudinary.api.delete_resources(filesToDelete);
        }

        // 4. Ambil file baru (pastikan fieldname-nya benar)
        const newFiles = newUploadedFiles
            .filter(file => file.fieldname === 'imageUrls')
            .map(file => ({
                url: file.path,
                filename: file.filename
            }));

        // 5. Gabungkan file lama yang disimpan + file baru
        const updatedImageFiles = [...filesToKeep, ...newFiles];

        // --- FITUR BARU: Validasi gambar wajib (sesuai permintaan Anda) ---
        if (updatedImageFiles.length === 0) {
            return res.status(400).json({ error: 'Pengumuman harus memiliki setidaknya satu gambar.' });
        }
        // --- BATAS FITUR BARU ---

        // 6. Buat objek update untuk MongoDB
        const dataUpdate = {
            judul: judul, // Dengan upload.any(), ini adalah string biasa
            isi: isi,
            imageFiles: updatedImageFiles 
        };

        // 7. Lakukan update di MongoDB
        const pengumumanTerupdate = await Pengumuman.findByIdAndUpdate(
            pengumumanId,
            dataUpdate,
            { new: true } 
        );

        res.json({ message: 'Pengumuman berhasil diupdate', data: pengumumanTerupdate });

    } catch (err) {
        console.error('Error saat update pengumuman:', err);
        res.status(500).json({ error: 'Gagal update pengumuman: ' + err.message });
    }
});

// ... (sisa kode server.js Anda) ...
// --- AKHIR PERBAIKAN ENDPOINT PUT PENGUMUMAN ---

// ... sisa kode Anda di server.js (seperti app.delete('/api/pengumuman/:id'), PORT, dll.) ...

/**
 * @route   DELETE /api/pengumuman/:id
 * @desc    Menghapus pengumuman (Admin Only)
 * @access  Private
 */
app.delete('/api/pengumuman/:id', authMiddleware, async (req, res) => {
    try {
        const pengumumanId = req.params.id;

        const pengumumanDihapus = await Pengumuman.findByIdAndDelete(pengumumanId);

        if (!pengumumanDihapus) {
            return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
        }

        // --- TAMBAHAN BARU ---
    try {
    // Kita gunakan 'imageFiles' sesuai nama skema baru kita
         if (pengumumanDihapus.imageFiles && pengumumanDihapus.imageFiles.length > 0) {

        // Dapatkan semua 'filename' (public_id) dari data yang dihapus
        const publicIds = pengumumanDihapus.imageFiles.map(file => file.filename);

        // Perintahkan Cloudinary untuk menghapus file-file ini
        await cloudinary.api.delete_resources(publicIds);
    }
    } catch (err) {
    console.error('Gagal menghapus file pengumuman dari Cloudinary:', err);
    // Jika gagal, jangan batalkan respons sukses, cukup catat errornya
}
// --- BATAS TAMBAHAN ---

        // Catatan: Ini belum menghapus file dari Cloudinary.
        // File-nya akan tetap ada di Cloudinary, tapi datanya terhapus dari MongoDB.
        // Ini adalah area yang bisa ditingkatkan nanti.
        
        res.json({ message: 'Pengumuman berhasil dihapus', data: pengumumanDihapus });

    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus pengumuman: ' + err.message });
    }  
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`server berjalan di http://localhost:${PORT}`);
});