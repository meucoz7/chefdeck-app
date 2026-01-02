const API_URL = 'https://pro.filma4.ru/api';
const API_KEY = '3f154923d8d6324c7a38dcd83159789f82a4ea9224335df225a375a6cb3d6415';

const folderCache: Record<string, number> = {};

/**
 * Получает ID папки по имени, создавая её при необходимости.
 */
const getFolderId = async (name: string): Promise<number | null> => {
    const normalizedName = name.toLowerCase().trim();
    if (folderCache[normalizedName]) return folderCache[normalizedName];

    try {
        // 1. Пытаемся найти существующую папку
        const res = await fetch(`${API_URL}/folders`, {
            headers: { 'X-API-Key': API_KEY }
        });
        
        if (res.ok) {
            const result = await res.json();
            if (result.success && Array.isArray(result.data)) {
                const folder = result.data.find((f: any) => f.name.toLowerCase() === normalizedName);
                if (folder) {
                    folderCache[normalizedName] = folder.id;
                    return folder.id;
                }
            }
        }

        // 2. Если папка не найдена или ошибка списка, пытаемся создать
        const createRes = await fetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: normalizedName })
        });
        
        const createResult = await createRes.json();
        if (createResult.success && createResult.data && createResult.data.id) {
            folderCache[normalizedName] = createResult.data.id;
            return createResult.data.id;
        }
    } catch (e) {
        console.error('[UploadService] Critical error during folder resolution:', e);
    }
    return null;
};

/**
 * Загружает файл на сервер.
 * @param file Файл для загрузки
 * @param folderName Имя папки (напр. 'recipes', 'wastage')
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const folderId = await getFolderId(folderName);
        if (folderId !== null) {
            formData.append('folder_id', folderId.toString());
        }

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY 
            },
            body: formData
        });

        const result = await response.json().catch(() => ({ success: false, message: 'Invalid JSON response' }));

        if (!response.ok || !result.success) {
            const errorMsg = result.message || `Server error: ${response.status}`;
            console.error('[UploadService] Upload failed:', errorMsg, result);
            throw new Error(errorMsg);
        }

        if (result.data && result.data.url) {
            // Возвращаем URL изображения (сервер обычно возвращает относительный или полный путь)
            return result.data.url;
        } else {
            console.error('[UploadService] No URL in success response:', result);
            throw new Error('Invalid response format: Missing data.url');
        }
    } catch (error) {
        console.error('[UploadService] Detailed upload error:', error);
        throw error;
    }
};
