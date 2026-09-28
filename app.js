// ============================================================
// KONFIGURASI SUPABASE - GANTI 2 BARIS INI!
// ============================================================
const SUPABASE_URL = 'https://ijhkqbqxxbednesnxprp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7KdrWbWtQbcKXY17aIwnZg_oEgPw1Wv';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// KONSTANTA
// ============================================================
const JENIS_IURAN = [
  'Iuran Keamanan', 'Iuran Keamanan & Jimpitan', 'Iuran Kebersihan',
  'Iuran Agustusan', 'Iuran Hari Raya', 'Iuran Sampah',
  'Iuran Jimpitan', 'Iuran Lainnya'
];

const PAGE_SIZE = 20; // jumlah baris per "load more"

// ============================================================
// VARIABEL GLOBAL
// ============================================================
let currentUser = null;
let currentWargaDetail = null;
let allWargaData = [];
let allIuranData = [];
let allIuranAllData = [];
let allPengeluaranData = [];
let allCatatanData = [];
let allUsersData = [];
let allMonthlyReports = [];
let allPengumumanData = [];
let allLogAktivitasData = [];
let currentActivePengumuman = [];
let currentPopupIndex = 0;

// FIX: pagination limit per tampilan
let limitWarga = PAGE_SIZE;
let limitIuran = PAGE_SIZE;
let limitPengeluaran = PAGE_SIZE;
let limitCatatan = PAGE_SIZE;
let limitUpdateIuran = PAGE_SIZE;

// Data yang sedang difilter (untuk pagination & filter)
let filteredWargaData = [];
let filteredIuranData = [];
let filteredPengeluaranData = [];
let filteredCatatanData = [];
let filteredUpdateIuranData = [];

// ============================================================
// HELPER: Nama Tampilan & Role Label
// ============================================================
function getDisplayName(user) {
  if (!user) return '-';
  const nt = (user.nama_tampilan || '').trim();
  return nt !== '' ? nt : user.username;
}

function getRoleLabel(role) {
  return role === 'admin' ? 'Admin' : 'Warga';
}

// FIX: getNamaByNomorRumah dengan prioritas suami > istri > nama_tampilan > username
function getNamaByNomorRumah(nomorRumah) {
  const warga = allWargaData.find(w => w.username === nomorRumah);
  if (!warga) return nomorRumah;
  const suami = (warga.nama_suami || '').trim();
  const istri = (warga.nama_istri || '').trim();
  const nt = (warga.nama_tampilan || '').trim();
  if (suami !== '') return suami;
  if (istri !== '') return istri;
  if (nt !== '') return nt;
  return warga.username;
}

// FIX: helper untuk tampil "C05 - Budi Santoso" (bukan "C05 - C05")
function formatWargaLabel(nomorRumah) {
  const nama = getNamaByNomorRumah(nomorRumah);
  if (!nama || nama === nomorRumah) return nomorRumah;
  return `${nomorRumah} - ${nama}`;
}

// ============================================================
// UTILITY
// ============================================================
function showGlobalLoading() { document.getElementById('globalLoading').style.display = 'flex'; }
function hideGlobalLoading() { document.getElementById('globalLoading').style.display = 'none'; }

function formatRupiah(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num === 0) return 'Rp 0';
  return 'Rp ' + num.toLocaleString('id-ID');
}

function formatTanggalIndo(tgl) {
  if (!tgl) return '-';
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const t = String(tgl).split('-');
  if (t.length !== 3) return tgl;
  return `${parseInt(t[2])} ${bulan[parseInt(t[1])-1]} ${t[0]}`;
}

function urutkanWarga(wargaList) {
  return [...wargaList].sort((a, b) => {
    const ua = a.username || '';
    const ub = b.username || '';
    const matchA = ua.match(/^([A-Za-z]+)(\d+)$/);
    const matchB = ub.match(/^([A-Za-z]+)(\d+)$/);
    if (!matchA && !matchB) return ua.localeCompare(ub);
    if (!matchA) return 1;
    if (!matchB) return -1;
    const blokA = matchA[1].toUpperCase();
    const blokB = matchB[1].toUpperCase();
    const angkaA = parseInt(matchA[2], 10);
    const angkaB = parseInt(matchB[2], 10);
    if (blokA !== blokB) return blokA.localeCompare(blokB);
    return angkaA - angkaB;
  });
}

function urutkanIuranSesuaiWarga(iuranList) {
  const urutanWarga = {};
  allWargaData.forEach((w, idx) => { urutanWarga[w.username] = idx; });
  return [...iuranList].sort((a, b) => {
    const ua = urutanWarga[a.nomor_rumah] ?? 9999;
    const ub = urutanWarga[b.nomor_rumah] ?? 9999;
    if (ua !== ub) return ua - ub;
    if (a.tahun !== b.tahun) return b.tahun - a.tahun;
    const bm = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    return bm.indexOf(b.bulan) - bm.indexOf(a.bulan);
  });
}

function debounce(func, wait) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => func(...args), wait); };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// ============================================================
// NOTIFIKASI SUKSES CUSTOM
// ============================================================
function showSuccess(title, message) {
  document.getElementById('successTitle').textContent = title || 'Berhasil!';
  document.getElementById('successMessage').textContent = message || '';
  new bootstrap.Modal(document.getElementById('successModal')).show();
}

// ============================================================
// FIX: HELPER PAGINATION
// ============================================================
// Reset semua limit ke PAGE_SIZE (dipanggil setelah filter/load baru)
function resetAllLimits() {
  limitWarga = PAGE_SIZE;
  limitIuran = PAGE_SIZE;
  limitPengeluaran = PAGE_SIZE;
  limitCatatan = PAGE_SIZE;
  limitUpdateIuran = PAGE_SIZE;
}

