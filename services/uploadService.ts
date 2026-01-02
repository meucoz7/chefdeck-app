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
        const res = await fetch(`${API_URL}/folders`, {
            headers: { 
                'X-API-Key': API_KEY,
                'Accept': 'application/json'
            }
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

        const createRes = await fetch(`${API_URL}/folders`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: normalizedName })
        });
        
        const createResult = await createRes.json();
        if (createResult.success && createResult.data && createResult.data.id) {
            folderCache[normalizedName] = createResult.data.id;
            return createResult.data.id;
        }
    } catch (e) {
        console.error('[UploadService] Folder resolution error:', e);
    }
    return null;
};

/**
 * Загружает файл на сервер.
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<string> => {
    if (!file) throw new Error('Файл не выбран');
    
    // Проверка размера (например, 15МБ)
    if (file.size > 15 * 1024 * 1024) {
        throw new Error('Файл слишком большой (макс. 15МБ)');
    }

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
                'X-API-Key': API_KEY,
                'Accept': 'application/json'
            },
            body: formData
        });

        const responseText = await response.text();
        let result;
        
        try {
            result = JSON.parse(responseText);
        } catch (e) {
            console.error('[UploadService] Server returned non-JSON:', responseText);
            throw new Error(`Ошибка сервера ${response.status}: Неверный формат ответа`);
        }

        if (!response.ok || !result.success) {
            const serverMsg = result.message || `Ошибка API (${response.status})`;
            console.error('[UploadService] Server rejected upload:', serverMsg, result);
            throw new Error(serverMsg);
        }

        if (result.data && result.data.url) {
            let finalUrl = result.data.url;
            // Если сервер вернул относительный путь, превращаем в абсолютный
            if (finalUrl.startsWith('/') && !finalUrl.startsWith('//')) {
                const apiOrigin = new URL(API_URL).origin;
                finalUrl = `${apiOrigin}${finalUrl}`;
            }
            return finalUrl;
        } else {
            throw new Error('Сервер не вернул ссылку на файл');
        }
    } catch (error: any) {
        console.error('[UploadService] Final error catch:', error);
        if (error.message === 'Failed to fetch') {
            throw new Error('Сетевая ошибка: Сервер недоступен или блокирует запрос');
        }
        throw error;
    }
};
