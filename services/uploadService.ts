
import { apiFetch } from './api';
import { ImageUrls } from '../types';

/**
 * Загружает файл на сервер через локальный прокси.
 * Возвращает объект со всеми размерами изображений.
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<ImageUrls> => {
    if (!file) throw new Error('Файл не выбран');
    
    if (file.size > 15 * 1024 * 1024) {
        throw new Error('Файл слишком большой (макс. 15МБ)');
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await apiFetch(`/api/upload?folder=${encodeURIComponent(folderName)}`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.success) {
            const serverMsg = result?.message || `Ошибка сервера (${response.status})`;
            throw new Error(serverMsg);
        }

        if (result.data && result.data.urls) {
            return {
                small: result.data.urls.small,
                medium: result.data.urls.medium,
                original: result.data.urls.original
            };
        } else {
            throw new Error('Сервер вернул некорректный формат ссылок');
        }
    } catch (error: any) {
        console.error('[UploadService] Error:', error.message);
        if (error.message === 'Failed to fetch') {
            throw new Error('Ошибка сети: Сервер недоступен или проблема CORS');
        }
        throw error;
    }
};