// Render tombol "load more" kalau masih ada sisa
function renderLoadMoreButton(containerId, currentLimit, totalData, onClickFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const remaining = totalData - currentLimit;
  if (remaining > 0) {
    container.style.display = 'block';
    const shown = Math.min(currentLimit, totalData);
    container.innerHTML = `
      <div class="show-more-btn" onclick="${onClickFn}()">
        <i class="fas fa-chevron-down me-1"></i>
        <span>Tampilkan ${Math.min(PAGE_SIZE, remaining)} lagi (${shown}/${totalData})</span>
      </div>
    `;
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

// ============================================================
// Navigasi Warga & Kelola Warga
// ============================================================
function goToKelolaWarga() {
  document.getElementById('dataWarga').classList.remove('show', 'active');
  document.getElementById('kelolaWargaView').style.display = 'block';
  renderKelolaWargaList(allWargaData);
}

function backToWarga() {
  document.getElementById('kelolaWargaView').style.display = 'none';
  document.getElementById('dataWarga').classList.add('show', 'active');
  document.querySelectorAll('#mainTabs .nav-link').forEach(l => l.classList.remove('active'));
  const wargaTab = document.querySelector('#mainTabs .nav-link[href="#dataWarga"]');
  if (wargaTab) wargaTab.classList.add('active');
  renderWargaList(allWargaData);
}

// ============================================================
// LOGIN & LOGOUT
// ============================================================
async function login(username, password) {
  const { data, error } = await supabaseClient.from('users').select('*').eq('username', username).eq('password', password).maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, message: 'Username atau password salah' };
  return { success: true, user: {
    username: data.username,
    nama_tampilan: data.nama_tampilan || null,
    role: data.role, dinas: data.dinas,
    nama_suami: data.nama_suami, nama_istri: data.nama_istri,
    anak: data.anak ? data.anak.split(',').map(a => a.trim()).filter(a => a) : []
  }};
}

async function catatLogin(username, role) {
  try {
    await supabaseClient.from('log_aktivitas').insert({
      username: username,
      role: role,
      aksi: 'login'
    });
  } catch (e) {
    console.error('Gagal catat log:', e);
  }
}

function logout() {
  sessionStorage.removeItem('ndb_user');
  currentUser = null;
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginForm').reset();
  document.getElementById('loginMessage').innerHTML = '';
}

// ============================================================
// LOAD ALL DATA
// ============================================================
async function loadAllData() {
  showGlobalLoading();
  try {
    const promises = [
      supabaseClient.from('users').select('*').order('id', { ascending: true }),
      supabaseClient.from('iuran').select('*').order('id', { ascending: false }),
      supabaseClient.from('pengeluaran').select('*').order('id', { ascending: false }),
      supabaseClient.from('catatan').select('*').order('id', { ascending: false })
    ];
    if (currentUser.role === 'admin') {
      promises.push(supabaseClient.from('pengumuman').select('*').order('tanggal', { ascending: false }));
    }

    const results = await Promise.all(promises);
    const [u, i, p, c] = results;

    if (u.error) throw u.error;
    if (i.error) throw i.error;
    if (p.error) throw p.error;
    if (c.error) throw c.error;

    allUsersData = u.data || [];
    allWargaData = urutkanWarga(allUsersData.filter(x => x.role === 'warga'));
    allIuranAllData = i.data || [];
    allPengeluaranData = p.data || [];
    allCatatanData = c.data || [];

    if (currentUser.role === 'admin' && results[4]) {
      allPengumumanData = results[4].data || [];
    }

    allIuranData = (currentUser.role === 'warga')
      ? allIuranAllData.filter(x => x.nomor_rumah === currentUser.username)
      : allIuranAllData;

    let totalIuran = 0, totalPengeluaran = 0;
    allIuranAllData.forEach(x => { if (x.status === 'lunas') totalIuran += parseFloat(x.jumlah) || 0; });
    allPengeluaranData.forEach(x => { totalPengeluaran += parseFloat(x.jumlah) || 0; });
    const saldo = totalIuran - totalPengeluaran;

    document.getElementById('saldoAmount').textContent = formatRupiah(saldo);
    document.getElementById('lastUpdate').textContent = new Date().toLocaleString('id-ID');

    // FIX: reset limit saat data di-reload
    resetAllLimits();

    // FIX: inisialisasi filtered data
    filteredWargaData = allWargaData;
    filteredIuranData = allIuranData;
    filteredPengeluaranData = allPengeluaranData;
    filteredCatatanData = allCatatanData;
    filteredUpdateIuranData = allIuranAllData.filter(x => x.status === 'belum');

    renderWargaList(filteredWargaData);
    renderIuranList(filteredIuranData);
    renderPengeluaranList(filteredPengeluaranData);
    renderCatatanList(filteredCatatanData);
    renderUpdateIuranList(filteredUpdateIuranData);
    if (currentUser.role === 'admin') {
      renderKelolaWargaList(allWargaData);
      renderPengumumanAdminList();
    }
    buildLaporanKeuangan();

    if (currentUser.role === 'warga') {
      await loadPengumumanAktifUntukWarga();
    }
  } catch (err) {
    console.error(err);
    alert('Gagal memuat data: ' + err.message);
  } finally {
    hideGlobalLoading();
  }
}

// ============================================================
// RENDER WARGA (dengan pagination)
// ============================================================
function renderWargaList(warga) {
  const c = document.getElementById('wargaList');
  if (!c) return;
  if (warga.length === 0) {
    c.innerHTML = '<div class="text-center text-muted py-3">Tidak ada data</div>';
    document.getElementById('wargaShowMore').style.display = 'none';
    return;
  }
  const d = warga.slice(0, limitWarga);
  c.innerHTML = d.map(item => `
    <div class="warga-item" onclick='showWargaDetail(${JSON.stringify(item).replace(/'/g, "&#39;")})'>
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <strong class="text-primary">${item.username}</strong>
          <div class="text-muted small mt-1">${item.dinas || '-'} - ${item.nama_suami || item.nama_istri || '-'}</div>
        </div>
        <div><i class="fas fa-chevron-right text-muted"></i></div>
      </div>
    </div>
  `).join('');
  renderLoadMoreButton('wargaShowMore', limitWarga, warga.length, 'loadMoreWarga');
}

function loadMoreWarga() {
  limitWarga += PAGE_SIZE;
  renderWargaList(filteredWargaData);
}

function filterWargaList(q) {
  q = q.toLowerCase();
  filteredWargaData = allWargaData.filter(i =>
    (i.username||'').toLowerCase().includes(q) || (i.dinas||'').toLowerCase().includes(q) ||
    (i.nama_suami||'').toLowerCase().includes(q) || (i.nama_istri||'').toLowerCase().includes(q)
  );
  limitWarga = PAGE_SIZE; // reset pagination saat filter berubah
  renderWargaList(filteredWargaData);
}

function showWargaDetail(w) {
  currentWargaDetail = w;
  document.getElementById('detailNomorRumah').textContent = w.username;
  document.getElementById('wargaDetailContent').innerHTML = `
    <div class="mb-2"><strong>Nomor Rumah:</strong> ${w.username}</div>
    <div class="mb-2"><strong>Nama Tampilan:</strong> ${w.nama_tampilan || '<em class="text-muted">(belum diisi)</em>'}</div>
    <div class="mb-2"><strong>Dinas:</strong> ${w.dinas || '-'}</div>
    <div class="mb-2"><strong>Nama Suami:</strong> ${w.nama_suami || '-'}</div>
    <div class="mb-2"><strong>Nama Istri:</strong> ${w.nama_istri || '-'}</div>
    <div class="mb-2"><strong>Anak:</strong> ${w.anak || '-'}</div>
  `;
  document.getElementById('editWargaBtn').style.display =
    (currentUser.role === 'warga' && currentUser.username === w.username) ? 'inline-block' : 'none';
  new bootstrap.Modal(document.getElementById('detailWargaModal')).show();
}

function showEditWargaModal() {
  if (!currentWargaDetail) return;
  const u = currentWargaDetail;
  document.getElementById('editUsername').value = u.username;
  document.getElementById('editNomorRumah').value = u.username;
  document.getElementById('editNamaTampilan').value = u.nama_tampilan || '';
  document.getElementById('editPassword').value = u.password || '';
  document.getElementById('editDinas').value = u.dinas || 'JOG';
  document.getElementById('editNamaSuami').value = u.nama_suami || '';
  document.getElementById('editNamaIstri').value = u.nama_istri || '';
  document.getElementById('editAnak').value = u.anak || '';
  bootstrap.Modal.getInstance(document.getElementById('detailWargaModal'))?.hide();
  new bootstrap.Modal(document.getElementById('editWargaModal')).show();
}

async function saveEditWarga() {
  const oldU = document.getElementById('editUsername').value;
  const newU = document.getElementById('editNomorRumah').value;
  const ntRaw = document.getElementById('editNamaTampilan').value.trim();
  const upd = {
    username: newU,
    nama_tampilan: ntRaw !== '' ? ntRaw : null,
    password: document.getElementById('editPassword').value,
    dinas: document.getElementById('editDinas').value,
    nama_suami: document.getElementById('editNamaSuami').value,
    nama_istri: document.getElementById('editNamaIstri').value,
    anak: document.getElementById('editAnak').value
  };
  showGlobalLoading();
  const { error } = await supabaseClient.from('users').update(upd).eq('username', oldU);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  showSuccess('Data Berhasil Disimpan', 'Data warga telah diperbarui.');
  bootstrap.Modal.getInstance(document.getElementById('editWargaModal')).hide();
  if (currentUser.username === oldU) {
    currentUser.username = newU;
    currentUser.nama_tampilan = upd.nama_tampilan;
    sessionStorage.setItem('ndb_user', JSON.stringify(currentUser));
    document.getElementById('userInfo').textContent = `${getDisplayName(currentUser)} (${getRoleLabel(currentUser.role)})`;
  }
  await loadAllData();
}

// ============================================================
// RENDER IURAN (dengan pagination & label fix)
// ============================================================
function renderIuranList(iuran) {
  const c = document.getElementById('iuranList');
  if (!c) return;
  if (iuran.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">Tidak ada data iuran</p>';
    document.getElementById('iuranShowMore').style.display = 'none';
    return;
  }
  const sorted = urutkanIuranSesuaiWarga(iuran);
  const d = sorted.slice(0, limitIuran);
  const isAdmin = currentUser.role === 'admin';
  c.innerHTML = d.map(item => {
    const sc = item.status === 'lunas' ? 'status-lunas' : 'status-belum';
    const st = item.status === 'lunas' ? 'LUNAS' : 'BELUM BAYAR';
    return `
      <div class="card mb-2"><div class="card-body py-2">
        <div class="d-flex justify-content-between align-items-center">
          <div class="flex-grow-1">
            <div class="fw-bold text-primary">${formatWargaLabel(item.nomor_rumah)}</div>
            <div class="text-muted small">${item.bulan} ${item.tahun} - ${item.jenis_iuran}</div>
            <div class="mt-1"><span class="fw-semibold">${formatRupiah(item.jumlah)}</span> - <span class="${sc}">${st}</span></div>
          </div>
          ${isAdmin ? `<div class="ms-3">
            <button class="btn btn-sm btn-outline-primary me-1" onclick='showEditIuranModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteIuran(${item.id})"><i class="fas fa-trash"></i></button>
          </div>` : ''}
        </div>
      </div></div>
    `;
  }).join('');
  renderLoadMoreButton('iuranShowMore', limitIuran, sorted.length, 'loadMoreIuran');
}

function loadMoreIuran() {
  limitIuran += PAGE_SIZE;
  renderIuranList(filteredIuranData);
}

function applyIuranFilterAdmin() {
  const s = (document.getElementById('searchIuran')?.value || '').toLowerCase();
  const b = document.getElementById('filterIuranBulanAdmin')?.value || '';
  const t = (document.getElementById('filterIuranTahunAdmin')?.value || '').toString();
  const j = document.getElementById('filterIuranJenisAdmin')?.value || '';
  filteredIuranData = allIuranData.filter(item => {
    let ms = true;
    if (s) {
      const n = getNamaByNomorRumah(item.nomor_rumah).toLowerCase();
      ms = item.nomor_rumah.toLowerCase().includes(s) || n.includes(s);
    }
    return ms && (!b || item.bulan === b) && (!t || String(item.tahun) === t) && (!j || item.jenis_iuran === j);
  });
  limitIuran = PAGE_SIZE;
  renderIuranList(filteredIuranData);
}

// ============================================================
// UPDATE IURAN (dengan pagination & label fix)
// ============================================================
function renderUpdateIuranList(iuran) {
  const c = document.getElementById('updateIuranList');
  if (!c) return;
  if (iuran.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">Tidak ada data</p>';
    document.getElementById('updateIuranShowMore').style.display = 'none';
    return;
  }
  const sorted = urutkanIuranSesuaiWarga(iuran);
  const d = sorted.slice(0, limitUpdateIuran);
  const isAdmin = currentUser.role === 'admin';
  c.innerHTML = d.map(item => `
    <div class="card mb-2 status-card status-belum-card"><div class="card-body py-2">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <div class="fw-bold text-primary">${formatWargaLabel(item.nomor_rumah)}</div>
          <div class="text-muted small">${item.bulan} ${item.tahun} - ${item.jenis_iuran}</div>
          <div class="mt-1"><span class="fw-semibold">${formatRupiah(item.jumlah)}</span> - <span class="status-belum">BELUM BAYAR</span></div>
        </div>
        ${isAdmin ? `<div class="ms-3"><button class="btn btn-sm btn-success" onclick='showEditIuranModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'><i class="fas fa-check me-1"></i>Bayar</button></div>` : ''}
      </div>
    </div></div>
  `).join('');
  renderLoadMoreButton('updateIuranShowMore', limitUpdateIuran, sorted.length, 'loadMoreUpdateIuran');
}

function loadMoreUpdateIuran() {
  limitUpdateIuran += PAGE_SIZE;
  renderUpdateIuranList(filteredUpdateIuranData);
}

function applyUpdateIuranFilter() {
  const s = (document.getElementById('searchUpdateIuran')?.value || '').toLowerCase();
  const b = document.getElementById('filterUpdateIuranBulan')?.value || '';
  const t = (document.getElementById('filterUpdateIuranTahun')?.value || '').toString();
  const j = document.getElementById('filterUpdateIuranJenis')?.value || '';
  filteredUpdateIuranData = allIuranAllData.filter(x => x.status === 'belum').filter(item => {
    let ms = true;
    if (s) {
      const n = getNamaByNomorRumah(item.nomor_rumah).toLowerCase();
      ms = item.nomor_rumah.toLowerCase().includes(s) || n.includes(s);
    }
    return ms && (!b || item.bulan === b) && (!t || String(item.tahun) === t) && (!j || item.jenis_iuran === j);
  });
  limitUpdateIuran = PAGE_SIZE;
  renderUpdateIuranList(filteredUpdateIuranData);
}

// ============================================================
// IURAN CRUD
// ============================================================
function showAddIuranModal() {
  document.getElementById('iuranNomorRumah').innerHTML = '<option value="">Pilih</option>' +
    allWargaData.map(w => {
      const label = formatWargaLabel(w.username);
      return `<option value="${w.username}">${label}</option>`;
    }).join('');
  document.getElementById('iuranTahun').value = new Date().getFullYear();
  new bootstrap.Modal(document.getElementById('addIuranModal')).show();
}

async function saveIuran() {
  const d = {
    nomor_rumah: document.getElementById('iuranNomorRumah').value,
    bulan: document.getElementById('iuranBulan').value,
    tahun: parseInt(document.getElementById('iuranTahun').value),
    jenis_iuran: document.getElementById('iuranJenis').value,
    jumlah: parseFloat(document.getElementById('iuranJumlah').value),
    status: document.getElementById('iuranStatus').value,
    tanggal_bayar: document.getElementById('iuranStatus').value === 'lunas' ? new Date().toISOString().split('T')[0] : null,
    created_by: getDisplayName(currentUser)
  };
  if (!d.nomor_rumah || !d.bulan || !d.jenis_iuran || !d.jumlah) { alert('Semua field wajib diisi!'); return; }
  showGlobalLoading();
  const { error } = await supabaseClient.from('iuran').insert(d);
  if (error) { hideGlobalLoading(); alert('Gagal: ' + error.message); return; }

  await supabaseClient.from('catatan').insert({
    tanggal: d.tanggal_bayar || new Date().toISOString().split('T')[0],
    jenis: 'iuran',
    keterangan: `${d.jenis_iuran} ${d.bulan} ${d.tahun} - ${d.nomor_rumah} (${getNamaByNomorRumah(d.nomor_rumah)})`,
    jumlah: d.jumlah,
    created_by: getDisplayName(currentUser)
  });

  hideGlobalLoading();
  bootstrap.Modal.getInstance(document.getElementById('addIuranModal')).hide();
  await loadAllData();
  showSuccess('Iuran Ditambahkan', `Iuran ${d.jenis_iuran} untuk ${d.nomor_rumah} berhasil dicatat.`);
}

function showEditIuranModal(item) {
  document.getElementById('editIuranId').value = item.id;
  document.getElementById('editIuranNomorRumah').value = item.nomor_rumah;
  document.getElementById('editIuranPeriode').value = `${item.bulan} ${item.tahun}`;
  document.getElementById('editIuranJenis').value = item.jenis_iuran;
  document.getElementById('editIuranJumlah').value = item.jumlah;
  document.getElementById('editIuranStatus').value = item.status;
  document.getElementById('editIuranTanggalBayar').value = item.tanggal_bayar || new Date().toISOString().split('T')[0];
  toggleTanggalPelunasan();
  new bootstrap.Modal(document.getElementById('editIuranModal')).show();
}

function toggleTanggalPelunasan() {
  document.getElementById('tanggalPelunasanGroup').style.display =
    document.getElementById('editIuranStatus').value === 'lunas' ? 'block' : 'none';
}

async function saveEditIuran() {
  const id = document.getElementById('editIuranId').value;
  const st = document.getElementById('editIuranStatus').value;
  const nomorRumah = document.getElementById('editIuranNomorRumah').value;
  const periode = document.getElementById('editIuranPeriode').value;
  const upd = {
    jenis_iuran: document.getElementById('editIuranJenis').value,
    jumlah: parseFloat(document.getElementById('editIuranJumlah').value),
    status: st,
    tanggal_bayar: st === 'lunas' ? document.getElementById('editIuranTanggalBayar').value : null
  };
  showGlobalLoading();
  const { error } = await supabaseClient.from('iuran').update(upd).eq('id', id);
  if (error) { hideGlobalLoading(); alert('Gagal: ' + error.message); return; }

  if (st === 'lunas') {
    await supabaseClient.from('catatan').insert({
      tanggal: upd.tanggal_bayar,
      jenis: 'iuran',
      keterangan: `Pembayaran ${upd.jenis_iuran} ${periode} - ${nomorRumah} (${getNamaByNomorRumah(nomorRumah)})`,
      jumlah: upd.jumlah,
      created_by: getDisplayName(currentUser)
    });
  }

  hideGlobalLoading();
  bootstrap.Modal.getInstance(document.getElementById('editIuranModal')).hide();
  await loadAllData();
  showSuccess('Iuran Diperbarui', `Status iuran ${nomorRumah} berhasil diubah menjadi ${st.toUpperCase()}.`);
}

async function deleteIuran(id) {
  if (!confirm('Yakin hapus iuran ini?')) return;
  showGlobalLoading();
  const { error } = await supabaseClient.from('iuran').delete().eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  await loadAllData();
  showSuccess('Iuran Dihapus', 'Data iuran berhasil dihapus.');
}

// ============================================================
// SEBAR IURAN
// ============================================================
function showSebarIuranModal() {
  document.getElementById('sebarIuranTahun').value = new Date().getFullYear();
  new bootstrap.Modal(document.getElementById('sebarIuranModal')).show();
}

async function saveSebarIuran() {
  const b = document.getElementById('sebarIuranBulan').value;
  const t = parseInt(document.getElementById('sebarIuranTahun').value);
  const j = document.getElementById('sebarIuranJenis').value;
  const jml = parseFloat(document.getElementById('sebarIuranJumlah').value);
  if (!b || !t || !j || !jml) { alert('Semua field wajib diisi!'); return; }

  const ex = allIuranAllData.filter(i => i.bulan === b && i.tahun === t && i.jenis_iuran === j).map(i => i.nomor_rumah);
  const belum = allWargaData.filter(w => !ex.includes(w.username));

  if (belum.length === 0) {
    bootstrap.Modal.getInstance(document.getElementById('sebarIuranModal')).hide();
    showSuccess('Tidak Ada Perubahan', `Semua warga sudah memiliki iuran ${j} untuk periode ${b} ${t}.`);
    return;
  }

  const rows = belum.map(w => ({
    nomor_rumah: w.username, bulan: b, tahun: t, jenis_iuran: j,
    jumlah: jml, status: 'belum', tanggal_bayar: null, created_by: 'system'
  }));

  showGlobalLoading();
  const { error } = await supabaseClient.from('iuran').insert(rows);
  if (error) { hideGlobalLoading(); alert('Gagal: ' + error.message); return; }

  await supabaseClient.from('catatan').insert({
    tanggal: new Date().toISOString().split('T')[0],
    jenis: 'info',
    keterangan: `Sebar iuran ${j} periode ${b} ${t} untuk ${belum.length} warga`,
    jumlah: 0,
    created_by: 'System'
  });

  hideGlobalLoading();
  bootstrap.Modal.getInstance(document.getElementById('sebarIuranModal')).hide();
  await loadAllData();
  showSuccess('Sebar Iuran Berhasil', `Iuran ${j} periode ${b} ${t} berhasil disebar ke ${belum.length} warga.`);
}

// ============================================================
// DETAIL IURAN
// ============================================================
function loadDetailIuran() {
  const b = document.getElementById('detailIuranBulan').value;
  const t = document.getElementById('detailIuranTahun').value;
  const jf = document.getElementById('detailIuranJenisFilter').value;
  let ib = allIuranAllData.filter(i => i.bulan === b && String(i.tahun) === String(t));
  if (jf) ib = ib.filter(i => i.jenis_iuran === jf);
  const detail = allWargaData.map(w => {
    const iw = ib.filter(i => i.nomor_rumah === w.username);
    let tl = 0, tb = 0;
    const ja = [];
    iw.forEach(i => {
      ja.push(i.jenis_iuran);
      if (i.status === 'lunas') tl += parseFloat(i.jumlah) || 0;
      else tb += parseFloat(i.jumlah) || 0;
    });
    const st = iw.length === 0 ? 'belum' : (iw.some(i => i.status === 'belum') ? 'belum' : 'lunas');
    return { nomor_rumah: w.username, dinas: w.dinas, nama_suami: w.nama_suami, nama_istri: w.nama_istri,
      status: st, jenis_iuran: ja, total_lunas: tl, total_belum: tb, total_iuran: tl + tb };
  });
  const tLunas = detail.filter(d => d.status === 'lunas').length;
  document.getElementById('totalWarga').textContent = detail.length;
  document.getElementById('totalLunas').textContent = tLunas;
  document.getElementById('totalBelum').textContent = detail.length - tLunas;
  document.getElementById('detailIuranList').innerHTML = detail.map(item => {
    const nama = (item.nama_suami || '').trim() || (item.nama_istri || '').trim() || item.nomor_rumah;
    return `
    <div class="card mb-2 status-card ${item.status === 'lunas' ? 'status-lunas-card' : 'status-belum-card'}">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${item.nomor_rumah}</strong>
            <div class="text-muted small">${item.dinas || '-'} - ${nama}</div>
            <div class="small">Jenis: ${item.jenis_iuran.length ? item.jenis_iuran.join(', ') : 'Tidak ada'}</div>
          </div>
          <div class="text-end">
            <span class="badge ${item.status === 'lunas' ? 'bg-success' : 'bg-danger'}">${item.status.toUpperCase()}</span>
            <div><small>Total: ${formatRupiah(item.total_iuran)}</small></div>
          </div>
        </div>
      </div>
    </div>
  `}).join('');
}

// ============================================================
// PENGELUARAN (dengan pagination)
// ============================================================
function renderPengeluaranList(data) {
  const c = document.getElementById('pengeluaranList');
  if (!c) return;
  if (data.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">Tidak ada data</p>';
    document.getElementById('pengeluaranShowMore').style.display = 'none';
    return;
  }
  const d = data.slice(0, limitPengeluaran);
  const isAdmin = currentUser.role === 'admin';
  c.innerHTML = d.map(item => `
    <div class="card mb-2"><div class="card-body py-2">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <span class="pengeluaran-keterangan">${item.keterangan}</span>
          <div class="text-muted small">${item.tanggal} - ${formatRupiah(item.jumlah)}</div>
        </div>
        ${isAdmin ? `<div>
          <button class="btn btn-sm btn-outline-primary me-1" onclick='showEditPengeluaranModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deletePengeluaran(${item.id})"><i class="fas fa-trash"></i></button>
        </div>` : ''}
      </div>
    </div></div>
  `).join('');
  renderLoadMoreButton('pengeluaranShowMore', limitPengeluaran, data.length, 'loadMorePengeluaran');
}

function loadMorePengeluaran() {
  limitPengeluaran += PAGE_SIZE;
  renderPengeluaranList(filteredPengeluaranData);
}

function showAddPengeluaranModal() {
  document.getElementById('pengeluaranTanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('pengeluaranKeterangan').value = '';
  document.getElementById('pengeluaranJumlah').value = '';
  new bootstrap.Modal(document.getElementById('addPengeluaranModal')).show();
}

async function savePengeluaran() {
  const d = {
    tanggal: document.getElementById('pengeluaranTanggal').value,
    keterangan: document.getElementById('pengeluaranKeterangan').value,
    jumlah: parseFloat(document.getElementById('pengeluaranJumlah').value),
    created_by: getDisplayName(currentUser)
  };
  if (!d.tanggal || !d.keterangan || !d.jumlah) { alert('Semua field wajib diisi!'); return; }
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengeluaran').insert(d);
  if (error) { hideGlobalLoading(); alert('Gagal: ' + error.message); return; }

  await supabaseClient.from('catatan').insert({
    tanggal: d.tanggal,
    jenis: 'pengeluaran',
    keterangan: d.keterangan,
    jumlah: d.jumlah,
    created_by: getDisplayName(currentUser)
  });

  hideGlobalLoading();
  bootstrap.Modal.getInstance(document.getElementById('addPengeluaranModal')).hide();
  await loadAllData();
  showSuccess('Pengeluaran Dicatat', `${d.keterangan} sebesar ${formatRupiah(d.jumlah)} berhasil dicatat.`);
}

function showEditPengeluaranModal(item) {
  document.getElementById('editPengeluaranId').value = item.id;
  document.getElementById('editPengeluaranTanggal').value = item.tanggal;
  document.getElementById('editPengeluaranKeterangan').value = item.keterangan;
  document.getElementById('editPengeluaranJumlah').value = item.jumlah;
  new bootstrap.Modal(document.getElementById('editPengeluaranModal')).show();
}

async function saveEditPengeluaran() {
  const id = document.getElementById('editPengeluaranId').value;
  const upd = {
    tanggal: document.getElementById('editPengeluaranTanggal').value,
    keterangan: document.getElementById('editPengeluaranKeterangan').value,
    jumlah: parseFloat(document.getElementById('editPengeluaranJumlah').value)
  };
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengeluaran').update(upd).eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('editPengeluaranModal')).hide();
  await loadAllData();
  showSuccess('Pengeluaran Diperbarui', 'Data pengeluaran berhasil diperbarui.');
}

async function deletePengeluaran(id) {
  if (!confirm('Yakin hapus pengeluaran ini?')) return;
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengeluaran').delete().eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  await loadAllData();
  showSuccess('Pengeluaran Dihapus', 'Data pengeluaran berhasil dihapus.');
}

// ============================================================
// CATATAN (dengan pagination)
// ============================================================
function renderCatatanList(data) {
  const c = document.getElementById('catatanList');
  if (!c) return;
  if (data.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">Tidak ada catatan</p>';
    document.getElementById('catatanShowMore').style.display = 'none';
    return;
  }
  const d = data.slice(0, limitCatatan);
  const isAdmin = currentUser.role === 'admin';
  c.innerHTML = d.map(item => {
    const jml = parseFloat(item.jumlah) || 0;
    const isSystem = item.created_by === 'System' || item.created_by === 'system';
    return `
      <div class="card mb-2"><div class="card-body py-2">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${item.jenis.toUpperCase()}</strong>
            <div class="text-muted small">${item.tanggal} - ${item.keterangan}</div>
          </div>
          <div class="text-end">
            ${jml > 0 ? `<div>${formatRupiah(item.jumlah)}</div>` : ''}
            <div class="text-muted small">Oleh: ${item.created_by}</div>
            ${(isAdmin && !isSystem) ? `<div class="mt-1">
              <button class="btn btn-sm btn-outline-primary" onclick='showEditCatatanModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="deleteCatatan(${item.id})"><i class="fas fa-trash"></i></button>
            </div>` : ''}
          </div>
        </div>
      </div></div>
    `;
  }).join('');
  renderLoadMoreButton('catatanShowMore', limitCatatan, data.length, 'loadMoreCatatan');
}

function loadMoreCatatan() {
  limitCatatan += PAGE_SIZE;
  renderCatatanList(filteredCatatanData);
}

function showAddCatatanModal() {
  document.getElementById('catatanTanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('catatanKeterangan').value = '';
  document.getElementById('catatanJumlah').value = 0;
  new bootstrap.Modal(document.getElementById('addCatatanModal')).show();
}

async function saveCatatan() {
  const d = {
    tanggal: document.getElementById('catatanTanggal').value,
    jenis: document.getElementById('catatanJenis').value,
    keterangan: document.getElementById('catatanKeterangan').value,
    jumlah: parseFloat(document.getElementById('catatanJumlah').value) || 0,
    created_by: getDisplayName(currentUser)
  };
  if (!d.tanggal || !d.keterangan) { alert('Tanggal dan keterangan wajib diisi!'); return; }
  showGlobalLoading();
  const { error } = await supabaseClient.from('catatan').insert(d);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('addCatatanModal')).hide();
  await loadAllData();
  showSuccess('Catatan Ditambahkan', 'Catatan berhasil disimpan.');
}

function showEditCatatanModal(item) {
  document.getElementById('editCatatanId').value = item.id;
  document.getElementById('editCatatanTanggal').value = item.tanggal;
  document.getElementById('editCatatanJenis').value = item.jenis;
  document.getElementById('editCatatanKeterangan').value = item.keterangan;
  document.getElementById('editCatatanJumlah').value = item.jumlah;
  new bootstrap.Modal(document.getElementById('editCatatanModal')).show();
}

async function saveEditCatatan() {
  const id = document.getElementById('editCatatanId').value;
  const upd = {
    tanggal: document.getElementById('editCatatanTanggal').value,
    jenis: document.getElementById('editCatatanJenis').value,
    keterangan: document.getElementById('editCatatanKeterangan').value,
    jumlah: parseFloat(document.getElementById('editCatatanJumlah').value) || 0
  };
  showGlobalLoading();
  const { error } = await supabaseClient.from('catatan').update(upd).eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('editCatatanModal')).hide();
  await loadAllData();
  showSuccess('Catatan Diperbarui', 'Catatan berhasil diperbarui.');
}

async function deleteCatatan(id) {
  if (!confirm('Yakin hapus catatan ini?')) return;
  showGlobalLoading();
  const { error } = await supabaseClient.from('catatan').delete().eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  await loadAllData();
  showSuccess('Catatan Dihapus', 'Catatan berhasil dihapus.');
}

// ============================================================
// KELOLA WARGA (ADMIN) - dengan pagination
// ============================================================
let limitKelolaWarga = PAGE_SIZE;

function renderKelolaWargaList(warga) {
  const c = document.getElementById('kelolaWargaList');
  if (!c) return;
  if (warga.length === 0) { c.innerHTML = '<p class="text-muted text-center">Tidak ada data</p>'; return; }
  const d = warga.slice(0, limitKelolaWarga);
  c.innerHTML = d.map(item => {
    const nt = (item.nama_tampilan || '').trim();
    const ntBadge = nt !== '' ? `<span class="badge bg-info ms-2">${escapeHtml(nt)}</span>` : '';
    return `
      <div class="card mb-2"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${item.username}</strong>${ntBadge}
            <div class="text-muted small">${item.dinas || '-'} - ${item.nama_suami || ''} ${item.nama_istri ? '& ' + item.nama_istri : ''}</div>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-primary me-1" onclick='showEditWargaAdminModal(${JSON.stringify(item).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteWarga('${item.username}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div></div>
    `;
  }).join('');

  // Pagination untuk kelola warga
  const container = document.getElementById('kelolaWargaList');
  let loadMoreDiv = document.getElementById('kelolaWargaLoadMore');
  if (!loadMoreDiv) {
    loadMoreDiv = document.createElement('div');
    loadMoreDiv.id = 'kelolaWargaLoadMore';
    loadMoreDiv.className = 'show-more-container';
    container.parentNode.appendChild(loadMoreDiv);
  }
  const remaining = warga.length - limitKelolaWarga;
  if (remaining > 0) {
    loadMoreDiv.style.display = 'block';
    const shown = Math.min(limitKelolaWarga, warga.length);
    loadMoreDiv.innerHTML = `
      <div class="show-more-btn" onclick="loadMoreKelolaWarga()">
        <i class="fas fa-chevron-down me-1"></i>
        <span>Tampilkan ${Math.min(PAGE_SIZE, remaining)} lagi (${shown}/${warga.length})</span>
      </div>`;
  } else {
    loadMoreDiv.style.display = 'none';
    loadMoreDiv.innerHTML = '';
  }
}

function loadMoreKelolaWarga() {
  limitKelolaWarga += PAGE_SIZE;
  renderKelolaWargaList(allWargaData);
}

function showAddWargaModal() {
  ['newNomorRumah','newNamaTampilan','newPassword','newNamaSuami','newNamaIstri','newAnak'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  new bootstrap.Modal(document.getElementById('addWargaModal')).show();
}

async function saveNewWarga() {
  const ntRaw = (document.getElementById('newNamaTampilan')?.value || '').trim();
  const d = {
    username: document.getElementById('newNomorRumah').value,
    nama_tampilan: ntRaw !== '' ? ntRaw : null,
    password: document.getElementById('newPassword').value,
    role: 'warga',
    dinas: document.getElementById('newDinas').value,
    nama_suami: document.getElementById('newNamaSuami').value,
    nama_istri: document.getElementById('newNamaIstri').value,
    anak: document.getElementById('newAnak').value
  };
  if (!d.username || !d.password) { alert('Nomor rumah dan password wajib diisi!'); return; }
  showGlobalLoading();
  const { error } = await supabaseClient.from('users').insert(d);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('addWargaModal')).hide();
  await loadAllData();
  showSuccess('Warga Ditambahkan', `Warga ${d.username} berhasil ditambahkan.`);
}

function showEditWargaAdminModal(item) {
  document.getElementById('editWargaAdminOriginal').value = item.username;
  document.getElementById('editWargaAdminNomorRumah').value = item.username;
  document.getElementById('editWargaAdminNamaTampilan').value = item.nama_tampilan || '';
  document.getElementById('editWargaAdminPassword').value = item.password || '';
  document.getElementById('editWargaAdminDinas').value = item.dinas || 'JOG';
  document.getElementById('editWargaAdminNamaSuami').value = item.nama_suami || '';
  document.getElementById('editWargaAdminNamaIstri').value = item.nama_istri || '';
  document.getElementById('editWargaAdminAnak').value = item.anak || '';
  new bootstrap.Modal(document.getElementById('editWargaAdminModal')).show();
}

async function saveEditWargaAdmin() {
  const oldU = document.getElementById('editWargaAdminOriginal').value;
  const newU = document.getElementById('editWargaAdminNomorRumah').value;
  const ntRaw = (document.getElementById('editWargaAdminNamaTampilan')?.value || '').trim();
  const upd = {
    username: newU,
    nama_tampilan: ntRaw !== '' ? ntRaw : null,
    password: document.getElementById('editWargaAdminPassword').value,
    dinas: document.getElementById('editWargaAdminDinas').value,
    nama_suami: document.getElementById('editWargaAdminNamaSuami').value,
    nama_istri: document.getElementById('editWargaAdminNamaIstri').value,
    anak: document.getElementById('editWargaAdminAnak').value
  };
  showGlobalLoading();
  const { error } = await supabaseClient.from('users').update(upd).eq('username', oldU);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('editWargaAdminModal')).hide();
  await loadAllData();
  showSuccess('Data Warga Diperbarui', `Data warga ${newU} berhasil diperbarui.`);
}

