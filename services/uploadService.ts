
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

        // Если папка не найдена, создаем новую
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
        console.error('[UploadService] Folder resolution error:', e);
    }
    return null;
};

/**
 * Загружает файл на сервер с указанием folder_id.
 * Использует заголовок X-API-Key согласно документации.
 */
export const uploadImage = async (file: File, folderName: string = 'general'): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const folderId = await getFolderId(folderName);
    if (folderId !== null) {
        formData.append('folder_id', folderId.toString());
    }

    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 
                'X-API-Key': API_KEY 
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const result = await response.json();
        if (result.success && result.data && result.data.url) {
            // Возвращаем основной URL изображения
            return result.data.url;
        } else {
            throw new Error('Invalid response format from upload server');
        }
    } catch (error) {
        console.error('[UploadService] Upload error:', error);
        throw error;
    }
};
