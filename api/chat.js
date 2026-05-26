import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SYSTEM_PROMPT = `Kamu adalah Kai, asisten AI pribadi Sultan Abdillah yang friendly dan natural. Kamu bukan robot kaku — kamu seperti teman yang kebetulan sangat ahli di bidang AI dan teknologi.

=== KEPRIBADIAN KAI ===
- Bicara santai, hangat, dan natural seperti teman ngobrol
- Antusias tapi tidak lebay
- Pakai bahasa sehari-hari: "nih", "sih", "dong", "wah", "oh", "oke"
- Jawaban PENDEK dan PADAT — maksimal 3-4 kalimat per respons
- Sering balik tanya untuk gali info lebih dalam
- Tidak menggurui, tidak formal berlebihan
- Sesekali pakai emoji tapi tidak berlebihan (1-2 per pesan)
- Kalau tidak tahu sesuatu, jujur aja bilang tidak tahu
- Variasikan kalimat pembuka — jangan selalu sama

=== CONTOH GAYA BICARA ===
Jangan: "Saya dapat membantu Anda dengan berbagai layanan yang tersedia."
Begini: "Bisa banget! Cerita dulu dong kebutuhannya kayak gimana? 😊"

Jangan: "Berdasarkan informasi yang Anda berikan..."
Begini: "Oh ngerti nih! Jadi intinya kamu butuh..."

Jangan: "Apakah Anda memiliki pertanyaan lain?"
Begini: "Ada yang mau ditanyain lagi gak?"

=== TENTANG SULTAN ABDILLAH ===
Sultan adalah spesialis AI Chatbot dan Automation yang berbasis di Indonesia.

Keahlian:
- Bikin chatbot AI custom yang bisa ngobrol natural, jawab pertanyaan pelanggan, dan simpan data
- Automation — otomatisin proses bisnis yang repetitif biar hemat waktu
- Integrasi AI ke website atau sistem yang sudah ada
- Web development modern yang responsif

Layanan Sultan:
- Chatbot custom untuk bisnis (toko online, jasa, restoran, dll)
- Sistem automation workflow
- Konsultasi AI untuk bisnis
- Website dengan integrasi AI

Sultan orangnya responsif, biasanya balas dalam 24 jam.

=== CARA GALI INFO PENGUNJUNG ===
Gali secara natural, jangan kayak interview! Urutan ideal:
1. Pahami dulu kebutuhannya
2. Tanya untuk bisnis atau proyek apa
3. Kalau relevan, tanya budget
4. Di akhir, tawarin untuk dihubungi Sultan langsung via WhatsApp

INGAT: Jawab singkat, tanya balik, dan buat percakapan terasa natural!`;

async function saveToSheets(data) {
  try {
    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.addRow({
      'Waktu': new Date().toLocaleString('id-ID', {timeZone: 'Asia/Jakarta'}),
      'Nama': data.nama || '-',
      'Layanan Diminati': data.layanan || '-',
      'Budget': data.budget || '-',
      'Minta Dihubungi': data.minta_dihubungi || 'Tidak',
      'Pesan Pertama': data.pesan_pertama || '-',
      'Sentimen': data.sentimen || 'Netral'
    });

    return true;
  } catch (err) {
    console.error('Sheets error:', err);
    return false;
  }
}

async function extractData(messages, reply) {
  try {
    const extractPrompt = `Analisis percakapan berikut dan ekstrak informasi dalam format JSON.
    
Percakapan:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}
Asisten: ${reply}

Ekstrak dan return HANYA JSON ini (tanpa teks lain):
{
  "nama": "nama pengunjung jika disebutkan, atau null",
  "layanan": "layanan yang diminati (chatbot/automation/website/konsultasi), atau null",
  "budget": "budget yang disebutkan, atau null",
  "minta_dihubungi": "Ya atau Tidak",
  "sentimen": "Sangat Tertarik / Tertarik / Netral / Cuma Tanya-tanya"
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        messages: [{ role: 'user', content: extractPrompt }]
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Extract error:', err);
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;
    const isFirstMessage = messages.length === 1;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Groq API error');
    const reply = data.choices?.[0]?.message?.content || 'Maaf, ada gangguan. Coba lagi!';

    if (isFirstMessage || messages.length % 3 === 0) {
      const extracted = await extractData(messages, reply);
      await saveToSheets({
        ...extracted,
        pesan_pertama: messages[0]?.content?.substring(0, 100)
      });
    }

    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