async function deleteWarga(username) {
  if (!confirm(`Yakin hapus warga ${username}?`)) return;
  showGlobalLoading();
  const { error } = await supabaseClient.from('users').delete().eq('username', username);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  await loadAllData();
  showSuccess('Warga Dihapus', `Warga ${username} berhasil dihapus.`);
}

// ============================================================
// LAPORAN KEUANGAN BULANAN
// ============================================================
function buildLaporanKeuangan() {
  const map = new Map();
  const bm = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  allIuranAllData.forEach(item => {
    if (item.status === 'lunas' && item.tanggal_bayar) {
      const t = String(item.tanggal_bayar).split('-');
      if (t.length === 3) {
        const k = `${t[0]}-${bm[parseInt(t[1]) - 1]}`;
        if (!map.has(k)) map.set(k, { bulan: bm[parseInt(t[1]) - 1], tahun: t[0], pemasukan: 0, pengeluaran: 0, details: { pemasukan: [], pengeluaran: [] }});
        const r = map.get(k);
        r.pemasukan += parseFloat(item.jumlah) || 0;
        r.details.pemasukan.push(item);
      }
    }
  });
  allPengeluaranData.forEach(item => {
    if (!item.tanggal) return;
    const t = String(item.tanggal).split('-');
    if (t.length === 3) {
      const k = `${t[0]}-${bm[parseInt(t[1]) - 1]}`;
      if (!map.has(k)) map.set(k, { bulan: bm[parseInt(t[1]) - 1], tahun: t[0], pemasukan: 0, pengeluaran: 0, details: { pemasukan: [], pengeluaran: [] }});
      const r = map.get(k);
      r.pengeluaran += parseFloat(item.jumlah) || 0;
      r.details.pengeluaran.push(item);
    }
  });
  allMonthlyReports = Array.from(map.values()).sort((a, b) => {
    if (a.tahun !== b.tahun) return b.tahun - a.tahun;
    return bm.indexOf(b.bulan) - bm.indexOf(a.bulan);
  });
  const c = document.getElementById('monthlyReportList');
  if (allMonthlyReports.length === 0) { c.innerHTML = '<p class="text-muted text-center">Belum ada transaksi</p>'; return; }
  c.innerHTML = allMonthlyReports.map((r, idx) => `
    <div class="card mb-3" style="cursor:pointer;" onclick="showFinancialDetail(${idx})">
      <div class="card-body">
        <h6 class="mb-2">${r.bulan} ${r.tahun}</h6>
        <div class="row mt-2">
          <div class="col-6 text-center"><div class="text-success fw-bold">Pemasukan</div><div class="text-success">${formatRupiah(r.pemasukan)}</div></div>
          <div class="col-6 text-center"><div class="text-danger fw-bold">Pengeluaran</div><div class="text-danger">${formatRupiah(r.pengeluaran)}</div></div>
        </div>
      </div>
    </div>
  `).join('');
}

