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

// --- PERBAIKAN: Tambahkan 'resource_type' di skema Laporan ---
const LaporanSchema = new mongoose.Schema({
    nama: { type: String, required: true},
    telepon: { type: String},
    kategori: { type: String, required:true},
    judul: { type: String, required:true},
    deskripsi: { type: String, required:true},
    status: { type: String, default: 'pending' },
    files: [{
        url: String,
        filename: String,
        originalname: String,
        resource_type: String // <-- TAMBAHAN
    }],
    priority: { type: String, default: 'rendah' },
}, {timestamps: true  
});

// --- PERBAIKAN: Tambahkan 'resource_type' di skema Pengumuman ---
const pengumumanSchema = new mongoose.Schema ({
    judul: {type:String, required:true},
    isi: {type:String, required:true},
    imageFiles: [{
        url: String,
        filename: String, // Ini adalah public_id di Cloudinary
        resource_type: String // <-- TAMBAHAN
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
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });

        if (!admin) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        const token = jwt.sign(
            { adminId: admin._id, username: admin.username }, 
            process.env.JWT_SECRET,   
            { expiresIn: '24h' }     
        );
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
        
        // --- PERBAIKAN: Simpan 'resource_type' dari hasil upload ---
        const files = req.files.map(file => ({
            url: file.path,
            filename: file.filename,
            originalname: file.originalname,
            resource_type: file.resource_type // <-- TAMBAHAN
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
        const semuaLaporan = await Laporan.find().sort({ createdAt: -1 });
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
// --- PERBAIKAN "SAPU JAGAT": Logika Hapus Paling Aman ---
app.delete('/api/laporan/:id', authMiddleware, async (req, res) => {
    try {
        const laporanId = req.params.id;
        const laporanDihapus = await Laporan.findByIdAndDelete(laporanId);

        if (!laporanDihapus) {
            return res.status(404).json({ error: 'Laporan tidak ditemukan' });
        }

        try {
            if (laporanDihapus.files && laporanDihapus.files.length > 0) {
                
                // Loop untuk setiap file yang ada di laporan ini
                for (const file of laporanDihapus.files) {
                    // Kita coba hapus file ini dari SEMUA kemungkinan tipe.
                    // Cloudinary tidak akan error jika file tidak ditemukan di tipe tersebut,
                    // dia hanya akan mengabaikannya. Ini cara paling aman untuk membersihkan data lama & baru.

                    // 1. Coba hapus sebagai Image
                    await cloudinary.api.delete_resources([file.filename], { resource_type: 'image' });
                    
                    // 2. Coba hapus sebagai Video
                    await cloudinary.api.delete_resources([file.filename], { resource_type: 'video' });
                    
                    // 3. Coba hapus sebagai Raw (File mentah/PDF)
                    await cloudinary.api.delete_resources([file.filename], { resource_type: 'raw' });
                }
            }
        } catch (err) {
            // Kita hanya log error, jangan hentikan proses response ke user
            console.error('Warning: Ada kendala saat menghapus file di Cloudinary:', err.message);
        }

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
app.post('/api/pengumuman', authMiddleware, upload.array('imageUrls', 10), async (req, res) => {
    try {
        const { judul, isi } = req.body;

        // --- PERBAIKAN: Simpan 'resource_type' dari hasil upload ---
        const imageFiles = req.files ? req.files.map(file => ({
            url: file.path,
            filename: file.filename,
            resource_type: file.resource_type // <-- TAMBAHAN
        })) : [];

        if (!judul || !isi) {
            return res.status(400).json({ error: 'Judul dan Isi tidak boleh kosong' });
        }

        const pengumumanBaru = new Pengumuman({
            judul,
            isi,
            imageFiles: imageFiles
        });

        await pengumumanBaru.save();
        res.status(201).json({ message: 'Pengumuman berhasil dibuat', data: pengumumanBaru });

    } catch (err) {
        res.status(400).json({ error: 'Gagal membuat pengumuman: ' + err.message });
    }
});

/**
 * @route   PUT /api/pengumuman/:id
 * @desc    Mengupdate pengumuman (Admin Only) DENGAN FILE
 * @access  Private
 */
app.put('/api/pengumuman/:id', authMiddleware, upload.any(), async (req, res) => {
    try {
        const { judul, isi, existingFiles } = req.body; 
        const newUploadedFiles = req.files || [];
        const pengumumanId = req.params.id;

        const pengumumanLama = await Pengumuman.findById(pengumumanId);
        if (!pengumumanLama) {
            return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
        }

        let filesToKeep = [];
        if (existingFiles) {
            try {
                filesToKeep = JSON.parse(existingFiles); 
            } catch (e) {
                return res.status(400).json({ error: 'Format existingFiles salah' });
            }
        }
        
        // --- AWAL PERBAIKAN LOGIKA HAPUS CLOUDINARY (SAAT EDIT) ---
        const keptFilenames = filesToKeep.map(f => f.filename);
        try {
            // Tentukan file lama mana yang tidak ada di 'filesToKeep'
            const filesToDeleteData = pengumumanLama.imageFiles
                .filter(file => !keptFilenames.includes(file.filename));

            // Pisahkan berdasarkan tipe
            const imageIds = filesToDeleteData
                .filter(f => f.resource_type === 'image')
                .map(f => f.filename);
            const videoIds = filesToDeleteData
                .filter(f => f.resource_type === 'video')
                .map(f => f.filename);
            const rawIds = filesToDeleteData
                .filter(f => f.resource_type === 'raw' || !f.resource_type)
                .map(f => f.filename);
            
            // Hapus dari cloudinary
            if (imageIds.length > 0) {
                await cloudinary.api.delete_resources(imageIds, { resource_type: 'image' });
            }
            if (videoIds.length > 0) {
                await cloudinary.api.delete_resources(videoIds, { resource_type: 'video' });
            }
            if (rawIds.length > 0) {
                await cloudinary.api.delete_resources(rawIds, { resource_type: 'raw' });
            }

        } catch (err) {
            console.error('Gagal menghapus file lama dari Cloudinary:', err);
        }
        // --- AKHIR PERBAIKAN LOGIKA HAPUS CLOUDINARY (SAAT EDIT) ---


        // --- PERBAIKAN: Simpan 'resource_type' untuk file baru ---
        const newFiles = newUploadedFiles
            .filter(file => file.fieldname === 'imageUrls')
            .map(file => ({
                url: file.path,
                filename: file.filename,
                resource_type: file.resource_type // <-- TAMBAHAN
            }));

        const updatedImageFiles = [...filesToKeep, ...newFiles];

        if (updatedImageFiles.length === 0) {
            return res.status(400).json({ error: 'Pengumuman harus memiliki setidaknya satu gambar.' });
        }

        const dataUpdate = {
            judul: judul,
            isi: isi,
            imageFiles: updatedImageFiles 
        };

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

        // --- AWAL PERBAIKAN LOGIKA HAPUS CLOUDINARY ---
        try {
            if (pengumumanDihapus.imageFiles && pengumumanDihapus.imageFiles.length > 0) {

                const imageIds = pengumumanDihapus.imageFiles
                    .filter(f => f.resource_type === 'image')
                    .map(f => f.filename);
                    
                const videoIds = pengumumanDihapus.imageFiles
                    .filter(f => f.resource_type === 'video')
                    .map(f => f.filename);
                    
                const rawIds = pengumumanDihapus.imageFiles
                    .filter(f => f.resource_type === 'raw' || !f.resource_type)
                    .map(f => f.filename);

                if (imageIds.length > 0) {
                    await cloudinary.api.delete_resources(imageIds, { resource_type: 'image' });
                }
                if (videoIds.length > 0) {
                    await cloudinary.api.delete_resources(videoIds, { resource_type: 'video' });
                }
                if (rawIds.length > 0) {
                    await cloudinary.api.delete_resources(rawIds, { resource_type: 'raw' });
                }
            }
        } catch (err) {
            console.error('Gagal menghapus file pengumuman dari Cloudinary:', err);
        }
        // --- AKHIR PERBAIKAN LOGIKA HAPUS CLOUDINARY ---
        
        res.json({ message: 'Pengumuman berhasil dihapus', data: pengumumanDihapus });

    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus pengumuman: ' + err.message });
    }  
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`server berjalan di http://localhost:${PORT}`);
});