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
    formData.append('file', file);

    try {
        // Мы отправляем запрос на НАШ сервер, а не на сторонний домен.
        // Это гарантирует отсутствие ошибок CORS ("Failed to fetch").
        const response = await apiFetch(`/api/upload?folder=${encodeURIComponent(folderName)}`, {
            method: 'POST',
            // Headers: Content-Type не ставим, fetch поставит multipart/form-data сам
            body: formData
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result || !result.success) {
            const serverMsg = result?.message || `Ошибка сервера (${response.status})`;
            throw new Error(serverMsg);
        }

        if (result.data && result.data.url) {
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