function showFinancialDetail(idx) {
  const r = allMonthlyReports[idx];
  document.getElementById('financialDetailMonth').textContent = `${r.bulan} ${r.tahun}`;
  document.getElementById('financialDetailContent').innerHTML = `
    <div class="row">
      <div class="col-md-6">
        <div class="card border-success mb-3">
          <div class="card-header bg-success text-white">Pemasukan - ${formatRupiah(r.pemasukan)}</div>
          <div class="card-body">
            ${r.details.pemasukan.length ? r.details.pemasukan.map(p => `
              <div class="border-bottom py-2">
                <strong>${p.nomor_rumah}</strong> - ${p.jenis_iuran} (${p.bulan} ${p.tahun})
                <div class="text-success">${formatRupiah(p.jumlah)}</div>
                <small class="text-muted">Tgl: ${p.tanggal_bayar}</small>
              </div>`).join('') : '<p class="text-muted">Tidak ada pemasukan</p>'}
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card border-danger mb-3">
          <div class="card-header bg-danger text-white">Pengeluaran - ${formatRupiah(r.pengeluaran)}</div>
          <div class="card-body">
            ${r.details.pengeluaran.length ? r.details.pengeluaran.map(p => `
              <div class="border-bottom py-2 pengeluaran-item">
                <span>${p.keterangan}</span>
                <div class="text-danger">${formatRupiah(p.jumlah)}</div>
                <small class="text-muted">Tgl: ${p.tanggal}</small>
              </div>`).join('') : '<p class="text-muted">Tidak ada pengeluaran</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
  new bootstrap.Modal(document.getElementById('financialDetailModal')).show();
}

// ============================================================
// MENU: PENGUMUMAN (ADMIN)
// ============================================================
function renderPengumumanAdminList() {
  const c = document.getElementById('pengumumanAdminList');
  if (!c) return;
  if (allPengumumanData.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">Belum ada pengumuman</p>';
    return;
  }
  c.innerHTML = allPengumumanData.map(item => {
    const isAktif = item.aktif === true;
    const badgeClass = isAktif ? 'bg-success' : 'bg-secondary';
    const badgeText = isAktif ? 'AKTIF' : 'NONAKTIF';
    const cardOpacity = isAktif ? '1' : '0.6';
    return `
      <div class="card mb-2" style="opacity: ${cardOpacity};">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center gap-2 mb-1">
                <strong class="text-primary">${escapeHtml(item.judul)}</strong>
                <span class="badge ${badgeClass}" style="font-size: 0.7rem;">${badgeText}</span>
              </div>
              <div class="text-muted small mb-2">
                <i class="fas fa-calendar me-1"></i>${formatTanggalIndo(item.tanggal)}
                &nbsp;•&nbsp;
                <i class="fas fa-user me-1"></i>${item.created_by || '-'}
              </div>
              <div class="text-muted" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                ${escapeHtml(item.isi)}
              </div>
            </div>
            <div class="ms-3 text-nowrap">
              <button class="btn btn-sm btn-outline-primary me-1" onclick='showEditPengumumanModal(${JSON.stringify(item).replace(/'/g, "&#39;")})' title="Edit">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-sm btn-outline-warning me-1" onclick="togglePengumuman(${item.id}, ${item.aktif})" title="${isAktif ? 'Nonaktifkan' : 'Aktifkan'}">
                <i class="fas fa-eye${isAktif ? '-slash' : ''}"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="deletePengumuman(${item.id})" title="Hapus">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showAddPengumumanModal() {
  document.getElementById('pengumumanJudul').value = '';
  document.getElementById('pengumumanIsi').value = '';
  document.getElementById('pengumumanTanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('pengumumanAktif').checked = true;
  new bootstrap.Modal(document.getElementById('addPengumumanModal')).show();
}

async function savePengumuman() {
  const d = {
    judul: document.getElementById('pengumumanJudul').value.trim(),
    isi: document.getElementById('pengumumanIsi').value.trim(),
    tanggal: document.getElementById('pengumumanTanggal').value,
    aktif: document.getElementById('pengumumanAktif').checked,
    created_by: getDisplayName(currentUser)
  };
  if (!d.judul || !d.isi || !d.tanggal) { alert('Judul, isi, dan tanggal wajib diisi!'); return; }
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengumuman').insert(d);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('addPengumumanModal')).hide();
  await loadAllData();
  showSuccess('Pengumuman Ditambahkan', `Pengumuman "${d.judul}" berhasil dibuat.`);
}

function showEditPengumumanModal(item) {
  document.getElementById('editPengumumanId').value = item.id;
  document.getElementById('editPengumumanJudul').value = item.judul;
  document.getElementById('editPengumumanIsi').value = item.isi;
  document.getElementById('editPengumumanTanggal').value = item.tanggal;
  document.getElementById('editPengumumanAktif').checked = item.aktif === true;
  new bootstrap.Modal(document.getElementById('editPengumumanModal')).show();
}

async function saveEditPengumuman() {
  const id = document.getElementById('editPengumumanId').value;
  const upd = {
    judul: document.getElementById('editPengumumanJudul').value.trim(),
    isi: document.getElementById('editPengumumanIsi').value.trim(),
    tanggal: document.getElementById('editPengumumanTanggal').value,
    aktif: document.getElementById('editPengumumanAktif').checked
  };
  if (!upd.judul || !upd.isi || !upd.tanggal) { alert('Judul, isi, dan tanggal wajib diisi!'); return; }
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengumuman').update(upd).eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  bootstrap.Modal.getInstance(document.getElementById('editPengumumanModal')).hide();
  await loadAllData();
  showSuccess('Pengumuman Diperbarui', 'Pengumuman berhasil diperbarui.');
}

async function togglePengumuman(id, aktifSaatIni) {
  const newStatus = !aktifSaatIni;
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengumuman').update({ aktif: newStatus }).eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  await loadAllData();
  showSuccess(
    newStatus ? 'Pengumuman Diaktifkan' : 'Pengumuman Dinonaktifkan',
    newStatus ? 'Pengumuman akan muncul sebagai pop-up saat warga login.' : 'Pengumuman tidak akan muncul sebagai pop-up.'
  );
}

async function deletePengumuman(id) {
  if (!confirm('Yakin hapus pengumuman ini? Tindakan ini tidak bisa dibatalkan.')) return;
  showGlobalLoading();
  const { error } = await supabaseClient.from('pengumuman').delete().eq('id', id);
  hideGlobalLoading();
  if (error) { alert('Gagal: ' + error.message); return; }
  await loadAllData();
  showSuccess('Pengumuman Dihapus', 'Pengumuman berhasil dihapus permanen.');
}

// ============================================================
// POP-UP PENGUMUMAN UNTUK WARGA
// ============================================================
async function loadPengumumanAktifUntukWarga() {
  try {
    const { data, error } = await supabaseClient
      .from('pengumuman')
      .select('*')
      .eq('aktif', true)
      .order('tanggal', { ascending: true });

    if (error) throw error;
    currentActivePengumuman = data || [];
    if (currentActivePengumuman.length > 0) {
      currentPopupIndex = 0;
      setTimeout(() => showPopupPengumuman(), 500);
    }
  } catch (err) {
    console.error('Gagal load pengumuman:', err);
  }
}

function showPopupPengumuman() {
  if (currentActivePengumuman.length === 0) return;
  renderPopupPengumuman();
  const modal = new bootstrap.Modal(document.getElementById('popupPengumumanModal'));
  modal.show();
}

function renderPopupPengumuman() {
  const item = currentActivePengumuman[currentPopupIndex];
  if (!item) return;

  document.getElementById('popupPengumumanCounter').textContent = `(${currentPopupIndex + 1}/${currentActivePengumuman.length})`;
  document.getElementById('popupPengumumanJudul').textContent = item.judul;
  document.getElementById('popupPengumumanTanggal').textContent = formatTanggalIndo(item.tanggal);
  document.getElementById('popupPengumumanIsi').textContent = item.isi;

  document.getElementById('popupPrevBtn').disabled = currentPopupIndex === 0;
  document.getElementById('popupNextBtn').disabled = currentPopupIndex === currentActivePengumuman.length - 1;

  const navFooter = document.getElementById('popupNavFooter');
  if (currentActivePengumuman.length <= 1) {
    navFooter.style.display = 'none';
  } else {
    navFooter.style.display = 'flex';
  }

  const dotsContainer = document.getElementById('popupDots');
  dotsContainer.innerHTML = currentActivePengumuman.map((_, idx) => {
    const isActive = idx === currentPopupIndex;
    return `<div style="width: ${isActive ? '22px' : '8px'}; height: 8px; border-radius: 4px; background: ${isActive ? '#16a34a' : '#ccc'}; transition: all 0.2s;"></div>`;
  }).join('');
}

function popupPrevPengumuman() {
  if (currentPopupIndex > 0) {
    currentPopupIndex--;
    renderPopupPengumuman();
  }
}

function popupNextPengumuman() {
  if (currentPopupIndex < currentActivePengumuman.length - 1) {
    currentPopupIndex++;
    renderPopupPengumuman();
  }
}

// ============================================================
// MENU: AKTIVITAS PENGGUNA (ADMIN)
// ============================================================
async function loadLogAktivitas() {
  showGlobalLoading();
  try {
    const { data, error } = await supabaseClient
      .from('log_aktivitas')
      .select('*')
      .order('waktu', { ascending: false });

    if (error) throw error;
    allLogAktivitasData = data || [];
    renderPenggunaList();
  } catch (err) {
    console.error(err);
    alert('Gagal memuat log: ' + err.message);
  } finally {
    hideGlobalLoading();
  }
}

function renderPenggunaList() {
  const c = document.getElementById('penggunaList');
  if (!c) return;

  const counts = {};
  allLogAktivitasData.forEach(log => {
    if (!counts[log.username]) counts[log.username] = { total: 0, terakhir: null };
    counts[log.username].total++;
    if (!counts[log.username].terakhir || new Date(log.waktu) > new Date(counts[log.username].terakhir)) {
      counts[log.username].terakhir = log.waktu;
    }
  });

  let list = allWargaData.map(w => ({
    username: w.username,
    nama: w.nama_suami || w.nama_istri || w.username,
    dinas: w.dinas || '-',
    total: counts[w.username]?.total || 0,
    terakhir: counts[w.username]?.terakhir || null
  }));

  const search = (document.getElementById('searchPengguna')?.value || '').toLowerCase();
  if (search) {
    list = list.filter(x => x.username.toLowerCase().includes(search) || x.nama.toLowerCase().includes(search));
  }

  const sortMode = document.getElementById('sortPengguna')?.value || 'terbanyak';
  if (sortMode === 'terbanyak') list.sort((a, b) => b.total - a.total);
  if (sortMode === 'tersedikit') list.sort((a, b) => a.total - b.total);
  if (sortMode === 'az') list.sort((a, b) => a.username.localeCompare(b.username));

  const totalLogin = allLogAktivitasData.length;
  const wargaAktif = Object.keys(counts).length;
  const belumLogin = allWargaData.length - wargaAktif;
  document.getElementById('statTotalLogin').textContent = totalLogin;
  document.getElementById('statWargaAktif').textContent = wargaAktif;
  document.getElementById('statBelumLogin').textContent = belumLogin;

  if (list.length === 0) {
    c.innerHTML = '<p class="text-muted text-center">Tidak ada data</p>';
    return;
  }

  const maxLogin = Math.max(...list.map(x => x.total), 1);

  c.innerHTML = list.map(item => {
    const persen = Math.round((item.total / maxLogin) * 100);
    const colorBadge = item.total === 0 ? 'bg-secondary' : item.total >= maxLogin * 0.7 ? 'bg-success' : 'bg-info';
    const terakhirText = item.terakhir ? new Date(item.terakhir).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum pernah';
    return `
      <div class="card mb-2">
        <div class="card-body py-3">
          <div class="d-flex justify-content-between align-items-center">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center mb-1">
                <strong class="text-primary me-2">${item.username}</strong>
                <span class="badge ${colorBadge}">${item.total}x login</span>
              </div>
              <div class="text-muted small">${item.nama} • ${item.dinas}</div>
              <div class="text-muted small"><i class="fas fa-clock me-1"></i>Terakhir: ${terakhirText}</div>
              <div class="progress mt-2" style="height: 6px;">
                <div class="progress-bar ${colorBadge}" style="width: ${persen}%;"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// TOGGLE SHOW ALL (tidak dipakai lagi, tapi tetap ada untuk kompatibilitas)
// ============================================================
function toggleShowAll(type) {
  // Fungsi ini sudah diganti dengan loadMore*. Biarkan kosong untuk kompatibilitas.
  console.warn('toggleShowAll tidak lagi digunakan:', type);
}

// ============================================================
// INIT
// ============================================================
function setupPasswordToggle() {
  const btn = document.getElementById('togglePassword');
  const inp = document.getElementById('password');
  const ico = document.getElementById('togglePasswordIcon');
  if (!btn || !inp || !ico) return;
  btn.addEventListener('click', () => {
    if (inp.type === 'password') { inp.type = 'text'; ico.classList.replace('fa-eye','fa-eye-slash'); }
    else { inp.type = 'password'; ico.classList.replace('fa-eye-slash','fa-eye'); }
  });
}

function setupTabs() {
  document.querySelectorAll('#mainTabs .nav-link').forEach(tab => {
    tab.addEventListener('shown.bs.tab', (e) => {
      document.getElementById('kelolaWargaView').style.display = 'none';
      const target = e.target.getAttribute('href');
      if (target === '#dataWarga') {
        document.getElementById('dataWarga').classList.add('show', 'active');
      }
      if (target === '#penggunaAdmin') {
        loadLogAktivitas();
      }
    });
  });
}

function showMainApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('userInfo').textContent = `${getDisplayName(currentUser)} (${getRoleLabel(currentUser.role)})`;
  const isAdmin = currentUser.role === 'admin';

  document.getElementById('sebarIuranTab').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('detailIuranTab').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('addIuranBtn').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('addPengeluaranBtn').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('addCatatanBtn').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('iuranFilterSectionAdmin').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('kelolaWargaBtn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('pengumumanTab').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('penggunaTab').style.display = isAdmin ? 'block' : 'none';

  const jOpt = '<option value="">Pilih Jenis</option>' + JENIS_IURAN.map(j => `<option>${j}</option>`).join('');
  const jAll = '<option value="">Semua Jenis</option>' + JENIS_IURAN.map(j => `<option>${j}</option>`).join('');
  document.getElementById('iuranJenis').innerHTML = jOpt;
  document.getElementById('editIuranJenis').innerHTML = jOpt;
  document.getElementById('sebarIuranJenis').innerHTML = jOpt;
  document.getElementById('filterIuranJenisAdmin').innerHTML = jAll;
  document.getElementById('filterUpdateIuranJenis').innerHTML = jAll;
  document.getElementById('detailIuranJenisFilter').innerHTML = jAll;

  const searchPengguna = document.getElementById('searchPengguna');
  if (searchPengguna) {
    searchPengguna.addEventListener('input', debounce(() => renderPenggunaList(), 300));
    document.getElementById('sortPengguna').addEventListener('change', () => renderPenggunaList());
  }

  loadAllData();
}

document.addEventListener('DOMContentLoaded', () => {
  setupPasswordToggle();
  setupTabs();
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const m = document.getElementById('loginMessage');
    showGlobalLoading();
    try {
      const r = await login(u, p);
      if (r.success) {
        currentUser = r.user;
        sessionStorage.setItem('ndb_user', JSON.stringify(currentUser));
        if (r.user.role === 'warga') {
          await catatLogin(r.user.username, r.user.role);
        }
        hideGlobalLoading();
        showMainApp();
      } else {
        hideGlobalLoading();
        m.innerHTML = `<div class="alert alert-danger">${r.message}</div>`;
      }
    } catch (err) {
      hideGlobalLoading();
      m.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    }
  });

  document.getElementById('searchWarga').addEventListener('input', debounce(e => filterWargaList(e.target.value), 300));
  document.getElementById('searchIuran').addEventListener('input', debounce(() => applyIuranFilterAdmin(), 300));
  document.getElementById('searchUpdateIuran').addEventListener('input', debounce(() => applyUpdateIuranFilter(), 300));

  const saved = sessionStorage.getItem('ndb_user');
  if (saved) { currentUser = JSON.parse(saved); showMainApp(); }
});