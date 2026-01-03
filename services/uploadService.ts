
import { apiFetch } from './api';

/**
 * Загружает файл на сервер через локальный прокси (обход CORS).
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<string> => {
    if (!file) throw new Error('Файл не выбран');
    
    // Проверка размера на клиенте (15МБ)
    if (file.size > 15 * 1024 * 1024) {
        throw new Error('Файл слишком большой (макс. 15МБ)');
    }

    const formData = new FormData();
    // Изменено: 'image' вместо 'file' согласно новой документации API v1
    formData.append('image', file);

    try {
        // Отправляем запрос на НАШ сервер.
        const response = await apiFetch(`/api/upload?folder=${encodeURIComponent(folderName)}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.success) {
            const serverMsg = result?.message || `Ошибка сервера (${response.status})`;
            throw new Error(serverMsg);
        }

        // Изменено: парсинг вложенной структуры data.urls.original
        if (result.data && result.data.urls && result.data.urls.original) {
            return result.data.urls.original;
        } else if (result.data && result.data.url) {
            // Fallback для совместимости
            return result.data.url;
        } else {
            throw new Error('Сервер вернул пустой путь к файлу');
        }
    } catch (error: any) {
        console.error('[UploadService] Error:', error.message);
        if (error.message === 'Failed to fetch') {
            throw new Error('Ошибка сети: Ваш сервер недоступен');
        }
        throw error;
    }
};
