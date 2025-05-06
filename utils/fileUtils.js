const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');
const fetch = require('node-fetch');

/**
 * Rasmlarni saqlash uchun util funksiyalar
 */

/**
 * Telegram rasmini yuklab olish va saqlash
 * @param {Object} bot Bot obyekti
 * @param {String} fileId Telegram fayl ID
 * @param {Number} userId Foydalanuvchi ID
 * @returns {Promise<String>} Saqlangan fayl yo'li
 */
const saveTelegramPhoto = async (bot, fileId, userId) => {
  try {
    // Fayl ma'lumotlarini olish
    const file = await bot.getFile(fileId);
    
    // Fayl yo'lini olish
    const filePath = file.file_path;
    
    // Fayl URL manzilini olish
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
    
    // Fayl nomini yaratish (vaqt va foydalanuvchi ID bo'yicha)
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const fileName = `${userId}_${timestamp}.jpg`;
    
    // Foydalanuvchi papkasini yaratish
    const userDir = path.join(__dirname, '..', 'uploads', 'payments', userId.toString());
    await fs.ensureDir(userDir);
    
    // Fayl yo'lini olish
    const savePath = path.join(userDir, fileName);
    
    // Faylni yuklab olish va saqlash
    const response = await fetch(fileUrl);
    const buffer = await response.buffer();
    await fs.writeFile(savePath, buffer);
    
    console.log(`Rasm saqlandi: ${savePath}`);
    return savePath;
  } catch (error) {
    console.error('Rasmni saqlashda xatolik:', error);
    throw error;
  }
};

/**
 * Foydalanuvchi rasmlarini olish
 * @param {Number} userId Foydalanuvchi ID
 * @returns {Promise<Array>} Rasmlar ro'yxati
 */
const getUserPhotos = async (userId) => {
  try {
    const userDir = path.join(__dirname, '..', 'uploads', 'payments', userId.toString());
    
    // Agar papka mavjud bo'lsa, rasmlarni olish
    if (await fs.pathExists(userDir)) {
      const files = await fs.readdir(userDir);
      return files.map(file => ({
        name: file,
        path: path.join(userDir, file),
        date: moment(file.split('_')[1].split('.')[0], 'YYYY-MM-DD_HH-mm-ss').toDate()
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Foydalanuvchi rasmlarini olishda xatolik:', error);
    return [];
  }
};

module.exports = {
  saveTelegramPhoto,
  getUserPhotos
}; 