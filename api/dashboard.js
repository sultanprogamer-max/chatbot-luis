import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    const data = rows.map(r => ({
      waktu: r.get('Waktu') || '',
      nama: r.get('Nama') || '',
      layanan: r.get('Layanan Diminati') || '',
      budget: r.get('Budget') || '',
      minta_dihubungi: r.get('Minta Dihubungi') || '',
      pesan_pertama: r.get('Pesan Pertama') || '',
      sentimen: r.get('Sentimen') || ''
    }));

    const stats = {
      total: data.length,
      hotLeads: data.filter(r => r.minta_dihubungi === 'Ya').length,
      sangatTertarik: data.filter(r => r.sentimen === 'Sangat Tertarik').length,
      topLayanan: (() => {
        const counts = {};
        data.forEach(r => { if (r.layanan && r.layanan !== '-') counts[r.layanan] = (counts[r.layanan] || 0) + 1; });
        return Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] || null;
      })()
    };

    res.status(200).json({ rows: data, stats });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
}
